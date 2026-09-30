import "server-only";

import { getElevenLabsVoiceCatalogEntry } from "consts/ai/voiceCatalog";
import {
  getAudioGenJobByJobId,
  listAudioAssetsByJobId,
} from "libs/database/lab/audioGenRepo";
import type { IAudioAssetDocument, IAudioGenJobDocument } from "models/lab";
// eslint-disable-next-line import/no-cycle -- publication/read service는 article source를 읽고, write repo는 post-write cleanup만 지연 연결한다.
import { getAppMagazineContentBySlug, type AppMagazineContentProjection } from "./appContentRepo";
import { listMagazineEmbedRegistryEntries, type MagazineRegistryReadResult } from "./magazineEmbedRegistry";
import {
  buildStudioAudioPlaylist,
  type StudioAudioManifest,
} from "libs/server-utils/lab/studioAudioContract";
import {
  assertVoiceAssetStorage,
  copyVoiceAssetToAccess,
  deleteVoiceAssetByStorage,
  resolveAudioExt,
  type VoiceAssetStorageMeta,
} from "libs/server-utils/audio/voiceAssetStorage";
import {
  buildMagazineNarrationId,
  buildMagazineNarrationObjectKey,
  isMagazineNarrationContentRef,
  isPrivateMagazineNarrationStorage,
  isPublicMagazineNarrationStorage,
  magazineNarrationContentRefKey,
  MAGAZINE_NARRATION_TEMPLATE_KEY,
  sameMagazineNarrationSource,
  type MagazineNarrationContentRef,
  type MagazineNarrationGateFailure,
  type MagazineNarrationPlayback,
  type MagazineNarrationPublishResult,
  type MagazineNarrationPublishInput,
  type MagazineNarrationSegment,
  type MagazineNarrationSource,
  type MagazineNarrationStorage,
  type MagazineNarrationVoiceProvenance,
} from "./magazineNarrationContract";
import {
  getMagazineNarration,
  getMagazineNarrationById,
  insertPublishedMagazineNarration,
  listMagazineNarrationsByContentRefKey,
  markMagazineNarrationInvalidated,
  recordMagazineNarrationInvalidationFailure,
  requestMagazineNarrationInvalidation,
  type MagazineNarrationProjection,
} from "./magazineNarrationRepo";
import { logger } from "utils/log";

type AudioJobLike = Pick<IAudioGenJobDocument, "jobId" | "status" | "scope" | "provider" | "modelName" | "request" | "sourceRevision" | "sourceHash" | "manifestHash" | "segmentCount" | "assets">;
type AudioAssetLike = Pick<IAudioAssetDocument, "assetId" | "jobId" | "scope" | "provider" | "modelName" | "templateKey" | "visibility" | "sourceRevision" | "sourceHash" | "segmentIndex" | "segmentCount" | "segmentHash" | "manifestHash" | "audio" | "storage" | "state">;

type NarrationRepository = {
  get: typeof getMagazineNarration;
  getById: typeof getMagazineNarrationById;
  insert: typeof insertPublishedMagazineNarration;
  listByContentRefKey: typeof listMagazineNarrationsByContentRefKey;
  requestInvalidation: typeof requestMagazineNarrationInvalidation;
  markInvalidated: typeof markMagazineNarrationInvalidated;
  recordInvalidationFailure: typeof recordMagazineNarrationInvalidationFailure;
};

type NarrationStorage = {
  assert: typeof assertVoiceAssetStorage;
  copy: typeof copyVoiceAssetToAccess;
  delete: typeof deleteVoiceAssetByStorage;
};

export type MagazineNarrationServiceDependencies = {
  content?: { getBySlug: typeof getAppMagazineContentBySlug };
  registry?: { list: typeof listMagazineEmbedRegistryEntries };
  audio?: {
    getJob: (jobId: string) => Promise<AudioJobLike | null>;
    listAssets: (jobId: string) => Promise<AudioAssetLike[]>;
  };
  narration?: Partial<NarrationRepository>;
  storage?: Partial<NarrationStorage>;
  now?: () => Date;
};

