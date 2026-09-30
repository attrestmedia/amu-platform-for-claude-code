import "server-only";
import {
  getNarrativePrivacyPreference,
  purgeUserNarrativeData,
  upsertNarrativePrivacyPreference,
} from "libs/database/game";
import { getModel } from "libs/database/modelCache";
import { UserSchema, type IUserDocument } from "models/user/UserSchema";
import { MONGODB_USERS_URL } from "consts/env/server";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import {
  NARRATIVE_LIFECYCLE_POLICY,
  TUTOR_PLAY_PROJECTION_CONSENT_VERSION,
  type INarrativePrivacyPreferenceDoc,
  type NarrativePilotEligibilityInput,
} from "types/game";
import { isNarrativeRuntimeEnabled } from "libs/server-utils/narrative/narrativeRuntimePolicy";

export { isNarrativeRuntimeEnabled } from "libs/server-utils/narrative/narrativeRuntimePolicy";

/**
 * @docHint
 * @purpose Narrative Runtime의 feature flag·동의·파일럿 lifecycle 경계
 * @process 기본 비활성  사용자 동의 확인  cross-service projection 권한  계정 삭제 위임
 * @domain narrative-privacy
 * @scope server
 */

export function isNarrativePilotEligible(input: NarrativePilotEligibilityInput) {
  return Boolean(
    input.narrativeRuntimeEnabled &&
      input.pilotCohortEnabled &&
      input.isMinor === false &&
      input.personalCanonStatus === "active" &&
      !["deletion_pending", "deleted"].includes(String(input.accountStatus || "")),
  );
}

export async function getNarrativeConsent(uid: string) {
  return (await getNarrativePrivacyPreference(uid)) || {
    uid,
    personalCanonStatus: NARRATIVE_LIFECYCLE_POLICY.defaultStatus,
    crossServiceMemoryConsent: NARRATIVE_LIFECYCLE_POLICY.crossServiceMemory.default,
    crossServiceConsentVersion: null,
    consentVersion: NARRATIVE_LIFECYCLE_POLICY.version,
    consentedAt: null,
    withdrawnAt: null,
  } satisfies INarrativePrivacyPreferenceDoc;
}

export async function assertNarrativeCollectionAllowed(uid: string, options?: { crossService?: boolean }) {
  const preference = await getNarrativeConsent(uid);
  if (preference.personalCanonStatus !== "active") throw new Error("NARRATIVE_CONSENT_REQUIRED");
  if (options?.crossService && preference.crossServiceMemoryConsent !== "granted") {
    throw new Error("NARRATIVE_CROSS_SERVICE_CONSENT_REQUIRED");
  }
  return preference;
}

export async function updateNarrativeConsent(input: {
  uid: string;
  personalCanonStatus: "active" | "opted_out";
  crossServiceMemoryConsent: "not_granted" | "granted" | "withdrawn";
  crossServiceConsentVersion?: string;
  consentVersion?: string;
  purposeAcknowledged?: boolean;
}) {
  if (input.personalCanonStatus === "active" && !isNarrativeRuntimeEnabled()) {
    throw new Error("NARRATIVE_RUNTIME_DISABLED");
  }
  if (input.personalCanonStatus === "active" && (input.consentVersion !== NARRATIVE_LIFECYCLE_POLICY.version || input.purposeAcknowledged !== true)) {
    throw new Error("NARRATIVE_CONSENT_VERSION_REQUIRED");
  }
  if (
    input.personalCanonStatus === "active" &&
    input.crossServiceMemoryConsent === "granted" &&
    (input.crossServiceConsentVersion !== TUTOR_PLAY_PROJECTION_CONSENT_VERSION || input.purposeAcknowledged !== true)
  ) {
    throw new Error("NARRATIVE_CROSS_SERVICE_CONSENT_VERSION_REQUIRED");
  }
  return upsertNarrativePrivacyPreference({
    ...input,
    crossServiceMemoryConsent: input.personalCanonStatus === "active" ? input.crossServiceMemoryConsent : "withdrawn",
    consentVersion: NARRATIVE_LIFECYCLE_POLICY.version,
  });
}

export async function deleteUserNarrativeData(uid: string) {
  return purgeUserNarrativeData(uid);
}

/**
 * OOC-045 신뢰형 미성년 판정 — 클라이언트 입력이 아닌 서버 DB의 가입 birthdate로만 판정한다.
 * birthdate가 없거나 해석 불가능하면 fail-closed로 미성년 취급해 pilot cohort에서 제외한다.
 */
export async function resolveTrustedMinorStatus(uid: string): Promise<{
  isMinor: boolean;
  minorSource: "birthdate" | "unknown_fail_closed";
}> {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) return { isMinor: true, minorSource: "unknown_fail_closed" };
  const userModelName = `${MONGODB_USER_MODEL_PREFIX}${normalizedUid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, userModelName, UserSchema, userModelName);
  const user = await UserModel
    .findOne({ $or: [{ uid: normalizedUid }, { ID: normalizedUid }] })
    .lean<(IUserDocument & { birthdate?: string }) | null>();
  const birthdate = String(user?.birthdate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(birthdate)) return { isMinor: true, minorSource: "unknown_fail_closed" };
  const birth = new Date(birthdate.slice(0, 10));
  if (Number.isNaN(birth.getTime())) return { isMinor: true, minorSource: "unknown_fail_closed" };
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return { isMinor: age < 19, minorSource: "birthdate" };
}

/**
 * 서버 권위 pilot eligibility — 동의·runtime flag·신뢰형 미성년 판정·계정 상태를 종합한다.
 */
export async function resolveNarrativePilotEligibility(input: {
  uid: string;
  pilotCohortEnabled: boolean;
  accountStatus?: string;
}) {
  const [preference, minor] = await Promise.all([getNarrativeConsent(input.uid), resolveTrustedMinorStatus(input.uid)]);
  const eligible = isNarrativePilotEligible({
    narrativeRuntimeEnabled: isNarrativeRuntimeEnabled(),
    pilotCohortEnabled: input.pilotCohortEnabled,
    isMinor: minor.isMinor,
    personalCanonStatus: preference.personalCanonStatus as "active" | "opted_out",
    accountStatus: input.accountStatus,
  });
  return { eligible, isMinor: minor.isMinor, minorSource: minor.minorSource, preference };
}
