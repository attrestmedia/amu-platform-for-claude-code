import { createHash } from "node:crypto";
import {
  ELEVENLABS_DEFAULT_TTS_MODEL,
  ELEVENLABS_TTS_SPEED_RANGE,
  getElevenLabsVoiceCatalogEntry,
  isApprovedElevenLabsVoiceId,
} from "consts/ai/voiceCatalog";

export const STUDIO_AUDIO_CONTRACT_VERSION = "studio-audio.v1" as const;
export const STUDIO_AUDIO_MAX_TEXT_LENGTH = 4096;
export const STUDIO_AUDIO_TEMPLATE_KEYS = ["narration-basic"] as const;

const PROVIDER_CHARACTER_LIMITS: Record<string, number> = {
  "eleven-flash-v2-5": 40_000,
  "eleven-multilingual-v2": 10_000,
  "eleven-v3": 5_000,
};

export type StudioAudioJobStatusType =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "unknown_outcome";

export type StudioAudioRequest = {
  provider: "elevenlabs";
  modelName: string;
  voiceId: string;
  locale: string;
  format: "mp3" | "opus" | "pcm" | "wav";
  speed: number;
  settings?: Record<string, unknown>;
  speechIntent?: Record<string, unknown>;
  text: string;
  sourceRevision: string;
  templateKey: string;
  clientRequestId: string;
  scope: "user" | "universe";
  uid: string;
  universeId: string;
  visibility: "private" | "public";
  sourceService: string;
  sourceSurface: string;
  pronunciationDictionary: string[];
  silenceMs: number;
  pricingRevision: string;
  providerCharacterLimit?: number;
};

export type StudioAudioSegment = {
  segmentIndex: number;
  orderedIndex: number;
  text: string;
  charCount: number;
  sourceRevision: string;
  sourceHash: string;
  segmentHash: string;
};

export type StudioAudioManifest = {
  contractVersion: typeof STUDIO_AUDIO_CONTRACT_VERSION;
  sourceRevision: string;
  sourceHash: string;
  segmentCount: number;
  segments: StudioAudioSegment[];
  manifestHash: string;
};

export type StudioAudioValidationResult =
  | { ok: true; request: StudioAudioRequest; manifest: StudioAudioManifest; requestHash: string }
  | { ok: false; error: string };

export type StudioAudioMetadata = {
  durationMs: number;
  codec: string;
  sampleRateHz: number;
  channels: number;
};

export type StudioAudioPlaylist = {
  contractVersion: typeof STUDIO_AUDIO_CONTRACT_VERSION;
  sourceRevision: string;
  sourceHash: string;
  manifestHash: string;
  segmentCount: number;
  silenceMs: number;
  pronunciationDictionary: string[];
  totalDurationMs: number;
  segments: Array<{
    assetId: string;
    segmentIndex: number;
    orderedIndex: number;
    segmentHash: string;
    durationMs: number;
    silenceAfterMs: number;
  }>;
};

export type StudioAudioSettlementDecision =
  | {
      kind: "settle";
      actualCoins: number;
      refundCoins: number;
      cumulativeActualCoins: number;
      cumulativeRefundedCoins: number;
      settledCharacters: number;
    }
  | { kind: "unknown_outcome"; errorCode: "AUDIO_PRICING_REVISION_CHANGED" | "AUDIO_RESERVATION_CAP_EXCEEDED" };

export type StudioAudioSegmentCompletionKind = "provider" | "cache" | "replay";

function safeString(value: unknown, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function parseWavMetadata(buffer: Buffer): StudioAudioMetadata | null {
  if (buffer.length < 12 || buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WAVE") {
    return null;
  }
  let offset = 12;
  let channels = 0;
  let sampleRateHz = 0;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(buffer.length, chunkStart + chunkSize);
    if (chunkId === "fmt " && chunkStart + 16 <= chunkEnd) {
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRateHz = buffer.readUInt32LE(chunkStart + 4);
      byteRate = buffer.readUInt32LE(chunkStart + 8);
    }
    if (chunkId === "data") {
      dataBytes = Math.max(0, chunkEnd - chunkStart);
      break;
    }
    if (chunkEnd <= offset) break;
    offset = chunkEnd + (chunkSize % 2);
  }
  if (!channels || !sampleRateHz || !byteRate || !dataBytes) return null;
  const durationMs = Math.round((dataBytes / byteRate) * 1000);
  return durationMs > 0 ? { durationMs, codec: "wav", sampleRateHz, channels } : null;
}