type ResolvedDependencies = {
  content: { getBySlug: typeof getAppMagazineContentBySlug };
  registry: { list: typeof listMagazineEmbedRegistryEntries };
  audio: Required<NonNullable<MagazineNarrationServiceDependencies["audio"]>>;
  narration: NarrationRepository;
  storage: NarrationStorage;
  now: () => Date;
};

function resolveDependencies(input: MagazineNarrationServiceDependencies = {}): ResolvedDependencies {
  return {
    content: { getBySlug: input.content?.getBySlug || getAppMagazineContentBySlug },
    registry: { list: input.registry?.list || listMagazineEmbedRegistryEntries },
    audio: {
      getJob: input.audio?.getJob || (getAudioGenJobByJobId as (jobId: string) => Promise<AudioJobLike | null>),
      listAssets: input.audio?.listAssets || (listAudioAssetsByJobId as (jobId: string) => Promise<AudioAssetLike[]>),
    },
    narration: {
      get: input.narration?.get || getMagazineNarration,
      getById: input.narration?.getById || getMagazineNarrationById,
      insert: input.narration?.insert || insertPublishedMagazineNarration,
      listByContentRefKey: input.narration?.listByContentRefKey || listMagazineNarrationsByContentRefKey,
      requestInvalidation: input.narration?.requestInvalidation || requestMagazineNarrationInvalidation,
      markInvalidated: input.narration?.markInvalidated || markMagazineNarrationInvalidated,
      recordInvalidationFailure: input.narration?.recordInvalidationFailure || recordMagazineNarrationInvalidationFailure,
    },
    storage: {
      assert: input.storage?.assert || assertVoiceAssetStorage,
      copy: input.storage?.copy || copyVoiceAssetToAccess,
      delete: input.storage?.delete || deleteVoiceAssetByStorage,
    },
    now: input.now || (() => new Date()),
  };
}

function safe(value: unknown, maxLength = 512) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type MagazineNarrationPublishError = MagazineNarrationGateFailure | "conflict" | "unavailable";

function fail(error: MagazineNarrationPublishError, message?: string): MagazineNarrationPublishResult {
  return { ok: false as const, error, ...(message ? { message } : {}) };
}

function registryAllowsContent(result: MagazineRegistryReadResult, contentId: string, now: Date) {
  if (!result.ok) return { ok: false as const, error: "allowlist_unavailable" as const };
  const nowMs = now.getTime();
  const allowed = result.entries.some((entry) => {
    const startsAt = entry.startsAt ? new Date(entry.startsAt).getTime() : null;
    const expiresAt = entry.expiresAt ? new Date(entry.expiresAt).getTime() : null;
    return entry.serviceKey === "gen-studio"
      && entry.runtimeEnabled
      && !entry.killSwitch
      && entry.magazineExposure !== "disabled"
      && (startsAt === null || (Number.isFinite(startsAt) && startsAt <= nowMs))
      && (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > nowMs))
      && (entry.allowedContentIds || []).includes(contentId);
  });
  return allowed ? { ok: true as const } : { ok: false as const, error: "article_not_allowlisted" as const };
}

async function readRegistryAllowlist(deps: ResolvedDependencies, contentId: string) {
  try {
    return registryAllowsContent(await deps.registry.list("gen-studio"), contentId, deps.now());
  } catch {
    return { ok: false as const, error: "allowlist_unavailable" as const };
  }
}

function sourceStorageOf(asset: AudioAssetLike): VoiceAssetStorageMeta | null {
  const raw = record(asset.storage);
  if (raw.driver !== "r2" || raw.access !== "private") return null;
  const storage = {
    driver: "r2" as const,
    access: "private" as const,
    bucket: safe(raw.bucket, 180),
    key: safe(raw.key, 500),
    mimeType: safe(raw.mimeType, 120).toLowerCase(),
    ext: safe(raw.ext, 16) || resolveAudioExt(safe(raw.mimeType, 120)),
    bytes: Number(raw.bytes || 0),
    sha256: safe(raw.sha256, 80).toLowerCase(),
  };
  return isPrivateMagazineNarrationStorage(storage) ? storage : null;
}

