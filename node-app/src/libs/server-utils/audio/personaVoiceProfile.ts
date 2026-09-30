import "server-only";
import {
  ELEVENLABS_DEFAULT_TTS_MODEL,
  OPENAI_DEFAULT_TTS_MODEL,
  getOpenAiVoiceCatalogEntry,
} from "consts/ai/voiceCatalog";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { getTutorsCollectionName } from "libs/services/tutors/tutorsCollectionKey";
import { resolveTutorPersonaReadAccess } from "libs/services/tutors/tutorGiftGrants";
import { PersonaSchema } from "models/universe";
import type { IPersonaDocument } from "models/universe";
import type { IPersona, ISpeechVoiceProfile } from "types/ai";
import { buildVoiceFingerprint } from "./cacheKeys";
import type { IResolvedVoiceProfile } from "./types";
import type { UnknownRecord } from "utils/common/typeUtils";

function normalizeTrimmedString(raw: unknown, maxLength: number) {
  const value = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  if (!value) return "";
  return value.slice(0, Math.max(1, maxLength));
}

export function normalizePersonaVoiceProfile(raw: unknown): ISpeechVoiceProfile | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const rec = raw as UnknownRecord;
  const provider = normalizeTrimmedString(rec.provider, 32).toLowerCase();
  if (provider === "elevenlabs") {
    const voiceId = normalizeTrimmedString(rec.voiceId, 128);
    const voiceRevision = normalizeTrimmedString(rec.voiceRevision, 80);
    const provenance = normalizeTrimmedString(rec.provenance, 64);
    const rightsStatus = normalizeTrimmedString(rec.rightsStatus, 64);
    if (!voiceId || !/^[A-Za-z0-9_-]{8,128}$/.test(voiceId)) return undefined;
    if (!voiceRevision || !provenance || rightsStatus !== "verified_commercial") return undefined;

    const modelName = normalizeTrimmedString(rec.modelName, 120) || ELEVENLABS_DEFAULT_TTS_MODEL;
    const locale = normalizeTrimmedString(rec.locale, 16) || undefined;
    const instructions = normalizeTrimmedString(rec.instructions, 1000) || undefined;
    const settings = rec.settings && typeof rec.settings === "object" && !Array.isArray(rec.settings)
      ? (rec.settings as ISpeechVoiceProfile["settings"])
      : undefined;
    const speechIntent = rec.speechIntent && typeof rec.speechIntent === "object" && !Array.isArray(rec.speechIntent)
      ? (rec.speechIntent as ISpeechVoiceProfile["speechIntent"])
      : undefined;

    return {
      provider: "elevenlabs",
      voiceId,
      voiceRevision,
      provenance,
      rightsStatus,
      modelName,
      locale,
      instructions,
      settings,
      speechIntent,
      voiceFingerprint: buildVoiceFingerprint({
        provider: "elevenlabs",
        voiceId,
        voiceRevision,
        modelName,
        locale,
        instructions,
        settings,
        speechIntent,
      }),
      source: normalizeTrimmedString(rec.source, 64) || "persona-profile",
      tags: Array.isArray(rec.tags) ? rec.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 16) : [],
      resolvedAt: (rec.resolvedAt as string | undefined) || new Date().toISOString(),
    };
  }
  if (provider && provider !== "openai") return undefined;

  const voiceId = normalizeTrimmedString(rec.voiceId, 64).toLowerCase();
  if (!voiceId) return undefined;

  const catalogEntry = getOpenAiVoiceCatalogEntry(voiceId);
  if (!catalogEntry) return undefined;

  const modelName = normalizeTrimmedString(rec.modelName, 120) || OPENAI_DEFAULT_TTS_MODEL;
  const locale = normalizeTrimmedString(rec.locale, 16).toLowerCase() || undefined;
  const instructions =
    normalizeTrimmedString(rec.instructions, 1000) || normalizeTrimmedString(catalogEntry.instructions, 1000);
  const source = normalizeTrimmedString(rec.source, 64) || "persona-profile";

  return {
    provider: "openai",
    voiceId: catalogEntry.voiceId,
    modelName,
    locale,
    instructions,
    voiceFingerprint: buildVoiceFingerprint({
      provider: "openai",
      voiceId: catalogEntry.voiceId,
      modelName,
      locale,
      instructions,
    }),
    source,
    tags: [...catalogEntry.tags],
    resolvedAt: (rec.resolvedAt as string | undefined) || new Date().toISOString(),
  };
}

export function normalizePersonaVoiceProfileForGender(raw: unknown, _gender: unknown): ISpeechVoiceProfile | undefined {
  const profile = normalizePersonaVoiceProfile(raw);
  if (!profile?.voiceId) return undefined;
  return profile;
}

export async function persistResolvedPersonaVoiceProfile(args: {
  user: unknown;
  routeHint: "ai" | "tutors" | "commerce";
  universeId: string;
  personaId: string;
  persona?: Partial<IPersona> | null;
  currentVoiceProfile?: Partial<ISpeechVoiceProfile> | null;
  resolvedVoice?: IResolvedVoiceProfile | null;
}) {
  const personaId = normalizeTrimmedString(args.personaId, 128);
  const universeId = normalizeTrimmedString(args.universeId, 128);
  const currentVoiceId = normalizeTrimmedString(args.currentVoiceProfile?.voiceId, 128);
  const currentFingerprint = normalizeTrimmedString(args.currentVoiceProfile?.voiceFingerprint, 160);
  const resolvedVoice = args.resolvedVoice;

  if (!personaId || !universeId || !resolvedVoice) return false;
  if (resolvedVoice.source === "request-override") return false;
  if (currentVoiceId || currentFingerprint) return false;

  const nextProfile = normalizePersonaVoiceProfile({
    provider: resolvedVoice.provider,
    voiceId: resolvedVoice.voiceId,
    voiceRevision: resolvedVoice.voiceRevision,
    provenance: resolvedVoice.provenance,
    rightsStatus: resolvedVoice.rightsStatus,
    modelName: resolvedVoice.modelName,
    locale: resolvedVoice.locale,
    instructions: resolvedVoice.instructions,
    settings: resolvedVoice.settings,
    speechIntent: resolvedVoice.speechIntent,
    source: resolvedVoice.source,
    resolvedAt: new Date().toISOString(),
  });
  if (!nextProfile) return false;

  if (args.routeHint === "tutors") {
    const resolved = await resolveTutorPersonaReadAccess(args.user, personaId).catch(() => null);
    if (!resolved?.access || resolved.access.kind !== "owner") return false;
  }

  const collectionName = args.routeHint === "tutors" ? getTutorsCollectionName(args.user) : universeId;
  const PersonaModel = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
  const result = await PersonaModel.updateOne(
    {
      pid: personaId,
      $or: [{ voiceProfile: { $exists: false } }, { "voiceProfile.voiceId": { $in: [null, ""] } }],
    },
    { $set: { voiceProfile: nextProfile } },
  ).exec();

  return Number(result.modifiedCount || 0) > 0;
}
