import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { ThreadsApiClient } from "libs/api/thirdparty/threads/threadsClient";
import { logger } from "utils/log";
import { redisCache } from "libs/cache/redisCacheService";
import { THREADS_DELETE_LIMIT_PER_24H, THREADS_POST_TEXT_MAX_LEN } from "consts/thirdparty/threads";
import { toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common";

export const runtime = "nodejs";

function resolveUniverseId(data: unknown, request?: Request | null): string {
  const fromBody = String(toUnknownRecord(data).universeId || "").trim();
  if (fromBody) return fromBody;
  const fromHeader = String(request?.headers.get("x-universe-id") || "").trim();
  return fromHeader;
}

function validateCreateBody(data: unknown) {
  const text = String(toUnknownRecord(data).text || "").trim();
  if (!text) return { valid: false, error: "text가 필요합니다." };
  if (text.length > THREADS_POST_TEXT_MAX_LEN) {
    return { valid: false, error: `text는 ${THREADS_POST_TEXT_MAX_LEN}자를 초과할 수 없습니다.` };
  }
  return { valid: true };
}

function validateDeleteBody(data: unknown) {
  const postId = String(toUnknownRecord(data).postId || "").trim();
  if (!postId) return { valid: false, error: "postId가 필요합니다." };
  return { valid: true };
}

export const POST = withAuth<UnknownRecord>(
  async (data, user, request) => {
    if (!request) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    try {
      const universeId = resolveUniverseId(data, request);
      if (!universeId) {
        return NextResponse.json({ success: false, message: "universeId가 필요합니다." }, { status: 400 });
      }

      const cred = await getDecryptedCredential(universeId, "threads");
      const threadsUserId = String(cred?.clientId || "").trim();
      const accessToken = String(cred?.clientSecret || "").trim();

      if (!threadsUserId || !accessToken) {
        return NextResponse.json(
          { success: false, message: "Threads 자격증명이 설정되어 있지 않습니다." },
          { status: 500 },
        );
      }

      const text = String(data?.text || "").trim();
      const replyToId = String(data?.replyToId || "").trim() || undefined;
      const quotePostId = String(data?.quotePostId || "").trim() || undefined;

      const client = new ThreadsApiClient({
        baseUrl: typeof cred?.extras?.graphBaseUrl === "string" ? cred.extras.graphBaseUrl : undefined,
      });

      const created = await client.createTextPostContainer({
        threadsUserId,
        accessToken,
        text,
        replyToId,
        quotePostId,
      });
      const creationId = String(created.id || "").trim();
      await client.waitForMediaContainerReady({
        accessToken,
        creationId,
      });

      const published = await client.publishPost({
        threadsUserId,
        accessToken,
        creationId,
      });

      logger.info("[Threads] 게시물 등록 성공", {
        userId: user?.ID,
        universeId,
        threadsUserId,
        postId: published?.id,
      });

      return NextResponse.json({
        success: true,
        data: {
          creationId: created?.id,
          postId: published?.id,
        },
      });
    } catch (error) {
      logger.error("[Threads] 게시물 등록 실패", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "Threads 게시물 등록 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateCreateBody,
  "threads/posts:create",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);

export const DELETE = withAuth<UnknownRecord>(
  async (data, user, request) => {
    if (!request) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    try {
      const universeId = resolveUniverseId(data, request);
      if (!universeId) {
        return NextResponse.json({ success: false, message: "universeId가 필요합니다." }, { status: 400 });
      }

      const postId = String(data?.postId || "").trim();
      const cred = await getDecryptedCredential(universeId, "threads");
      const threadsUserId = String(cred?.clientId || "").trim();
      const accessToken = String(cred?.clientSecret || "").trim();

      if (!threadsUserId || !accessToken) {
        return NextResponse.json(
          { success: false, message: "Threads 자격증명이 설정되어 있지 않습니다." },
          { status: 500 },
        );
      }

      // 24시간 이동창 100회 제한(사전 방어; 플랫폼 제한과 별도로 서버단 보호)
      const deleteLimitKey = `threads:delete:${universeId}:${threadsUserId}`;
      const deleteCount = await redisCache.incr(deleteLimitKey, 24 * 60 * 60);
      if (deleteCount > THREADS_DELETE_LIMIT_PER_24H) {
        return NextResponse.json(
          {
            success: false,
            message: `삭제 제한을 초과했습니다. 24시간 내 최대 ${THREADS_DELETE_LIMIT_PER_24H}회까지 가능합니다.`,
          },
          { status: 429 },
        );
      }

      const client = new ThreadsApiClient({
        baseUrl: typeof cred?.extras?.graphBaseUrl === "string" ? cred.extras.graphBaseUrl : undefined,
      });
      await client.deletePost({ postId, accessToken });

      logger.info("[Threads] 게시물 삭제 성공", {
        userId: user?.ID,
        universeId,
        threadsUserId,
        postId,
        deleteCount,
      });

      return NextResponse.json({
        success: true,
        data: {
          postId,
          deleteCount,
          deleteLimitPer24h: THREADS_DELETE_LIMIT_PER_24H,
        },
      });
    } catch (error) {
      logger.error("[Threads] 게시물 삭제 실패", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "Threads 게시물 삭제 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  validateDeleteBody,
  "threads/posts:delete",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