function voiceFromAsset(asset: AudioAssetLike): MagazineNarrationVoiceProvenance | null {
  const raw = record(asset.audio?.voiceProvenance);
  const provider = safe(raw.provider, 40).toLowerCase();
  const voiceId = safe(raw.voiceId, 160);
  const voiceRevision = safe(raw.voiceRevision, 160);
  const rightsStatus = safe(raw.rightsStatus, 80);
  const source = safe(raw.source, 160);
  const entry = provider === "elevenlabs" ? getElevenLabsVoiceCatalogEntry(voiceId) : undefined;
  if (
    provider !== "elevenlabs"
    || !voiceId
    || !voiceRevision
    || rightsStatus !== "verified_commercial"
    || source !== "approved_catalog"
    || !entry
    || entry.voiceRevision !== voiceRevision
    || entry.rightsStatus !== "verified_commercial"
    || entry.usage !== "production"
    || entry.evidence.length === 0
  ) return null;
  return {
    provider: "elevenlabs",
    voiceId,
    voiceRevision,
    rightsStatus: "verified_commercial",
    usage: "production",
    source,
    evidence: entry.evidence.map((item) => String(item).trim()).filter(Boolean),
  };
}

function manifestOf(job: AudioJobLike): StudioAudioManifest | null {
  const raw = record(job.request).manifest;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const manifest = raw as StudioAudioManifest;
  if (!Array.isArray(manifest.segments) || !Number.isInteger(manifest.segmentCount) || manifest.segmentCount < 1) return null;
  return manifest;
}

function normalizedAssetIds(values: unknown) {
  return (Array.isArray(values) ? values : []).map((item) => safe(item, 180)).filter(Boolean).sort();
}

function sourceMatchesJob(job: AudioJobLike, manifest: StudioAudioManifest, assets: AudioAssetLike[], articleRevision: string) {
  const request = record(job.request);
  if (request.templateKey !== MAGAZINE_NARRATION_TEMPLATE_KEY || request.visibility !== "private" || request.scope !== "user") return false;
  const sourceRevision = safe(job.sourceRevision, 200);
  const sourceHash = safe(job.sourceHash, 80).toLowerCase();
  const manifestHash = safe(job.manifestHash, 80).toLowerCase();
  if (sourceRevision !== articleRevision || manifest.sourceRevision !== articleRevision || !sourceHash || sourceHash !== manifest.sourceHash || !manifestHash || manifestHash !== manifest.manifestHash) return false;
  if (manifest.segmentCount !== Number(job.segmentCount) || assets.length !== manifest.segmentCount) return false;
  if (manifest.contractVersion !== "studio-audio.v1" || manifest.segments.some((segment) => typeof segment.text !== "string" || segment.sourceRevision !== articleRevision || segment.sourceHash !== sourceHash || !segment.text.trim() || segment.charCount !== Array.from(segment.text).length)) return false;
  if (normalizedAssetIds(job.assets).join(",") !== normalizedAssetIds(assets.map((asset) => asset.assetId)).join(",")) return false;
  return assets.every((asset) => asset.jobId === job.jobId
    && asset.state === "active"
    && asset.scope === "user"
    && asset.visibility === "private"
    && asset.provider === "elevenlabs"
    && asset.templateKey === MAGAZINE_NARRATION_TEMPLATE_KEY
    && asset.sourceRevision === articleRevision
    && asset.sourceHash === sourceHash
    && asset.manifestHash === manifestHash
    && asset.segmentCount === manifest.segmentCount
    && Number.isInteger(asset.segmentIndex)
    && asset.segmentIndex >= 0
    && Boolean(sourceStorageOf(asset))
    && asset.audio?.sourceTextVersion === articleRevision
    && Number(asset.audio?.durationMs || 0) > 0);
}

async function cleanupCopied(storage: MagazineNarrationStorage[], deps: ResolvedDependencies) {
  const results = await Promise.allSettled(storage.map((item) => deps.storage.delete(item)));
  if (results.some((result) => result.status === "rejected" || result.value !== true)) {
    throw new Error("MAGAZINE_NARRATION_COMPENSATION_FAILED");
  }
}

