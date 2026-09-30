import { logger } from "utils/log";
import { GITLAB_BASE } from "consts/thirdparty/gitlab";
import type { GitlabClientConfigType, GitlabCommitType } from "types/thirdparty";

type GitlabPaginationType = { total: number; totalPages: number; page: number; perPage: number };
type GitlabCommitRaw = {
  id: string | number;
  short_id?: string;
  title?: string;
  message?: string;
  author_name?: string;
  author_email?: string;
  authored_date?: string;
  created_at?: string;
  committed_date?: string;
  web_url?: string;
};

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain thirdparty/gitlab
 * @scope server
 */

type ListCommitParams = {
  branch?: string; // ref_name
  since?: string; // ISO 8601
  until?: string; // ISO 8601
  page?: number;
  perPage?: number;
  search?: string; // message 검색
  path?: string; // 특정 디렉토리만
};

export class GitlabClient {
  private baseUrl: string;
  private projectId: string;
  private accessToken: string;

  constructor(config: GitlabClientConfigType) {
    this.baseUrl = (config.baseUrl || GITLAB_BASE).replace(/\/+$/, "");
    this.projectId = encodeURIComponent(config.projectId);
    this.accessToken = config.accessToken;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<{ data: T; pagination: GitlabPaginationType }> {
    const url = `${this.baseUrl}/api/v4${path}`;
    const headers = new Headers(init.headers || {});
    // PAT 방식 (Bearer 로도 가능)
    if (!headers.has("Authorization") && !headers.has("PRIVATE-TOKEN")) {
      headers.set("PRIVATE-TOKEN", this.accessToken);
    }

    const res = await fetch(url, { ...init, headers });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error("[GitLab] API 오류", { status: res.status, path, text });
      throw new Error(`GitLab API 오류: ${res.status} ${text}`);
    }

    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      data = {} as T;
    }

    const pagination = {
      total: Number(res.headers.get("X-Total") || 0),
      totalPages: Number(res.headers.get("X-Total-Pages") || 1),
      page: Number(res.headers.get("X-Page") || 1),
      perPage: Number(res.headers.get("X-Per-Page") || 20),
    };

    return { data, pagination };
  }

  async listCommits(params: ListCommitParams = {}): Promise<{ commits: GitlabCommitType[]; pagination: GitlabPaginationType }> {
    const { branch, since, until, page = 1, perPage = 50, search, path } = params;

    const sp = new URLSearchParams();
    sp.set("per_page", String(perPage));
    sp.set("page", String(page));
    if (branch) sp.set("ref_name", branch);
    if (since) sp.set("since", since);
    if (until) sp.set("until", until);
    if (search) sp.set("search", search);
    if (path) sp.set("path", path);

    const { data, pagination } = await this.request<GitlabCommitRaw[]>(
      `/projects/${this.projectId}/repository/commits?` + sp.toString(),
    );

    const commits: GitlabCommitType[] = (data || []).map((c) => ({
      id: String(c.id),
      shortId: String(c.short_id || String(c.id).slice(0, 8)),
      title: String(c.title || ""),
      message: String(c.message || ""),
      authorName: String(c.author_name || ""),
      authorEmail: String(c.author_email || ""),
      authoredAt: c.authored_date || c.created_at || "",
      committedAt: c.committed_date || c.authored_date || "",
      webUrl: c.web_url || "",
      branch, // ref 정보는 직접 넘겨줌
    }));

    return { commits, pagination };
  }
}