function parseMp3Frame(buffer: Buffer, offset: number) {
  if (offset + 4 > buffer.length) return null;
  const header = buffer.readUInt32BE(offset);
  if ((header >>> 21) !== 0x7ff) return null;
  const version = (header >>> 19) & 0x03;
  const layer = (header >>> 17) & 0x03;
  const bitrateIndex = (header >>> 12) & 0x0f;
  const sampleRateIndex = (header >>> 10) & 0x03;
  const padding = (header >>> 9) & 0x01;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;
  const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const mpeg2Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const mpeg1SampleRates = [44100, 48000, 32000];
  const mpeg2SampleRates = [22050, 24000, 16000];
  const bitrates = version === 3 ? mpeg1Bitrates : mpeg2Bitrates;
  const sampleRates = version === 3 ? mpeg1SampleRates : version === 2 ? mpeg2SampleRates : [11025, 12000, 8000];
  const bitrateKbps = bitrates[bitrateIndex] || 0;
  const sampleRateHz = sampleRates[sampleRateIndex] || 0;
  if (!bitrateKbps || !sampleRateHz) return null;
  const frameLength = Math.floor((version === 3 ? 144 : 72) * bitrateKbps * 1000 / sampleRateHz) + padding;
  if (frameLength < 4 || offset + frameLength > buffer.length) return null;
  return {
    frameLength,
    sampleRateHz,
    samplesPerFrame: version === 3 ? 1152 : 576,
    channels: ((header >>> 6) & 0x03) === 3 ? 1 : 2,
  };
}

function parseMp3Metadata(buffer: Buffer): StudioAudioMetadata | null {
  let offset = 0;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3" && buffer.length >= 10) {
    const tagSize = ((buffer[6] || 0) & 0x7f) * 0x200000 + ((buffer[7] || 0) & 0x7f) * 0x4000 + ((buffer[8] || 0) & 0x7f) * 0x80 + ((buffer[9] || 0) & 0x7f);
    offset = 10 + tagSize + ((buffer[5] || 0) & 0x10 ? 10 : 0);
  }
  while (offset + 4 <= buffer.length && !parseMp3Frame(buffer, offset)) offset += 1;
  const first = parseMp3Frame(buffer, offset);
  if (!first) return null;
  let frames = 0;
  let cursor = offset;
  while (cursor + 4 <= buffer.length) {
    const frame = parseMp3Frame(buffer, cursor);
    if (!frame || frame.sampleRateHz !== first.sampleRateHz || frame.channels !== first.channels) break;
    frames += 1;
    cursor += frame.frameLength;
  }
  if (!frames) return null;
  const durationMs = Math.round((frames * first.samplesPerFrame / first.sampleRateHz) * 1000);
  return durationMs > 0 ? { durationMs, codec: "mp3", sampleRateHz: first.sampleRateHz, channels: first.channels } : null;
}

