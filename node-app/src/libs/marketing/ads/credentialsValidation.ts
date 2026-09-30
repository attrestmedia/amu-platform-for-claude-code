import "server-only";

import { getCredentialStatus, upsertCredential } from "libs/database/secure/credentials";
import { getNaverAdsAuth, naverSearchAdReadApi } from "libs/api/thirdparty/naverads/naverSearchAdClient";
import {
  getGoogleAdsAuth,
  googleAdsListAccessibleCustomers,
  googleAdsSearch,
  googleAdsSearchForCustomer,
  GoogleAdsApiError,
  GOOGLE_ADS_GAQL,
} from "libs/api/thirdparty/googleads/googleAdsClient";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

export type AdsCredentialProvider = "naver_ads" | "google_ads";

class AdsCredentialDiagnosticError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AdsCredentialDiagnosticError";
    this.code = code;
    this.details = details;
  }
}

function classify(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "validation_failed");
  if (error instanceof AdsCredentialDiagnosticError) {
    return { code: error.code, message, ...(error.details ? { details: error.details } : {}) };
  }
  if (error instanceof GoogleAdsApiError) {
    const reasons = new Set(error.reasons);
    const result = (code: string, userMessage: string) => ({
      code,
      message: userMessage,
      reasons: error.reasons,
      ...(error.providerMessage ? { providerMessage: error.providerMessage } : {}),
      ...(error.requestId ? { requestId: error.requestId } : {}),
    });
    if (reasons.has("CUSTOMER_NOT_ENABLED")) {
      return result("CUSTOMER_NOT_ENABLED", "대상 Google Ads 계정이 아직 활성화되지 않았거나 폐쇄·비활성 상태입니다.");
    }
    if (reasons.has("INCOMPLETE_SIGNUP") || reasons.has("MISSING_TOS")) {
      return result("ACCOUNT_SETUP_INCOMPLETE", "Google Ads 계정 가입 또는 API 이용약관 설정이 완료되지 않았습니다.");
    }
    if (reasons.has("DEVELOPER_TOKEN_NOT_APPROVED") || reasons.has("DEVELOPER_TOKEN_NOT_ON_ALLOWLIST")) {
      return result("DEVELOPER_TOKEN_INVALID", "Developer Token의 운영 계정 접근 등급 또는 허용 상태를 확인하세요.");
    }
    if (reasons.has("DEVELOPER_TOKEN_PROHIBITED") || reasons.has("PROJECT_DISABLED") || reasons.has("SERVICE_ACCESS_DENIED")) {
      return result("API_PROJECT_ACCESS_DENIED", "Developer Token과 Google Cloud Project의 API 접근 연결을 확인하세요.");
    }
    if (reasons.has("ACCESS_TOKEN_SCOPE_INSUFFICIENT")) {
      return result("AUTH_FAILED", "Refresh Token에 Google Ads adwords scope가 없습니다.");
    }
    if (reasons.has("USER_PERMISSION_DENIED") || reasons.has("INVALID_LOGIN_CUSTOMER_ID_SERVING_CUSTOMER_ID_COMBINATION")) {
      return result("CUSTOMER_MISMATCH", "Refresh Token 사용자, Login Customer ID, 대상 Customer ID의 접근 계층을 확인하세요.");
    }
    return result(error.status === 403 ? "AUTH_FAILED" : "NETWORK", "Google Ads API 요청이 거부되었습니다.");
  }
  // 구체 코드(자격 미완성 → developer token → 인증) 우선, 광범위 패턴(customer)은 마지막에 검사한다.
  // _401/_403은 provider 클라이언트가 만드는 `GOOGLE_ADS_401:`/`NAVER_SEARCH_AD_403:` 접두어와 결합해 오탐을 줄인다.
  if (/credentials_incomplete/i.test(message)) return { code: "CREDENTIALS_INCOMPLETE", message };
  if (/developer.token|DEVELOPER_TOKEN/i.test(message)) return { code: "DEVELOPER_TOKEN_INVALID", message };
  if (/OAUTH_FAILED|invalid_grant|unauthorized|_401:|signature|authenticat/i.test(message)) return { code: "AUTH_FAILED", message };
  if (/customer|permission|NOT_ADS_USER/i.test(message)) return { code: "CUSTOMER_MISMATCH", message };
  if (/_403:/.test(message)) return { code: "AUTH_FAILED", message };
  return { code: "NETWORK", message };
}

