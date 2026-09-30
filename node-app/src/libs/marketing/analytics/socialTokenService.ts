import "server-only";

import { THREADS_GRAPH_BASE } from "consts/thirdparty/threads";
import { getDecryptedCredential, upsertCredential } from "libs/database/secure/credentials";
import { hasOAuthConnectionHistory, listOAuthConnectionStatus } from "libs/database/secure/oauthConnections";
import { getLinkedInMemberTokenStatus } from "libs/database/secure/linkedinMemberTokens";
import { toErrorMessage, toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";
import { resolveMarketingOAuthAccess } from "libs/marketing/auth/marketingOAuthResolver";

/**
 * @docHint
 * @purpose 소셜 채널 토큰 수명주기 — Threads 장기 토큰 자동 갱신(D-15) + 채널별 토큰 만료 경고 요약
 * @process credential extras의 tokenExpiresAt 검사 → 갱신 기한 도달 시 refresh_access_token 호출 → 성공 시 clientSecret/만료 메타 갱신, 실패 시 lastRefreshStatus 기록 / 경고 목록은 수집 실행 기록·UI 상태 카드에 사용
 * @domain marketing
 * @scope server
 */

const THREADS_REFRESH_BEFORE_DAYS = 15;
const TOKEN_WARNING_BEFORE_DAYS = 14;
const DAY_MS = 86_400_000;

type ThreadsRefreshResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

function toDaysLeft(expiresAtIso: string) {
  const expiresAt = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAt)) return null;
  return Math.floor((expiresAt - Date.now()) / DAY_MS);
}

function threadsRefreshEndpoint() {
  // refresh_access_token은 버전 prefix 없는 루트 경로다 (graph.threads.net/refresh_access_token).
  const origin = new URL(THREADS_GRAPH_BASE).origin;
  return `${origin}/refresh_access_token`;
}

export async function refreshThreadsTokenIfDue(universeId: string): Promise<{
  status: "refreshed" | "not_due" | "skipped_no_credential" | "failed";
  daysLeft?: number | null;
  error?: string;
}> {
  const hasOAuthHistory = await hasOAuthConnectionHistory({
    ownerType: "universe",
    ownerId: universeId,
    provider: "threads",
  });
  if (hasOAuthHistory) {
    const oauth = await resolveMarketingOAuthAccess({ universeId, provider: "threads" });
    if (!oauth) return { status: "failed", error: "threads_oauth_reauth_required" };
    return {
      status: "not_due",
      daysLeft: oauth.expiresAt ? Math.floor((oauth.expiresAt.getTime() - Date.now()) / DAY_MS) : null,
    };
  }

  const credential = await getDecryptedCredential(universeId, "threads");
  const accessToken = toSafeString(credential?.clientSecret);
  if (!accessToken) return { status: "skipped_no_credential" };

  const extras = toUnknownRecord(credential?.extras);
  const expiresAtIso = toSafeString(extras.tokenExpiresAt);
  const daysLeft = expiresAtIso ? toDaysLeft(expiresAtIso) : null;

  // 만료 메타가 없으면 갱신을 1회 시도해 메타를 부트스트랩하고, 있으면 D-15부터 갱신한다.
  const due = daysLeft === null || (Number.isFinite(daysLeft) && Number(daysLeft) <= THREADS_REFRESH_BEFORE_DAYS);
  if (!due) return { status: "not_due", daysLeft };

  const now = new Date();
  try {
    const url = new URL(threadsRefreshEndpoint());
    url.searchParams.set("grant_type", "th_refresh_token");
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url.toString(), { method: "GET" });
    const body = (await response.json().catch(() => ({}))) as ThreadsRefreshResponse & { error?: { message?: string } };
    const nextToken = toSafeString(body.access_token);
    const expiresInSec = Number(body.expires_in || 0);
    if (!response.ok || !nextToken || expiresInSec <= 0) {
      throw new Error(toSafeString(body.error?.message) || `threads_refresh_failed:${response.status}`);
    }

    const nextExpiresAt = new Date(now.getTime() + expiresInSec * 1000);
    const nextRefreshDueAt = new Date(nextExpiresAt.getTime() - THREADS_REFRESH_BEFORE_DAYS * DAY_MS);
    await upsertCredential({
      universeId,
      provider: "threads",
      clientSecret: nextToken,
      actor: "social-collect-cron",
      extras: {
        ...extras,
        tokenIssuedAt: now.toISOString(),
        tokenExpiresAt: nextExpiresAt.toISOString(),
        tokenRefreshDueAt: nextRefreshDueAt.toISOString(),
        lastRefreshStatus: `refreshed@${now.toISOString()}`,
      },
    });
    logger.info("[socialToken] threads token refreshed", { universeId, expiresAt: nextExpiresAt.toISOString() });
    return { status: "refreshed", daysLeft };
  } catch (error) {
    const message = toErrorMessage(error, String(error));
    logger.warn("[socialToken] threads token refresh failed", { universeId, error: message });
    try {
      await upsertCredential({
        universeId,
        provider: "threads",
        actor: "social-collect-cron",
        extras: { ...extras, lastRefreshStatus: `failed@${now.toISOString()}:${message.slice(0, 200)}` },
      });
    } catch {
      // 상태 기록 실패는 무시 — 다음 실행에서 다시 시도한다.
    }
    return { status: "failed", daysLeft, error: message };
  }
}

