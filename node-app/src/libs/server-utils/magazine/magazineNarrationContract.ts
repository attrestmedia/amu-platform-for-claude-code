import crypto from "node:crypto";

export const MAGAZINE_NARRATION_CONTRACT_TYPE = "magazine-narration" as const;
export const MAGAZINE_NARRATION_SCHEMA_VERSION = "magazine-narration.v1" as const;
export const MAGAZINE_NARRATION_TEMPLATE_KEY = "narration-basic" as const;
export const MAGAZINE_NARRATION_STATES = ["published", "invalidation_pending", "invalidated"] as const;
export type MagazineNarrationState = (typeof MAGAZINE_NARRATION_STATES)[number];

export type MagazineNarrationContentRef = {
  kind: "app_content";
  contentId: string;
  slug: string;
};

export type MagazineNarrationStorage = {
  driver: "r2";
  access: "public";
  bucket: string;
  key: string;
  url: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  ext: string;
};

export type MagazineNarrationVoiceProvenance = {
  provider: "elevenlabs";
  voiceId: string;
  voiceRevision: string;
  rightsStatus: "verified_commercial";
  usage: "production";
  source: string;
  evidence: string[];
};

export type MagazineNarrationSource = {
  jobId: string;
  assetIds: string[];
  sourceRevision: string;
  sourceHash: string;
  manifestHash: string;
  segmentCount: number;
  provider: "elevenlabs";
  modelName: string;
  templateKey: typeof MAGAZINE_NARRATION_TEMPLATE_KEY;
  visibility: "private";
  voice: MagazineNarrationVoiceProvenance;
};

export type MagazineNarrationSegment = {
  assetId: string;
  segmentIndex: number;
  orderedIndex: number;
  segmentHash: string;
  text: string;
  charCount: number;
  durationMs: number;
  silenceAfterMs: number;
  sourceStorage: {
    driver: "r2";
    access: "private";
    bucket: string;
    key: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    ext: string;
  };
  storage?: MagazineNarrationStorage;
};

export type MagazineNarrationPlaylist = {
  contractVersion: "studio-audio.v1";
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

export type MagazineNarrationInvalidation = {
  reason: "article_revision_changed" | "article_unpublished" | "voice_rights_withdrawn" | "manual" | "cleanup_failed";
  requestedBy: string;
  requestedAt: string;
  lastError?: string;
  lastAttemptAt?: string;
};

export type MagazineNarrationPlaybackSegment = {
  assetId: string;
  segmentIndex: number;
  orderedIndex: number;
  segmentHash: string;
  text: string;
  durationMs: number;
  silenceAfterMs: number;
  url: string;
  urlKind: "public";
};

export type MagazineNarrationPlayback = {
  contractType: typeof MAGAZINE_NARRATION_CONTRACT_TYPE;
  schemaVersion: typeof MAGAZINE_NARRATION_SCHEMA_VERSION;
  contentRef: MagazineNarrationContentRef;
  contentRefKey: string;
  articleRevision: string;
  voice: MagazineNarrationVoiceProvenance;
  playlist: MagazineNarrationPlaylist;
  segments: MagazineNarrationPlaybackSegment[];
};

export type MagazineNarrationPublishInput = {
  contentRef: unknown;
  articleRevision?: unknown;
  jobId: unknown;
  actor: unknown;
};

export type MagazineNarrationGateFailure =
  | "invalid_content_ref"
  | "article_not_found"
  | "article_unavailable"
  | "article_revision_mismatch"
  | "article_not_indexable"
  | "article_not_allowlisted"
  | "allowlist_unavailable"
  | "audio_job_not_found"
  | "audio_job_not_success"
  | "audio_source_mismatch"
  | "audio_source_incomplete"
  | "audio_voice_not_approved"
  | "audio_storage_invalid"
  | "audio_storage_unavailable";

export type MagazineNarrationPublishResult =
  | { ok: true; data: unknown; reused: boolean }
  | { ok: false; error: MagazineNarrationGateFailure | "conflict" | "unavailable"; message?: string };

function safeString(value: unknown, maxLength = 512) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function magazineNarrationContentRefKey(ref: MagazineNarrationContentRef) {
  return ref.contentId.trim();
}

export function isMagazineNarrationContentRef(value: unknown): value is MagazineNarrationContentRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return ref.kind === "app_content"
    && /^amu:magazine:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeString(ref.contentId, 180))
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeString(ref.slug, 120))
    && safeString(ref.contentId, 180) === `amu:magazine:${safeString(ref.slug, 120)}`;
}

