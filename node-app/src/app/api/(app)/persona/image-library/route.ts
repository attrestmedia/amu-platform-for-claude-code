import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  getPersonaImageLibraryAsset,
  listPersonaImageLibraryAssets,
  updatePersonaImageLibraryAssetReference,
  updatePersonaImageLibraryAssetStatus,
} from "libs/database/personaImageLibraryRepo";
import {
  createPersonaImageLibraryAssetFromBuffer,
  createPersonaImageLibraryAssetFromUrl,
  deletePersonaImageLibraryStoredObjects,
} from "libs/server-utils/persona/personaImageLibraryStorage";
import { readLegacyPublicMedia } from "libs/server-utils/persona/personaImageLibraryLegacyStorage";
import type {
  PersonaImageLibraryAssetType,
  PersonaImageLibrarySourceType,
  PersonaImageLibraryStatusType,
} from "types/ai";
import type { UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose API 라우트(persona / image-library) 기능 요청 처리
 * @process 요청 파싱  인증 검증  이미지 최적화 저장 또는 메타 조회/상태 변경  JSON 응답 반환
 * @domain persona.image-library
 * @scope app-api
 */

export const runtime = "nodejs";

const ALLOWED_UPLOAD_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function actorUid(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function safeText(value: unknown, limit = 240) {
  return String(value || "").trim().slice(0, limit);
}

function normalizeSource(source: unknown): PersonaImageLibrarySourceType {
  const value = safeText(source, 80);
  if (value === "generated" || value === "imported") return value;
  return "uploaded_reference";
}

function normalizeStatus(status: unknown): PersonaImageLibraryStatusType {
  const value = safeText(status, 80);
  if (value === "archived" || value === "deleted") return value;
  return "active";
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => safeText(item, 80)).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => safeText(item, 80))
    .filter(Boolean);
}

function parseJsonRecord(value: unknown): UnknownRecord {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as UnknownRecord) : {};
  } catch {
    return {};
  }
}

function normalizeGeneration(value: unknown): PersonaImageLibraryAssetType["generation"] {
  const input = (value && typeof value === "object" ? value : {}) as UnknownRecord;
  const generation: NonNullable<PersonaImageLibraryAssetType["generation"]> = {};
  const templateKey = safeText(input.templateKey, 160);
  const modelName = safeText(input.modelName, 160);
  const promptHash = safeText(input.promptHash, 160);
  const generationJobId = safeText(input.generationJobId, 160);
  if (templateKey) generation.templateKey = templateKey;
  if (modelName) generation.modelName = modelName;
  if (promptHash) generation.promptHash = promptHash;
  if (generationJobId) generation.generationJobId = generationJobId;
  return generation;
}

function normalizeReference(value: unknown): PersonaImageLibraryAssetType["reference"] {
  const input = (value && typeof value === "object" ? value : {}) as UnknownRecord;
  const kind = safeText(input.kind, 80);
  const sourceReferenceRole = safeText(input.sourceReferenceRole, 80);
  const referenceStrength = safeText(input.referenceStrength, 80);
  const reference: NonNullable<PersonaImageLibraryAssetType["reference"]> = {};
  const sourceAssetId = safeText(input.sourceAssetId, 160);
  const sourceTemplateKey = safeText(input.sourceTemplateKey, 160);
  const sourceTemplateTitle = safeText(input.sourceTemplateTitle, 240);
  const linkedPersonaPid = safeText(input.linkedPersonaPid, 160);
  const linkedProfileImageUrl = safeText(input.linkedProfileImageUrl, 2000);
  const note = safeText(input.note, 500);

  if (sourceAssetId) reference.sourceAssetId = sourceAssetId;
  if (
    kind === "profile_reference_sketch" ||
    kind === "profile_reference_photo" ||
    kind === "profile_generated_result"
  ) {
    reference.kind = kind;
  }
  if (sourceTemplateKey) reference.sourceTemplateKey = sourceTemplateKey;
  if (sourceTemplateTitle) reference.sourceTemplateTitle = sourceTemplateTitle;
  if (sourceReferenceRole === "reference" || sourceReferenceRole === "model") {
    reference.sourceReferenceRole = sourceReferenceRole;
  }
  if (referenceStrength === "light" || referenceStrength === "medium" || referenceStrength === "preserve") {
    reference.referenceStrength = referenceStrength;
  }
  if (linkedPersonaPid) reference.linkedPersonaPid = linkedPersonaPid;
  if (linkedProfileImageUrl) reference.linkedProfileImageUrl = linkedProfileImageUrl;
  if (note) reference.note = note;
  return reference;
}

