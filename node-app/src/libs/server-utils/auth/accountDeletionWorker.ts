import "server-only";

import type { IAccountDeletionRequestDocument } from "models/user/AccountDeletionRequestSchema";
import {
  ACCOUNT_DELETION_SUPPORT_EMAIL,
  ACCOUNT_DELETION_WORKER_ENABLED,
  classifyAccountDeletionError,
  safeAccountDeletionErrorCode,
} from "./accountDeletionState";
import {
  claimAccountDeletion,
  checkpointAccountDeletion,
  listAccountDeletionReplayCandidates,
  markAccountDeletionFailure,
  markAccountDeletionNotificationAccepted,
  readAccountDeletionReconciliation,
  recordAccountDeletionNotification,
  releaseAccountDeletionLease,
  renewAccountDeletionLease,
  type ClaimedAccountDeletion,
  type AccountDeletionModel,
} from "./accountDeletionStore";

export type AccountDeletionWorkerResult =
  | { status: "disabled" | "idle" }
  | { status: "awaiting_finalization" | "failed" | "dead_lettered" | "lease_lost"; requestId: string };

export type AccountDeletionNotificationOutcome = {
  accepted: boolean;
  eventType: string;
  messageId: string;
  errorCode?: string;
};

export type AccountDeletionWorkerDependencies = {
  store: {
    claim: (workerId: string, now: Date) => Promise<ClaimedAccountDeletion | null>;
    checkpoint: (requestId: string, workerId: string, update: Record<string, unknown>, now: Date) => Promise<boolean>;
    renew: (requestId: string, workerId: string, now: Date) => Promise<boolean>;
    release: (requestId: string, workerId: string, now: Date) => Promise<boolean>;
    fail: (input: {
      requestId: string;
      workerId: string;
      errorCode: string;
      failedStage: string;
      retryable: boolean;
      retryCount: number;
    }, now: Date) => Promise<{ updated: boolean; deadLettered: boolean }>;
    recordNotification: (input: {
      requestId: string;
      notification: { eventType: string; messageId: string; enqueuedAt: Date; accepted: boolean; errorCode?: string };
    }) => Promise<boolean>;
  };
  wordpress: {
    getUserById: (userId: number) => Promise<{ id: number; email?: string; roles?: string[] } | null>;
    suspend: (userId: number) => Promise<void>;
    remove: (userId: number) => Promise<unknown>;
  };
  identityHash: (email: string) => string;
  loadEmail: (uid: string) => Promise<string>;
  now?: () => Date;
  notify?: (input: { requestId: string; email: string; processedAt: Date; wordpressStatus: "deleted" | "suspended" | "not_linked" }) => Promise<AccountDeletionNotificationOutcome>;
  notifyFailure?: (input: { requestId: string; email: string; failedAt: Date }) => Promise<AccountDeletionNotificationOutcome>;
  alertFailure?: (input: { errorCode: string; failedStage: string; retryable: boolean; deadLettered: boolean }) => Promise<void>;
};

async function recordNotificationOutcome(
  deps: AccountDeletionWorkerDependencies,
  requestId: string,
  outcome: AccountDeletionNotificationOutcome | undefined,
  enqueuedAt: Date,
) {
  if (!outcome?.messageId) return;
  await deps.store.recordNotification({
    requestId,
    notification: {
      eventType: outcome.eventType,
      messageId: outcome.messageId,
      enqueuedAt,
      accepted: outcome.accepted,
      ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
    },
  }).catch(() => undefined);
}