function buildPublishedSegments(args: {
  manifest: StudioAudioManifest;
  playlist: NonNullable<ReturnType<typeof buildStudioAudioPlaylist>>;
  assets: AudioAssetLike[];
  publicStorage: MagazineNarrationStorage[];
}): MagazineNarrationSegment[] {
  const assetByIndex = new Map(args.assets.map((asset) => [asset.segmentIndex, asset]));
  const storageByIndex = new Map(args.publicStorage.map((storage, index) => [args.assets[index]?.segmentIndex, storage]));
  return args.playlist.segments.map((playlistSegment) => {
    const manifestSegment = args.manifest.segments.find((segment) => segment.segmentIndex === playlistSegment.segmentIndex);
    const asset = assetByIndex.get(playlistSegment.segmentIndex);
    const sourceStorage = asset ? sourceStorageOf(asset) : null;
    const storage = storageByIndex.get(playlistSegment.segmentIndex);
    if (!manifestSegment || !asset || !sourceStorage || !storage) throw new Error("MAGAZINE_NARRATION_SEGMENT_BUILD_FAILED");
    return {
      assetId: asset.assetId,
      segmentIndex: playlistSegment.segmentIndex,
      orderedIndex: playlistSegment.orderedIndex,
      segmentHash: playlistSegment.segmentHash,
      text: manifestSegment.text,
      charCount: manifestSegment.charCount,
      durationMs: playlistSegment.durationMs,
      silenceAfterMs: playlistSegment.silenceAfterMs,
      sourceStorage: { ...sourceStorage, access: "private" as const, mimeType: sourceStorage.mimeType || "audio/mpeg", bytes: sourceStorage.bytes || 0, sha256: sourceStorage.sha256 || "", ext: sourceStorage.ext || "mp3" },
      storage,
    };
  });
}

