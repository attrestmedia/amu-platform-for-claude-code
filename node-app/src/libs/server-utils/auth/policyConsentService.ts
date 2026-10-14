import "server-only";
import mongoose from "mongoose";
import { MONGODB_USERS_URL } from "consts/env/server";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import {
  buildAccountConsentRecords,
  decideAccountPolicyConsent,
} from "libs/server-utils/legal/accountPolicyDecision";
import {
  currentPolicyConsents,
  type AccountPolicyId,
  type PolicyConsentRecord,
} from "consts/legal/accountPolicy";
import { dbConnect } from "libs/database/mongoose";
import { getModel } from "libs/database/modelCache";
import {
  UserIndexSchema,
  UserSchema,
  type IUserDocument,
  type IUserIndexDocument,
} from "models/user";
import { findWordPressUserByEmail, saveWordPressPolicyConsents } from "./wordpressAccountService";
import { logger } from "utils/log";

function policyConsentError(errorCode: string, message: string, status: number) {
  return Object.assign(new Error(message), { errorCode, status });
}

function consentKey(consent: PolicyConsentRecord) {
  return `${consent.policyId}:${consent.version}:${new Date(consent.agreedAt).toISOString()}:${consent.method}`;
}

function mergeConsentHistory(...groups: Array<readonly PolicyConsentRecord[] | null | undefined>) {
  const merged = new Map<string, PolicyConsentRecord>();
  for (const consent of groups.flatMap((group) => (Array.isArray(group) ? group : []))) {
    if (!consent?.policyId || !consent?.version || !consent?.agreedAt || !consent?.method) continue;
    merged.set(consentKey(consent), consent);
  }
  return [...merged.values()].sort(
    (left, right) => new Date(left.agreedAt).getTime() - new Date(right.agreedAt).getTime(),
  );
}

