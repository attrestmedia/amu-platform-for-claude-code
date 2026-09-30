import "server-only";

import type { AccountDeletionDestructionState } from "models/user/AccountDeletionRequestSchema";

// SES-453 최종 파기 allowlist·dry-run worker.
// 이 모듈은 기본적으로 dry-run만 수행한다. 실제 삭제(apply)는
//   (1) 사용자·legal-policy-review가 정확한 collection·R2 prefix allowlist를 승인하고
//   (2) ACCOUNT_DELETION_DESTRUCTION_ENABLED=true + confirm 토큰이 일치할 때만 가능하다.
// apply는 비가역적이므로 apply 전 dry-run diff 승인과 필요 백업의 접근 통제를 먼저 완료한다.

export const ACCOUNT_DELETION_DESTRUCTION_ENABLED =
  process.env.ACCOUNT_DELETION_DESTRUCTION_ENABLED === "true";
export const ACCOUNT_DELETION_DESTRUCTION_CONFIRM = "SES453_DESTRUCTION_APPLY";

export type DestructionTarget =
  | { kind: "mongo"; database: string; collection: string; field: string; scope: "collection" }
  | { kind: "mongo"; database: string; prefix: string; scope: "drop-prefix" }
  | { kind: "mongo"; database: string; prefix: string; scope: "provider-drop" }
  | {
      kind: "r2-doc";
      database: string;
      collection: string;
      field: string;
      keyPath: string;
      accessPath: string;
      bucketPath: string;
      defaultAccess: "public" | "private";
      scope: "doc-keys";
    }
  | { kind: "r2"; bucket: string; prefix: string; scope: "prefix" };

export function readDestructionDocumentPath(document: unknown, path: string) {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[segment];
  }, document);
}