function parseOpusMetadata(buffer: Buffer): StudioAudioMetadata | null {
  let offset = 0;
  let channels = 0;
  let lastGranule = -1;
  while (offset + 27 <= buffer.length && buffer.subarray(offset, offset + 4).toString("ascii") === "OggS") {
    const pageSegments = buffer[offset + 26] || 0;
    const tableStart = offset + 27;
    const bodyStart = tableStart + pageSegments;
    if (bodyStart > buffer.length) break;
    const bodyLength = Array.from(buffer.subarray(tableStart, bodyStart)).reduce((sum, value) => sum + value, 0);
    const bodyEnd = Math.min(buffer.length, bodyStart + bodyLength);
    const head = buffer.subarray(bodyStart, bodyEnd);
    const headIndex = head.indexOf("OpusHead");
    if (headIndex >= 0 && headIndex + 12 <= head.length) channels = head[headIndex + 9] || 0;
    if (offset + 14 <= buffer.length && typeof buffer.readBigUInt64LE === "function") {
      const granule = Number(buffer.readBigUInt64LE(offset + 6));
      if (Number.isSafeInteger(granule) && granule >= 0) lastGranule = Math.max(lastGranule, granule);
    }
    offset = bodyEnd;
  }
  if (!channels || lastGranule <= 0) return null;
  const durationMs = Math.round((lastGranule / 48000) * 1000);
  return durationMs > 0 ? { durationMs, codec: "opus", sampleRateHz: 48000, channels } : null;
}

export function resolveStudioAudioMetadata(args: {
  audioBuffer: Buffer;
  contentType?: string;
  format?: StudioAudioRequest["format"];
}): StudioAudioMetadata | null {
  const mime = safeString(args.contentType, 80).split(";")[0].toLowerCase();
  // provider가 wav를 raw PCM(audio/pcm)으로 반환할 수 있으므로, 실제 MIME을 우선한다.
  if (mime.includes("pcm")) {
    const sampleRateHz = 16000;
    const channels = 1;
    const durationMs = Math.round((args.audioBuffer.length / (2 * sampleRateHz * channels)) * 1000);
    return durationMs > 0 ? { durationMs, codec: "pcm", sampleRateHz, channels } : null;
  }
  if (mime.includes("wav")) return parseWavMetadata(args.audioBuffer);
  if (mime.includes("mpeg") || mime.includes("mp3")) return parseMp3Metadata(args.audioBuffer);
  if (mime.includes("opus")) return parseOpusMetadata(args.audioBuffer);
  if (!mime && args.format === "wav") return parseWavMetadata(args.audioBuffer);
  if (!mime && args.format === "mp3") return parseMp3Metadata(args.audioBuffer);
  if (!mime && args.format === "opus") return parseOpusMetadata(args.audioBuffer);
  if (!mime && args.format === "pcm") {
    const sampleRateHz = 16000;
    const channels = 1;
    const durationMs = Math.round((args.audioBuffer.length / (2 * sampleRateHz * channels)) * 1000);
    return durationMs > 0 ? { durationMs, codec: "pcm", sampleRateHz, channels } : null;
  }
  return null;
}

export function buildStudioAudioPlaylist(args: {
  manifest: StudioAudioManifest;
  assets: ReadonlyArray<{
    assetId: string;
    segmentIndex: number;
    segmentHash: string;
    audio?: { durationMs?: number | null };
  }>;
  silenceMs?: number;
  pronunciationDictionary?: readonly string[];
}): StudioAudioPlaylist | null {
  const silenceMs = Math.max(0, Math.min(10_000, Math.floor(Number(args.silenceMs) || 0)));
  const byIndex = new Map(args.assets.map((asset) => [asset.segmentIndex, asset]));
  if (
    args.manifest.segments.length !== args.manifest.segmentCount ||
    args.assets.length !== args.manifest.segmentCount ||
    byIndex.size !== args.manifest.segmentCount
  ) return null;
  const segments = args.manifest.segments.map((manifestSegment, index) => {
    const asset = byIndex.get(manifestSegment.segmentIndex);
    const durationMs = positiveNumber(asset?.audio?.durationMs);
    const assetId = safeString(asset?.assetId, 240);
    if (!asset || !assetId || asset.segmentHash !== manifestSegment.segmentHash || !durationMs) return null;
    return {
      assetId,
      segmentIndex: manifestSegment.segmentIndex,
      orderedIndex: manifestSegment.orderedIndex,
      segmentHash: manifestSegment.segmentHash,
      durationMs: Math.round(durationMs),
      silenceAfterMs: index < args.manifest.segmentCount - 1 ? silenceMs : 0,
    };
  });
  if (segments.some((segment) => !segment)) return null;
  const resolvedSegments = segments as Array<NonNullable<(typeof segments)[number]>>;
  return {
    contractVersion: STUDIO_AUDIO_CONTRACT_VERSION,
    sourceRevision: args.manifest.sourceRevision,
    sourceHash: args.manifest.sourceHash,
    manifestHash: args.manifest.manifestHash,
    segmentCount: resolvedSegments.length,
    silenceMs,
    pronunciationDictionary: Array.from(new Set((args.pronunciationDictionary || []).map((item) => safeString(item, 160)).filter(Boolean))),
    totalDurationMs: resolvedSegments.reduce((sum, segment) => sum + segment.durationMs + segment.silenceAfterMs, 0),
    segments: resolvedSegments,
  };
}

