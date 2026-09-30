import "server-only";
import mongoose from "mongoose";
import { dbConnect } from "libs/database/mongoose";
import type { IUserIndexDocument } from "models/user";
import { UserIndexSchema } from "models/user";
import { MONGODB_USERS_URL } from "consts/env/server";
import { logger } from "utils/log";
import { accountIdentityHash } from "./accountIdentity";
import {
  deleteWordPressAccount,
  ensureWordPressAccount,
  findWordPressUserByEmail,
  saveWordPressPolicyConsents,
} from "./wordpressAccountService";
import type { currentPolicyConsents } from "consts/legal/accountPolicy";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process ensureUserMeta 중심 처리  입력 검증  핵심 로직  결과 포맷팅  이미지 파이프라인 호출 포함
 * @domain auth
 * @scope server
 */

type LinkInput = {
  provider: string;
  providerAccountId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  allowCreate?: boolean;
  policyConsents?: ReturnType<typeof currentPolicyConsents>;
  registrationSource?: "magazine" | "platform";
  profile?: Record<string, unknown>;
};

export type LinkedSocialAccount = {
  uid: string;
  email: string;
  signupCompleted: boolean;
  registrationSource: string;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function ensureUserMeta(args: {
  uid: string; // 선호 uid (':' 없는 uid)
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  const { uid, email, name } = args;
  if (!email) throw new Error("ensureUserMeta: email is required");

  const conn = await dbConnect(MONGODB_USERS_URL);
  const UserIndexModel: mongoose.Model<IUserIndexDocument> =
    (conn.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    conn.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");

  const emailLower = email.toLowerCase();

  // 같은 이메일의 기존 메타 문서 조회
  const existing = await UserIndexModel.findOne({ userEmailLower: emailLower }).lean();
  if (existing?.accountStatus && existing.accountStatus !== "active") {
    throw Object.assign(new Error("탈퇴 처리 중이거나 탈퇴가 완료된 계정입니다."), {
      errorCode: "ACCOUNT_DELETION_PENDING",
      status: 403,
    });
  }

  // ① 기존 문서가 있고, 거기에 저장된 uid가 소셜형(uid에 ':')이고
  //    이번에 들어온 uid가 ':' 없는 WP uid라면 → 캐논컬 uid를 WP로 바꿔줌
  if (existing && existing.uid !== uid && !uid.includes(":") && existing.uid.includes(":")) {
    await UserIndexModel.updateOne(
      { _id: existing._id },
      {
        $set: {
          uid,
          userEmail: email,
          userEmailLower: emailLower,
          ...(name ? { "userInfo.name": name } : {}),
        },
      },
    );
    return uid;
  }

  // ② 나머지 케이스: upsert로 메타 보장
  await UserIndexModel.updateOne(
    { $or: [{ uid }, { userEmailLower: emailLower }] },
    {
      $set: {
        uid,
        userEmail: email,
        userEmailLower: emailLower,
        ...(name ? { "userInfo.name": name } : {}),
      },
      $setOnInsert: {
        createdAt: new Date(),
        accountStatus: "active",
        identityHash: accountIdentityHash(email),
      },
    },
    { upsert: true },
  );

  return uid;
}

/**
 * 소셜 로그인과 기존 사용자(이메일 기준)를 통합하고, "정규화된 uid"를 반환
 * - 같은 이메일의 기존 문서가 있으면 그 문서의 uid를 유지(WP uid)
 * - 없으면 WordPress 회원을 먼저 만들고 숫자형 통합 uid를 사용
 */
export async function linkSocialToExistingUserByEmail(
  input: LinkInput,
): Promise<LinkedSocialAccount> {
  const {
    provider,
    providerAccountId,
    email,
    name,
    allowCreate = false,
    policyConsents = [],
    registrationSource = "platform",
    profile,
  } = input;

  // 1) DB 연결 & 모델 확보
  const conn = await dbConnect(MONGODB_USERS_URL);
  const UserIndexModel: mongoose.Model<IUserIndexDocument> =
    (conn.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    conn.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");

  // 2) provider 연결을 먼저 찾는다. 동일 provider/account ID가 여러 계정에 연결된 상태는
  // 임의 선택하지 않고 fail-closed 한다.
  const linkedCandidates = await UserIndexModel.find({
    providers: { $elemMatch: { provider, providerAccountId: String(providerAccountId) } },
  }).limit(2).lean();
  if (linkedCandidates.length > 1) {
    throw Object.assign(new Error("소셜 계정 연결 상태를 확인할 수 없습니다."), {
      errorCode: "PROVIDER_LINK_AMBIGUOUS",
      status: 409,
    });
  }
  const linked = linkedCandidates[0];
  if (linked) {
    if (!/^\d+$/.test(String(linked.uid || ""))) {
      throw Object.assign(new Error("연결된 계정을 확인할 수 없습니다."), {
        errorCode: "PROVIDER_ACCOUNT_INVALID",
        status: 403,
      });
    }
    if (linked.accountStatus && linked.accountStatus !== "active") {
      throw Object.assign(new Error("탈퇴 처리 중이거나 탈퇴가 완료된 계정입니다."), {
        errorCode: "ACCOUNT_DELETION_PENDING",
        status: 403,
      });
    }
    const canonicalEmail = String(linked.userEmail || linked.userEmailLower || "").trim();
    if (!canonicalEmail) {
      throw Object.assign(new Error("연결된 계정의 이메일을 확인할 수 없습니다."), {
        errorCode: "PROVIDER_ACCOUNT_INVALID",
        status: 403,
      });
    }
    if (policyConsents.length) {
      const wpUser = await findWordPressUserByEmail(canonicalEmail);
      if (wpUser) await saveWordPressPolicyConsents(wpUser.id, policyConsents);
      await UserIndexModel.updateOne({ _id: linked._id }, { $push: { policyConsents: { $each: policyConsents } } });
    }
    return {
      uid: String(linked.uid),
      email: canonicalEmail,
      signupCompleted: false,
      registrationSource: `${registrationSource}_social_${provider}`,
    };
  }

  if (!email) {
    throw Object.assign(new Error("소셜 이메일 제공 동의가 필요합니다."), {
      errorCode: "PROVIDER_EMAIL_REQUIRED",
      status: 403,
    });
  }

  // 3) 이메일(소문자) 기준으로 기존 사용자 찾기
  const emailLower = email.toLowerCase();

  // 중복 문서가 혹시 존재할 수 있어 우선 순위 규칙 부여:
  // - uid에 ":"가 없는(=WP 등 기존 계정) 문서 우선 / createdAt이 더 오래된 문서 우선(안정성)
  const candidates = await UserIndexModel.find({
    $or: [
      { userEmailLower: emailLower },
      { userEmail: email }, // 정확 일치
      { userEmail: new RegExp(`^${escapeRegex(email)}$`, "i") }, // 대소문자 무시
    ],
  })
    .sort({ createdAt: 1 })
    .lean();

  const chosen = candidates.find((u) => typeof u.uid === "string" && !u.uid.includes(":")) || candidates[0];
  if (chosen?.accountStatus && chosen.accountStatus !== "active") {
    throw Object.assign(new Error("탈퇴 처리 중이거나 탈퇴가 완료된 계정입니다."), {
      errorCode: "ACCOUNT_DELETION_PENDING",
      status: 403,
    });
  }

  // provider 미연결 상태에서 기존 이메일 계정과 자동 연결하려면 provider가 이메일 소유권을 보증해야 한다.
  const profileRecord = toUnknownRecord(profile);
  const kakaoAccount = toUnknownRecord(profileRecord.kakao_account || toUnknownRecord(profileRecord.response).kakao_account);
  const providerEmailVerified =
    provider === "google"
      ? profileRecord.email_verified === true
      : provider === "kakao"
        ? kakaoAccount.is_email_valid === true && kakaoAccount.is_email_verified === true
        : false;
  // 매거진에서 시작한 소셜 가입·재동의는 기존 numeric UID 계정도 WordPress 동의 이력을 함께 갱신해야 한다.
  let wpUser = !chosen || chosen.uid.includes(":") || policyConsents.length
    ? await findWordPressUserByEmail(email)
    : null;
  if (chosen || wpUser) {
    if (!providerEmailVerified) {
      throw Object.assign(new Error("소셜 이메일 소유권 확인이 필요합니다."), {
        errorCode: "PROVIDER_EMAIL_UNVERIFIED",
        status: 403,
      });
    }
  }

  const isNewIntegratedAccount = !chosen && !wpUser;
  if (!chosen && !wpUser && !allowCreate) {
    throw Object.assign(new Error("신규 소셜 회원가입에는 이용약관과 개인정보처리방침 동의가 필요합니다."), {
      errorCode: "SIGNUP_CONSENT_REQUIRED",
      status: 403,
    });
  }
  if ((!chosen || chosen.uid.includes(":")) && !wpUser) {
    if (!allowCreate) {
      throw Object.assign(new Error("통합회원 전환을 위해 회원가입 동의가 필요합니다."), {
        errorCode: "SIGNUP_CONSENT_REQUIRED",
        status: 403,
      });
    }
    wpUser = await ensureWordPressAccount({ email, name: name || undefined });
  }

  const canonicalUid = wpUser ? String(wpUser.id) : String(chosen!.uid);
  const socialUid = `${provider}:${providerAccountId}`;
  const now = new Date();
  const consentUpdate = policyConsents.length
    ? { $push: { policyConsents: { $each: policyConsents } } }
    : {};

  if (wpUser && policyConsents.length) {
    try {
      await saveWordPressPolicyConsents(wpUser.id, policyConsents);
    } catch (error) {
      if (isNewIntegratedAccount) await deleteWordPressAccount(wpUser.id).catch(() => undefined);
      throw error;
    }
  }

  await UserIndexModel.updateOne(
    chosen ? { _id: chosen._id } : { userEmailLower: emailLower },
    {
      $set: {
        uid: canonicalUid,
        userEmail: email,
        userEmailLower: emailLower,
        identityHash: accountIdentityHash(email),
        accountStatus: "active",
        ...(chosen?.userInfo?.name ? {} : { "userInfo.name": name || "" }),
      },
      $setOnInsert: { createdAt: now },
      $pull: { providers: { uid: socialUid } },
      ...consentUpdate,
    },
    { upsert: true },
  );
  await UserIndexModel.updateOne(
    { userEmailLower: emailLower },
    {
      $push: {
        providers: {
          provider,
          providerAccountId: String(providerAccountId),
          uid: socialUid,
          linkedAt: now,
        },
      },
    },
  );

  const target = await UserIndexModel.findOne({ userEmailLower: emailLower }, { _id: 1 }).lean();
  const targetId = target?._id || null;

  logger.log("[accountLinker] 통합 완료", {
    identityHash: accountIdentityHash(email),
    provider,
    canonicalUid,
    targetId,
    isNewIntegratedAccount,
  });

  return {
    uid: canonicalUid,
    email,
    signupCompleted: isNewIntegratedAccount,
    registrationSource: `${registrationSource}_social_${provider}`,
  };
}
export async function syncUserMetaOnProfileUpdate({ uid, email, name }: { uid: string; email: string; name?: string }) {
  const conn = await dbConnect(MONGODB_USERS_URL);
  const UserIndexModel: mongoose.Model<IUserIndexDocument> =
    (conn.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    conn.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");
  const emailLower = email.toLowerCase();

  const existing = await UserIndexModel.findOne({ $or: [{ uid }, { userEmailLower: emailLower }] }).lean();
  // WP(uid에 ':' 없음)가 이미 있으면 그걸 캐논컬로 유지
  const nextUid = existing?.uid && !existing.uid.includes(":") ? existing.uid : uid;

  await UserIndexModel.updateOne(
    { $or: [{ uid: nextUid }, { userEmailLower: emailLower }] },
    {
      $set: {
        uid: nextUid,
        userEmail: email,
        userEmailLower: emailLower,
        ...(name ? { "userInfo.name": name } : {}),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}
