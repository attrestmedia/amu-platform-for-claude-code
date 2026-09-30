import "server-only";
import type { SpeechInputFormat, SpeechSynthesisFormat, ISpeechAudioInput, IValidatedSpeechAudioInput } from "./types";

export const SPEECH_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const SPEECH_DEFAULT_MAX_DURATION_MS = 10 * 60 * 1000;
export const SPEECH_MAX_TTS_TEXT_LENGTH = 4096;

const AUDIO_EXTENSION_TO_MIME: Record<SpeechInputFormat, string> = {
  flac: "audio/flac",
  m4a: "audio/m4a",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
};

const AUDIO_MIME_TO_EXTENSION: Record<string, SpeechInputFormat> = {
  "audio/aac": "mp4",
  "audio/flac": "flac",
  "audio/m4a": "m4a",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mpga": "mpga",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const SYNTHESIS_FORMAT_TO_CONTENT_TYPE: Record<SpeechSynthesisFormat, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  mp3: "audio/mpeg",
  opus: "audio/opus",
  pcm: "audio/pcm",
  wav: "audio/wav",
};

function hasBytesAt(buffer: Buffer, offset: number, bytes: number[]) {
  return bytes.every((value, index) => buffer[offset + index] === value);
}

function matchesAudioMagic(buffer: Buffer, format: SpeechInputFormat) {
  switch (format) {
    case "wav":
      return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
    case "flac":
      return buffer.subarray(0, 4).toString("ascii") === "fLaC";
    case "ogg":
      return buffer.subarray(0, 4).toString("ascii") === "OggS";
    case "webm":
      return hasBytesAt(buffer, 0, [0x1a, 0x45, 0xdf, 0xa3]);
    case "m4a":
    case "mp4":
      return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
    case "mp3":
    case "mpga":
    case "mpeg":
      return buffer.subarray(0, 3).toString("ascii") === "ID3" ||
        (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    default:
      return false;
  }
}

function resolveWavDurationMs(buffer: Buffer) {
  if (!matchesAudioMagic(buffer, "wav")) return undefined;
  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(buffer.length, chunkStart + chunkSize);
    if (chunkId === "fmt " && chunkStart + 12 <= chunkEnd) byteRate = buffer.readUInt32LE(chunkStart + 8);
    if (chunkId === "data") {
      dataBytes = Math.max(0, chunkEnd - chunkStart);
      break;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  if (!byteRate || !dataBytes) return undefined;
  return Math.round((dataBytes / byteRate) * 1000);
}

export function resolveSpeechAudioDurationMs(buffer: Buffer, format: SpeechInputFormat) {
  // WAV is the only duration parser kept in this dependency-free boundary for now.
  // Other formats must carry a server-derived duration from a trusted decoder before ElevenLabs STT is enabled.
  return format === "wav" ? resolveWavDurationMs(buffer) : undefined;
}

function createSpeechError(message: string, errorCode: string, status: number, detail?: Record<string, unknown>) {
  const err = new Error(message) as Error & { errorCode: string; status: number; detail?: Record<string, unknown> };
  err.errorCode = errorCode;
  err.status = status;
  if (detail) err.detail = detail;
  return err;
}

function sanitizeFileName(filename: string, fallbackExt: SpeechInputFormat) {
  const base = String(filename || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) return `speech-input.${fallbackExt}`;
  if (base.includes(".")) return base;
  return `${base}.${fallbackExt}`;
}

function normalizeAudioMimeType(raw: unknown) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
}

function resolveFormatFromInput(file: ISpeechAudioInput): SpeechInputFormat | "" {
  const mimeType = normalizeAudioMimeType(file.mimeType);
  if (mimeType && AUDIO_MIME_TO_EXTENSION[mimeType]) return AUDIO_MIME_TO_EXTENSION[mimeType];

  const filename = String(file.filename || "").trim().toLowerCase();
  const ext = filename.includes(".") ? filename.split(".").pop() || "" : "";
  if (!ext) return "";
  if (ext === "mpga") return "mpga";
  if (ext === "mp3") return "mp3";
  if (ext === "wav") return "wav";
  if (ext === "ogg") return "ogg";
  if (ext === "webm") return "webm";
  if (ext === "m4a") return "m4a";
  if (ext === "mp4") return "mp4";
  if (ext === "mpeg") return "mpeg";
  if (ext === "flac") return "flac";
  return "";
}

export function assertSpeechAudioInputOrThrow(
  file: ISpeechAudioInput,
  opts?: { maxBytes?: number; maxDurationMs?: number },
): IValidatedSpeechAudioInput {
  const rawBuffer = file?.buffer;
  const buffer = Buffer.isBuffer(rawBuffer) ? rawBuffer : rawBuffer instanceof Uint8Array ? Buffer.from(rawBuffer) : null;
  if (!buffer || buffer.length <= 0) {
    throw createSpeechError("빈 오디오 파일은 처리할 수 없습니다.", "EMPTY_AUDIO_FILE", 400);
  }

  // multipart의 sizeBytes는 클라이언트가 주장하는 값일 수 있으므로 buffer 실측값만 상한 판정에 사용한다.
  const sizeBytes = buffer.length;
  const maxBytes = Math.max(1, Number(opts?.maxBytes || SPEECH_MAX_AUDIO_BYTES));
  if (sizeBytes > maxBytes) {
    throw createSpeechError("오디오 파일 용량이 허용 범위를 초과했습니다.", "AUDIO_FILE_TOO_LARGE", 413, {
      maxBytes,
      sizeBytes,
    });
  }

  const format = resolveFormatFromInput(file);
  if (!format) {
    throw createSpeechError("지원하지 않는 오디오 포맷입니다.", "UNSUPPORTED_AUDIO_FORMAT", 400, {
      filename: file?.filename,
      mimeType: file?.mimeType,
    });
  }

  if (!matchesAudioMagic(buffer, format)) {
    throw createSpeechError("오디오 파일의 실제 형식이 MIME 또는 확장자와 일치하지 않습니다.", "AUDIO_CONTENT_MISMATCH", 400, {
      filename: file?.filename,
      mimeType: file?.mimeType,
      format,
    });
  }

  const maxDurationMs = Math.max(1, Number(opts?.maxDurationMs || SPEECH_DEFAULT_MAX_DURATION_MS));
  const actualDurationMs = resolveSpeechAudioDurationMs(buffer, format);
  const clientDurationMs = file?.durationMs != null ? Math.max(0, Number(file.durationMs || 0)) : undefined;
  const durationMs = actualDurationMs ?? clientDurationMs;
  if (durationMs != null && durationMs > maxDurationMs) {
    throw createSpeechError("오디오 길이가 허용 범위를 초과했습니다.", "AUDIO_DURATION_EXCEEDED", 413, {
      durationMs,
      maxDurationMs,
    });
  }

  return {
    buffer,
    filename: sanitizeFileName(String(file?.filename || ""), format),
    mimeType: normalizeAudioMimeType(file?.mimeType) || AUDIO_EXTENSION_TO_MIME[format],
    sizeBytes,
    durationMs,
    actualDurationMs,
    durationSource: actualDurationMs != null ? "server" : clientDurationMs != null ? "client" : "unavailable",
    format,
  };
}

export function assertSpeechSynthesisTextOrThrow(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    throw createSpeechError("음성 합성용 텍스트가 비어 있습니다.", "TTS_TEXT_REQUIRED", 400);
  }
  if (normalized.length > SPEECH_MAX_TTS_TEXT_LENGTH) {
    throw createSpeechError("음성 합성 텍스트가 너무 깁니다.", "TTS_TEXT_TOO_LONG", 413, {
      length: normalized.length,
      maxLength: SPEECH_MAX_TTS_TEXT_LENGTH,
    });
  }
  return normalized;
}

export function resolveSpeechSynthesisContentType(format: SpeechSynthesisFormat) {
  return SYNTHESIS_FORMAT_TO_CONTENT_TYPE[format];
}

export { createSpeechError };