async function serveAssetImage(uid: string, searchParams: URLSearchParams) {
  const assetId = safeText(searchParams.get("assetId"), 160);
  if (!assetId) return null;

  const asset = await getPersonaImageLibraryAsset({ uid, assetId });
  if (!asset) return NextResponse.json({ success: false, error: "asset_not_found" }, { status: 404 });

  const variant = safeText(searchParams.get("variant"), 40);
  const storage = asset.storage || {};
  const preferredUrl = variant === "thumbnail" ? storage.thumbnailUrl : storage.optimizedUrl || storage.thumbnailUrl;
  const imageUrl = safeText(preferredUrl || storage.thumbnailUrl || storage.optimizedUrl, 2000);
  if (!imageUrl) return NextResponse.json({ success: false, error: "asset_image_not_found" }, { status: 404 });
  if (/^https?:\/\//i.test(imageUrl)) return NextResponse.redirect(imageUrl);

  try {
    const buffer = await readLegacyPublicMedia(imageUrl);
    if (!buffer) return NextResponse.json({ success: false, error: "invalid_asset_image_path" }, { status: 400 });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": safeText(storage.mimeType, 120) || "image/webp",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "asset_image_file_missing" }, { status: 404 });
  }
}

export const GET = withAuth(
  async (_data: unknown, user: AuthenticatedUserType, request: NextRequest) => {
    const uid = actorUid(user);
    if (!uid) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });

    const searchParams = new URL(request.url).searchParams;
    const assetImageResponse = await serveAssetImage(uid, searchParams);
    if (assetImageResponse) return assetImageResponse;

    const assets = await listPersonaImageLibraryAssets({
      uid,
      universeId: safeText(searchParams.get("universeId"), 160),
      personaId: safeText(searchParams.get("personaId"), 160),
      linkedProfileImageUrl: safeText(searchParams.get("linkedProfileImageUrl"), 2000),
      referenceKind: normalizeReference({ kind: searchParams.get("referenceKind") })?.kind,
      source: (safeText(searchParams.get("source"), 80) || "all") as PersonaImageLibrarySourceType | "all",
      status: (safeText(searchParams.get("status"), 80) || "active") as PersonaImageLibraryStatusType | "all",
      limit: Number(searchParams.get("limit") || 40),
    });

    return NextResponse.json({ success: true, data: { assets } });
  },
  undefined,
  "persona_image_library:list",
);

export const POST = withAuth(
  async (_data: unknown, user: AuthenticatedUserType, request: NextRequest) => {
    const uid = actorUid(user);
    if (!uid) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });

    const contentType = request.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ success: false, error: "missing_file" }, { status: 400 });
      }
      if (!ALLOWED_UPLOAD_MIME.has(file.type)) {
        return NextResponse.json({ success: false, error: "invalid_file_type", details: file.type }, { status: 415 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { success: false, error: "file_too_large", details: { maxBytes: MAX_UPLOAD_BYTES, size: file.size } },
          { status: 413 },
        );
      }

      const generationInput = parseJsonRecord(form.get("generation"));
      const legacyTemplateKey = safeText(form.get("templateKey"), 160);
      const legacyModelName = safeText(form.get("modelName"), 160);
      if (legacyTemplateKey) generationInput.templateKey = legacyTemplateKey;
      if (legacyModelName) generationInput.modelName = legacyModelName;

      const referenceInput = parseJsonRecord(form.get("reference"));
      const legacySourceAssetId = safeText(form.get("sourceAssetId"), 160);
      if (legacySourceAssetId) referenceInput.sourceAssetId = legacySourceAssetId;

      const generation = normalizeGeneration(generationInput);
      const reference = normalizeReference(referenceInput);

      const asset = await createPersonaImageLibraryAssetFromBuffer({
        uid,
        universeId: safeText(form.get("universeId"), 160),
        personaId: safeText(form.get("personaId"), 160),
        source: normalizeSource(form.get("source")),
        buffer: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
        generation,
        reference,
        tags: parseTags(form.get("tags")),
      });

      return NextResponse.json({ success: true, data: { asset } });
    }

    const body = await request.json().catch(() => ({}));
    const imageUrl = safeText(body?.imageUrl, 2000);
    if (!imageUrl) {
      return NextResponse.json({ success: false, error: "imageUrl_required" }, { status: 400 });
    }

    const asset = await createPersonaImageLibraryAssetFromUrl({
      uid,
      universeId: safeText(body?.universeId, 160),
      personaId: safeText(body?.personaId, 160),
      source: normalizeSource(body?.source),
      imageUrl,
      generation: normalizeGeneration(body?.generation),
      reference: normalizeReference(body?.reference),
      tags: parseTags(body?.tags),
    });

    return NextResponse.json({ success: true, data: { asset } });
  },
  undefined,
  "persona_image_library:create",
  { bodyParser: "none" },
);

export const PATCH = withAuth(
  async (body: UnknownRecord, user: AuthenticatedUserType) => {
    const uid = actorUid(user);
    if (!uid) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });

    const assetId = safeText(body?.assetId, 160);
    if (!assetId) return NextResponse.json({ success: false, error: "assetId_required" }, { status: 400 });

    if (body?.action === "link") {
      const reference = normalizeReference(body?.reference);
      if (!reference?.linkedProfileImageUrl) {
        return NextResponse.json({ success: false, error: "linked_profile_image_url_required" }, { status: 400 });
      }
      const asset = await updatePersonaImageLibraryAssetReference({
        uid,
        assetId,
        personaId: safeText(body?.personaId, 160),
        reference,
      });
      if (!asset) return NextResponse.json({ success: false, error: "asset_not_found" }, { status: 404 });
      return NextResponse.json({ success: true, data: { asset } });
    }

    if (body?.action === "delete") {
      const existing = await getPersonaImageLibraryAsset({ uid, assetId });
      if (!existing) return NextResponse.json({ success: false, error: "asset_not_found" }, { status: 404 });
      await deletePersonaImageLibraryStoredObjects(existing.storage);
    }
    const status = body?.action === "archive" ? "archived" : body?.action === "delete" ? "deleted" : normalizeStatus(body?.status);
    const asset = await updatePersonaImageLibraryAssetStatus({ uid, assetId, status });
    if (!asset) return NextResponse.json({ success: false, error: "asset_not_found" }, { status: 404 });

    return NextResponse.json({ success: true, data: { asset } });
  },
  undefined,
  "persona_image_library:update",
);
