import "server-only";
import { USER_ROLES, USER_ACCOUNT_TYPE } from "consts/auth";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import type { IUpdateUserData, IUserInfo } from "types/user";
import type { UserAccountType, UserRoles } from "consts/auth";
import type { IUniverse } from "types/game";
import { getModel } from "libs/database/modelCache";
import type { IUserDocument } from "models/user";
import { UserSchema } from "models/user";
import type { LanguageType } from "types/language";
import { MONGODB_USERS_URL } from "consts/env/server";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process getUserRole 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain auth
 * @scope server
 */

// WordPress 사용자 역할 가져오기
export function getUserRole(userData: IUpdateUserData): UserRoles[] {
  if (!userData || !userData.roles) {
    return [USER_ROLES.SUBSCRIBER]; // 기본 역할
  }

  // 문자열, 배열, 또는 다른 형식의 역할 처리
  let roles: string[] = [];
  if (typeof userData.roles === "string") {
    roles = [userData.roles];
  } else if (Array.isArray(userData.roles)) {
    roles = userData.roles;
  } else if (typeof userData.roles === "object") {
    roles = Object.keys(userData.roles);
  }

  // WordPress 역할만 필터링
  const validRoles = Object.values(USER_ROLES);
  const wpRoles = roles.filter((role) => validRoles.includes(role as UserRoles)) as UserRoles[];

  return wpRoles.length > 0 ? wpRoles : [USER_ROLES.SUBSCRIBER];
}

// MongoDB에서 사용자 정보 가져오기
export async function getUserFromDB(userId: string) {
  try {
    const modelName = `${MONGODB_USER_MODEL_PREFIX}${userId}`;
    const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
    return await UserModel.findOne({ uid: userId });
  } catch (error) {
    logger.error(`사용자 정보 조회 오류:`, error);
    return null;
  }
}

// 사용자의 계정 권한(free, pro, premium, ...)을 가져오기
export function getUserAccountType(userData: IUpdateUserData): UserAccountType {
  // MongoDB의 accountType이 있으면 우선 사용
  if (userData && userData.accountType) {
    const raw = String(userData.accountType).trim().toLowerCase();
    const valid = Object.values(USER_ACCOUNT_TYPE) as string[];
    if (valid.includes(raw)) return raw as UserAccountType;
  }

  return USER_ACCOUNT_TYPE.FREE;
}

// 사용자 언어 설정 업데이트
export async function updateUserLanguage(userId: string, language: LanguageType) {
  try {
    const modelName = `${MONGODB_USER_MODEL_PREFIX}${userId}`;
    const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);

    // 사용자 문서 찾기
    const user = await UserModel.findOne({ uid: userId });

    if (user) {
      // 기존 userInfo 객체가 있으면 language만 업데이트
      if (user.userInfo) {
        user.userInfo.language = language;
      } else {
        // userInfo 객체가 없으면 새로 생성
        user.userInfo = { language } as IUserInfo;
      }

      await user.save();
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`사용자 언어 설정 업데이트 오류:`, error);
    return false;
  }
}

// 유니버스 편집 권한 체크
export function canEditUniverse(user: IUpdateUserData, universe?: IUniverse): boolean {
  const userRoles = getUserRole(user);

  // 1. administrator는 모든 유니버스 편집 가능
  if (userRoles.includes(USER_ROLES.ADMINISTRATOR)) {
    return true;
  }

  // 2. universe 정보가 없으면 기본 접근 권한만 체크 (목록 조회 등)
  if (!universe) {
    return true;
  }

  // 3. commerce 타입이 아니면 편집 불가
  if (universe.type !== "commerce") {
    return false;
  }

  // 4. commerce 타입이고 해당 유니버스의 관리자로 등록된 경우만 편집 가능
  const emailLower =
    (user?.userEmailLower as string) || (typeof user?.userEmail === "string" ? user.userEmail.toLowerCase() : "");
  if (!emailLower) return false;

  const billingOwnerEmail = String(universe.billingOwnerEmail || "").trim().toLowerCase();
  if (billingOwnerEmail && billingOwnerEmail === emailLower) return true;
  const commerceAdmins = (universe as IUniverse & { commerceAdmins?: unknown }).commerceAdmins;
  const admins = Array.isArray(commerceAdmins) ? (commerceAdmins as unknown[]) : [];
  return admins.some((e) => String(e).toLowerCase() === emailLower);
}

// 결제·환불은 명시적 billingOwner만 수행한다. 기존 데이터는 첫 commerceAdmin을 임시 소유자로 본다.
export function canManageUniverseBilling(user: IUpdateUserData, universe?: IUniverse): boolean {
  if (!universe || universe.type !== "commerce") return false;
  const emailLower =
    (user?.userEmailLower as string) || (typeof user?.userEmail === "string" ? user.userEmail.toLowerCase() : "");
  if (!emailLower) return false;
  const owner = String(universe.billingOwnerEmail || universe.commerceAdmins?.[0] || "").trim().toLowerCase();
  return Boolean(owner && owner === emailLower);
}

// 유니버스 상세 데이터 편집 권한 체크
export function canEditUniverseDetails(user: IUpdateUserData, universe: IUniverse): boolean {
  return canEditUniverse(user, universe);
}
