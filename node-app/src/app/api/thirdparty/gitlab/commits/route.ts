import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";
import { getDecryptedCredential } from "libs/database/secure/credentials";
import { GitlabClient } from "libs/api/thirdparty/gitlab/gitlabClient";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { GITLAB_BASE } from "consts/thirdparty/gitlab";
import { toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(thirdparty / gitlab / commits) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain integration.gitlab
 * @scope universe_api
 */

export const runtime = "nodejs";

// GitLab 커밋 목록 조회
export const POST = withAuth(
  async (data, user, request) => {
    if (!request) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    try {
      const {
        universeId: universeIdFromBody,
        projectId: projectIdFromBody,
        projectKey: projectKeyFromBody,
        branch: branchFromBody,
        days,
        since: sinceArg,
        until: untilArg,
        page = 1,
        perPage = 50,
        search,
        path,
        noCache = false,
      } = data || {};

      const universeId = universeIdFromBody || request.headers.get("x-universe-id") || undefined;

      if (!universeId) {
        return NextResponse.json({ success: false, message: "universeId가 필요합니다." }, { status: 400 });
      }

      // 1) 자격증명 로드 (DB only)
      const cred = await getDecryptedCredential(universeId, "gitlab");
      if (!cred || !cred.clientSecret) {
        return NextResponse.json(
          { success: false, message: "GitLab 자격증명이 설정되어 있지 않습니다." },
          { status: 404 },
        );
      }

      const extras = toUnknownRecord(cred.extras);

      // projects[] 정규화
      type ProjectDef = {
        key?: string;
        projectId: string;
        baseUrl?: string;
        defaultBranch?: string;
      };

      const projects: ProjectDef[] = [];

      if (Array.isArray(extras.projects)) {
        extras.projects.forEach((entry) => {
          const p = toUnknownRecord(entry);
          const key = p.key ? String(p.key) : undefined;
          const projectId = p.projectId ? String(p.projectId) : "";
          if (!projectId) return;
          projects.push({
            key,
            projectId,
            baseUrl: p.baseUrl ? String(p.baseUrl) : undefined,
            defaultBranch: p.defaultBranch ? String(p.defaultBranch) : undefined,
          });
        });
      }

      const requestedProjectKey =
        typeof projectKeyFromBody === "string" && projectKeyFromBody.trim()
          ? String(projectKeyFromBody).trim()
          : undefined;
      const requestedProjectId =
        typeof projectIdFromBody === "string" && projectIdFromBody.trim()
          ? String(projectIdFromBody).trim()
          : undefined;

      let resolvedProjectId = "";
      let resolvedProjectKey: string | undefined = requestedProjectKey;
      let resolvedBaseUrl: string | undefined;
      let resolvedDefaultBranch: string | undefined;

      // (1) projectKey 우선 매칭
      if (requestedProjectKey) {
        const found = projects.find((p) => p.key === requestedProjectKey);
        if (found) {
          resolvedProjectId = found.projectId;
          resolvedBaseUrl = found.baseUrl;
          resolvedDefaultBranch = found.defaultBranch;
        }
      }

      // (2) projectId 직접 지정 시 매칭 시도
      if (!resolvedProjectId && requestedProjectId) {
        const found = projects.find((p) => p.projectId === requestedProjectId);
        if (found) {
          resolvedProjectId = found.projectId;
          resolvedBaseUrl = found.baseUrl;
          resolvedDefaultBranch = found.defaultBranch;
          if (!resolvedProjectKey && found.key) {
            resolvedProjectKey = found.key;
          }
        } else {
          resolvedProjectId = requestedProjectId;
        }
      }

      // (3) extras의 defaultProjectKey 또는 첫 번째 프로젝트 사용
      if (!resolvedProjectId && projects.length > 0) {
        const defaultProjectKey =
          typeof extras.defaultProjectKey === "string" && extras.defaultProjectKey.trim()
            ? String(extras.defaultProjectKey).trim()
            : undefined;

        let fallback = defaultProjectKey ? projects.find((p) => p.key === defaultProjectKey) : undefined;
        if (!fallback) fallback = projects[0];

        if (fallback) {
          resolvedProjectId = fallback.projectId;
          resolvedBaseUrl = fallback.baseUrl;
          resolvedDefaultBranch = fallback.defaultBranch;
          if (!resolvedProjectKey && fallback.key) {
            resolvedProjectKey = fallback.key;
          }
        }
      }

      if (!resolvedProjectId) {
        return NextResponse.json(
          { success: false, message: "GitLab projectId가 설정되어 있지 않습니다." },
          { status: 500 },
        );
      }

      const extrasBaseUrl = typeof extras.baseUrl === "string" ? extras.baseUrl : "";
      const extrasDefaultBranch = typeof extras.defaultBranch === "string" ? extras.defaultBranch : "";
      const baseUrl = resolvedBaseUrl || extrasBaseUrl || process.env.GITLAB_DEFAULT_BASE || GITLAB_BASE;
      const defaultBranch = resolvedDefaultBranch || extrasDefaultBranch || "main";
      const branch = branchFromBody || defaultBranch;

      // 2) 기간 계산 (days 우선)
      let since = sinceArg;
      let until = untilArg;

      if (days && !since && !until) {
        const now = new Date();
        const untilDate = now.toISOString();
        const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        since = from.toISOString();
        until = untilDate;
      }

      // 3) 캐시 키 구성 (옵션 해시 활용, projectKey/projectId 포함)
      const optionsHash = CacheKeyManager.content.hashOptions({
        universeId,
        projectId: resolvedProjectId,
        projectKey: resolvedProjectKey,
        branch,
        since,
        until,
        page,
        perPage,
        search,
        path,
      });

      const cacheKey = `gitlab:commits:${optionsHash}`;

      // noCache: 강제 새로고침 플래그
      if (!noCache) {
        const cached = await redisCache.get<UnknownRecord>(cacheKey);
        if (cached) {
          return NextResponse.json({ success: true, data: cached, cached: true });
        }
      }

      // 4) GitLab 호출
      const client = new GitlabClient({
        baseUrl,
        projectId: resolvedProjectId,
        accessToken: cred.clientSecret,
      });

      const { commits, pagination } = await client.listCommits({
        branch,
        since,
        until,
        page,
        perPage,
        search,
        path,
      });

      logger.info("[GitLab] 커밋 목록 조회 성공", {
        userId: user.ID,
        universeId,
        projectId: resolvedProjectId,
        projectKey: resolvedProjectKey,
        branch,
        count: commits.length,
      });

      const payload = {
        commits,
        pagination,
        projectId: resolvedProjectId,
        projectKey: resolvedProjectKey,
        branch,
        since,
        until,
      };

      // 5) 캐시 저장 (5분)
      await redisCache.set(cacheKey, payload, 5 * 60);

      return NextResponse.json({ success: true, data: payload });
    } catch (error) {
      logger.error("[GitLab] 커밋 목록 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "커밋 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  () => ({ valid: true }),
  "gitlab_commits_list",
  { checkUniversePermission: { universeIdParam: "universeId", requireEdit: true } },
);