export function readDestructionDocumentStorageKey(
  document: unknown,
  target: Extract<DestructionTarget, { kind: "r2-doc" }>,
) {
  const value = readDestructionDocumentPath(document, target.keyPath);
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

export type DestructionDocumentR2Target = Extract<DestructionTarget, { kind: "r2-doc" }>;

export type DestructionDocumentR2Collection = {
  find: (
    filter: Record<string, unknown>,
    options: { projection: Record<string, number> },
  ) => AsyncIterable<unknown>;
};

export type DestructionDocumentR2LogEvent = {
  collection: string;
  bucket: string;
  key?: string;
  deleted: number;
  failures: number;
  fallbackCount: number;
};

export function createDocumentR2Deps(input: {
  collectionFor: (target: DestructionDocumentR2Target) => Promise<DestructionDocumentR2Collection>;
  fallbackBucketFor: (target: DestructionDocumentR2Target, document: unknown) => string;
  deleteObject: (params: { bucket: string; key: string }) => Promise<boolean>;
  log?: (event: DestructionDocumentR2LogEvent) => void;
}) {
  const projectionFor = (target: DestructionDocumentR2Target) => ({
    [target.keyPath]: 1,
    [target.accessPath]: 1,
    [target.bucketPath]: 1,
    _id: 0,
  });

  const targetFor = (target: DestructionTarget): DestructionDocumentR2Target => {
    if (target.kind !== "r2-doc" || target.scope !== "doc-keys") throw new Error("INVALID_TARGET");
    return target;
  };

  const bucketFor = (target: DestructionDocumentR2Target, document: unknown) => {
    const storedBucket = readDestructionDocumentPath(document, target.bucketPath);
    if (typeof storedBucket === "string" && storedBucket.trim()) {
      return { bucket: storedBucket.trim(), fallbackUsed: false };
    }
    return { bucket: input.fallbackBucketFor(target, document).trim(), fallbackUsed: true };
  };

  return {
    async list(target: DestructionTarget, uid: string) {
      const docTarget = targetFor(target);
      const collection = await input.collectionFor(docTarget);
      const cursor = collection.find(
        { [docTarget.field]: uid },
        { projection: projectionFor(docTarget) },
      );
      let count = 0;
      const keys: string[] = [];
      for await (const document of cursor) {
        const key = readDestructionDocumentStorageKey(document, docTarget);
        if (!key) continue;
        count += 1;
        if (keys.length < 100) keys.push(key);
      }
      return { count, keys };
    },
    async remove(target: DestructionTarget, uid: string) {
      const docTarget = targetFor(target);
      const collection = await input.collectionFor(docTarget);
      const cursor = collection.find(
        { [docTarget.field]: uid },
        { projection: projectionFor(docTarget) },
      );
      let deleted = 0;
      let failures = 0;
      let fallbackCount = 0;
      for await (const document of cursor) {
        const key = readDestructionDocumentStorageKey(document, docTarget);
        if (!key) continue;

        let bucket = "";
        let fallbackUsed = false;
        let removed = false;
        try {
          const resolved = bucketFor(docTarget, document);
          bucket = resolved.bucket;
          fallbackUsed = resolved.fallbackUsed;
          if (fallbackUsed) fallbackCount += 1;
          removed = await input.deleteObject({ bucket, key });
          if (removed) deleted += 1;
          else failures += 1;
        } catch {
          failures += 1;
        }
        input.log?.({
          collection: docTarget.collection,
          bucket,
          key,
          deleted: removed ? 1 : 0,
          failures,
          fallbackCount,
        });
      }
      if (failures > 0) throw new Error("DOC_R2_DELETE_FAILED");
      return { deleted };
    },
  };
}

export type DestructionPlanEntry = {
  target: DestructionTarget;
  matched: number;
  matchedKeys: string[];
};

export type DestructionPlan = {
  requestId: string;
  uid: string;
  mode: "dry-run" | "apply";
  allowed: boolean;
  blockedReason?: string;
  entries: DestructionPlanEntry[];
};

// allowlist는 "정확한 DB collection·R2 prefix"가 확정되기 전까지 제안 상태다.
// SES-453 apply 전 사용자·legal-policy-review 승인으로 이 목록을 확정한다.
// 실제 컬렉션은 production Mongo 실측 기준으로 매핑했다(2026-08-22).
export const DESTRUCTION_ALLOWLIST: readonly DestructionTarget[] = [
  // 공유 컬렉션: 사용자 식별자 필드(field) 기준 deleteMany
  { kind: "mongo", database: "users", collection: "users", field: "uid", scope: "collection" },
  { kind: "mongo", database: "users", collection: "users_index", field: "uid", scope: "collection" },
  { kind: "mongo", database: "users", collection: "user_friendships", field: "uid", scope: "collection" },
  { kind: "mongo", database: "users", collection: "user_ai_chat_preferences", field: "uid", scope: "collection" },
  { kind: "mongo", database: "ai", collection: "card_news_decks", field: "ownerUid", scope: "collection" },
  { kind: "mongo", database: "persona", collection: "persona_image_library_assets", field: "uid", scope: "collection" },
  { kind: "mongo", database: "conversations", collection: "npcusage", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "user_game_characters", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "narrative_privacy_preferences", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "user_story_states", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "story_arcs", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "story_beats", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "narrative_events", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "character_relations", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "personal_universes", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "personal_universe_canon_revisions", field: "ownerUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "personal_universe_public_snapshots", field: "ownerUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "personal_universe_public_snapshot_reports", field: "ownerUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "personal_universe_public_snapshot_reports", field: "reporterUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "tutor_play_projection_ledger", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "tutor_play_projection_daily_usage", field: "uid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "cross_universe_share_preferences", field: "ownerUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "cross_universe_bridge_events", field: "requesterUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "cross_universe_bridge_events", field: "hostUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "cross_universe_bridge_events", field: "guest.ownerUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "cross_universe_user_blocks", field: "ownerUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "cross_universe_user_blocks", field: "blockedUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "cross_universe_reports", field: "reporterUid", scope: "collection" },
  { kind: "mongo", database: "game", collection: "cross_universe_reports", field: "reportedUid", scope: "collection" },
  // AIR-301 App Magazine 관계 원장(MONGODB_AMU_URL → amu). WP user meta와 분리하며 ownerUid만 파기한다.
  { kind: "mongo", database: "amu", collection: "app_magazine_content_saves", field: "ownerUid", scope: "collection" },
  // TTS 미리듣기는 ownerUid를 가진 이용자 소유 자산이다 — EL-002 정책으로 계정 삭제 대상에 포함한다.
  { kind: "mongo", database: "ai", collection: "tts_preview_assets", field: "ownerUid", scope: "collection" },
  // EL-602 Tutors Assistant TTS job transport metadata — 원문 텍스트·오디오 바이트 없이 uid 참조만 저장한다.
  { kind: "mongo", database: "ai", collection: "tutors_assistant_tts_jobs", field: "uid", scope: "collection" },
  {
    kind: "r2-doc",
    database: "ai",
    collection: "tts_preview_assets",
    field: "ownerUid",
    keyPath: "storage.key",
    accessPath: "storage.access",
    bucketPath: "storage.bucket",
    defaultAccess: "private",
    scope: "doc-keys",
  },
  { kind: "mongo", database: "amu", collection: "app_magazine_topic_follows", field: "ownerUid", scope: "collection" },
  { kind: "mongo", database: "amu", collection: "app_magazine_reading_progress", field: "ownerUid", scope: "collection" },
  { kind: "mongo", database: "amu", collection: "app_magazine_personalization_counters", field: "ownerUid", scope: "collection" },
  // uploads 계열(앱 업로드 미디어 `apps.uploaded_media_assets` + R2 `uploads/` prefix)은
  // 사용자 요청으로 우선 폐기 대상에서 제외한다(2026-08-22). 추후 별도 승인 후 추가.
  { kind: "mongo", database: "secrets", collection: "oauth_connections", field: "ownerId", scope: "collection" },
  // 사용자별 컬렉션 drop(prefix 매치: exact | prefix_ | prefix:)
  { kind: "mongo", database: "users", prefix: "user_{uid}", scope: "drop-prefix" },
  { kind: "mongo", database: "users", prefix: "personas_{uid}", scope: "drop-prefix" },
  { kind: "mongo", database: "users", prefix: "user_personas_{uid}", scope: "drop-prefix" },
  { kind: "mongo", database: "persona", prefix: "tutors_{uid}", scope: "drop-prefix" },
  { kind: "mongo", database: "conversations", prefix: "user_{uid}", scope: "drop-prefix" },
  // provider 키 컬렉션(user_{provider}:{providerAccountId}) — users_index.providers로 해석
  { kind: "mongo", database: "users", prefix: "user_", scope: "provider-drop" },
  // R2 사용자 미디어 prefix(제안). bucket은 "public"/"private" 토큰으로 표기하고
  // 실제 bucket 이름은 production deps에서 R2_PUBLIC_BUCKET/R2_PRIVATE_BUCKET으로 바인딩한다.
  { kind: "r2", bucket: "public", prefix: "persona-image-library/users/{uid}/", scope: "prefix" },
  // 음성 자산 — EL-002 정책(2026-09-10 사용자 승인): "이용자에 속한 자산은 계정 삭제 시 함께 삭제한다".
  // 대화 음성 키는 voice/chat/{routeHint}/{uid}/... 이고 routeHint가 uid 앞에 온다. 중간 와일드카드를
  // 표현할 수 없으므로 routeHint 3종을 각각 나열한다(RouteHintType = ai | commerce | tutors).
  { kind: "r2", bucket: "private", prefix: "voice/chat/ai/{uid}/", scope: "prefix" },
  { kind: "r2", bucket: "private", prefix: "voice/chat/tutors/{uid}/", scope: "prefix" },
  { kind: "r2", bucket: "private", prefix: "voice/chat/commerce/{uid}/", scope: "prefix" },
];

// **prefix로 도달할 수 없는 음성 객체가 있다.**
// buildVoicePreviewStorageKey는 `voice/previews/{visibility}/{voiceId}/{assetId}.{ext}` 형태로
// **키에 uid가 없다.** 따라서 미리듣기 R2 객체는 prefix sweep으로 지울 수 없고,
// tts_preview_assets 문서의 storage.key를 읽어 건별로 지워야 한다(문서에는 `storage.key` 인덱스가 있다).
// 위 mongo 항목은 문서를 지우므로, 문서 삭제 **전에** 객체를 지우지 않으면 R2에 고아가 남는다.
// 실행기는 문서 기반 R2 객체를 문서 삭제 전에 파기해 고아 객체가 남지 않도록 한다.

// 보존 대상(파기 금지): 결제·정산·동의 이력은 법정 보존으로 분리하고 파기하지 않는다.
export const DESTRUCTION_PROTECTED_PATTERNS: readonly RegExp[] = [
  /^payments?$/i,
  /^orders?$/i,
  /^billing/i,
  /^coin_ledger/i,
  /^policy_?consents?$/i,
];

export function isProtectedCollection(collection: string) {
  return DESTRUCTION_PROTECTED_PATTERNS.some((pattern) => pattern.test(collection));
}

export function matchesDropPrefix(name: string, prefix: string) {
  return name === prefix || name.startsWith(`${prefix}_`) || name.startsWith(`${prefix}:`);
}

export function resolveDestructionTargets(uid: string): DestructionTarget[] {
  return DESTRUCTION_ALLOWLIST.map((target) => {
    if (target.kind === "mongo" && target.scope === "drop-prefix") {
      return { ...target, prefix: target.prefix.replace("{uid}", uid) };
    }
    if (target.kind === "r2") {
      return { ...target, prefix: target.prefix.replace("{uid}", uid) };
    }
    return target;
  });
}

export function assertDestructionInput(input: { requestId: string; uid: string; confirm?: string }) {
  if (!/^[A-Za-z0-9._:-]{1,127}$/.test(input.requestId)) {
    return { ok: false as const, errorCode: "INVALID_REQUEST_ID" };
  }
  if (!/^[A-Za-z0-9:_-]{1,64}$/.test(input.uid)) {
    return { ok: false as const, errorCode: "INVALID_UID" };
  }
  const apply = input.confirm !== undefined;
  if (apply) {
    if (!ACCOUNT_DELETION_DESTRUCTION_ENABLED) {
      return { ok: false as const, errorCode: "DESTRUCTION_DISABLED" };
    }
    if (input.confirm !== ACCOUNT_DELETION_DESTRUCTION_CONFIRM) {
      return { ok: false as const, errorCode: "CONFIRMATION_REQUIRED" };
    }
  }
  return { ok: true as const, mode: (apply ? "apply" : "dry-run") as "apply" | "dry-run" };
}

export function buildDestructionPlan(input: {
  requestId: string;
  uid: string;
  targets: DestructionTarget[];
  matchCount: (target: DestructionTarget) => { matched: number; matchedKeys: string[] };
}): DestructionPlan {
  const entries = input.targets.map((target) => {
    const result = input.matchCount(target);
    return { target, matched: result.matched, matchedKeys: result.matchedKeys };
  });
  return {
    requestId: input.requestId,
    uid: input.uid,
    mode: "dry-run",
    allowed: true,
    entries,
  };
}

export function sanitizeDestructionErrorCode(error: unknown) {
  const value = typeof error === "string" ? error : error instanceof Error ? error.message : "INTERNAL_ERROR";
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(value) ? value : "INTERNAL_ERROR";
}

// ===== SES-453 finalization (환불 게이트 + 파기 + checkpoint + tombstone) =====

export type DestructionGateReason =
  | "REFUND_REVIEW_REQUIRED"
  | "LEGAL_HOLD"
  | "ADMIN_ACCOUNT_DELETION_FORBIDDEN"
  | "MISSING_LIFECYCLE";

export type DestructionClaim = {
  requestId: string;
  uid: string;
  identityHash: string;
  destruction?: AccountDeletionDestructionState;
  leaseOwner: string;
};

export type DestructionTargetResult = { count: number; keys: string[] };

export type DestructionFinalizerDeps = {
  store: {
    claimAwaitingFinalization: (workerId: string, now: Date) => Promise<DestructionClaim | null>;
    checkpoint: (requestId: string, workerId: string, update: Record<string, unknown>, now: Date) => Promise<boolean>;
    complete: (input: { requestId: string; workerId: string; tombstoneHash: string }, now: Date) => Promise<boolean>;
    fail: (input: { requestId: string; workerId: string; errorCode: string; failedStage: string; retryable: boolean }, now: Date) => Promise<{ updated: boolean }>;
  };
  mongo: {
    list: (target: DestructionTarget, uid: string) => Promise<DestructionTargetResult>;
    remove: (target: DestructionTarget, uid: string) => Promise<{ deleted: number }>;
  };
  r2: {
    list: (target: DestructionTarget, uid: string) => Promise<DestructionTargetResult>;
    remove: (target: DestructionTarget, uid: string) => Promise<{ deleted: number }>;
  };
  docR2: {
    list: (target: DestructionTarget, uid: string) => Promise<DestructionTargetResult>;
    remove: (target: DestructionTarget, uid: string) => Promise<{ deleted: number }>;
  };
  gateCheck: (uid: string) => Promise<{ allowed: boolean; blockReason?: DestructionGateReason }>;
  tombstoneHash: (uid: string, requestId: string) => string;
  now?: () => Date;
};

export type FinalizeResult =
  | { status: "disabled" | "idle" }
  | { status: "blocked"; blockReason: DestructionGateReason; requestId: string }
  | { status: "dry_run"; plan: DestructionPlan; requestId: string }
  | { status: "completed"; requestId: string }
  | { status: "failed" | "lease_lost"; requestId: string };

async function buildDestructionEntries(
  deps: DestructionFinalizerDeps,
  uid: string,
  targets: DestructionTarget[],
): Promise<DestructionPlanEntry[]> {
  const entries: DestructionPlanEntry[] = [];
  for (const target of targets) {
    if (target.kind === "mongo") {
      const result = await deps.mongo.list(target, uid);
      entries.push({ target, matched: result.count, matchedKeys: result.keys });
    } else if (target.kind === "r2") {
      const result = await deps.r2.list(target, uid);
      entries.push({ target, matched: result.count, matchedKeys: result.keys });
    } else {
      const result = await deps.docR2.list(target, uid);
      entries.push({ target, matched: result.count, matchedKeys: result.keys });
    }
  }
  return entries;
}

export async function finalizeAccountDeletion(
  deps: DestructionFinalizerDeps,
  request: DestructionClaim,
  workerId: string,
  mode: "dry-run" | "apply",
  now = new Date(),
): Promise<Exclude<FinalizeResult, { status: "disabled" | "idle" }>> {
  const operationNow = () => deps.now?.() ?? now;

  // 1. 환불/법정 보존/관리자 fail-closed 게이트 — 유료 자산·보존 레코드는 자동 파기하지 않는다.
  const gate = await deps.gateCheck(request.uid);
  if (!gate.allowed) {
    return { status: "blocked", blockReason: gate.blockReason ?? "REFUND_REVIEW_REQUIRED", requestId: request.requestId };
  }

  const targets = resolveDestructionTargets(request.uid);

  // 2. dry-run: 삭제 대상만 열거하고 아무것도 지우지 않는다.
  if (mode === "dry-run") {
    const entries = await buildDestructionEntries(deps, request.uid, targets);
    return {
      status: "dry_run",
      plan: {
        requestId: request.requestId,
        uid: request.uid,
        mode: "dry-run",
        allowed: true,
        entries,
      },
      requestId: request.requestId,
    };
  }

  // 3. apply: 문서 기반 R2 → mongo → prefix R2 → tombstone 순서로 단계별 checkpoint.
  // 단계별 대상은 allowlist 배열 순서가 아니라 kind로 분리해 실행 순서를 고정한다.
  if (!request.destruction?.docR2CleanedAt) {
    try {
      for (const target of targets) {
        if (target.kind !== "r2-doc") continue;
        await deps.docR2.remove(target, request.uid);
      }
      const checkpointNow = operationNow();
      const checked = await deps.store.checkpoint(request.requestId, workerId, { "destruction.docR2CleanedAt": checkpointNow }, checkpointNow);
      if (!checked) return { status: "lease_lost", requestId: request.requestId };
    } catch (error) {
      await deps.store.fail({ requestId: request.requestId, workerId, errorCode: sanitizeDestructionErrorCode(error), failedStage: "doc_r2_cleanup", retryable: true }, operationNow());
      return { status: "failed", requestId: request.requestId };
    }
  }

  if (!request.destruction?.mongoCleanedAt) {
    try {
      for (const target of targets) {
        if (target.kind !== "mongo") continue;
        await deps.mongo.remove(target, request.uid);
      }
      const checkpointNow = operationNow();
      const checked = await deps.store.checkpoint(request.requestId, workerId, { "destruction.mongoCleanedAt": checkpointNow }, checkpointNow);
      if (!checked) return { status: "lease_lost", requestId: request.requestId };
    } catch (error) {
      await deps.store.fail({ requestId: request.requestId, workerId, errorCode: sanitizeDestructionErrorCode(error), failedStage: "mongo_cleanup", retryable: true }, operationNow());
      return { status: "failed", requestId: request.requestId };
    }
  }

  if (!request.destruction?.r2CleanedAt) {
    try {
      for (const target of targets) {
        if (target.kind !== "r2") continue;
        await deps.r2.remove(target, request.uid);
      }
      const checkpointNow = operationNow();
      const checked = await deps.store.checkpoint(request.requestId, workerId, { "destruction.r2CleanedAt": checkpointNow }, checkpointNow);
      if (!checked) return { status: "lease_lost", requestId: request.requestId };
    } catch (error) {
      await deps.store.fail({ requestId: request.requestId, workerId, errorCode: sanitizeDestructionErrorCode(error), failedStage: "r2_cleanup", retryable: true }, operationNow());
      return { status: "failed", requestId: request.requestId };
    }
  }

  // 4. tombstone(keyed hash) + 완료(PII purge).
  const tombstoneNow = operationNow();
  const hash = deps.tombstoneHash(request.uid, request.requestId);
  const completed = await deps.store.complete({ requestId: request.requestId, workerId, tombstoneHash: hash }, tombstoneNow);
  return completed ? { status: "completed", requestId: request.requestId } : { status: "lease_lost", requestId: request.requestId };
}

export async function finalizeOneAccountDeletion(
  deps: DestructionFinalizerDeps,
  workerId: string,
  mode: "dry-run" | "apply",
  now = new Date(),
): Promise<FinalizeResult> {
  if (mode === "apply" && !ACCOUNT_DELETION_DESTRUCTION_ENABLED) return { status: "disabled" };
  const request = await deps.store.claimAwaitingFinalization(workerId, now);
  if (!request) return { status: "idle" };
  return finalizeAccountDeletion(deps, request, workerId, mode, now);
}
