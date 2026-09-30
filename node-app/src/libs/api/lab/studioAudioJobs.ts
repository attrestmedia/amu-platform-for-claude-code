import fetchClient from "libs/api/fetchClient";

/**
 * @docHint
 * @purpose Gen Studio audio(TTS) 생성·견적·자산 client API
 * @process 서버 estimate/enqueue/job/asset 계약 호출  envelope 정리
 * @domain lab
 * @scope client
 */

export type StudioAudioStatusType =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "unknown_outcome";

export type StudioAudioFormatType = "mp3" | "wav" | "opus" | "pcm";

export type StudioAudioAssetAudio = {
  durationMs?: number | null;
  codec?: string | null;
  sampleRateHz?: number | null;
  channels?: number | null;
  voiceProvenance?: Record<string, unknown> | null;
};

export type StudioAudioAssetTransport = {
  assetId: string;
  jobId: string;
  segmentIndex: number;
  segmentCount: number;
  sourceRevision: string;
  sourceHash: string;
  segmentHash: string;
  manifestHash: string;
  provider: string;
  modelName: string;
  templateKey: string;
  visibility: string;
  audio: StudioAudioAssetAudio;
  storage: {
    driver?: string;
    access?: string;
    mimeType?: string;
    bytes?: number;
    sha256?: string;
  };
  url: string | null;
  urlKind: string;
  createdAt?: string | Date | null;
};

export type StudioAudioPlaylistSegmentTransport = {
  assetId: string;
  segmentIndex: number;
  orderedIndex: number;
  segmentHash: string;
  durationMs: number;
  silenceAfterMs: number;
};

export type StudioAudioPlaylistTransport = {
  contractVersion: string;
  sourceRevision: string;
  sourceHash: string;
  manifestHash: string;
  segmentCount: number;
  silenceMs: number;
  pronunciationDictionary: string[];
  totalDurationMs: number;
  segments: StudioAudioPlaylistSegmentTransport[];
};

export type StudioAudioJobTransport = {
  jobId: string;
  scope: "user" | "universe";
  uid: string;
  universeId: string;
  provider: string;
  modelName: string;
  clientRequestId: string;
  requestHash: string;
  request: Record<string, unknown>;
  sourceRevision: string;
  sourceHash: string;
  manifestHash: string;
  segmentCount: number;
  completedSegments: number[];
  status: StudioAudioStatusType;
  billing: Record<string, unknown>;
  assets: StudioAudioAssetTransport[];
  playlist: StudioAudioPlaylistTransport | null;
  error: { code?: string; message?: string } | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type StudioAudioVoiceOption = {
  voiceId: string;
  label: string;
  locales: string[];
  tags: string[];
  usage: "production";
  creditMultiplier: 1;
  sourceCategory: string;
  commercialUseAllowed: true;
};

export type StudioAudioModelOption = {
  modelName: string;
  preset: "fast" | "quality";
  label: { ko: string; en: string };
  description: { ko: string; en: string };
};

export type StudioAudioCatalog = {
  defaultModelName: string;
  maxTextLength: number;
  minTextLength: number;
  silenceMaxMs: number;
  speed: { min: number; max: number; step: number; defaultValue: number };
  formats: readonly string[];
  templates: readonly string[];
  models: StudioAudioModelOption[];
  voices: StudioAudioVoiceOption[];
};

export type StudioAudioEstimateRequest = {
  provider: "elevenlabs";
  modelName: string;
  voiceId: string;
  locale: string;
  format: StudioAudioFormatType;
  speed: number;
  text: string;
  sourceRevision: string;
  templateKey: string;
  clientRequestId: string;
  scope?: "user";
  silenceMs?: number;
  settings?: Record<string, unknown>;
  speechIntent?: Record<string, unknown>;
};

export type StudioAudioEstimateResult = {
  estimatedCoins: number;
  characters: number;
  segmentCount: number;
  segments: Array<{ segmentIndex: number; orderedIndex: number; charCount: number; preview: string }>;
  maxTextLength: number;
  pricingRevision: string;
  billingKey: string;
  provider: "elevenlabs";
  modelName: string;
  voiceId: string;
  locale: string;
  format: string;
  speed: number;
  silenceMs: number;
};

export type StudioAudioEnqueueRequest = StudioAudioEstimateRequest & {
  universeId?: string;
  visibility?: "private";
};

type Envelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
};