export async function publishMagazineNarration(
  input: MagazineNarrationPublishInput,
  dependencies: MagazineNarrationServiceDependencies = {},
): Promise<MagazineNarrationPublishResult> {
  const deps = resolveDependencies(dependencies);
  const rawRef = input?.contentRef;
  if (!isMagazineNarrationContentRef(rawRef)) return fail("invalid_content_ref");
  const contentRef = rawRef;
  const contentRefKey = magazineNarrationContentRefKey(contentRef);
  const actor = safe(input.actor, 180);
  const jobId = safe(input.jobId, 180);
  if (!actor || actor === "unknown" || !jobId) return fail("invalid_content_ref", "actor와 jobId가 필요합니다.");

  const contentResult = await deps.content.getBySlug(contentRef.slug);
  if (!contentResult.ok) return fail(contentResult.error === "not_found" ? "article_not_found" : "article_unavailable");
  const content: AppMagazineContentProjection = contentResult.data;
  if (content.content.contentId !== contentRef.contentId) return fail("article_revision_mismatch");
  const requestedRevision = safe(input.articleRevision, 200);
  if (requestedRevision && requestedRevision !== content.revision) return fail("article_revision_mismatch");
  if (!content.content.seo.indexable) return fail("article_not_indexable");

  const allowlist = await readRegistryAllowlist(deps, content.content.contentId);
  if (!allowlist.ok) return fail(allowlist.error);

  const job = await deps.audio.getJob(jobId);
  if (!job) return fail("audio_job_not_found");
  if (job.status !== "success") return fail("audio_job_not_success");
  if (job.scope !== "user" || job.provider !== "elevenlabs") return fail("audio_source_mismatch");
  const manifest = manifestOf(job);
  const rawAssets = await deps.audio.listAssets(jobId);
  const assets = (Array.isArray(rawAssets) ? rawAssets : []).slice().sort((left, right) => left.segmentIndex - right.segmentIndex);
  if (!manifest || !sourceMatchesJob(job, manifest, assets, content.revision)) return fail("audio_source_mismatch");
  if (assets.some((asset) => !voiceFromAsset(asset))) return fail("audio_voice_not_approved");
  const voice = voiceFromAsset(assets[0] as AudioAssetLike);
  if (!voice || assets.some((asset) => {
    const candidate = voiceFromAsset(asset);
    return !candidate || candidate.voiceId !== voice.voiceId || candidate.voiceRevision !== voice.voiceRevision;
  })) return fail("audio_voice_not_approved");

  const playlist = buildStudioAudioPlaylist({
    manifest,
    assets: assets.map((asset) => ({
      assetId: asset.assetId,
      segmentIndex: asset.segmentIndex,
      segmentHash: asset.segmentHash,
      audio: { durationMs: asset.audio?.durationMs },
    })),
    silenceMs: Number(record(job.request).silenceMs || 0),
    pronunciationDictionary: Array.isArray(record(job.request).pronunciationDictionary) ? record(job.request).pronunciationDictionary as string[] : [],
  });
  if (!playlist) return fail("audio_source_incomplete");

  const existing = await deps.narration.get({ contentRefKey, articleRevision: content.revision });
  if (existing.ok && existing.data.status === "published") {
    if (sameMagazineNarrationSource({ source: existing.data.source, jobId, manifestHash: manifest.manifestHash, sourceRevision: content.revision, assetIds: assets.map((asset) => asset.assetId) })) {
      return { ok: true, data: existing.data, reused: true };
    }
    return fail("conflict", "같은 article revision에 다른 audio source를 덮어쓸 수 없습니다.");
  }
  if (existing.ok) return fail("conflict", "기존 narration이 cleanup 대기 또는 무효화 상태입니다.");
  if (!existing.ok && existing.error === "unavailable") return fail("unavailable");

  const narrationId = buildMagazineNarrationId();
  const copied: MagazineNarrationStorage[] = [];
  try {
    for (const asset of assets) {
      const sourceStorage = sourceStorageOf(asset);
      if (!sourceStorage) throw new Error("MAGAZINE_NARRATION_SOURCE_STORAGE_INVALID");
      await deps.storage.assert(sourceStorage);
      const copiedStorage = await deps.storage.copy({
        storage: sourceStorage,
        targetAccess: "public",
        targetKey: buildMagazineNarrationObjectKey({
          contentRefKey,
          articleRevision: content.revision,
          narrationId,
          segmentIndex: asset.segmentIndex,
          ext: sourceStorage.ext || resolveAudioExt(sourceStorage.mimeType),
        }),
      });
      if (!isPublicMagazineNarrationStorage(copiedStorage)) throw new Error("MAGAZINE_NARRATION_PUBLIC_STORAGE_INVALID");
      copied.push(copiedStorage);
    }
    const segments = buildPublishedSegments({ manifest, playlist, assets, publicStorage: copied });
    const source: MagazineNarrationSource = {
      jobId,
      assetIds: assets.map((asset) => asset.assetId),
      sourceRevision: content.revision,
      sourceHash: manifest.sourceHash,
      manifestHash: manifest.manifestHash,
      segmentCount: manifest.segmentCount,
      provider: "elevenlabs",
      modelName: safe(job.modelName, 120),
      templateKey: MAGAZINE_NARRATION_TEMPLATE_KEY,
      visibility: "private",
      voice,
    };
    const inserted = await deps.narration.insert({
      narrationId,
      contentRefKey,
      contentRef,
      articleRevision: content.revision,
      source,
      playlist: { ...playlist, contractVersion: "studio-audio.v1" },
      segments,
      publishedBy: actor,
      publishedAt: deps.now(),
    });
    if (inserted.ok) return { ok: true, data: inserted.data, reused: false };
    if (inserted.error === "conflict") {
      const raced = await deps.narration.get({ contentRefKey, articleRevision: content.revision });
      if (raced.ok && raced.data.status === "published" && sameMagazineNarrationSource({ source: raced.data.source, jobId, manifestHash: manifest.manifestHash, sourceRevision: content.revision, assetIds: assets.map((asset) => asset.assetId) })) {
        await cleanupCopied(copied, deps);
        return { ok: true, data: raced.data, reused: true };
      }
      throw new Error("MAGAZINE_NARRATION_PUBLICATION_CONFLICT");
    }
    throw new Error("MAGAZINE_NARRATION_DB_INSERT_FAILED");
  } catch (error) {
    try {
      await cleanupCopied(copied, deps);
    } catch (cleanupError) {
      logger.error("[magazine-narration] publication compensation failed", {
        error: cleanupError instanceof Error ? cleanupError.message : "unknown",
        contentRefKey,
      });
      return fail("unavailable", "R2 보상 삭제가 확인되지 않아 게시를 완료하지 않았습니다.");
    }
    if (error instanceof Error && error.message === "MAGAZINE_NARRATION_PUBLICATION_CONFLICT") return fail("conflict");
    if (error instanceof Error && error.message === "MAGAZINE_NARRATION_SOURCE_STORAGE_INVALID") return fail("audio_storage_invalid");
    return fail("unavailable");
  }
}

