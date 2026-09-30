import "server-only";
import mongoose from "mongoose";
import { MONGODB_USERS_URL } from "consts/env/server";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import {
  QWEN_MODEL_STUDIO_CONSENT_CONTRACTS,
  QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS,
  isQwenPrivacyPolicyReleaseReady,
  VOICE_DATA_CONSENT_DERIVED_RETENTION_DAYS,
  VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
  VOICE_DATA_CONSENT_PURPOSE_ID,
  VOICE_DATA_CONSENT_REVOCATION_SLA_HOURS,
  VOICE_DATA_CONSENT_VERSION,
  type QwenPersistedPurposeConsentId,
  type VoicePurposeConsentPurposeId,
  type VoicePurposeConsentRecord,
} from "consts/legal/voiceDataConsent";
import { dbConnect } from "libs/database/mongoose";
import { getModel } from "libs/database/modelCache";
import {
  UserIndexSchema,
  UserSchema,
  type IUserDocument,
  type IUserIndexDocument,
} from "models/user";

/**
 * @docHint
 * @purpose 원음 이해 목적별 동의 조회·재동의·철회 처리
 * @process 인증 UID 기반 users/users_index 조회  서버 계약 버전 확인  동의 이력 저장·철회
 * @domain privacy-consent
 * @scope server
 */

type PurposeConsentStatus = {
  purposeId: typeof VOICE_DATA_CONSENT_PURPOSE_ID;
  contractVersion: typeof VOICE_DATA_CONSENT_VERSION;
  linkedPrivacyVersion: typeof VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION;
  required: boolean;
  granted: boolean;
  version: string | null;
  revokedAt: Date | string | null;
  consents: VoicePurposeConsentRecord[];
};

function consentKey(consent: VoicePurposeConsentRecord) {
  return `${consent.purposeId}:${consent.version}:${new Date(consent.agreedAt).toISOString()}:${consent.method}`;
}

