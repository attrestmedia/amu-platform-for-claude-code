"use client";

import type { IMessageAudioMeta, ISpeechSynthesizeResponse, ISpeechTranscribeResponse, RouteHintType, SpeechProviderType } from "types/ai";
import fetchClient from "libs/api/fetchClient";

/**
 * @docHint
 * @purpose 클라이언트 speech API 호출 래핑
 * @process multipart form 구성  transcribe 엔드포인트 호출  응답 반환
 * @domain ai-speech
 * @scope client
 */

type SpeechTranscribeClientArgs = {
  file: Blob;
  fileName?: string;
  mimeType?: string;
  routeHint: RouteHintType;
  universeId?: string;
  npcId: string;
  sessionId?: string;
  userClientId?: string;
  provider?: SpeechProviderType;
  modelName?: string;
  language?: string;
  durationMs?: number;
  voiceIntent?: "chat_transcript" | "pronunciation_assessment";
  audioRetention?: "transient" | "short_ttl";
  assessmentConsent?: boolean;
  analysisContext?: string;
};

type SpeechSynthesizeClientArgs = {
  routeHint: RouteHintType;
  universeId?: string;
  npcId: string;
  sessionId?: string;
  assistantClientId: string;
  text: string;
  locale?: string;
  format?: "mp3" | "wav" | "opus";
  speed?: number;
};

export type VoicePreviewAsset = {
  assetId: string;
  provider: string;
  modelName: string;
  voiceId: string;
  locale: string;
  text: string;
  speed: number;
  visibility: "private" | "public";
  source: "default" | "custom";
  moderationStatus: "pending" | "approved" | "rejected";
  audioUrl: string;
  bytes: number;
  createdAt: string | null;
  isOwner: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type VoicePreviewEnvelope<T> = { ok: boolean; data: T; error?: string; reused?: boolean };

const DEFAULT_AUDIO_FILE_NAME = "voice-input.webm";

export async function requestSpeechTranscription(args: SpeechTranscribeClientArgs) {
  const form = new FormData();
  const mimeType = String(args.mimeType || args.file.type || "audio/webm").trim() || "audio/webm";
  const fileName = String(args.fileName || DEFAULT_AUDIO_FILE_NAME).trim() || DEFAULT_AUDIO_FILE_NAME;
  const uploadFile =
    args.file instanceof File
      ? args.file
      : new File([args.file], fileName, {
          type: mimeType,
          lastModified: Date.now(),
        });

  form.append("file", uploadFile);
  form.append("routeHint", args.routeHint);
  form.append("npcId", args.npcId);
  if (args.universeId) form.append("universeId", args.universeId);
  if (args.sessionId) form.append("sessionId", args.sessionId);
  if (args.userClientId) form.append("userClientId", args.userClientId);
  if (args.provider) form.append("provider", args.provider);
  if (args.modelName) form.append("modelName", args.modelName);
  if (args.language) form.append("language", args.language);
  form.append("voiceIntent", args.voiceIntent || "chat_transcript");
  form.append("audioRetention", args.audioRetention || "transient");
  if (args.assessmentConsent) form.append("assessmentConsent", "true");
  if (args.analysisContext) form.append("analysisContext", args.analysisContext.slice(0, 1200));
  if (typeof args.durationMs === "number" && Number.isFinite(args.durationMs) && args.durationMs > 0) {
    form.append("durationMs", String(Math.round(args.durationMs)));
  }

  const out = await fetchClient.post<ISpeechTranscribeResponse>("/speech/transcribe", form, {
    timeout: 75_000,
    responseType: "auto",
  });

  return out.data;
}

export async function requestSpeechSynthesis(args: SpeechSynthesizeClientArgs) {
  const out = await fetchClient.post<
    ISpeechSynthesizeResponse & {
      meta?: {
        audioMeta?: IMessageAudioMeta;
        assistantClientId?: string;
      };
    }
  >(
    "/speech/synthesize",
    {
      routeHint: args.routeHint,
      universeId: args.universeId,
      npcId: args.npcId,
      sessionId: args.sessionId,
      assistantClientId: args.assistantClientId,
      text: args.text,
      locale: args.locale,
      format: args.format,
      speed: args.speed,
    },
    {
      timeout: 60_000,
      responseType: "auto",
    },
  );

  return out.data;
}

export async function listVoicePreviews(args: {
  voiceId: string;
  modelName?: string;
  locale?: string;
  limit?: number;
}) {
  const out = await fetchClient.get<VoicePreviewEnvelope<VoicePreviewAsset[]>>("/speech/voice-previews", {
    params: args,
  });
  return out.data.data || [];
}

export async function generateVoicePreview(args: {
  universeId: string;
  voiceId: string;
  modelName?: string;
  locale?: string;
  text?: string;
  visibility: "private" | "public";
  source: "default" | "custom";
}) {
  const out = await fetchClient.post<VoicePreviewEnvelope<VoicePreviewAsset>>("/speech/voice-previews", args, {
    timeout: 60_000,
  });
  return { asset: out.data.data, reused: Boolean(out.data.reused) };
}

export async function setVoicePreviewVisibility(assetId: string, visibility: "private" | "public") {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.patch<VoicePreviewEnvelope<VoicePreviewAsset>>(
    `/speech/voice-previews/${safeAssetId}`,
    { action: "set_visibility", visibility },
  );
  return out.data.data;
}

export async function deleteVoicePreview(assetId: string, reason = "user_delete") {
  const safeAssetId = encodeURIComponent(String(assetId || "").trim());
  const out = await fetchClient.deleteWithBody<VoicePreviewEnvelope<{ assetId: string; state: "deleted" }>>(
    `/speech/voice-previews/${safeAssetId}`,
    { reason },
  );
  return out.data.data;
}