async function policyModels(uid: string) {
  const connection = await dbConnect(MONGODB_USERS_URL);
  const UserIndexModel: mongoose.Model<IUserIndexDocument> =
    (connection.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    connection.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");
  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
  return { UserIndexModel, UserModel };
}

export async function getAccountPolicyConsentStatus(args: {
  uid: string;
  email?: string;
  knownConsents?: readonly PolicyConsentRecord[];
  now?: Date;
}) {
  const { UserIndexModel, UserModel } = await policyModels(args.uid);
  const [index, user] = await Promise.all([
    UserIndexModel.findOne(
      { $or: [{ uid: args.uid }, ...(args.email ? [{ userEmailLower: args.email.toLowerCase() }] : [])] },
      { policyConsents: 1 },
    ).lean(),
    args.knownConsents ? Promise.resolve(null) : UserModel.findOne({ uid: args.uid }, { policyConsents: 1 }).lean(),
  ]);
  const consents = mergeConsentHistory(args.knownConsents, index?.policyConsents, user?.policyConsents);
  const decision = await decideAccountPolicyConsent(consents, args.now);
  return { ...decision, consents };
}

export async function recordAccountPolicyReconsent(args: {
  uid: string;
  email: string;
  agreedPolicyIds?: readonly AccountPolicyId[];
  releaseIds?: readonly string[];
  manifestRevision?: string | null;
  syncWordPress?: boolean;
}) {
  const email = args.email.trim().toLowerCase();
  if (!args.uid || !email) {
    throw Object.assign(new Error("계정 식별 정보를 확인할 수 없습니다."), {
      errorCode: "ACCOUNT_IDENTITY_REQUIRED",
      status: 422,
    });
  }

  const before = await getAccountPolicyConsentStatus(args);

  let newConsents: PolicyConsentRecord[];
  let manifestReleaseIds: string[] | undefined;
  if (before.mode === "manifest") {
    if (args.agreedPolicyIds !== undefined && args.releaseIds !== undefined) {
      throw policyConsentError("INVALID_INPUT", "정책 동의 요청 형식이 올바르지 않습니다.", 400);
    }
    const requiredReleases = before.releases.filter((release) => release.kind === "required" || release.kind === "announced");
    const requiredReleaseIds = new Set(requiredReleases.map((release) => release.releaseId));
    const selectedReleaseIds = args.releaseIds !== undefined
      ? [...args.releaseIds]
      : requiredReleases
          .filter((release) => args.agreedPolicyIds?.includes(release.policyId))
          .map((release) => release.releaseId);
    manifestReleaseIds = selectedReleaseIds;
    const selectedReleaseIdSet = new Set(selectedReleaseIds);

    if (selectedReleaseIdSet.size !== selectedReleaseIds.length) {
      throw policyConsentError("INVALID_INPUT", "정책 동의 요청 형식이 올바르지 않습니다.", 400);
    }
    if (selectedReleaseIds.some((releaseId) => !requiredReleaseIds.has(releaseId))) {
      throw policyConsentError("POLICY_RELEASE_MISMATCH", "정책 릴리스가 현재 동의 대상과 일치하지 않습니다.", 409);
    }
    if (!before.required && selectedReleaseIds.length === 0) return before;
    if (before.required && requiredReleases.length === 0) {
      throw policyConsentError("POLICY_RELEASE_MISMATCH", "정책 동의 대상을 확인할 수 없습니다.", 409);
    }
    if (requiredReleases.some((release) => !selectedReleaseIdSet.has(release.releaseId))) {
      throw policyConsentError("POLICY_CONSENT_REQUIRED", "개정 정책의 필수 동의 항목을 확인해 주세요.", 400);
    }
    if (selectedReleaseIds.length === 0) return before;

    const built = buildAccountConsentRecords({
      method: "policy_reconsent",
      agreedAt: new Date(),
      releaseIds: selectedReleaseIds,
      manifestRevision: args.manifestRevision,
    });
    if (built.records.length === 0) {
      throw policyConsentError("POLICY_RELEASE_MISMATCH", "정책 릴리스가 현재 동의 대상과 일치하지 않습니다.", 409);
    }
    newConsents = built.records;
    if (built.warning === "MANIFEST_REVISION_MISMATCH") {
      logger.warn("[policyConsent] manifest revision mismatch accepted", {
        expectedRevision: before.manifestRevision,
        receivedRevision: args.manifestRevision || null,
        source: "account_reconsent",
      });
    }
  } else {
    if (args.releaseIds !== undefined) {
      throw policyConsentError("POLICY_RELEASE_MISMATCH", "정책 릴리스가 현재 동의 대상과 일치하지 않습니다.", 409);
    }
    if (!before.required) return before;
    const accepted = new Set(args.agreedPolicyIds || []);
    const unaccepted = before.noticePolicyIds.filter((policyId) => !accepted.has(policyId));
    if (unaccepted.length > 0) {
      throw policyConsentError("POLICY_CONSENT_REQUIRED", "개정 정책의 필수 동의 항목을 확인해 주세요.", 400);
    }
    const acceptedMissingPolicyIds = before.noticePolicyIds.filter((policyId) => accepted.has(policyId));
    if (acceptedMissingPolicyIds.length === 0) return before;
    newConsents = currentPolicyConsents("policy_reconsent", undefined, acceptedMissingPolicyIds);
  }

  if (args.syncWordPress !== false) {
    const wordpressUser = await findWordPressUserByEmail(email);
    if (!wordpressUser) {
      throw Object.assign(new Error("연결된 AMU 매거진 계정을 찾을 수 없습니다."), {
        errorCode: "WORDPRESS_ACCOUNT_NOT_FOUND",
        status: 409,
      });
    }
    const wordpressConsents = newConsents.map(({ policyId, version, agreedAt, method, provider }) => ({
      policyId,
      version,
      agreedAt,
      method,
      ...(provider ? { provider } : {}),
    }));
    if (before.mode === "manifest") {
      if (!args.manifestRevision) {
        throw policyConsentError("POLICY_RELEASE_MISMATCH", "정책 릴리스가 현재 동의 대상과 일치하지 않습니다.", 409);
      }
      await saveWordPressPolicyConsents(wordpressUser.id, wordpressConsents, {
        releaseIds: manifestReleaseIds || [],
        manifestRevision: args.manifestRevision,
        agreedAt: newConsents[0].agreedAt,
        method: newConsents[0].method,
        ...(newConsents[0].provider ? { provider: newConsents[0].provider } : {}),
      });
    } else {
      await saveWordPressPolicyConsents(wordpressUser.id, wordpressConsents);
    }
  }

  const { UserIndexModel, UserModel } = await policyModels(args.uid);
  await Promise.all([
    UserIndexModel.updateOne(
      { $or: [{ uid: args.uid }, { userEmailLower: email }] },
      { $push: { policyConsents: { $each: newConsents } } },
    ),
    UserModel.updateOne({ uid: args.uid }, { $push: { policyConsents: { $each: newConsents } } }),
  ]);

  return getAccountPolicyConsentStatus({ uid: args.uid, email });
}
