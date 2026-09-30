import { NextRequest, NextResponse } from "next/server";
import { COOKIE_CONFIG } from "consts/token";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import * as cookie from "cookie";
import { recordLogin, getJwtExpServer } from "libs/server-utils/auth/loginUtils";
import { getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { logger } from "utils/log";
import { getServerSession } from "next-auth";
import { USER_ROLES, type UserRoles } from "consts/auth/userRoles";
import { ALL_ROLES, coerceUserRoles } from "libs/server-utils/auth/roleCoercion";
import { dbConnect } from "libs/database/mongoose";
import { UserSchema, UserIndexSchema } from "models/user";
import { ensureUserMeta } from "libs/server-utils/auth/accountLinker";
import { authOptions } from "src/auth";
import { getModel } from "libs/database/modelCache";
import { MONGODB_USERS_URL } from "consts/env/server";
import fetchClient from "libs/api/fetchClient";
import { setAuthTokenCookie, setSessionHintCookie } from "libs/server-utils/auth/authCookie";
import { getWpJwtEndpointWithToken } from "libs/server-utils/auth/wpJwt";
import { getWordPressSignupContext } from "libs/server-utils/auth/wordpressAccountService";
import {
  grantSignupBonusIfEligible,
  type SignupBonusRegistrationContext,
} from "libs/server-utils/payment/signupBonusGrantService";

import { getResponseStatus, toErrorMessage } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";
import type { IUserDocument } from "models/user";
import { touchUniverseLoginActivity } from "libs/server-utils/payment/universeWalletPolicyService";

type WpAuthMeResponse = {
  data: {
    user: {
      ID: string | number;
      user_email: string;
      display_name?: string;
    };
    roles?: unknown;
  };
};
/**
 * @docHint
 * @purpose API 라우트(auth / me) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain auth
 * @scope api
 */

const toUserRoles = (input: unknown): UserRoles[] => coerceUserRoles(input, [USER_ROLES.SUBSCRIBER]);

function resolveRegistrationSource(consents: unknown) {
  const first = Array.isArray(consents) ? toUnknownRecord(consents[0]) : {};
  const method = String(first.method || "");
  if (method === "platform_social_signup") return `platform_social_${String(first.provider || "unknown")}`;
  if (method === "magazine_social_signup") return `magazine_social_${String(first.provider || "unknown")}`;
  if (method === "platform_email_signup") return "platform_email";
  return "auth_me";
}

async function settleSignupBonus(uid: string, registration?: SignupBonusRegistrationContext | null) {
  try {
    const result = await grantSignupBonusIfEligible(uid, registration);
    if (result.status === "applied" || result.status === "cap_reached") {
      logger.log("[auth/me] 신규 가입 코인 지급 판정", { uid, status: result.status });
    }
    return result;
  } catch (error) {
    logger.warn("[auth/me] 신규 가입 코인 지급 실패(로그인은 계속)", {
      uid,
      errorCode: String((error as { errorCode?: string }).errorCode || "SIGNUP_BONUS_GRANT_FAILED"),
    });
    return null;
  }
}

// 기존 uid와 새 uid가 다를 때, 어떤 uid를 최종 canonical로 쓸지 결정하는 헬퍼
// - 콜론 없는 WP numeric uid를 최우선 / 둘 다 콜론 유/무가 같으면 기존 uid 우선
function resolveCanonicalUid(existingUid: string | undefined, newUid: string): string {
  if (!existingUid || existingUid === newUid) return newUid;

  const existingHasColon = existingUid.includes(":");
  const newHasColon = newUid.includes(":");

  // 1) WP numeric ID(콜론 없음)가 하나라도 있으면 그걸 우선
  if (!existingHasColon && newHasColon) {
    return existingUid;
  }
  if (existingHasColon && !newHasColon) {
    return newUid;
  }

  // 2) 둘 다 콜론 유/무가 같으면 기존 uid 우선
  return existingUid;
}

/**
 * /api/auth/me 안에서만 사용하는 내부용 user upsert 헬퍼
 * - /api/user 라우트(HTTP)를 거치지 않고 직접 MongoDB 업데이트
 * - 이메일 / 이메일Lower / roles 정도만 책임
 */
async function upsertUserFromAuthMe(params: {
  uid: string;
  userEmail: string;
  userEmailLower: string;
  roles: UserRoles[];
}) {
  const { uid, userEmail, userEmailLower, roles } = params;

  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);

  const existingUser = await UserModel.findOne({ uid });

  if (existingUser) {
    let shouldSave = false;

    // 이메일 변경
    if (existingUser.userEmail !== userEmail) {
      existingUser.userEmail = userEmail;
      (existingUser as IUserDocument & { userEmailLower?: string }).userEmailLower = userEmailLower;
      existingUser.markModified("userEmail");
      existingUser.markModified("userEmailLower");
      shouldSave = true;
    }

    // roles 변경 여부 체크
    const prevRoles: UserRoles[] = Array.isArray(existingUser.roles)
      ? (existingUser.roles as unknown[]).filter((r): r is UserRoles => ALL_ROLES.has(r as UserRoles))
      : [];
    const nextRoles: UserRoles[] = toUserRoles(roles);

    const rolesChanged =
      prevRoles.length !== nextRoles.length ||
      prevRoles.some((r) => !nextRoles.includes(r)) ||
      nextRoles.some((r) => !prevRoles.includes(r));

    if (rolesChanged) {
      existingUser.roles = nextRoles;
      existingUser.markModified("roles");
      shouldSave = true;
    }

    if (shouldSave) {
      await existingUser.save();
      logger.log("[auth/me] 기존 유저 정보 갱신 완료:", { uid, roles: nextRoles });
    }

    return { user: existingUser, created: false };
  }

  // 새 유저 문서 생성 (필수 필드 중심)
  const newUser = new UserModel({
    uid,
    userEmail,
    userEmailLower,
    roles: toUserRoles(roles),
    loginStats: {},
    personas: {},
    userPersonas: {},
    gameStats: {},
    lastAccessedUniverse: "",
    userInfo: {},
  });

  await newUser.save();
  logger.log("[auth/me] 새 유저 문서 생성:", { uid, roles: newUser.roles });

  return { user: newUser, created: true };
}

