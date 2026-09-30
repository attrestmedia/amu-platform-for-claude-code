import "server-only";

import { createHash } from "node:crypto";
import { extname, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  IStageDoc,
  IStageReleaseAssetRef,
  IStageReleaseDeployment,
  IStageReleaseManifest,
  IStageReleaseObjectRef,
} from "types/game";
import {
  buildR2PublicUrl,
  getR2PublicBucket,
  getR2PublicObjectFromUrl,
  headR2Object,
  isR2StorageEnabled,
  putR2PublicObject,
} from "libs/server-utils/storage/r2Storage";
import { validateStageCoordinateV2 } from "utils/game/stageCoordinateContract";
import { collectStageMediaRefs } from "utils/game/stageReleaseContract";

/**
 * @docHint
 * @purpose AMU 기본 StageDoc과 미디어를 불변 R2 release/manifest로 재생성
 * @process v2 source 검증  content-addressed asset 업로드  manifest 업로드
 * @domain game-stage-release
 * @scope server-operations
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
};

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeSegment(value: string, label: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) throw new Error(`invalid_${label}`);
  return normalized;
}

function mimeFromRef(sourceRef: string): string {
  const pathname = sourceRef.startsWith("http") ? new URL(sourceRef).pathname : sourceRef;
  return MIME_BY_EXTENSION[extname(pathname).toLowerCase()] || "application/octet-stream";
}

function extensionFromRef(sourceRef: string): string {
  const pathname = sourceRef.startsWith("http") ? new URL(sourceRef).pathname : sourceRef;
  const extension = extname(pathname).toLowerCase();
  return extension && /^[.][a-z0-9]+$/.test(extension) ? extension : ".bin";
}

async function readSourceMedia(sourceRef: string, publicRoot: string): Promise<{ body: Buffer; mimeType: string }> {
  if (sourceRef.startsWith("/")) {
    const absolutePublicRoot = resolve(publicRoot);
    const absolutePath = resolve(absolutePublicRoot, `.${sourceRef}`);
    if (absolutePath !== absolutePublicRoot && !absolutePath.startsWith(`${absolutePublicRoot}${sep}`)) {
      throw new Error(`stage_media_path_outside_public:${sourceRef}`);
    }
    return { body: await readFile(absolutePath), mimeType: mimeFromRef(sourceRef) };
  }

  if (/^https:\/\//i.test(sourceRef)) {
    const response = await fetch(sourceRef, { redirect: "error" });
    if (!response.ok) throw new Error(`stage_media_fetch_failed:${response.status}`);
    return {
      body: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type")?.split(";")[0]?.trim() || mimeFromRef(sourceRef),
    };
  }

  throw new Error(`unsupported_stage_media_ref:${sourceRef}`);
}

async function putImmutablePublicObject(args: {
  key: string;
  body: Buffer;
  mimeType: string;
  cacheControl?: string;
}): Promise<IStageReleaseObjectRef> {
  const digest = sha256(args.body);
  const bucket = getR2PublicBucket();
  const existing = await headR2Object({ bucket, key: args.key });
  if (existing) {
    if (existing.bytes !== args.body.byteLength || (existing.sha256 && existing.sha256 !== digest)) {
      throw new Error(`immutable_r2_object_conflict:${args.key}`);
    }
  } else {
    await putR2PublicObject({
      key: args.key,
      body: args.body,
      contentType: args.mimeType,
      cacheControl: args.cacheControl,
      sha256: digest,
    });
  }

  const verified = await headR2Object({ bucket, key: args.key });
  if (!verified || verified.bytes !== args.body.byteLength || (verified.sha256 && verified.sha256 !== digest)) {
    throw new Error(`r2_object_verification_failed:${args.key}`);
  }
  return {
    key: args.key,
    url: buildR2PublicUrl(args.key),
    bytes: args.body.byteLength,
    sha256: digest,
    mimeType: args.mimeType,
  };
}

function replaceStageMediaRefs(doc: IStageDoc, urlBySource: Map<string, string>): IStageDoc {
  const candidate = structuredClone(doc);
  delete candidate.releaseDeployment;
  if (candidate.background?.name) {
    candidate.background.name = urlBySource.get(candidate.background.name) ?? candidate.background.name;
  }
  if (candidate.border) {
    for (const [key, value] of Object.entries(candidate.border)) {
      if (value) candidate.border[key as keyof typeof candidate.border] = urlBySource.get(value) ?? value;
    }
  }
  for (const asset of candidate.assets ?? []) {
    asset.fileName = urlBySource.get(asset.fileName) ?? asset.fileName;
    for (const state of asset.meta?.states ?? []) {
      state.fileName = urlBySource.get(state.fileName) ?? state.fileName;
    }
  }
  return candidate;
}

export interface PrepareStageReleaseInput {
  source: IStageDoc;
  universeId: string;
  releaseId: string;
  publicRoot: string;
  createdAt?: string;
}

export interface PreparedStageRelease {
  candidate: IStageDoc;
  manifest: IStageReleaseManifest;
  manifestRef: IStageReleaseObjectRef;
  deployment: IStageReleaseDeployment;
}

export async function prepareAndUploadStageRelease(input: PrepareStageReleaseInput): Promise<PreparedStageRelease> {
  if (!isR2StorageEnabled()) throw new Error("r2_storage_required");
  const sourceValidation = validateStageCoordinateV2(input.source);
  if (!sourceValidation.valid) {
    throw new Error(`stage_coordinate_contract_invalid:${JSON.stringify(sourceValidation.issues)}`);
  }

  const universeId = normalizeSegment(input.universeId, "universe_id");
  const stageId = normalizeSegment(input.source.stageId, "stage_id");
  const stageName = normalizeSegment(input.source.stageName, "stage_name");
  const releaseId = normalizeSegment(input.releaseId, "release_id");
  const createdAt = input.createdAt ?? new Date().toISOString();
  const releasePrefix = `game/stages/${universeId}/${stageId}/${stageName}/releases/${releaseId}`;

  const releaseAssets: IStageReleaseAssetRef[] = [];
  const urlBySource = new Map<string, string>();
  for (const sourceRef of collectStageMediaRefs(input.source)) {
    const media = await readSourceMedia(sourceRef, input.publicRoot);
    const digest = sha256(media.body);
    const object = await putImmutablePublicObject({
      key: `${releasePrefix}/assets/${digest}${extensionFromRef(sourceRef)}`,
      body: media.body,
      mimeType: media.mimeType,
    });
    const releaseAsset: IStageReleaseAssetRef = { ...object, sourceRef };
    releaseAssets.push(releaseAsset);
    urlBySource.set(sourceRef, object.url);
  }

  const candidate = replaceStageMediaRefs(input.source, urlBySource);
  const candidateValidation = validateStageCoordinateV2(candidate);
  if (!candidateValidation.valid) {
    throw new Error(`stage_release_candidate_invalid:${JSON.stringify(candidateValidation.issues)}`);
  }
  if (!collectStageMediaRefs(candidate).every((url) => getR2PublicObjectFromUrl(url) !== null)) {
    throw new Error("stage_release_non_r2_public_url");
  }

  const stageDocRef = await putImmutablePublicObject({
    key: `${releasePrefix}/stage-doc.v2.json`,
    body: jsonBuffer(candidate),
    mimeType: "application/json",
  });
  const manifest: IStageReleaseManifest = {
    schemaVersion: 1,
    manifestVersion: releaseId,
    releaseId,
    universeId,
    stageId,
    stageName,
    coordinateContractVersion: 2,
    createdAt,
    stageDoc: stageDocRef,
    assets: releaseAssets.sort((left, right) => left.sourceRef.localeCompare(right.sourceRef)),
  };
  const manifestRef = await putImmutablePublicObject({
    key: `${releasePrefix}/manifest.json`,
    body: jsonBuffer(manifest),
    mimeType: "application/json",
  });

  return {
    candidate,
    manifest,
    manifestRef,
    deployment: {
      schemaVersion: 1,
      status: "prepared",
      universeId,
      releaseId,
      manifestVersion: manifest.manifestVersion,
      manifestKey: manifestRef.key,
      manifestUrl: manifestRef.url,
      manifestSha256: manifestRef.sha256,
      stageDocKey: stageDocRef.key,
      stageDocSha256: stageDocRef.sha256,
      coordinateContractVersion: 2,
      preparedAt: createdAt,
    },
  };
}

export function createStageReleaseJsonBuffer(value: unknown): Buffer {
  return jsonBuffer(value);
}