function hasRevokedAt(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function isKnownPurposeConsentId(value: unknown): value is VoicePurposeConsentPurposeId {
  return value === VOICE_DATA_CONSENT_PURPOSE_ID || QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS.includes(value as QwenPersistedPurposeConsentId);
}

function consentTime(consent: VoicePurposeConsentRecord) {
  const time = new Date(consent.agreedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeConsentHistory(...groups: Array<readonly VoicePurposeConsentRecord[] | null | undefined>) {
  const merged = new Map<string, VoicePurposeConsentRecord>();
  for (const consent of groups.flatMap((group) => (Array.isArray(group) ? group : []))) {
    if (
      !isKnownPurposeConsentId(consent?.purposeId) ||
      !consent.version ||
      !consent.agreedAt ||
      !consent.method
    ) {
      continue;
    }
    const key = consentKey(consent);
    const previous = merged.get(key);
    // users/users_index 중 한쪽만 먼저 철회된 순간에도 철회 상태를 잃지 않는다.
    if (!previous || (!hasRevokedAt(previous.revokedAt) && hasRevokedAt(consent.revokedAt))) {
      merged.set(key, consent);
    }
  }
  return [...merged.values()].sort((left, right) => consentTime(left) - consentTime(right));
}

async function purposeModels(uid: string) {
  const connection = await dbConnect(MONGODB_USERS_URL);
  const UserIndexModel: mongoose.Model<IUserIndexDocument> =
    (connection.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    connection.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");
  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
  return { UserIndexModel, UserModel };
}

function currentConsent(consents: readonly VoicePurposeConsentRecord[]) {
  return consents
    .filter(
      (consent) =>
        consent.purposeId === VOICE_DATA_CONSENT_PURPOSE_ID &&
        consent.version === VOICE_DATA_CONSENT_VERSION &&
        consent.linkedPrivacyVersion === VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
    )
    .sort((left, right) => consentTime(right) - consentTime(left))[0];
}

function statusFromConsents(consents: VoicePurposeConsentRecord[]): PurposeConsentStatus {
  const voiceDataConsents = consents.filter((consent) => consent.purposeId === VOICE_DATA_CONSENT_PURPOSE_ID);
  const current = currentConsent(voiceDataConsents);
  const revoked = hasRevokedAt(current?.revokedAt);
  return {
    purposeId: VOICE_DATA_CONSENT_PURPOSE_ID,
    contractVersion: VOICE_DATA_CONSENT_VERSION,
    linkedPrivacyVersion: VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
    required: !current || revoked,
    granted: Boolean(current && !revoked),
    version: current?.version || null,
    revokedAt: current?.revokedAt || null,
    consents: voiceDataConsents,
  };
}

/**
 * 원음 이해 동의 상태를 users_index와 users 양쪽에서 읽는다.
 * `knownConsents`는 withAuth가 이미 병합한 사용자 문서를 전달할 때 사용하는 읽기 최적화이며,
 * 서버 저장소의 purposeConsents를 요청 body나 클라이언트 주장으로 대체하지 않는다.
 */
export async function getVoiceDataPurposeConsentStatus(args: {
  uid: string;
  email?: string;
  knownConsents?: readonly VoicePurposeConsentRecord[];
}) {
  if (!args.uid) {
    throw Object.assign(new Error("계정 식별 정보를 확인할 수 없습니다."), {
      errorCode: "ACCOUNT_IDENTITY_REQUIRED",
      status: 422,
    });
  }

  const { UserIndexModel, UserModel } = await purposeModels(args.uid);
  const [index, user] = await Promise.all([
    UserIndexModel.findOne(
      { $or: [{ uid: args.uid }, ...(args.email ? [{ userEmailLower: args.email.toLowerCase() }] : [])] },
      { purposeConsents: 1 },
    ).lean(),
    args.knownConsents
      ? Promise.resolve(null)
      : UserModel.findOne({ uid: args.uid }, { purposeConsents: 1 }).lean(),
  ]);
  const consents = mergeConsentHistory(args.knownConsents, index?.purposeConsents, user?.purposeConsents);
  return statusFromConsents(consents);
}

export type QwenPurposeConsentStatus = {
  purposeId: QwenPersistedPurposeConsentId;
  provider: "alibaba_cloud_model_studio";
  modality: "audio" | "video" | "text";
  contractVersion: string | null;
  linkedPrivacyVersion: string | null;
  retentionConfirmed: boolean;
  grantable: boolean;
  transferAllowed: boolean;
  policyReleaseReady: boolean;
  required: boolean;
  granted: boolean;
  version: string | null;
  revokedAt: Date | string | null;
  consents: VoicePurposeConsentRecord[];
};

function statusFromQwenConsents(
  purposeId: QwenPersistedPurposeConsentId,
  allConsents: readonly VoicePurposeConsentRecord[],
): QwenPurposeConsentStatus {
  const contract = QWEN_MODEL_STUDIO_CONSENT_CONTRACTS[purposeId];
  const policyReleaseReady = isQwenPrivacyPolicyReleaseReady(contract.linkedPrivacyVersion);
  const consents = allConsents.filter((consent) => consent.purposeId === purposeId);
  const current = policyReleaseReady && contract.contractVersion && contract.linkedPrivacyVersion
    ? consents
        .filter(
          (consent) =>
            consent.version === contract.contractVersion &&
            consent.linkedPrivacyVersion === contract.linkedPrivacyVersion,
        )
        .sort((left, right) => consentTime(right) - consentTime(left))[0]
    : undefined;
  const contractAvailable =
    contract.grantable &&
    contract.transferAllowed &&
    contract.retentionConfirmed &&
    Boolean(contract.contractVersion && contract.linkedPrivacyVersion) &&
    policyReleaseReady;
  const revoked = hasRevokedAt(current?.revokedAt);
  const granted = Boolean(contractAvailable && current && !revoked);

  return {
    ...contract,
    grantable: contract.grantable && policyReleaseReady,
    transferAllowed: contract.transferAllowed && policyReleaseReady,
    policyReleaseReady,
    required: !granted,
    granted,
    version: current?.version || null,
    revokedAt: current?.revokedAt || null,
    consents,
  };
}

/** Qwen 목적별 상태 조회. consent history는 서버의 users/users_index 저장소만 근거로 삼는다. */
export async function getQwenPurposeConsentStatus(args: {
  uid: string;
  email?: string;
  purposeId: QwenPersistedPurposeConsentId;
  knownConsents?: readonly VoicePurposeConsentRecord[];
}) {
  if (!args.uid) {
    throw Object.assign(new Error("계정 식별 정보를 확인할 수 없습니다."), {
      errorCode: "ACCOUNT_IDENTITY_REQUIRED",
      status: 422,
    });
  }

  let consents = args.knownConsents ? [...args.knownConsents] : [];
  if (!args.knownConsents) {
    const { UserIndexModel, UserModel } = await purposeModels(args.uid);
    const [index, user] = await Promise.all([
      UserIndexModel.findOne(
        { $or: [{ uid: args.uid }, ...(args.email ? [{ userEmailLower: args.email.toLowerCase() }] : [])] },
        { purposeConsents: 1 },
      ).lean(),
      UserModel.findOne({ uid: args.uid }, { purposeConsents: 1 }).lean(),
    ]);
    consents = mergeConsentHistory(index?.purposeConsents, user?.purposeConsents);
  }
  return statusFromQwenConsents(args.purposeId, consents);
}

/** 기존 회원이 별도 목적에 처음 동의하거나 재동의한다. 회원가입 동의와 분리된 경로다. */
export async function recordVoiceDataPurposeConsent(args: { uid: string; email?: string }) {
  if (!args.uid) {
    throw Object.assign(new Error("계정 식별 정보를 확인할 수 없습니다."), {
      errorCode: "ACCOUNT_IDENTITY_REQUIRED",
      status: 422,
    });
  }

  const before = await getVoiceDataPurposeConsentStatus(args);
  if (before.granted && before.version === VOICE_DATA_CONSENT_VERSION) return before;

  const newConsent: VoicePurposeConsentRecord = {
    purposeId: VOICE_DATA_CONSENT_PURPOSE_ID,
    version: VOICE_DATA_CONSENT_VERSION,
    linkedPrivacyVersion: VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
    agreedAt: new Date(),
    method: before.consents.length > 0 ? "purpose_reconsent" : "purpose_consent",
  };
  const { UserIndexModel, UserModel } = await purposeModels(args.uid);
  await Promise.all([
    UserIndexModel.updateOne(
      { $or: [{ uid: args.uid }, ...(args.email ? [{ userEmailLower: args.email.toLowerCase() }] : [])] },
      { $push: { purposeConsents: newConsent } },
    ),
    UserModel.updateOne({ uid: args.uid }, { $push: { purposeConsents: newConsent } }),
  ]);

  return getVoiceDataPurposeConsentStatus({ uid: args.uid, email: args.email });
}

/** 현재 계약 버전의 활성 동의를 철회하고, 이후 provider 호출을 즉시 차단한다. */
export async function revokeVoiceDataPurposeConsent(args: { uid: string; email?: string }) {
  if (!args.uid) {
    throw Object.assign(new Error("계정 식별 정보를 확인할 수 없습니다."), {
      errorCode: "ACCOUNT_IDENTITY_REQUIRED",
      status: 422,
    });
  }

  const before = await getVoiceDataPurposeConsentStatus(args);
  const current = currentConsent(before.consents);
  if (!current || hasRevokedAt(current.revokedAt)) return before;

  const revokedAt = new Date();
  const filter = {
    "consent.purposeId": VOICE_DATA_CONSENT_PURPOSE_ID,
    "consent.version": VOICE_DATA_CONSENT_VERSION,
    "consent.linkedPrivacyVersion": VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
    "consent.revokedAt": { $exists: false },
  };
  const { UserIndexModel, UserModel } = await purposeModels(args.uid);
  await Promise.all([
    UserIndexModel.updateOne(
      { $or: [{ uid: args.uid }, ...(args.email ? [{ userEmailLower: args.email.toLowerCase() }] : [])] },
      { $set: { "purposeConsents.$[consent].revokedAt": revokedAt } },
      { arrayFilters: [filter] },
    ),
    UserModel.updateOne(
      { uid: args.uid },
      { $set: { "purposeConsents.$[consent].revokedAt": revokedAt } },
      { arrayFilters: [filter] },
    ),
  ]);

  return getVoiceDataPurposeConsentStatus({ uid: args.uid, email: args.email });
}

/** Qwen 목적은 계약·TTL·정책 버전이 모두 확인되기 전까지 생성할 수 없다. */
export async function recordQwenPurposeConsent(args: {
  uid: string;
  email?: string;
  purposeId: QwenPersistedPurposeConsentId;
  agreed: boolean;
}) {
  const contract = QWEN_MODEL_STUDIO_CONSENT_CONTRACTS[args.purposeId];
  const policyReleaseReady = isQwenPrivacyPolicyReleaseReady(contract.linkedPrivacyVersion);
  if (
    !args.agreed ||
    !contract.grantable ||
    !contract.transferAllowed ||
    !contract.retentionConfirmed ||
    !contract.contractVersion ||
    !contract.linkedPrivacyVersion ||
    !policyReleaseReady
  ) {
    throw Object.assign(new Error("Qwen 목적별 동의 조건이 아직 확정되지 않았습니다."), {
      errorCode: "QWEN_PURPOSE_CONSENT_UNAVAILABLE",
      status: 423,
    });
  }
  if (!args.uid) {
    throw Object.assign(new Error("계정 식별 정보를 확인할 수 없습니다."), {
      errorCode: "ACCOUNT_IDENTITY_REQUIRED",
      status: 422,
    });
  }

  const before = await getQwenPurposeConsentStatus(args);
  if (before.granted && before.version === contract.contractVersion) return before;
  const newConsent: VoicePurposeConsentRecord = {
    purposeId: args.purposeId,
    version: contract.contractVersion,
    linkedPrivacyVersion: contract.linkedPrivacyVersion,
    agreedAt: new Date(),
    method: before.consents.length > 0 ? "purpose_reconsent" : "purpose_consent",
  };
  const { UserIndexModel, UserModel } = await purposeModels(args.uid);
  await Promise.all([
    UserIndexModel.updateOne(
      { $or: [{ uid: args.uid }, ...(args.email ? [{ userEmailLower: args.email.toLowerCase() }] : [])] },
      { $push: { purposeConsents: newConsent } },
    ),
    UserModel.updateOne({ uid: args.uid }, { $push: { purposeConsents: newConsent } }),
  ]);
  return getQwenPurposeConsentStatus({ uid: args.uid, email: args.email, purposeId: args.purposeId });
}

/** 과거에 생성된 Qwen 목적 동의도 철회 시 users와 users_index 모두 차단 상태로 기록한다. */
export async function revokeQwenPurposeConsent(args: {
  uid: string;
  email?: string;
  purposeId: QwenPersistedPurposeConsentId;
}) {
  if (!args.uid) {
    throw Object.assign(new Error("계정 식별 정보를 확인할 수 없습니다."), {
      errorCode: "ACCOUNT_IDENTITY_REQUIRED",
      status: 422,
    });
  }
  const before = await getQwenPurposeConsentStatus(args);
  if (!before.consents.some((consent) => !hasRevokedAt(consent.revokedAt))) return before;

  const revokedAt = new Date();
  const filter = {
    "consent.purposeId": args.purposeId,
    "consent.revokedAt": { $exists: false },
  };
  const { UserIndexModel, UserModel } = await purposeModels(args.uid);
  await Promise.all([
    UserIndexModel.updateOne(
      { $or: [{ uid: args.uid }, ...(args.email ? [{ userEmailLower: args.email.toLowerCase() }] : [])] },
      { $set: { "purposeConsents.$[consent].revokedAt": revokedAt } },
      { arrayFilters: [filter] },
    ),
    UserModel.updateOne(
      { uid: args.uid },
      { $set: { "purposeConsents.$[consent].revokedAt": revokedAt } },
      { arrayFilters: [filter] },
    ),
  ]);
  return getQwenPurposeConsentStatus(args);
}

export type VoiceDataErasureStorageAxis = {
  axis: "db" | "redis" | "r2" | "logs" | "analytics";
  target: string;
  persisted: false;
  reason: string;
};

/**
 * 현재 owner 결정(원음 transient·파생 학습 근거는 아직 영속 원장 없음)에 따른 삭제 계약.
 * users 문서의 purposeConsents 이력은 증빙을 위해 남기며, 계정 삭제 cascade에는 users가 포함된다.
 */
export const VOICE_DATA_ERASURE_STORAGE_AXES: readonly VoiceDataErasureStorageAxis[] = [
  { axis: "db", target: "voice_understanding", persisted: false, reason: "원음·분석 raw·점수를 새 영속 원장에 저장하지 않는다." },
  { axis: "redis", target: "voice_understanding:*", persisted: false, reason: "요청 수명 밖의 음성 이해 파생 데이터를 Redis에 저장하지 않는다." },
  { axis: "r2", target: "voice_understanding/", persisted: false, reason: "원본 음성과 파생 데이터를 R2에 저장하지 않는다." },
  { axis: "logs", target: "voice_understanding", persisted: false, reason: "원음·전사·분석 raw·점수를 로그에 기록하지 않는다." },
  { axis: "analytics", target: "voice_understanding", persisted: false, reason: "음성 이해 내용·점수·민감 근거를 analytics에 전송하지 않는다." },
];

export const VOICE_DATA_ERASURE_ACCOUNT_CASCADE_COLLECTIONS = ["users"] as const;
export const VOICE_DATA_ERASURE_DERIVED_RETENTION_DAYS = VOICE_DATA_CONSENT_DERIVED_RETENTION_DAYS;
export const VOICE_DATA_ERASURE_REVOCATION_SLA_HOURS = VOICE_DATA_CONSENT_REVOCATION_SLA_HOURS;

/** 현재 저장 대상이 구조적으로 0건임을 호출부·계약 테스트가 재사용할 수 있게 고정한다. */
export function collectVoiceDataErasureTargets(_uid: string): VoiceDataErasureStorageAxis[] {
  return [];
}
