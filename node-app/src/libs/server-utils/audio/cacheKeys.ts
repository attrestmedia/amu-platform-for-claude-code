import "server-only";
import type { IMessageAudioMeta, ISpeechVoiceProfile } from "types/ai";
import { createTextHash } from "utils/common";

function normalizeVoicePart(value: unknown, max = 120) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .slice(0, Math.max(1, max));
}

function normalizeCaseSensitivePart(value: unknown, max = 120) {
  return String(value ?? "")
    .trim()
    .slice(0, Math.max(1, max));
}

function stableValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return String(value ?? "");
}

export function buildLegacyVoiceFingerprint(profile?: Partial<ISpeechVoiceProfile> | null) {
  const base = [
    normalizeVoicePart(profile?.provider, 32),
    normalizeVoicePart(profile?.modelName, 120),
    normalizeVoicePart(profile?.voiceId, 80),
    normalizeVoicePart(profile?.locale, 24),
    normalizeVoicePart(profile?.instructions, 240),
  ]
    .filter(Boolean)
    .join("|");

  return createTextHash(base || "default-voice");
}

export function buildVoiceFingerprint(
  profile?: Partial<ISpeechVoiceProfile> | null,
  options?: {
    tenantScope?: string;
    contentHash?: string;
    contentRevision?: string;
    format?: string;
    speed?: number;
    settings?: ISpeechVoiceProfile["settings"];
    speechIntent?: ISpeechVoiceProfile["speechIntent"];
  },
) {
  const base = [
    "speech-voice-fingerprint:v2",
    normalizeVoicePart(options?.tenantScope || "public", 160),
    normalizeVoicePart(options?.contentHash, 128),
    normalizeVoicePart(options?.contentRevision, 128),
    normalizeVoicePart(profile?.provider, 32),
    normalizeVoicePart(profile?.modelName, 120),
    // ElevenLabs voice IDs are opaque and case-sensitive. OpenAI voice names are not changed by preserving case.
    normalizeCaseSensitivePart(profile?.voiceId, 128),
    normalizeCaseSensitivePart(profile?.voiceRevision, 80),
    normalizeVoicePart(profile?.locale, 24),
    normalizeVoicePart(options?.format || profile?.format, 24),
    typeof options?.speed === "number" ? String(options.speed) : typeof profile?.speed === "number" ? String(profile.speed) : "",
    JSON.stringify(stableValue(options?.settings || profile?.settings || {})),
    JSON.stringify(stableValue(options?.speechIntent || profile?.speechIntent || {})),
    normalizeVoicePart(profile?.profileVersion, 24),
    normalizeVoicePart(profile?.instructions, 240),
  ].join("|");

  return createTextHash(base || "speech-voice-v2");
}

export function buildAssistantAudioCacheKey(args: { assistantClientId: string; voiceFingerprint: string }) {
  const clientId = String(args.assistantClientId || "").trim();
  const fingerprint = String(args.voiceFingerprint || "").trim();
  return `assistant-audio:${clientId}:${fingerprint}`;
}

export function buildMessageAudioMeta(args: {
  assistantClientId: string;
  voiceProfile?: Partial<ISpeechVoiceProfile> | null;
  contentType?: string;
  bytes?: number;
  durationMs?: number;
  storage?: Record<string, unknown>;
  tenantScope?: string;
  contentHash?: string;
  contentRevision?: string;
  format?: string;
  speed?: number;
  settings?: ISpeechVoiceProfile["settings"];
  speechIntent?: ISpeechVoiceProfile["speechIntent"];
  status?: "pending" | "ready" | "failed";
  errorCode?: string;
}): IMessageAudioMeta {
  const voiceFingerprint =
    args.contentHash || args.contentRevision || args.format || args.speed != null || args.settings || args.speechIntent || args.tenantScope
      ? buildVoiceFingerprint(args.voiceProfile, args)
      : normalizeVoicePart(args.voiceProfile?.voiceFingerprint, 64) || buildVoiceFingerprint(args.voiceProfile);

  return {
    provider: args.voiceProfile?.provider,
    voiceId: args.voiceProfile?.voiceId,
    modelName: args.voiceProfile?.modelName,
    locale: args.voiceProfile?.locale,
    voiceFingerprint,
    cacheKey: buildAssistantAudioCacheKey({
      assistantClientId: args.assistantClientId,
      voiceFingerprint,
    }),
    contentType: args.contentType,
    bytes: typeof args.bytes === "number" ? args.bytes : undefined,
    durationMs: typeof args.durationMs === "number" ? args.durationMs : undefined,
    storage: args.storage,
    status: args.status || "ready",
    errorCode: args.errorCode,
    generatedAt: new Date().toISOString(),
  };
}