function numericWordPressId(uid: string) {
  const id = Number(uid);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function fail(
  deps: AccountDeletionWorkerDependencies,
  request: ClaimedAccountDeletion,
  workerId: string,
  stage: "preflight" | "wordpress_identity" | "wordpress_suspend" | "wordpress_delete",
  error: unknown,
  now: Date,
) {
  const classified = classifyAccountDeletionError(error, stage);
  const result = await deps.store.fail({
    requestId: request.requestId,
    workerId,
    errorCode: classified.errorCode,
    failedStage: classified.stage,
    retryable: classified.retryable,
    retryCount: request.retryCount,
  }, now);
  if (!result.updated) return { status: "lease_lost" as const, requestId: request.requestId };
  await deps.alertFailure?.({
    errorCode: classified.errorCode,
    failedStage: classified.stage,
    retryable: classified.retryable,
    deadLettered: result.deadLettered,
  }).catch(() => undefined);
  if (result.deadLettered && deps.notifyFailure) {
    const email = await deps.loadEmail(request.uid).catch(() => "");
    if (email) {
      const outcome = await deps.notifyFailure({ requestId: request.requestId, email, failedAt: now }).catch(() => undefined);
      await recordNotificationOutcome(deps, request.requestId, outcome, now);
    }
  }
  return { status: result.deadLettered ? "dead_lettered" as const : "failed" as const, requestId: request.requestId };
}

export async function processClaimedAccountDeletion(
  deps: AccountDeletionWorkerDependencies,
  request: ClaimedAccountDeletion,
  workerId: string,
  now = new Date(),
): Promise<Exclude<AccountDeletionWorkerResult, { status: "disabled" | "idle" }>> {
  const operationNow = () => deps.now?.() ?? new Date();
  const userId = numericWordPressId(request.uid);
  if (!userId) return fail(deps, request, workerId, "preflight", { errorCode: "WORDPRESS_USER_NOT_FOUND", status: 404 }, operationNow());

  let wpUser;
  try {
    wpUser = await deps.wordpress.getUserById(userId);
  } catch (error) {
    return fail(deps, request, workerId, "wordpress_identity", error, operationNow());
  }

  if (!wpUser) {
    if (request.stages.wordpressSuspendedAt && !request.stages.wordpressDeletedAt) {
      const checkpointNow = operationNow();
      const checked = await deps.store.checkpoint(request.requestId, workerId, {
        "stages.wordpressDeletedAt": checkpointNow,
        workflowPhase: "awaiting_finalization",
      }, checkpointNow);
      if (!checked) return { status: "lease_lost", requestId: request.requestId };
      await deps.store.release(request.requestId, workerId, checkpointNow);
      return { status: "awaiting_finalization", requestId: request.requestId };
    }
    return fail(deps, request, workerId, "wordpress_identity", { errorCode: "WORDPRESS_USER_NOT_FOUND", status: 404 }, operationNow());
  }

  if (!wpUser.email || deps.identityHash(wpUser.email) !== request.identityHash) {
    return fail(deps, request, workerId, "wordpress_identity", { errorCode: "WORDPRESS_IDENTITY_MISMATCH", status: 409 }, operationNow());
  }
  if (wpUser.roles?.includes("administrator")) {
    return fail(deps, request, workerId, "wordpress_identity", { errorCode: "ADMIN_ACCOUNT_DELETION_FORBIDDEN", status: 403 }, operationNow());
  }

  let suspendedAt = request.stages.wordpressSuspendedAt;
  if (!suspendedAt) {
    try {
      const heartbeatNow = operationNow();
      if (!await deps.store.renew(request.requestId, workerId, heartbeatNow)) return { status: "lease_lost", requestId: request.requestId };
      await deps.wordpress.suspend(userId);
      const checkpointNow = operationNow();
      suspendedAt = checkpointNow;
      const checkpointed = await deps.store.checkpoint(request.requestId, workerId, {
        "stages.wordpressSuspendedAt": suspendedAt,
      }, checkpointNow);
      if (!checkpointed) return { status: "lease_lost", requestId: request.requestId };
    } catch (error) {
      return fail(deps, request, workerId, "wordpress_suspend", error, operationNow());
    }
  }

  let deletedAt = request.stages.wordpressDeletedAt;
  if (!deletedAt) {
    try {
      const heartbeatNow = operationNow();
      if (!await deps.store.renew(request.requestId, workerId, heartbeatNow)) return { status: "lease_lost", requestId: request.requestId };
      await deps.wordpress.remove(userId);
      deletedAt = operationNow();
    } catch (error) {
      if (Number((error as { status?: unknown }).status) === 404) {
        let verifiedMissing;
        try {
          verifiedMissing = await deps.wordpress.getUserById(userId);
        } catch (verificationError) {
          return fail(deps, request, workerId, "wordpress_delete", verificationError, operationNow());
        }
        if (!verifiedMissing) deletedAt = operationNow();
        else return fail(deps, request, workerId, "wordpress_delete", error, operationNow());
      } else {
        return fail(deps, request, workerId, "wordpress_delete", error, operationNow());
      }
    }
    const checkpointNow = operationNow();
    const checkpointed = await deps.store.checkpoint(request.requestId, workerId, {
      "stages.wordpressDeletedAt": deletedAt,
      workflowPhase: "awaiting_finalization",
    }, checkpointNow);
    if (!checkpointed) return { status: "lease_lost", requestId: request.requestId };
    await deps.store.release(request.requestId, workerId, checkpointNow);
  }

  if (deps.notify) {
    const email = await deps.loadEmail(request.uid);
    if (email) {
      const outcome = await deps.notify({ requestId: request.requestId, email, processedAt: deletedAt || suspendedAt || now, wordpressStatus: deletedAt ? "deleted" : "suspended" }).catch(() => undefined);
      await recordNotificationOutcome(deps, request.requestId, outcome, deletedAt || suspendedAt || now);
    }
  }
  return { status: "awaiting_finalization", requestId: request.requestId };
}

async function productionDependencies(model: AccountDeletionModel): Promise<AccountDeletionWorkerDependencies> {
  const [{ getAccountLifecycle }, { accountIdentityHash }, wordpress, mail] = await Promise.all([
    import("./accountLifecycleService"),
    import("./accountIdentity"),
    import("./wordpressAccountService"),
    import("libs/server-utils/mail/internalNotification"),
  ]);
  return {
    store: {
      claim: (workerId, now) => claimAccountDeletion(model, workerId, now),
      checkpoint: (requestId, workerId, update, now) => checkpointAccountDeletion(model, requestId, workerId, update, now),
      renew: (requestId, workerId, now) => renewAccountDeletionLease(model, requestId, workerId, now),
      release: (requestId, workerId, now) => releaseAccountDeletionLease(model, requestId, workerId, now),
      fail: (input, now) => markAccountDeletionFailure(model, input, now),
      recordNotification: (input) => recordAccountDeletionNotification(model, input),
    },
    wordpress: {
      getUserById: wordpress.getWordPressUserById,
      suspend: wordpress.suspendWordPressAccount,
      remove: wordpress.deleteWordPressAccount,
    },
    identityHash: accountIdentityHash,
    loadEmail: async (uid) => (await getAccountLifecycle(uid)).email,
    notify: async ({ requestId, email, processedAt, wordpressStatus }) => {
      const built = mail.buildAccountDeletionProcessingMail({
        requestId,
        recipientEmail: email,
        processedAt,
        wordpressStatus,
        supportUrl: process.env.NEXTAUTH_URL || "/account",
      });
      const result = await mail.enqueueInternalNotification(built, "account.deletion_processing");
      return {
        accepted: result.accepted,
        eventType: "account.deletion_processing",
        messageId: built.messageId,
        ...(result.accepted ? {} : { errorCode: "MAIL_ENQUEUE_REJECTED" }),
      };
    },
    notifyFailure: async ({ requestId, email, failedAt }) => {
      const built = mail.buildAccountDeletionFailedMail({
        requestId,
        recipientEmail: email,
        failedAt,
        supportUrl: `mailto:${ACCOUNT_DELETION_SUPPORT_EMAIL}`,
      });
      const result = await mail.enqueueInternalNotification(built, "account.deletion_failed");
      return {
        accepted: result.accepted,
        eventType: "account.deletion_failed",
        messageId: built.messageId,
        ...(result.accepted ? {} : { errorCode: "MAIL_ENQUEUE_REJECTED" }),
      };
    },
    alertFailure: async (input) => {
      const { logger } = await import("utils/log");
      logger.error("[account-deletion] stage failed", input);
    },
  };
}

async function deletionModel() {
  const [{ MONGODB_USERS_URL }, { dbConnect }, { AccountDeletionRequestSchema }] = await Promise.all([
    import("consts/env/server"),
    import("libs/database/mongoose"),
    import("models/user/AccountDeletionRequestSchema"),
  ]);
  const conn = await dbConnect(MONGODB_USERS_URL);
  return (conn.models.AccountDeletionRequest as AccountDeletionModel | undefined) || conn.model<IAccountDeletionRequestDocument>(
    "AccountDeletionRequest",
    AccountDeletionRequestSchema,
    "account_deletion_requests",
  );
}

export async function runAccountDeletionWorkerOnce(input: { workerId: string; now?: Date }): Promise<AccountDeletionWorkerResult> {
  if (!ACCOUNT_DELETION_WORKER_ENABLED) return { status: "disabled" };
  const now = input.now ?? new Date();
  const model = await deletionModel();
  const deps = await productionDependencies(model);
  const request = await deps.store.claim(input.workerId, now);
  if (!request) return { status: "idle" };
  return processClaimedAccountDeletion(deps, request, input.workerId, now);
}

export async function runAccountDeletionReconciliationOnce() {
  const model = await deletionModel();
  return readAccountDeletionReconciliation(model);
}

export type AccountDeletionReplayCandidate = {
  requestId: string;
  uid: string;
  stages?: { wordpressSuspendedAt?: Date; wordpressDeletedAt?: Date };
  notifications?: Array<{ eventType: string; messageId: string; enqueuedAt: Date; accepted: boolean; errorCode?: string }>;
};

export async function replayAccountDeletionNotificationsWithDeps(
  model: AccountDeletionModel,
  deps: AccountDeletionWorkerDependencies,
  candidates: AccountDeletionReplayCandidate[],
) {
  let replayed = 0;
  for (const candidate of candidates) {
    const email = await deps.loadEmail(candidate.uid).catch(() => "");
    if (!email) continue;
    for (const notification of candidate.notifications ?? []) {
      if (notification.accepted) continue;
      const failedAt = notification.enqueuedAt ? new Date(notification.enqueuedAt) : new Date();
      let outcome: AccountDeletionNotificationOutcome | undefined;
      if (notification.eventType === "account.deletion_failed") {
        outcome = await deps.notifyFailure?.({ requestId: candidate.requestId, email, failedAt }).catch(() => undefined);
      } else if (notification.eventType === "account.deletion_processing") {
        const deletedAt = candidate.stages?.wordpressDeletedAt;
        const suspendedAt = candidate.stages?.wordpressSuspendedAt;
        outcome = await deps.notify?.({
          requestId: candidate.requestId,
          email,
          processedAt: deletedAt || suspendedAt || failedAt,
          wordpressStatus: deletedAt ? "deleted" : suspendedAt ? "suspended" : "not_linked",
        }).catch(() => undefined);
      }
      if (outcome?.accepted) {
        await markAccountDeletionNotificationAccepted(model, {
          requestId: candidate.requestId,
          messageId: notification.messageId,
        }).catch(() => undefined);
        replayed += 1;
      }
    }
  }
  return { replayed };
}

export async function replayAccountDeletionNotifications() {
  const model = await deletionModel();
  const deps = await productionDependencies(model);
  const candidates = await listAccountDeletionReplayCandidates(model);
  return replayAccountDeletionNotificationsWithDeps(model, deps, candidates);
}

export function sanitizeWorkerErrorCode(error: unknown) {
  return safeAccountDeletionErrorCode(error, "INTERNAL_ERROR");
}
