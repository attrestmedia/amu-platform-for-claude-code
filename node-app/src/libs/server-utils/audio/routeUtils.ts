import "server-only";
import { getTutorPersonaForPrompt } from "libs/database/tutors/tutorPersonaPromptRepo";
import { getPersonaForPrompt, getUniverseById, getUniverseDetail } from "libs/database/universe";
import { normalizeTutorsState } from "libs/services/tutors/tutorsState";
import type { SpeechProviderType } from "types/ai";
import { normalizeRouteHint } from "utils/normalize";
import { createSpeechError } from "./guards";
import type { ISpeechBillingContext } from "./types";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

const MAX_ID_LEN = 128;
const MAX_CLIENT_ID_LEN = 160;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SAFE_CLIENT_ID_RE = /^[a-zA-Z0-9._:-]+$/;

function normalizeSafeId(raw: unknown, field: string) {
  const value = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  if (!value) {
    throw createSpeechError(`${field}가 필요합니다.`, `${field.toUpperCase()}_REQUIRED`, 400);
  }
  if (value.length > MAX_ID_LEN || !SAFE_ID_RE.test(value)) {
    throw createSpeechError(`${field} 형식이 올바르지 않습니다.`, `INVALID_${field.toUpperCase()}`, 400, { field, value });
  }
  return value;
}

export function normalizeSpeechClientId(raw: unknown, fieldLabel: string) {
  const value = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  if (!value) {
    throw createSpeechError(`${fieldLabel}가 필요합니다.`, "CLIENT_ID_REQUIRED", 400, { field: fieldLabel });
  }
  if (value.length > MAX_CLIENT_ID_LEN || !SAFE_CLIENT_ID_RE.test(value)) {
    throw createSpeechError(`${fieldLabel} 형식이 올바르지 않습니다.`, "INVALID_CLIENT_ID", 400, {
      field: fieldLabel,
      value,
    });
  }
  return value;
}

export function normalizeOptionalSpeechString(raw: unknown, maxLength = 2000) {
  const value = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  if (!value) return "";
  return value.slice(0, Math.max(1, maxLength));
}

export function normalizeOptionalSpeechNumber(raw: unknown) {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

export function normalizeOptionalSpeechObject(raw: unknown): UnknownRecord | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as UnknownRecord) : null;
}

export function normalizeOptionalSpeechProvider(raw: unknown): SpeechProviderType | undefined {
  const value = normalizeOptionalSpeechString(raw, 32).toLowerCase();
  if (!value) return undefined;
  if (value === "openai" || value === "google" || value === "elevenlabs" || value === "qwen") return value;
  throw createSpeechError("지원하지 않는 speech provider 입니다.", "UNSUPPORTED_SPEECH_PROVIDER", 400, { provider: value });
}

type ResolveSpeechRouteContextArgs = {
  user: unknown;
  routeHintRaw: unknown;
  universeIdRaw: unknown;
  npcIdRaw: unknown;
  sessionIdRaw: unknown;
  clientIdRaw: unknown;
  clientIdFieldLabel: string;
  /** 비-tutors route로 위조된 Tutors persona를 provider 이전에 차단한다. */
  rejectTutorsPersona?: boolean;
};

