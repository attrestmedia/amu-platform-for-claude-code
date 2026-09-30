import fetchClient from "libs/api/fetchClient";
import type { ContentPromptBodyType, ContentPromptCustomType } from "types/app";

/**
 * @docHint
 * @purpose Gen Studio 콘텐츠 생성 Job 클라이언트 API 래핑
 * @process fetchClient 호출  응답 envelope 정리  생성 요청/알림 센터 데이터 반환
 * @domain lab
 * @scope client
 */

export type StudioContentJobNotificationStatusType = "queued" | "running" | "success" | "partial" | "failed";

export type StudioContentJobAssetType = {
  assetId: string;
  jobId: string;
  templateKey?: string;
  visibility?: string;
  createdAt?: string | Date | null;
  provider?: string;
  modelName?: string;
  generationMode?: "template" | "custom";
  outputIndex: number;
  textPreview: string;
  chars: number;
  bytes: number;
};

export type StudioContentJobNotificationType = {
  jobId: string;
  status: StudioContentJobNotificationStatusType;
  templateKey: string;
  templateTitle?: string;
  generationMode: "template" | "custom";
  provider?: string;
  modelName?: string;
  outputCount: number;
  requestedCount: number;
  coins: number;
  errorMessage?: string;
  readAt?: string | Date | null;
  createdAt?: string | Date | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  assets: StudioContentJobAssetType[];
};

export type StudioContentJobKindType = "template-content" | "basic-content";

type StudioContentJobEnvelope = {
  ok?: boolean;
  data?: {
    jobs?: StudioContentJobNotificationType[];
    jobId?: string;
    status?: StudioContentJobNotificationStatusType;
    reused?: boolean;
  };
  error?: string;
};

export async function enqueueStudioContentJob(args: {
  kind: StudioContentJobKindType;
  payload: ContentPromptBodyType | ContentPromptCustomType;
  clientRequestId?: string;
}) {
  const out = await fetchClient.post<StudioContentJobEnvelope>(
    "/lab/studio-content-jobs",
    {
      kind: args.kind,
      payload: args.payload,
      clientRequestId: args.clientRequestId,
    },
    {
      responseType: "auto",
      timeout: 30000,
    },
  );
  return out.data?.data || null;
}

export async function listStudioContentJobNotifications(params?: {
  limit?: number;
  unread?: boolean;
  includeRunning?: boolean;
  /** 지정하면 기간·읽음·목록 상한과 무관하게 그 job만 확정 조회한다. */
  jobIds?: string[];
}) {
  const jobIds = (params?.jobIds || []).map((jobId) => String(jobId || "").trim()).filter(Boolean);
  const out = await fetchClient.get<StudioContentJobEnvelope>("/lab/studio-content-jobs", {
    params: {
      limit: params?.limit ?? 8,
      unread: params?.unread ? 1 : 0,
      includeRunning: params?.includeRunning === false ? 0 : 1,
      ...(jobIds.length > 0 ? { jobIds: jobIds.join(",") } : {}),
    },
    responseType: "auto",
    cache: "no-store",
  });
  return out.data?.data?.jobs || [];
}

export async function markStudioContentJobNotificationRead(jobId: string) {
  const id = String(jobId || "").trim();
  if (!id) return false;

  const out = await fetchClient.patch<StudioContentJobEnvelope>(
    `/lab/studio-content-jobs/${encodeURIComponent(id)}/read`,
    {},
    { responseType: "auto" },
  );
  return Boolean(out.data?.ok);
}