export function validateMagazineNarrationPublishInput(raw: unknown): { ok: true; value: MagazineNarrationPublishInput & { contentRef: MagazineNarrationContentRef; articleRevision?: string; jobId: string; actor: string } } | { ok: false; error: "invalid_input"; issues: string[] } {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const issues: string[] = [];
  if (!isMagazineNarrationContentRef(value.contentRef)) issues.push("contentRef는 app_content namespace여야 합니다.");
  const jobId = safeString(value.jobId, 180);
  if (!jobId) issues.push("jobId가 필요합니다.");
  const actor = safeString(value.actor, 180);
  if (!actor || actor === "unknown") issues.push("감사 actor가 필요합니다.");
  let articleRevision: string | undefined;
  if (value.articleRevision !== undefined) {
    articleRevision = safeString(value.articleRevision, 200);
    if (!/^[a-f0-9]{64}$/.test(articleRevision)) issues.push("articleRevision은 64자리 revision이어야 합니다.");
  }
  if (issues.length) return { ok: false, error: "invalid_input", issues };
  return {
    ok: true,
    value: {
      contentRef: value.contentRef as MagazineNarrationContentRef,
      ...(articleRevision ? { articleRevision } : {}),
      jobId,
      actor,
    },
  };
}

function safeKeySegment(value: unknown, fallback: string) {
  return safeString(value, 180).replace(/[^a-zA-Z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || fallback;
}

export function buildMagazineNarrationObjectKey(args: {
  contentRefKey: string;
  articleRevision: string;
  narrationId: string;
  segmentIndex: number;
  ext: string;
}) {
  return [
    "voice",
    "magazine",
    "narration",
    safeKeySegment(args.contentRefKey, "content"),
    safeKeySegment(args.articleRevision, "revision"),
    safeKeySegment(args.narrationId, "narration"),
    `${Math.max(0, Math.floor(Number(args.segmentIndex) || 0))}.${safeKeySegment(args.ext, "mp3")}`,
  ].join("/");
}

export function buildMagazineNarrationId() {
  return `mag_narr_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function isPublicMagazineNarrationStorage(value: unknown): value is MagazineNarrationStorage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const storage = value as Record<string, unknown>;
  let publicUrl = false;
  try {
    const url = new URL(safeString(storage.url, 1200));
    publicUrl = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    publicUrl = false;
  }
  return storage.driver === "r2"
    && storage.access === "public"
    && safeString(storage.bucket, 180).length > 0
    && safeString(storage.key, 500).length > 0
    && publicUrl
    && safeString(storage.mimeType, 120).toLowerCase().startsWith("audio/")
    && Number.isSafeInteger(Number(storage.bytes))
    && Number(storage.bytes) > 0
    && /^[a-f0-9]{64}$/i.test(safeString(storage.sha256, 80))
    && safeString(storage.ext, 16).length > 0;
}

export function isPrivateMagazineNarrationStorage(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const storage = value as Record<string, unknown>;
  return storage.driver === "r2"
    && storage.access === "private"
    && safeString(storage.bucket, 180).length > 0
    && safeString(storage.key, 500).length > 0
    && safeString(storage.mimeType, 120).toLowerCase().startsWith("audio/")
    && Number.isSafeInteger(Number(storage.bytes))
    && Number(storage.bytes) > 0
    && /^[a-f0-9]{64}$/i.test(safeString(storage.sha256, 80))
    && safeString(storage.ext, 16).length > 0;
}

export function sameMagazineNarrationSource(args: {
  source: Pick<MagazineNarrationSource, "jobId" | "manifestHash" | "sourceRevision" | "assetIds">;
  jobId: string;
  manifestHash: string;
  sourceRevision: string;
  assetIds: readonly string[];
}) {
  return args.source.jobId === args.jobId
    && args.source.manifestHash === args.manifestHash
    && args.source.sourceRevision === args.sourceRevision
    && JSON.stringify(args.source.assetIds) === JSON.stringify(Array.from(args.assetIds));
}

export function stableMagazineNarrationHash(value: unknown) {
  return crypto.createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

export function stableStringify(value: unknown): string {
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