export async function getSocialTokenWarnings(universeId: string): Promise<string[]> {
  const warnings: string[] = [];

  const [threads, instagram, linkedin, threadsHistory, instagramHistory, threadsOAuth, instagramOAuth] = await Promise.all([
    getDecryptedCredential(universeId, "threads"),
    getDecryptedCredential(universeId, "instagram"),
    getLinkedInMemberTokenStatus(universeId),
    hasOAuthConnectionHistory({ ownerType: "universe", ownerId: universeId, provider: "threads" }),
    hasOAuthConnectionHistory({ ownerType: "universe", ownerId: universeId, provider: "instagram" }),
    listOAuthConnectionStatus({ ownerType: "universe", ownerId: universeId, provider: "threads" }),
    listOAuthConnectionStatus({ ownerType: "universe", ownerId: universeId, provider: "instagram" }),
  ]);

  (["threads", "instagram"] as const).forEach((provider, index) => {
    const hasHistory = index === 0 ? threadsHistory : instagramHistory;
    const oauthRows = index === 0 ? threadsOAuth : instagramOAuth;
    if (hasHistory) {
      const active = oauthRows.find((row) => row.isActive);
      if (!active || active.connectionStatus !== "connected") {
        warnings.push(`${provider}: OAuth 재연결이 필요합니다.`);
        return;
      }
      if (active.expiresAt) {
        const daysLeft = toDaysLeft(active.expiresAt);
        if (daysLeft !== null && daysLeft <= TOKEN_WARNING_BEFORE_DAYS) {
          warnings.push(`${provider}: OAuth 토큰 만료 D-${Math.max(0, daysLeft)} — 자동 갱신을 확인하세요.`);
        }
      }
      return;
    }
    const credential = index === 0 ? threads : instagram;
    if (!credential?.clientSecret) return;
    const expiresAtIso = toSafeString(toUnknownRecord(credential.extras).tokenExpiresAt);
    if (!expiresAtIso) {
      warnings.push(`${provider}: 토큰 만료 메타 없음 — 만료 시점을 추적할 수 없습니다.`);
      return;
    }
    const daysLeft = toDaysLeft(expiresAtIso);
    if (daysLeft === null) return;
    if (daysLeft < 0) warnings.push(`${provider}: 토큰 만료됨 (D+${Math.abs(daysLeft)}) — 재연결 필요.`);
    else if (daysLeft <= TOKEN_WARNING_BEFORE_DAYS) warnings.push(`${provider}: 토큰 만료 D-${daysLeft}.`);
  });

  if (linkedin.exists) {
    if (linkedin.expired) {
      warnings.push("linkedin: 토큰 만료됨 — 재연결 필요 (자동 갱신 불가).");
    } else if (linkedin.expiresAt) {
      const daysLeft = toDaysLeft(linkedin.expiresAt);
      if (daysLeft !== null && daysLeft <= TOKEN_WARNING_BEFORE_DAYS) {
        warnings.push(`linkedin: 토큰 만료 D-${daysLeft} — 재연결 필요 (자동 갱신 불가).`);
      }
    }
  }

  return warnings;
}