function currentVoiceAllowed(voice: MagazineNarrationVoiceProvenance) {
  const raw = record(voice);
  const voiceId = safe(raw.voiceId, 160);
  const voiceRevision = safe(raw.voiceRevision, 160);
  const evidence = Array.isArray(raw.evidence) ? raw.evidence.map((item) => safe(item, 500)).filter(Boolean) : [];
  const entry = getElevenLabsVoiceCatalogEntry(voiceId);
  return raw.provider === "elevenlabs"
    && raw.rightsStatus === "verified_commercial"
    && raw.usage === "production"
    && raw.source === "approved_catalog"
    && evidence.length > 0
    && Boolean(entry)
    && entry?.voiceRevision === voiceRevision
    && entry.rightsStatus === "verified_commercial"
    && entry.usage === "production"
    && entry.evidence.length > 0
    && JSON.stringify(evidence) === JSON.stringify(entry.evidence.map((item) => String(item).trim()).filter(Boolean));
}

type MagazineNarrationPlaybackArgs = {
  content: AppMagazineContentProjection;
  dependencies?: MagazineNarrationServiceDependencies;
};

export async function resolveMagazineNarrationPlayback(args: MagazineNarrationPlaybackArgs): Promise<MagazineNarrationPlayback | null> {
  try {
    return await resolveMagazineNarrationPlaybackUnsafe(args);
  } catch {
    return null;
  }
}

