import fetchClient from "libs/api/fetchClient";
import type { ImagePromptBodyType, ImagePromptCustomType, ImagePromptMetaType } from "types/app";

/**
 * @docHint
 * @purpose Gen Studio 이미지 생성 Job 클라이언트 API 래핑
 * @process fetchClient 호출  응답 envelope 정리  생성 요청/알림 센터 데이터 반환
 * @domain lab
 * @scope client
 */

export type StudioImageJobNotificationStatusType = "queued" | "running" | "success" | "partial" | "failed";

export type StudioImageJobNotificationType = {
  jobId: string;
  status: StudioImageJobNotificationStatusType;
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
  assets: ImagePromptMetaType[];
};

export type StudioImageJobKindType = "template-image" | "basic-image";

type StudioImageJobEnvelope = {
  ok?: boolean;
  data?: {
    jobs?: StudioImageJobNotificationType[];
    jobId?: string;
    status?: StudioImageJobNotificationStatusType;
    reused?: boolean;
  };
  error?: string;
};

export async function enqueueStudioImageJob(args: {
  kind: StudioImageJobKindType;
  payload: ImagePromptBodyType | ImagePromptCustomType;
  clientRequestId?: string;
}) {
  const out = await fetchClient.post<StudioImageJobEnvelope>(
    "/lab/studio-image-jobs",
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

export async function listStudioImageJobNotifications(params?: {
  limit?: number;
  unread?: boolean;
  includeRunning?: boolean;
  /** 지정하면 기간·읽음·상한과 무관하게 그 job만 확정 조회한다 (SSM-203). */
  jobIds?: string[];
}) {
  const jobIds = (params?.jobIds || []).map((jobId) => String(jobId || "").trim()).filter(Boolean);
  const out = await fetchClient.get<StudioImageJobEnvelope>("/lab/studio-image-jobs", {
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

export async function markStudioImageJobNotificationRead(jobId: string) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) return false;

  const out = await fetchClient.patch<StudioImageJobEnvelope>(
    `/lab/studio-image-jobs/${encodeURIComponent(safeJobId)}/read`,
    {},
    { responseType: "auto" },
  );
  return Boolean(out.data?.ok);
}