export function hashStudioAudioContent(text: string) {
  return sha256(String(text ?? "").normalize("NFC"));
}

export function isApprovedStudioAudioTemplateKey(value: unknown): value is (typeof STUDIO_AUDIO_TEMPLATE_KEYS)[number] {
  return (STUDIO_AUDIO_TEMPLATE_KEYS as readonly string[]).includes(safeString(value, 200));
}

export function resolveStudioAudioCharacterLimit(modelName: string, providerLimit?: number) {
  const providerLimitValue = Number(providerLimit);
  const modelLimit = PROVIDER_CHARACTER_LIMITS[safeString(modelName, 80)] || Number.POSITIVE_INFINITY;
  if (Number.isFinite(providerLimitValue) && providerLimitValue > 0) {
    return Math.max(1, Math.min(STUDIO_AUDIO_MAX_TEXT_LENGTH, Math.floor(providerLimitValue), modelLimit));
  }
  return Math.max(1, Math.min(STUDIO_AUDIO_MAX_TEXT_LENGTH, modelLimit));
}

function isSentenceBoundary(value: string) {
  return /[.!?。！？\n]/u.test(value);
}

/** 문장 경계를 우선하되, 하나의 문장이 제한보다 길면 code point 단위로만 자른다. */
export function splitStudioAudioText(text: string, maxLength = STUDIO_AUDIO_MAX_TEXT_LENGTH) {
  const normalized = String(text ?? "").normalize("NFC");
  const chars = Array.from(normalized);
  const limit = Math.max(1, Math.floor(Number(maxLength) || STUDIO_AUDIO_MAX_TEXT_LENGTH));
  if (chars.length <= limit) return normalized ? [normalized] : [];

  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < chars.length; index += 1) {
    if (!isSentenceBoundary(chars[index] || "")) continue;
    const next = chars[index + 1] || "";
    if (next && !/\s/u.test(next) && !isSentenceBoundary(next)) continue;
    sentences.push(chars.slice(start, index + 1).join(""));
    start = index + 1;
  }
  if (start < chars.length) sentences.push(chars.slice(start).join(""));

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences.length ? sentences : [normalized]) {
    const sentenceChars = Array.from(sentence);
    if (sentenceChars.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let offset = 0; offset < sentenceChars.length; offset += limit) {
        chunks.push(sentenceChars.slice(offset, offset + limit).join(""));
      }
      continue;
    }
    if (current && Array.from(current).length + sentenceChars.length > limit) {
      chunks.push(current);
      current = "";
    }
    current += sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildStudioAudioManifest(args: {
  text: string;
  sourceRevision: string;
  maxLength?: number;
  segmentCacheKey?: string;
}): StudioAudioManifest {
  const sourceRevision = safeString(args.sourceRevision, 200);
  const text = String(args.text ?? "").normalize("NFC");
  const sourceHash = hashStudioAudioContent(text);
  const segments = splitStudioAudioText(text, args.maxLength).map((segment, segmentIndex) => ({
    segmentIndex,
    orderedIndex: segmentIndex,
    text: segment,
    charCount: Array.from(segment).length,
    sourceRevision,
    sourceHash,
    // segment 캐시는 playlist provenance(sourceRevision/index)가 아니라 실제 합성 identity에 고정한다.
    segmentHash: hashStudioAudioContent(stableStringify({
      segmentCacheKey: args.segmentCacheKey || "",
      text: segment,
    })),
  }));
  const manifestBody = segments.map(({ text: _text, ...segment }) => segment);
  return {
    contractVersion: STUDIO_AUDIO_CONTRACT_VERSION,
    sourceRevision,
    sourceHash,
    segmentCount: segments.length,
    segments,
    manifestHash: sha256(stableStringify({
      contractVersion: STUDIO_AUDIO_CONTRACT_VERSION,
      sourceRevision,
      sourceHash,
      segments: manifestBody,
    })),
  };
}

