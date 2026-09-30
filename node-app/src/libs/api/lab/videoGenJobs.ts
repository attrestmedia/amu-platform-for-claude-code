import fetchClient from "libs/api/fetchClient";
import type { VideoGenJob, VideoGenerationRequest } from "types/ai";

export type StudioVideoJobEnvelope = {
  ok?: boolean;
  data?: {
    job?: VideoGenJob;
    jobs?: VideoGenJob[];
    reused?: boolean;
  };
  error?: string;
  errorCode?: string;
};

/** S4-01 비동기 경계를 위한 클라이언트 계약. 실제 provider 호출은 서버 worker가 소유한다. */
export async function enqueueStudioVideoJob(request: VideoGenerationRequest) {
  const out = await fetchClient.post<StudioVideoJobEnvelope>(
    "/lab/studio-video-jobs",
    request,
    { responseType: "auto", timeout: 30000 },
  );
  return out.data?.data || null;
}

export async function getStudioVideoJob(jobId: string) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) return null;
  const out = await fetchClient.get<StudioVideoJobEnvelope>(
    `/lab/studio-video-jobs/${encodeURIComponent(safeJobId)}`,
    { responseType: "auto", cache: "no-store" },
  );
  return out.data?.data?.job || null;
}

export async function listStudioVideoJobs(params?: { jobIds?: string[]; limit?: number }) {
  const jobIds = (params?.jobIds || []).map((id) => String(id || "").trim()).filter(Boolean);
  const out = await fetchClient.get<StudioVideoJobEnvelope>("/lab/studio-video-jobs", {
    params: {
      limit: params?.limit ?? 8,
      ...(jobIds.length ? { jobIds: jobIds.join(",") } : {}),
    },
    responseType: "auto",
    cache: "no-store",
  });
  return out.data?.data?.jobs || [];
}

export async function cancelStudioVideoJob(jobId: string) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) return null;
  const out = await fetchClient.patch<StudioVideoJobEnvelope>(
    "/lab/studio-video-jobs",
    { jobId: safeJobId },
    { responseType: "auto", timeout: 30000 },
  );
  return out.data?.data?.job || null;
}
