import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import KakaoProvider from "next-auth/providers/kakao";
import NaverProvider from "next-auth/providers/naver";
import { linkSocialToExistingUserByEmail, type LinkedSocialAccount } from "libs/server-utils/auth/accountLinker";
import { recordEmailVerified } from "libs/server-utils/auth/emailVerification";
import { logger } from "utils/log";
import { isProduct } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";
import { cookies } from "next/headers";
import { CURRENT_ACCOUNT_POLICY, currentPolicyConsents } from "consts/legal/accountPolicy";
import { consumeSignupIntent, SIGNUP_INTENT_COOKIE } from "libs/server-utils/auth/signupIntent";
import { consumeMagazineLoginIntent, MAGAZINE_LOGIN_INTENT_COOKIE } from "libs/server-utils/auth/magazineLoginIntent";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  KAKAO_CLIENT_ID,
  KAKAO_CLIENT_SECRET,
  NAVER_CLIENT_ID,
  NAVER_CLIENT_SECRET,
  NEXTAUTH_SECRET,
} from "consts/env/server";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain auth
 * @scope server-auth
 */

function pickAuthString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function providerGuaranteesEmailVerification(provider: string, profile: Record<string, unknown>) {
  if (provider === "google") return profile.email_verified === true;
  if (provider === "apple") return true;
  return false;
}

function setLinkedAuthResult(user: unknown, result: LinkedSocialAccount) {
  if (!user || typeof user !== "object") return;
  Object.assign(user, { __amuLinkedAuthResult: result });
}

function getLinkedAuthResult(user: unknown): LinkedSocialAccount | null {
  const record = toUnknownRecord(user);
  const value = toUnknownRecord(record.__amuLinkedAuthResult);
  if (
    !value.uid ||
    !value.email ||
    typeof value.signupCompleted !== "boolean" ||
    typeof value.registrationSource !== "string"
  ) return null;
  return {
    uid: String(value.uid),
    email: String(value.email),
    signupCompleted: value.signupCompleted,
    registrationSource: value.registrationSource,
  };
}

const PUBLIC_AUTH_ERROR_CODES = new Set([
  "ACCOUNT_DELETION_PENDING",
  "MAGAZINE_LOGIN_INTENT_INVALID",
  "PROVIDER_ACCOUNT_INVALID",
  "PROVIDER_EMAIL_REQUIRED",
  "PROVIDER_EMAIL_UNVERIFIED",
  "PROVIDER_LINK_AMBIGUOUS",
  "SIGNUP_CONSENT_REQUIRED",
  "SIGNUP_INTENT_INVALID",
  "SOCIAL_AUTH_FAILED",
]);

function publicAuthErrorCode(error: unknown) {
  const code = String((error as { errorCode?: unknown })?.errorCode || "SOCIAL_AUTH_FAILED");
  return PUBLIC_AUTH_ERROR_CODES.has(code) ? code : "SOCIAL_AUTH_FAILED";
}

function magazineAuthRecovery(args: {
  mode: "login" | "signup";
  provider: string;
  returnTo: string;
  errorCode: string;
}) {
  const params = new URLSearchParams({
    source: "magazine",
    provider: args.provider,
    returnTo: args.returnTo,
    error: args.errorCode,
    cleanup: "1",
  });
  return `/${args.mode}?${params.toString()}`;
}

function platformAuthRecovery(mode: "login" | "signup", provider: string, errorCode: string) {
  const params = new URLSearchParams({ error: errorCode, cleanup: "1" });
  if (mode === "signup") params.set("provider", provider);
  return `/${mode}?${params.toString()}`;
}

function invalidIntentError(code: "MAGAZINE_LOGIN_INTENT_INVALID" | "SIGNUP_INTENT_INVALID") {
  return Object.assign(new Error(code), { errorCode: code });
}

function signupRequiredRecovery(provider: string, returnTo: string) {
  return magazineAuthRecovery({
    mode: "signup",
    provider,
    returnTo,
    errorCode: "SIGNUP_CONSENT_REQUIRED",
  });
}