export function resolveStudioAudioReservationCharacters(args: {
  manifest: StudioAudioManifest;
  completedSegmentIndexes?: readonly number[];
}) {
  const completed = new Set((args.completedSegmentIndexes || []).filter((value) => Number.isInteger(value)));
  return args.manifest.segments
    .filter((segment) => !completed.has(segment.segmentIndex))
    .reduce((sum, segment) => sum + Math.max(0, Number(segment.charCount || 0)), 0);
}

export function resolveStudioAudioProgressIncrement(args: {
  segmentCharacters: number;
  completion: StudioAudioSegmentCompletionKind;
}) {
  const characters = Math.max(0, Math.floor(Number(args.segmentCharacters) || 0));
  return {
    completedCharacters: characters,
    // Cache clone은 새 provider 호출이 없으므로 billable/generated progress에 포함하지 않는다.
    generatedCharacters: args.completion === "cache" ? 0 : characters,
  };
}

export type StudioAudioRecoveryTransition =
  | { action: "requeue"; nextStatus: "queued"; providerCallAllowed: true }
  | { action: "mark_unknown"; nextStatus: "unknown_outcome"; providerCallAllowed: false }
  | { action: "ignore"; nextStatus: "unchanged"; providerCallAllowed: false };

export function resolveStudioAudioRecoveryTransition(status: unknown): StudioAudioRecoveryTransition {
  if (status === "queued") return { action: "requeue", nextStatus: "queued", providerCallAllowed: true };
  if (status === "running") return { action: "mark_unknown", nextStatus: "unknown_outcome", providerCallAllowed: false };
  return { action: "ignore", nextStatus: "unchanged", providerCallAllowed: false };
}

export function resolveStudioAudioRecoveryAction(status: unknown) {
  return resolveStudioAudioRecoveryTransition(status).action;
}

export function buildStudioAudioCloneStorageKey(args: {
  visibility: "private" | "public";
  uid: string;
  jobId: string;
  segmentIndex: number;
  ext: string;
}) {
  const cleanSegment = (value: unknown, fallback: string) => String(value || "").trim().replace(/[^a-zA-Z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || fallback;
  return `voice/studio/${args.visibility}/${cleanSegment(args.uid, "uid")}/${cleanSegment(args.jobId, "job")}/${Math.max(0, Math.floor(Number(args.segmentIndex) || 0))}.${cleanSegment(args.ext, "mp3")}`;
}

export function isStudioAudioStorageShared(args: {
  assetId: string;
  storage: { driver?: string; bucket?: string; key?: string };
  activeAssets: ReadonlyArray<{ assetId: string; storage?: { driver?: string; bucket?: string; key?: string } }>;
}) {
  const target = args.storage;
  if (!target.driver || !target.bucket || !target.key) return false;
  const { driver, bucket, key } = target;
  return args.activeAssets.some((asset) => {
    const storage = asset.storage;
    return asset.assetId !== args.assetId && storage?.driver === driver && storage.bucket === bucket && storage.key === key;
  });
}

export function buildStudioAudioRequestHash(request: Omit<StudioAudioRequest, "text"> & { sourceHash: string; manifestHash: string }) {
  return sha256(stableStringify({
    contractVersion: STUDIO_AUDIO_CONTRACT_VERSION,
    provider: request.provider,
    modelName: request.modelName,
    voiceId: request.voiceId,
    locale: request.locale.toLowerCase(),
    format: request.format,
    speed: request.speed,
    settings: request.settings || null,
    speechIntent: request.speechIntent || null,
    sourceRevision: request.sourceRevision,
    sourceHash: request.sourceHash,
    manifestHash: request.manifestHash,
    templateKey: request.templateKey,
    clientRequestId: request.clientRequestId,
    scope: request.scope,
    uid: request.uid,
    universeId: request.universeId,
    visibility: request.visibility,
    pronunciationDictionary: request.pronunciationDictionary,
    silenceMs: request.silenceMs,
    pricingRevision: request.pricingRevision,
  }));
}

function normalizeFormat(value: unknown): StudioAudioRequest["format"] | "" {
  const format = safeString(value, 16).toLowerCase();
  return format === "mp3" || format === "opus" || format === "pcm" || format === "wav" ? format : "";
}

function normalizeStringList(value: unknown, maxItems: number, maxItemLength: number) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => safeString(item, maxItemLength))
      .filter(Boolean),
  )).slice(0, maxItems);
}

