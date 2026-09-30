export type GitlabClientConfigType = {
  baseUrl?: string;
  projectId: string; // numeric id or URL-encoded full path
  accessToken: string; // PAT or OAuth token
};

export type GitlabCommitType = {
  id: string;
  shortId: string;
  title: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  committedAt: string;
  webUrl?: string;
  branch?: string;
};

export type GetGitlabCommitsParamsType = {
  universeId?: string;
  projectId?: string;
  projectKey?: string;
  branch?: string;
  days?: number;
  since?: string;
  until?: string;
  page?: number;
  perPage?: number;
  search?: string;
  path?: string;
  noCache?: boolean;
};

export type GetGitlabCommitsResponseType = {
  commits: GitlabCommitType[];
  pagination: {
    total: number;
    totalPages: number;
    page: number;
    perPage: number;
  };
  projectId: string;
  branch: string;
  since?: string;
  until?: string;
};