export async function validateAdsCredentials(args: {
  universeId: string;
  provider: AdsCredentialProvider;
  actor?: string;
  persist?: boolean;
}) {
  try {
    let details: Record<string, unknown>;
    if (args.provider === "naver_ads") {
      const auth = await getNaverAdsAuth(args.universeId);
      if (!auth) throw new Error("naver_ads_credentials_incomplete");
      const campaigns = await naverSearchAdReadApi.listCampaigns(auth);
      details = { campaignCount: campaigns.length, customerId: auth.customerId };
    } else {
      const auth = await getGoogleAdsAuth(args.universeId);
      if (!auth) throw new Error("google_ads_credentials_incomplete");
      const accessible = await googleAdsListAccessibleCustomers(auth);
      const accessibleCustomerIds = (accessible.resourceNames || [])
        .map((resourceName) => toSafeString(resourceName).replace(/^customers\//, ""))
        .filter(Boolean)
        .slice(0, 100);
      if (auth.loginCustomerId && !accessibleCustomerIds.includes(auth.loginCustomerId)) {
        throw new AdsCredentialDiagnosticError(
          "OAUTH_LOGIN_CUSTOMER_ACCESS_DENIED",
          "Refresh Token 사용자가 Login Customer ID에 직접 접근할 수 없습니다.",
          { accessibleCustomerIds, loginCustomerId: auth.loginCustomerId },
        );
      }
      if (!auth.loginCustomerId && !accessibleCustomerIds.includes(auth.customerId)) {
        throw new AdsCredentialDiagnosticError(
          "LOGIN_CUSTOMER_ID_REQUIRED",
          "대상 Customer ID가 직접 접근 계정이 아니므로 관리자 Login Customer ID가 필요합니다.",
          { accessibleCustomerIds, customerId: auth.customerId },
        );
      }
      let hierarchyStatus: string | null = null;
      if (auth.loginCustomerId) {
        const hierarchy = await googleAdsSearchForCustomer<Record<string, unknown>>(
          auth,
          auth.loginCustomerId,
          GOOGLE_ADS_GAQL.customerHierarchy(auth.customerId),
        );
        const targetRow = hierarchy
          .flatMap((chunk) => chunk.results || [])
          .map((row) => toUnknownRecord(toUnknownRecord(row).customerClient))
          .find((row) => toSafeString(row.id) === auth.customerId);
        if (!targetRow) {
          throw new AdsCredentialDiagnosticError(
            "LOGIN_CUSTOMER_TARGET_NOT_LINKED",
            "Login Customer ID의 계정 계층에서 대상 Customer ID를 찾지 못했습니다.",
            { loginCustomerId: auth.loginCustomerId, customerId: auth.customerId },
          );
        }
        hierarchyStatus = toSafeString(targetRow.status) || null;
        if (hierarchyStatus && hierarchyStatus !== "ENABLED") {
          throw new AdsCredentialDiagnosticError(
            "CUSTOMER_NOT_ENABLED",
            `대상 Google Ads 계정 상태가 ${hierarchyStatus}입니다. 계정을 활성화하거나 활성 Customer ID로 교체하세요.`,
            { loginCustomerId: auth.loginCustomerId, customerId: auth.customerId, hierarchyStatus },
          );
        }
      }
      await googleAdsSearch(auth, GOOGLE_ADS_GAQL.accessibleCheck);
      details = {
        customerId: auth.customerId,
        loginCustomerId: auth.loginCustomerId || null,
        accessibleCustomerIds,
        hierarchyStatus,
      };
    }
    const result = { ok: true as const, provider: args.provider, validatedAt: new Date().toISOString(), details };
    if (args.persist) await persistValidation(args, result);
    return result;
  } catch (error) {
    const classified = classify(error);
    const result = { ok: false as const, provider: args.provider, validatedAt: new Date().toISOString(), ...classified };
    if (args.persist) await persistValidation(args, result);
    return result;
  }
}

async function persistValidation(
  args: { universeId: string; provider: AdsCredentialProvider; actor?: string },
  result: Record<string, unknown>,
) {
  const status = await getCredentialStatus(args.universeId);
  const current = status[args.provider]?.extras || {};
  await upsertCredential({
    universeId: args.universeId,
    provider: args.provider,
    actor: args.actor,
    extras: {
      ...current,
      lastValidatedAt: result.validatedAt,
      lastValidationStatus: result.ok ? "valid" : "invalid",
      lastValidationCode: result.ok ? "" : result.code,
      lastValidationRequestId: result.requestId || "",
    },
  });
}