export function validateStudioAudioRequest(raw: unknown): StudioAudioValidationResult {
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const provider = safeString(body.provider, 40).toLowerCase();
  const modelName = safeString(body.modelName, 80) || ELEVENLABS_DEFAULT_TTS_MODEL;
  const voiceId = safeString(body.voiceId, 128);
  const uid = safeString(body.uid, 160);
  const clientRequestId = safeString(body.clientRequestId, 160);
  const sourceRevision = safeString(body.sourceRevision, 200);
  const text = String(body.text ?? "").normalize("NFC").trim();
  const templateKey = safeString(body.templateKey, 200);

  if (provider !== "elevenlabs") return { ok: false, error: "AUDIO_PROVIDER_UNSUPPORTED" };
  if (!uid) return { ok: false, error: "AUDIO_OWNER_REQUIRED" };
  if (!clientRequestId) return { ok: false, error: "AUDIO_CLIENT_REQUEST_ID_REQUIRED" };
  if (!sourceRevision) return { ok: false, error: "AUDIO_SOURCE_REVISION_REQUIRED" };
  if (!text) return { ok: false, error: "AUDIO_TEXT_REQUIRED" };
  if (!templateKey) return { ok: false, error: "AUDIO_TEMPLATE_REQUIRED" };
  if (!isApprovedStudioAudioTemplateKey(templateKey)) return { ok: false, error: "AUDIO_TEMPLATE_NOT_APPROVED" };
  if (!isApprovedElevenLabsVoiceId(voiceId, { productionOnly: true })) {
    return { ok: false, error: "AUDIO_VOICE_NOT_APPROVED" };
  }

  const voice = getElevenLabsVoiceCatalogEntry(voiceId);
  const locale = safeString(body.locale, 32).toLowerCase() || "ko";
  if (voice && voice.locales.length > 0 && !voice.locales.some((item) => String(item).split("-")[0] === locale.split("-")[0])) {
    return { ok: false, error: "AUDIO_VOICE_LOCALE_UNSUPPORTED" };
  }
  const speed = Number(body.speed ?? 1);
  if (!Number.isFinite(speed) || speed < ELEVENLABS_TTS_SPEED_RANGE.min || speed > ELEVENLABS_TTS_SPEED_RANGE.max) {
    return { ok: false, error: "AUDIO_SPEED_INVALID" };
  }
  const scope = body.scope === "universe" ? "universe" : "user";
  const universeId = safeString(body.universeId, 160);
  if (scope === "universe" && !universeId) return { ok: false, error: "AUDIO_UNIVERSE_REQUIRED" };
  if (scope === "universe") return { ok: false, error: "AUDIO_UNIVERSE_SCOPE_UNSUPPORTED" };

  const maxLength = resolveStudioAudioCharacterLimit(modelName, Number(body.providerCharacterLimit));
  if (body.providerCharacterLimit !== undefined && (!Number.isFinite(Number(body.providerCharacterLimit)) || Number(body.providerCharacterLimit) <= 0)) {
    return { ok: false, error: "AUDIO_PROVIDER_CHARACTER_LIMIT_INVALID" };
  }
  const pronunciationDictionary = normalizeStringList(body.pronunciationDictionary, 100, 160);
  if (pronunciationDictionary.length > 0) return { ok: false, error: "AUDIO_PRONUNCIATION_DICTIONARY_UNSUPPORTED" };
  const silenceMs = Math.max(0, Math.min(10_000, Math.floor(Number(body.silenceMs) || 0)));
  const segmentCacheKey = stableStringify({
    provider: "elevenlabs",
    modelName,
    voiceId,
    locale,
    format: normalizeFormat(body.format) || "mp3",
    speed,
    settings: body.settings && typeof body.settings === "object" ? body.settings : null,
    speechIntent: body.speechIntent && typeof body.speechIntent === "object" ? body.speechIntent : null,
  });
  const manifest = buildStudioAudioManifest({ text, sourceRevision, maxLength, segmentCacheKey });
  if (!manifest.segments.length) return { ok: false, error: "AUDIO_TEXT_REQUIRED" };

  const request: StudioAudioRequest = {
    provider: "elevenlabs",
    modelName,
    voiceId,
    locale,
    format: normalizeFormat(body.format) || "mp3",
    speed,
    settings: body.settings && typeof body.settings === "object" ? body.settings as Record<string, unknown> : undefined,
    speechIntent: body.speechIntent && typeof body.speechIntent === "object" ? body.speechIntent as Record<string, unknown> : undefined,
    text,
    sourceRevision,
    templateKey,
    clientRequestId,
    scope,
    uid,
    universeId,
    // 사용자 제작 초안은 항상 private이며 public 승격은 별도 검수 경로가 소유한다.
    visibility: "private",
    sourceService: safeString(body.sourceService, 80) || "gen-studio",
    sourceSurface: safeString(body.sourceSurface, 120) || "unknown",
    pronunciationDictionary,
    silenceMs,
    pricingRevision: safeString(body.pricingRevision, 120),
    ...(Number.isFinite(Number(body.providerCharacterLimit)) ? { providerCharacterLimit: Number(body.providerCharacterLimit) } : {}),
  };
  const requestHash = buildStudioAudioRequestHash({
    ...request,
    sourceHash: manifest.sourceHash,
    manifestHash: manifest.manifestHash,
  });
  return { ok: true, request, manifest, requestHash };
}

