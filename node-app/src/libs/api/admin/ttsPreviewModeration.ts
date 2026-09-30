import fetchClient from "libs/api/fetchClient";

export type TtsPreviewModerationStatus = "pending" | "approved" | "rejected";

export type TtsPreviewModerationAsset = {
  assetId: string;
  ownerUid: string;
  provider: string;
  modelName: string;
  voiceId: string;
  locale: string;
  text: string;
  speed: number;
  moderationStatus: TtsPreviewModerationStatus;
  moderationReason: string;
  audioUrl: string;
  bytes: number;
  createdAt: string | null;
  moderatedAt: string | null;
};

type ModerationEnvelope<T> = { ok: boolean; data: T; error?: string };

export async function listTtsPreviewModerationAssets(args: {
  status: TtsPreviewModerationStatus;
  cursor?: string | null;
}) {
  const response = await fetchClient.get<
    ModerationEnvelope<{ items: TtsPreviewModerationAsset[]; nextCursor: string | null }>
  >(
    "/admin/tts-preview-moderation",
    { params: { status: args.status, limit: 24, cursor: args.cursor || undefined } },
  );
  return response.data.data || { items: [], nextCursor: null };
}

export async function moderateTtsPreview(args: {
  assetId: string;
  decision: Exclude<TtsPreviewModerationStatus, "pending">;
  reason?: string;
}) {
  const response = await fetchClient.patch<ModerationEnvelope<TtsPreviewModerationAsset>>(
    "/admin/tts-preview-moderation",
    args,
  );
  return response.data.data;
}