export async function resolveSpeechRouteContext(args: ResolveSpeechRouteContextArgs) {
  const routeHint = normalizeRouteHint(args.routeHintRaw);
  const universeId = normalizeSafeId(args.universeIdRaw, "universeId");
  const npcId = normalizeSafeId(args.npcIdRaw, "npcId");
  const sessionId = normalizeSafeId(args.sessionIdRaw, "sessionId");
  const clientId = normalizeSpeechClientId(args.clientIdRaw, args.clientIdFieldLabel);

  const userRec = toUnknownRecord(args.user);
  const isGuest = String(userRec.ID || "").startsWith("guest:");
  if (routeHint !== "commerce" && isGuest) {
    throw createSpeechError("로그인이 필요합니다.", "AUTH_REQUIRED", 401);
  }

  if (args.rejectTutorsPersona && routeHint === "ai") {
    const tutorsState = normalizeTutorsState(toUnknownRecord(userRec.selectedPersonas).tutors);
    const forgedTutorsPersona = tutorsState.selected.find((item) => item.personaId === npcId);
    if (forgedTutorsPersona) {
      throw createSpeechError(
        "Tutors 음성 입력은 현재 텍스트 전용입니다.",
        "TUTORS_SPEECH_GATE_CLOSED",
        403,
        { universeId, npcId, routeHint },
      );
    }
  }

  const universe = await getUniverseById(universeId).catch(() => null);
  if (!universe) {
    throw createSpeechError("유니버스를 찾을 수 없습니다.", "UNIVERSE_NOT_FOUND", 404, { universeId });
  }

  const universeType = String(toUnknownRecord(universe).type || "")
    .trim()
    .toLowerCase();
  if (routeHint === "commerce" && universeType !== "commerce") {
    throw createSpeechError("커머스 유니버스가 아닙니다.", "NOT_COMMERCE_UNIVERSE", 400, { universeId });
  }
  if (routeHint !== "commerce" && universeType === "commerce") {
    throw createSpeechError("커머스 유니버스는 commerce 라우트를 사용해야 합니다.", "ROUTE_UNIVERSE_MISMATCH", 400, {
      universeId,
      routeHint,
    });
  }

  const persona =
    routeHint === "tutors"
      ? await getTutorPersonaForPrompt(args.user, npcId).catch(() => null)
      : await getPersonaForPrompt(universeId, npcId).catch(() => null);
  if (!persona) {
    throw createSpeechError("NPC를 찾을 수 없습니다.", "NPC_NOT_FOUND", 404, { universeId, npcId });
  }

  if (routeHint === "tutors") {
    const tutorsState = normalizeTutorsState(toUnknownRecord(userRec.selectedPersonas).tutors);
    const selected = tutorsState.selected.find((item) => item.personaId === npcId && item.universeId === universeId);
    if (!selected) {
      throw createSpeechError(
        "선택되지 않은 선생님입니다. 먼저 선택해주세요.",
        "TUTORS_PERSONA_NOT_SELECTED",
        400,
        { universeId, npcId },
      );
    }
  }

  const universeDetail = await getUniverseDetail(universeId).catch(() => null);
  if (universeDetail?.metadata?.voiceEnabled === false) {
    throw createSpeechError("이 유니버스에서는 음성 기능이 비활성화되어 있습니다.", "VOICE_DISABLED", 403, {
      universeId,
    });
  }

  return {
    routeHint,
    universeId,
    npcId,
    sessionId,
    clientId,
    universe,
    persona,
    universeDetail,
    universeMetadata: universeDetail?.metadata,
  };
}

export function buildSpeechBillingContext(args: {
  user: unknown;
  routeHint: "ai" | "tutors" | "commerce";
  universeId: string;
  sessionId: string;
  npcId: string;
  clientId: string;
  operation: "speech_transcribe" | "speech_synthesize" | "speech_audio_analyze";
}): ISpeechBillingContext {
  const u = toUnknownRecord(args.user);
  const uid = String(u.uid || u.ID || "").trim();
  return {
    uid,
    universeId: args.universeId,
    routeHint: args.routeHint,
    billToUniverse: args.routeHint === "commerce",
    requireChargeContext: true,
    meta: {
      operation: args.operation,
      routeHint: args.routeHint,
      universeId: args.universeId,
      npcId: args.npcId,
      sessionId: args.sessionId,
      clientId: args.clientId,
      source: "user_action",
      operationId: `audio:${args.operation}:${args.sessionId}:${args.clientId}`,
    },
  };
}

export function buildInlineAudioDataUrl(contentType: string, audioBuffer: Buffer) {
  return `data:${contentType};base64,${audioBuffer.toString("base64")}`;
}