function socialRecoveryForContext(args: {
  provider: string;
  error: unknown;
  magazineLogin?: { returnTo: string } | null;
  signupIntent?: { source: "platform" | "magazine"; returnTo: string } | null;
}) {
  const errorCode = publicAuthErrorCode(args.error);
  if (args.magazineLogin) {
    if (errorCode === "SIGNUP_CONSENT_REQUIRED") {
      return signupRequiredRecovery(args.provider, args.magazineLogin.returnTo);
    }
    return magazineAuthRecovery({
      mode: "login",
      provider: args.provider,
      returnTo: args.magazineLogin.returnTo,
      errorCode,
    });
  }
  if (args.signupIntent?.source === "magazine") {
    return magazineAuthRecovery({
      mode: "signup",
      provider: args.provider,
      returnTo: args.signupIntent.returnTo,
      errorCode,
    });
  }
  return platformAuthRecovery(args.signupIntent ? "signup" : "login", args.provider, errorCode);
}

export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name: isProduct ? "__Host-na.session" : "na.session",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduct,
      },
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
  },
  providers: [
    GoogleProvider({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
    }),
    KakaoProvider({
      clientId: KAKAO_CLIENT_ID,
      clientSecret: KAKAO_CLIENT_SECRET,
      authorization: { params: { scope: "profile_nickname profile_image account_email" } },
    }),
    NaverProvider({
      clientId: NAVER_CLIENT_ID,
      clientSecret: NAVER_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !profile) return true;
      const provider = account.provider;
      const profileRecord = toUnknownRecord(profile);
      const profileResponse = toUnknownRecord(profileRecord.response);
      const userRecord = toUnknownRecord(user);
      const providerId = pickAuthString(
        account.providerAccountId,
        userRecord.id,
        profileResponse.id,
        profileRecord.id,
        profileRecord.sub,
      );
      const email = pickAuthString(userRecord.email, profileResponse.email, profileRecord.email) || "";
      const name = pickAuthString(userRecord.name, profileResponse.name, profileRecord.nickname);
      const image = pickAuthString(
        userRecord.image,
        profileResponse.profile_image,
        profileRecord.profile_image,
        profileRecord.picture,
      );
      const cookieStore = await cookies();
      const magazineJti = cookieStore.get(MAGAZINE_LOGIN_INTENT_COOKIE)?.value;
      const signupJti = cookieStore.get(SIGNUP_INTENT_COOKIE)?.value;
      let magazineLogin: Awaited<ReturnType<typeof consumeMagazineLoginIntent>> = null;
      let signupIntent: Awaited<ReturnType<typeof consumeSignupIntent>> = null;
      try {
        if (!providerId) throw Object.assign(new Error("소셜 계정을 확인할 수 없습니다."), { errorCode: "PROVIDER_ACCOUNT_INVALID" });
        if (magazineJti) {
          magazineLogin = await consumeMagazineLoginIntent({ jti: magazineJti, provider });
          if (!magazineLogin) throw invalidIntentError("MAGAZINE_LOGIN_INTENT_INVALID");
        } else if (signupJti) {
          signupIntent = await consumeSignupIntent({ jti: signupJti, provider });
          if (!signupIntent) throw invalidIntentError("SIGNUP_INTENT_INVALID");
        }
        if (magazineLogin) {
          const linked = await linkSocialToExistingUserByEmail({
            provider,
            providerAccountId: String(providerId),
            email,
            name,
            image,
            profile: profileRecord,
            allowCreate: false,
            registrationSource: "magazine",
          });
          setLinkedAuthResult(user, linked);
          return true;
        }
        if (signupIntent) {
          const acceptedAt = new Date(signupIntent.acceptedAt);
          if (
            signupIntent.termsVersion !== CURRENT_ACCOUNT_POLICY.terms.version ||
            signupIntent.privacyVersion !== CURRENT_ACCOUNT_POLICY.privacy.version
          ) {
            const policyError = Object.assign(new Error("정책 동의를 다시 확인해 주세요."), {
              errorCode: "SIGNUP_INTENT_INVALID",
            });
            return socialRecoveryForContext({ provider, error: policyError, signupIntent });
          }
          const linked = await linkSocialToExistingUserByEmail({
            provider,
            providerAccountId: String(providerId),
            email,
            name,
            image,
            profile: profileRecord,
            allowCreate: true,
            registrationSource: signupIntent.source,
            policyConsents: currentPolicyConsents(
              signupIntent.source === "magazine" ? "magazine_social_signup" : "platform_social_signup",
              provider,
            ).map((consent) => ({ ...consent, agreedAt: acceptedAt })),
          });
          setLinkedAuthResult(user, linked);
          return true;
        }
        const linked = await linkSocialToExistingUserByEmail({
          provider,
          providerAccountId: String(providerId),
          email,
          name,
          image,
          profile: profileRecord,
          allowCreate: false,
          registrationSource: "platform",
        });
        setLinkedAuthResult(user, linked);
        return true;
      } catch (error) {
        const errorCode = publicAuthErrorCode(error);
        logger.warn("[auth] social sign-in rejected", {
          provider,
          errorCode,
        });
        return socialRecoveryForContext({ provider, error, magazineLogin, signupIntent });
      }
    },
    async jwt({ token, account, user, profile }) {
      if (account && profile) {
        const provider = account.provider;
        const userRecord = toUnknownRecord(user);
        const profileRecord = toUnknownRecord(profile);
        const profileResponse = toUnknownRecord(profileRecord.response);
        const tokenRecord = toUnknownRecord(token);
        const name = pickAuthString(userRecord.name, profileResponse.name, profileRecord.nickname, tokenRecord.name);

        const picture = pickAuthString(
          userRecord.image,
          profileResponse.profile_image,
          profileRecord.profile_image,
          profileRecord.picture,
          tokenRecord.picture,
        );

        // signIn callback이 선행 linking한 결과를 전달받아 중복 linking을 피한다.
        const linkedAccount = getLinkedAuthResult(user);
        if (!linkedAccount) throw Object.assign(new Error("소셜 이메일 제공 동의가 필요합니다."), { errorCode: "PROVIDER_EMAIL_REQUIRED" });
        const email = linkedAccount.email;

        // ② '둘 다' 덮어쓰기
        token.uid = linkedAccount.uid;
        token.sub = linkedAccount.uid;
        token.signupCompleted = linkedAccount.signupCompleted;
        token.registrationSource = linkedAccount.registrationSource;

        // ③ provider가 이메일 소유권을 보증하면 AMU 인증 상태로 승격(비차단).
        //    uid가 숫자형(WP uid)일 때만 기록한다. 소셜 전용(uid에 ':')은 제외.
        if (
          email &&
          providerGuaranteesEmailVerification(provider, profileRecord) &&
          /^\d+$/.test(linkedAccount.uid)
        ) {
          try {
            await recordEmailVerified({
              userId: Number(linkedAccount.uid),
              email,
              method: provider === "apple" ? "apple" : "google",
              verifiedAt: new Date(),
            });
          } catch (error) {
            logger.warn("[auth] social email auto-verify failed", {
              provider,
              errorCode: (error as { errorCode?: string }).errorCode,
            });
          }
        }

        // 보강 필드 유지
        token.email = email;
        token.name = name;
        token.picture = picture;
      }
      return token;
    },

    async session({ session, token }) {
      const tokenRecord = toUnknownRecord(token);
      session.user = {
        ...(session.user || {}),
        id: String(tokenRecord.uid || ""), // 정규화된 uid
        name: session.user?.name || String(tokenRecord.name || ""),
        email: session.user?.email || String(tokenRecord.email || ""),
        image: session.user?.image || String(tokenRecord.picture || ""),
        signupCompleted: tokenRecord.signupCompleted === true,
        registrationSource: String(tokenRecord.registrationSource || "auth_me"),
      } as typeof session.user & { id: string };
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/api/auth/social-error",
  },
  secret: NEXTAUTH_SECRET,
};