export function isTerminalStudioAudioJobStatus(status: unknown) {
  return status === "success" || status === "failed" || status === "cancelled" || status === "unknown_outcome";
}

export function resolveStudioAudioSettlement(args: {
  reservedCoins: number;
  actualCoins: number;
  reservedPricingRevision: string;
  currentPricingRevision: string;
  previousActualCoins?: number;
  previousRefundedCoins?: number;
  previousSettledCharacters?: number;
  pendingCharacters?: number;
}): StudioAudioSettlementDecision {
  if (!args.reservedPricingRevision || args.reservedPricingRevision !== args.currentPricingRevision) {
    return { kind: "unknown_outcome", errorCode: "AUDIO_PRICING_REVISION_CHANGED" };
  }
  const reservedCoins = positiveNumber(args.reservedCoins);
  const actualCoins = positiveNumber(args.actualCoins);
  const previousActualCoins = positiveNumber(args.previousActualCoins);
  const previousRefundedCoins = positiveNumber(args.previousRefundedCoins);
  const previousSettledCharacters = Math.floor(positiveNumber(args.previousSettledCharacters));
  const pendingCharacters = Math.floor(positiveNumber(args.pendingCharacters));
  if (actualCoins > reservedCoins) {
    return { kind: "unknown_outcome", errorCode: "AUDIO_RESERVATION_CAP_EXCEEDED" };
  }
  const refundCoins = reservedCoins - actualCoins;
  return {
    kind: "settle",
    actualCoins,
    refundCoins,
    cumulativeActualCoins: previousActualCoins + actualCoins,
    cumulativeRefundedCoins: previousRefundedCoins + refundCoins,
    settledCharacters: previousSettledCharacters + pendingCharacters,
  };
}