async function resolveMagazineNarrationPlaybackUnsafe(args: MagazineNarrationPlaybackArgs): Promise<MagazineNarrationPlayback | null> {
  const deps = resolveDependencies(args.dependencies);
  const content = args.content;
  const contentRef: MagazineNarrationContentRef = {
    kind: "app_content",
    contentId: content.content.contentId,
    slug: content.content.slug,
  };
  if (!content.content.seo.indexable) return null;
  const allowlist = await readRegistryAllowlist(deps, content.content.contentId);
  if (!allowlist.ok) return null;
  const stored = await deps.narration.get({ contentRefKey: content.content.contentId, articleRevision: content.revision });
  if (!stored.ok || stored.data.status !== "published") return null;
  const narration = stored.data;
  if (
    !isMagazineNarrationContentRef(narration.contentRef)
    || narration.contentRef.contentId !== content.content.contentId
    || narration.contentRef.slug !== content.content.slug
    || narration.contentRefKey !== content.content.contentId
    || narration.articleRevision !== content.revision
    || narration.source.provider !== "elevenlabs"
    || narration.source.templateKey !== MAGAZINE_NARRATION_TEMPLATE_KEY
    || narration.source.visibility !== "private"
    || narration.playlist.contractVersion !== "studio-audio.v1"
    || narration.playlist.sourceRevision !== content.revision
    || !/^[a-f0-9]{64}$/.test(narration.playlist.sourceHash)
    || !/^[a-f0-9]{64}$/.test(narration.playlist.manifestHash)
    || !Number.isSafeInteger(narration.playlist.segmentCount)
    || !Number.isFinite(narration.playlist.silenceMs)
    || narration.playlist.silenceMs < 0
    || !Number.isFinite(narration.playlist.totalDurationMs)
    || narration.playlist.totalDurationMs <= 0
    || !Array.isArray(narration.playlist.pronunciationDictionary)
    || narration.playlist.pronunciationDictionary.some((item) => typeof item !== "string")
    || !Array.isArray(narration.playlist.segments)
    || narration.playlist.segments.length !== narration.playlist.segmentCount
    || !Array.isArray(narration.segments)
    || narration.segments.length !== narration.playlist.segmentCount
    || !Array.isArray(narration.source.assetIds)
    || narration.source.assetIds.length !== narration.segments.length
    || narration.source.assetIds.some((assetId) => typeof assetId !== "string" || !assetId.trim())
    || new Set(narration.source.assetIds).size !== narration.source.assetIds.length
    || narration.segments.some((segment) => typeof segment.text !== "string"
      || !segment.text.trim()
      || !Number.isSafeInteger(segment.charCount)
      || segment.charCount !== Array.from(segment.text).length
      || !Number.isSafeInteger(segment.durationMs)
      || segment.durationMs <= 0
      || !Number.isSafeInteger(segment.silenceAfterMs)
      || segment.silenceAfterMs < 0
      || !isPrivateMagazineNarrationStorage(segment.sourceStorage))
  ) return null;
  if (
    narration.source.sourceRevision !== content.revision
    || narration.source.manifestHash !== narration.playlist.manifestHash
    || narration.source.sourceHash !== narration.playlist.sourceHash
    || narration.source.segmentCount !== narration.playlist.segmentCount
    || narration.segments.length !== narration.playlist.segmentCount
    || narration.source.assetIds.length !== narration.segments.length
    || narration.source.assetIds.some((assetId, index) => assetId !== narration.segments[index]?.assetId)
  ) return null;
  if (!currentVoiceAllowed(narration.source.voice)) return null;
  const segments = [];
  for (const segment of narration.segments.slice().sort((left, right) => left.orderedIndex - right.orderedIndex)) {
    if (!segment.storage || !isPublicMagazineNarrationStorage(segment.storage)) return null;
    const playlistSegment = narration.playlist.segments?.find((item) => item.segmentIndex === segment.segmentIndex);
    if (!playlistSegment || playlistSegment.segmentHash !== segment.segmentHash || playlistSegment.durationMs !== segment.durationMs || playlistSegment.silenceAfterMs !== segment.silenceAfterMs || !segment.text.trim()) return null;
    try {
      const head = await deps.storage.assert(segment.storage);
      const headRecord = record(head);
      if (Number(headRecord.bytes) !== segment.storage.bytes || safe(headRecord.contentType, 120).split(";")[0].toLowerCase() !== segment.storage.mimeType.toLowerCase() || safe(headRecord.sha256, 80).toLowerCase() !== segment.storage.sha256.toLowerCase()) return null;
    } catch {
      return null;
    }
    segments.push({
      assetId: segment.assetId,
      segmentIndex: segment.segmentIndex,
      orderedIndex: segment.orderedIndex,
      segmentHash: segment.segmentHash,
      text: segment.text,
      durationMs: segment.durationMs,
      silenceAfterMs: segment.silenceAfterMs,
      url: segment.storage.url,
      urlKind: "public" as const,
    });
  }
  if (segments.length !== narration.playlist.segmentCount) return null;
  return {
    contractType: "magazine-narration",
    schemaVersion: "magazine-narration.v1",
    contentRef,
    contentRefKey: content.content.contentId,
    articleRevision: content.revision,
    voice: narration.source.voice,
    playlist: narration.playlist,
    segments,
  };
}

export type MagazineNarrationInvalidationResult =
  | { ok: true; status: "invalidated" | "already_invalidated" | "not_found"; narrationId?: string }
  | { ok: false; error: "not_found" | "unavailable" | "cleanup_pending" };