/** 무과금 서버 견적. Voice·텍스트·설정이 바뀌면 호출자가 이전 견적을 stale로 버린다. */
export async function estimateStudioAudio(request: StudioAudioEstimateRequest) {
  const out = await fetchClient.post<Envelope<StudioAudioEstimateResult>>(
    "/lab/studio-audio-estimate",
    request,
    { responseType: "auto", timeout: 30000 },
  );
  if (!out.data?.ok || !out.data.data) {
    const error = new Error(out.data?.error || "studio_audio_estimate_failed") as Error & { errorCode?: string };
    error.errorCode = out.data?.errorCode;
    throw error;
  }
  return out.data.data;
}

export async function fetchStudioAudioCatalog() {
  const out = await fetchClient.get<Envelope<StudioAudioCatalog>>("/lab/studio-audio-estimate", {
    responseType: "auto",
    cache: "no-store",
  });
  return out.data?.data || null;
}

export async function enqueueStudioAudioJob(request: StudioAudioEnqueueRequest) {
  const out = await fetchClient.post<Envelope<StudioAudioJobTransport>>(
    "/lab/studio-audio-jobs",
    request,
    { responseType: "auto", timeout: 30000 },
  );
  if (!out.data?.ok || !out.data.data) {
    const error = new Error(out.data?.error || "studio_audio_enqueue_failed") as Error & { errorCode?: string };
    error.errorCode = out.data?.errorCode;
    throw error;
  }
  return out.data.data;
}

export async function getStudioAudioJob(jobId: string) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) return null;
  const out = await fetchClient.get<Envelope<{ job: StudioAudioJobTransport }>>(
    `/lab/studio-audio-jobs/${encodeURIComponent(safeJobId)}`,
    { responseType: "auto", cache: "no-store" },
  );
  return out.data?.data?.job || null;
}

export async function cancelStudioAudioJob(jobId: string) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) return null;
  const out = await fetchClient.patch<Envelope<{ job: StudioAudioJobTransport }>>(
    `/lab/studio-audio-jobs/${encodeURIComponent(safeJobId)}`,
    { action: "cancel" },
    { responseType: "auto", timeout: 30000 },
  );
  return out.data?.data?.job || null;
}

export async function listStudioAudioAssets(params?: {
  assetIds?: string[];
  jobIds?: string[];
  limit?: number;
}) {
  const assetIds = (params?.assetIds || []).map((value) => String(value || "").trim()).filter(Boolean);
  const jobIds = (params?.jobIds || []).map((value) => String(value || "").trim()).filter(Boolean);
  const out = await fetchClient.get<Envelope<StudioAudioAssetTransport[]>>("/lab/studio-audios", {
    params: {
      limit: params?.limit ?? 20,
      ...(assetIds.length ? { assetIds: assetIds.join(",") } : {}),
      ...(jobIds.length ? { jobIds: jobIds.join(",") } : {}),
    },
    responseType: "auto",
    cache: "no-store",
  });
  return out.data?.data || [];
}

export async function getStudioAudioAsset(assetId: string) {
  const safeAssetId = String(assetId || "").trim();
  if (!safeAssetId) return null;
  const out = await fetchClient.get<Envelope<StudioAudioAssetTransport>>(
    `/lab/studio-audios/${encodeURIComponent(safeAssetId)}`,
    { responseType: "auto", cache: "no-store" },
  );
  return out.data?.data || null;
}

async function deleteStudioAudioAsset(
  assetId: string,
  opts?: { policy?: "soft" | "hard" | "detach"; reason?: string },
) {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.deleteWithBody<Envelope<{ assetId: string; state: string }>>(
    `/lab/studio-audios/${safeAssetId}`,
    { policy: opts?.policy || "soft", reason: opts?.reason || "user_delete" },
    { loading: "global" },
  );
  if (!out.data?.ok) throw new Error(out.data?.error || "delete_studio_audio_failed");
  return out.data.data;
}

export { deleteStudioAudioAsset };