export async function GET(req: NextRequest) {
  try {
    // 1) NextAuth 세션 우선 확인 (소셜 로그인 분기)
    const session = (await getServerSession(authOptions)) as
      | (Awaited<ReturnType<typeof getServerSession>> & {
          user?: {
            id?: string;
            email?: string | null;
            name?: string | null;
            signupCompleted?: boolean;
            registrationSource?: string;
          };
          expires?: string;
        })
      | null;

    if (session?.user?.id) {
      const rawUid = session.user.id as string;
      const email = session.user.email as string | undefined;
      const displayName = session.user.name as string | undefined;

      // 이메일 동의가 없으면 내부 user 업데이트가 의미가 없어서 명시적으로 에러 처리
      if (!email) {
        return NextResponse.json(
          { authenticated: false, message: "이메일 동의가 필요합니다. 소셜 로그인 동의 설정을 확인해주세요." },
          { status: 403 },
        );
      }

      const emailLower = email.toLowerCase();

      // 동일 이메일로 이미 존재하는 "기존 계정" 탐색 (User 인덱스 사용)
      const conn = await dbConnect(MONGODB_USERS_URL);
      const UserIndexModel =
        conn.models.UserIndex || conn.model("UserIndex", UserIndexSchema, "users_index");
      const existing = (await UserIndexModel.findOne({ userEmailLower: emailLower }).lean()) as
        | { uid?: unknown; roles?: unknown; policyConsents?: unknown }
        | null;

      // canonicalUid 결정 (WP numeric uid 최우선)
      const canonicalUid = resolveCanonicalUid(existing?.uid ? String(existing.uid) : undefined, rawUid);

      // roles 결정: 기존 유저 roles가 있으면 최대한 존중
      let rolesForUpdate: UserRoles[] = [];
      if (existing && Array.isArray(existing.roles)) {
        const filtered = toUserRoles(existing.roles);
        if (filtered.length > 0) {
          rolesForUpdate = filtered;
        }
      }
      if (rolesForUpdate.length === 0) {
        rolesForUpdate = [USER_ROLES.SUBSCRIBER];
      }

      // 메타 보장
      await ensureUserMeta({ uid: canonicalUid, email, name: displayName });

      // 프론트 호환을 위한 WP-like 응답 구조
      const wpLike = {
        data: {
          user: {
            ID: canonicalUid,
            user_email: email,
            display_name: displayName || "",
          },
          roles: rolesForUpdate,
        },
      };

      // Mongo 사용자 정보 동기화 (HTTP /api/user 대신 직접 upsert)
      const userSync = await upsertUserFromAuthMe({
        uid: canonicalUid,
        userEmail: email,
        userEmailLower: emailLower,
        roles: rolesForUpdate,
      });
      await settleSignupBonus(canonicalUid);
      const signupCompleted = session.user.signupCompleted === true && userSync.created;
      const registrationSource = session.user.registrationSource || resolveRegistrationSource(existing?.policyConsents);

      // 세션 만료 시각을 토큰 exp와 동일하게 내려 프론트의 자동 리프레시 로직과 맞춤
      const expSec = session.expires ? Math.floor(new Date(session.expires).getTime() / 1000) : null;

      // 최근 로그인 세션 쿠키 유지 (30분 규칙)
      const cookiesHeader = req.headers.get("cookie") || "";
      const parsedCookies = cookie.parse(cookiesHeader);
      const sessionKey = `last_login_${canonicalUid}`;
      const lastLoginTimestamp = parsedCookies[sessionKey];
      const currentTime = Date.now();
      const isNewLogin = !lastLoginTimestamp || currentTime - parseInt(lastLoginTimestamp) > 1800000;

      if (isNewLogin) {
        // 로그인 기록 남기기
        await recordLogin(canonicalUid, {
          ip: req.headers.get("x-forwarded-for") || "unknown",
          userAgent: req.headers.get("user-agent") || "",
          device: parsedCookies[COOKIE_CONFIG.DEVICE_TYPE.name] || "unknown",
        });
        await touchUniverseLoginActivity(email).catch((error) =>
          logger.warn("[auth/me] 유니버스 활동 시각 갱신 실패(로그인은 계속):", error),
        );

        const res = NextResponse.json({
          authenticated: true,
          user: wpLike,
          data: {
            tokenExp: expSec,
            signupCompleted,
            registrationSource,
          },
        });

        // 세션 쿠키 설정 (HTTP only 아님, 클라이언트에서 접근 가능)
        res.cookies.set(sessionKey, String(currentTime), {
          maxAge: 86400, // 1일
          path: "/",
        });

        return res;
      }

      // 새 로그인 아님 → 정보만 반환
      return NextResponse.json({
        authenticated: true,
        user: wpLike,
        data: {
          tokenExp: expSec,
          signupCompleted,
          registrationSource,
        },
      });
    }

    // 2) NextAuth 세션이 없으면 WP JWT 토큰 분기
    const cookiesHeader = req.headers.get("cookie") || "";
    const parsedCookies = cookie.parse(cookiesHeader);
    const authToken = parsedCookies[COOKIE_CONFIG.AUTH_TOKEN.name];

    if (!authToken) {
      return NextResponse.json(
        {
          authenticated: false,
          message: "인증 토큰이 없습니다. 로그인 후 다시 시도하세요.",
        },
        { status: 401 },
      );
    }

    // WordPress API 호출
    let userData!: WpAuthMeResponse;
    try {
      const validateUrl = getWpJwtEndpointWithToken("validate", authToken);
      const r = await fetchClient.post<WpAuthMeResponse>(validateUrl, undefined, {
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        timeout: 15_000,
        cache: "no-store",
      });
      userData = r.data;
    } catch (e) {
      const status = getResponseStatus(e) ?? 401;
      let errorMessage = "토큰이 만료되었거나 올바르지 않습니다.";
      if (status === 401) errorMessage = "인증이 만료되었습니다. 다시 로그인하세요.";
      else if (status === 403) errorMessage = "접근이 거부되었습니다.";
      return NextResponse.json({ authenticated: false, message: errorMessage, status }, { status });
    }
    logger.log("me api response userData => ", userData);

    const wpSignupContext = await getWordPressSignupContext(Number(userData.data.user.ID)).catch((error) => {
      logger.warn("[auth/me] WordPress 가입 컨텍스트 조회 실패(로그인은 계속)", {
        uid: String(userData.data.user.ID),
        errorCode: String((error as { errorCode?: string }).errorCode || "WORDPRESS_SIGNUP_CONTEXT_FAILED"),
      });
      return null;
    });

    await ensureUserMeta({
      uid: String(userData.data.user.ID), // WP uid (':' 없는 형태)
      email: userData.data.user.user_email,
      name: userData.data.user.display_name || "",
    });

    // 로그인 세션 체크를 위한 쿠키 확인
    const sessionKey = `last_login_${userData.data.user.ID}`;
    const lastLoginTimestamp = parsedCookies[sessionKey];
    const currentTime = new Date().getTime();

    // 마지막 로그인 시간과 현재 시간 차이가 30분 이상이거나 마지막 로그인 기록이 없는 경우 새 로그인으로 간주
    const isNewLogin = !lastLoginTimestamp || currentTime - parseInt(lastLoginTimestamp) > 1800000;

    // getUserRole 함수 사용하여 역할 검증
    const validatedRolesRaw = getUserRole({
      uid: String(userData.data.user.ID),
      userEmail: userData.data.user.user_email,
      userEmailLower: userData.data.user.user_email.toLowerCase(),
      roles: userData.data.roles as UserRoles[],
    });

    logger.log("역할 검증 완료:", {
      원본: userData.data.roles,
      검증후: validatedRolesRaw,
    });

    const normalizedRoles = toUserRoles(validatedRolesRaw);

    // 사용자 정보 업데이트 - HTTP 호출 대신 직접 upsert
    const userSync = await upsertUserFromAuthMe({
      uid: String(userData.data.user.ID),
      userEmail: userData.data.user.user_email,
      userEmailLower: userData.data.user.user_email.toLowerCase(),
      roles: normalizedRoles,
    });
    await settleSignupBonus(
      String(userData.data.user.ID),
      wpSignupContext
        ? {
            signupCompletedAt: wpSignupContext.signupCompletedAt,
            registrationSource: wpSignupContext.registrationSource,
          }
        : null,
    );
    const signupCompleted = userSync.created && wpSignupContext?.registrationSource === "platform_email";

    if (isNewLogin) {
      await recordLogin(String(userData.data.user.ID), {
        ip: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "",
        device: parsedCookies[COOKIE_CONFIG.DEVICE_TYPE.name] || "unknown",
      });
      await touchUniverseLoginActivity(userData.data.user.user_email).catch((error) =>
        logger.warn("[auth/me] 유니버스 활동 시각 갱신 실패(로그인은 계속):", error),
      );

      // 세션 쿠키 설정 - 30분 유효
      const responseJson = NextResponse.json({
        authenticated: true,
        user: userData,
        data: {
          tokenExp: getJwtExpServer(authToken),
          signupCompleted,
          registrationSource: wpSignupContext?.registrationSource || "magazine_email",
        },
      });

      responseJson.cookies.set(sessionKey, currentTime.toString(), {
        maxAge: 86400, // 1일
        path: "/",
      });
      setAuthTokenCookie(responseJson, authToken);
      setSessionHintCookie(responseJson);
      responseJson.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      responseJson.headers.set("Pragma", "no-cache");

      return responseJson;
    }

    // 새 로그인이 아닌 경우 로그 추가 없이 사용자 정보만 반환
    const responseJson = NextResponse.json({
      authenticated: true,
      user: userData,
      data: {
        tokenExp: getJwtExpServer(authToken),
        signupCompleted,
        registrationSource: wpSignupContext?.registrationSource || "magazine_email",
      },
    });
    setAuthTokenCookie(responseJson, authToken);
      setSessionHintCookie(responseJson);
    responseJson.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    responseJson.headers.set("Pragma", "no-cache");
    return responseJson;
  } catch (error) {
    logger.error("사용자 정보를 가져오는 중 오류 발생:", error);

    return NextResponse.json(
      {
        authenticated: false,
        message: "사용자 정보를 가져오는 중 오류가 발생했습니다.",
        error: toErrorMessage(error, "알 수 없는 오류"),
      },
      { status: 500 },
    );
  }
}
