import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { ThreadsApiClient } from "libs/api/thirdparty/threads/threadsClient";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { logger } from "utils/log";
import { toErrorMessage, type UnknownRecord } from "utils/common";

export const runtime = "nodejs";

function normalizeUsername(raw: string) {
  return String(raw || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function validateUsername(username: string) {
  return /^[a-z0-9._]{1,30}$/.test(username);
}

export const GET = withAuth(
  async (_data, user, request) => {
    if (!request) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    try {
      const { searchParams } = new URL(request.url);

      const universeId = String(searchParams.get("universeId") || request.headers.get("x-universe-id") || "").trim();
      if (!universeId) {
        return NextResponse.json({ success: false, message: "universeId가 필요합니다." }, { status: 400 });
      }

      const username = normalizeUsername(searchParams.get("username") || "");
      if (!username || !validateUsername(username)) {
        return NextResponse.json({ success: false, message: "username 형식이 올바르지 않습니다." }, { status: 400 });
      }

      const limitRaw = Number(searchParams.get("limit") || "20");
      const limit = Math.min(50, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
      const after = String(searchParams.get("after") || "").trim() || undefined;
      const noCache = searchParams.get("noCache") === "true";

      const cred = await getDecryptedCredential(universeId, "threads");
      const accessToken = String(cred?.clientSecret || "").trim();
      if (!accessToken) {
        return NextResponse.json(
          { success: false, message: "Threads 자격증명이 설정되어 있지 않습니다." },
          { status: 500 },
        );
      }

      const cacheHash = CacheKeyManager.content.hashOptions({ universeId, username, limit, after });
      const cacheKey = `threads:profile-posts:${cacheHash}`;

      if (!noCache) {
        const cached = await redisCache.get<UnknownRecord>(cacheKey);
        if (cached) {
          return NextResponse.json({ success: true, data: cached, cached: true });
        }
      }

      const client = new ThreadsApiClient({
        baseUrl: typeof cred?.extras?.graphBaseUrl === "string" ? cred.extras.graphBaseUrl : undefined,
      });

      const [profile, posts] = await Promise.all([
        client.profileLookup({ username, accessToken }),
        client.profilePosts({ username, accessToken, limit, after }),
      ]);

      const payload = {
        profile,
        posts: Array.isArray(posts?.data) ? posts.data : [],
        paging: posts?.paging || null,
        source: "threads_profile_discovery",
      };

      await redisCache.set(cacheKey, payload, 120);

      logger.info("[Threads] 공개 계정 게시물 수집 성공", {
        userId: user?.ID,
        universeId,
        username,
        count: payload.posts.length,
      });

      return NextResponse.json({ success: true, data: payload });
    } catch (error) {
      logger.error("[Threads] 공개 계정 게시물 수집 실패", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "Threads 공개 계정 게시물 수집 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "threads/profile-posts:get",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