export async function invalidateMagazineNarrationById(args: {
  narrationId: string;
  actor: string;
  reason: "article_revision_changed" | "article_unpublished" | "voice_rights_withdrawn" | "manual";
  dependencies?: MagazineNarrationServiceDependencies;
}): Promise<MagazineNarrationInvalidationResult> {
  const deps = resolveDependencies(args.dependencies);
  const byId = await findNarrationById(args.narrationId, deps);
  if (!byId) return { ok: false, error: "not_found" };
  if (byId.status === "invalidated") return { ok: true, status: "already_invalidated", narrationId: byId.narrationId };
  const pending = await deps.narration.requestInvalidation({ narrationId: byId.narrationId, reason: args.reason, actor: args.actor, now: deps.now() });
  if (!pending) return { ok: false, error: "unavailable" };
  const publicStorage = byId.segments.map((segment) => segment.storage);
  if (publicStorage.length !== byId.segments.length || publicStorage.some((storage) => !isPublicMagazineNarrationStorage(storage))) {
    await deps.narration.recordInvalidationFailure({ narrationId: byId.narrationId, error: "public storage metadata missing or invalid", now: deps.now() });
    return { ok: false, error: "cleanup_pending" };
  }
  const results = await Promise.allSettled(publicStorage.map((storage) => deps.storage.delete(storage)));
  if (results.some((result) => result.status === "rejected" || result.value !== true)) {
    await deps.narration.recordInvalidationFailure({ narrationId: byId.narrationId, error: "R2 public object cleanup failed", now: deps.now() });
    return { ok: false, error: "cleanup_pending" };
  }
  const invalidated = await deps.narration.markInvalidated({ narrationId: byId.narrationId, now: deps.now() });
  return invalidated ? { ok: true, status: "invalidated", narrationId: byId.narrationId } : { ok: false, error: "unavailable" };
}

async function findNarrationById(narrationId: string, deps: ResolvedDependencies): Promise<MagazineNarrationProjection | null> {
  const value = safe(narrationId, 180);
  if (!value) return null;
  const result = await deps.narration.getById(value);
  return result.ok ? result.data : null;
}

export async function invalidateMagazineNarrationsForContent(args: {
  contentRef: MagazineNarrationContentRef;
  actor: string;
  reason: "article_revision_changed" | "article_unpublished" | "voice_rights_withdrawn" | "manual";
  dependencies?: MagazineNarrationServiceDependencies;
}) {
  const deps = resolveDependencies(args.dependencies);
  if (!isMagazineNarrationContentRef(args.contentRef)) return { ok: false as const, error: "not_found" as const, invalidated: 0 };
  const listed = await deps.narration.listByContentRefKey(magazineNarrationContentRefKey(args.contentRef));
  if (!listed.ok) return { ok: false as const, error: "unavailable" as const, invalidated: 0 };
  let invalidated = 0;
  let pending = 0;
  for (const narration of listed.data) {
    if (narration.status === "invalidated") continue;
    const requested = await deps.narration.requestInvalidation({ narrationId: narration.narrationId, reason: args.reason, actor: args.actor, now: deps.now() });
    if (!requested) {
      pending += 1;
      continue;
    }
    const publicStorage = narration.segments.map((segment) => segment.storage);
    if (publicStorage.length !== narration.segments.length || publicStorage.some((storage) => !isPublicMagazineNarrationStorage(storage))) {
      pending += 1;
      await deps.narration.recordInvalidationFailure({ narrationId: narration.narrationId, error: "public storage metadata missing or invalid", now: deps.now() });
      continue;
    }
    const cleanup = await Promise.allSettled(publicStorage.map((storage) => deps.storage.delete(storage)));
    if (cleanup.some((result) => result.status === "rejected" || result.value !== true)) {
      pending += 1;
      await deps.narration.recordInvalidationFailure({ narrationId: narration.narrationId, error: "R2 public object cleanup failed", now: deps.now() });
      continue;
    }
    if (await deps.narration.markInvalidated({ narrationId: narration.narrationId, now: deps.now() })) invalidated += 1;
    else pending += 1;
  }
  return pending ? { ok: false as const, error: "cleanup_pending" as const, invalidated, pending } : { ok: true as const, invalidated, pending: 0 };
}
