import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { IMAGE_STUDIO_NAMESPACE_KEY } from "consts/app";
import { statusMap } from "consts/ai";
import { getImageGenJobByClientRequestId } from "libs/database/lab";
import { getPersonaImageLibraryAsset } from "libs/database/personaImageLibraryRepo";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { generateSaveAndBillImages, resolveImageProvider } from "libs/server-utils/api/imagePipeline";
import { validateTemplateReferencePolicy } from "libs/server-utils/api/imageReferencePolicyGuard";
import { claimProviderOperationOrThrow } from "libs/server-utils/api/providerOperationGuard";
import { resolveSystemDefaultModelName } from "libs/server-utils/api/systemModelControl";
import type { TutorProfileImageGenerateRequest } from "types/ai";
import { buildTutorProfileImagePromptPayload } from "libs/server-utils/tutors/tutorProfileImagePrompt";
import { resolveTutorProfileReferenceBaseImagesFromUrl } from "libs/server-utils/tutors/tutorProfileReferenceImage";
import { createPersonaImageLibraryAssetFromUrl } from "libs/server-utils/persona/personaImageLibraryStorage";
import { toUnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

function safeText(value: unknown, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

type PersonaImageLibraryAssetFromUrlArgs = Parameters<typeof createPersonaImageLibraryAssetFromUrl>[0];

function safeOperationSegment(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  const segment = raw
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 40);
  if (!segment) return fallback;
  if (raw.length <= 40 && segment === raw) return segment;
  const suffix = createHash("sha256").update(raw).digest("hex").slice(0, 10);
  return `${segment.slice(0, 29)}-${suffix}`;
}

function buildPersonaLibraryOperationId(args: {
  source: PersonaImageLibraryAssetFromUrlArgs["source"];
  uid: string;
  universeId?: string;
  personaId?: string;
  clientRequestId: string;
  imageUrl: string;
}) {
  const digest = createHash("sha256")
    .update(JSON.stringify([args.clientRequestId, args.imageUrl]))
    .digest("hex");
  return [
    "persona-library",
    safeOperationSegment(args.source, "asset"),
    safeOperationSegment(args.uid, "user"),
    safeOperationSegment(args.universeId, "universe"),
    safeOperationSegment(args.personaId, "persona"),
    digest,
  ].join(":");
}

async function createPersonaImageLibraryAssetWithReplay(
  args: PersonaImageLibraryAssetFromUrlArgs & { clientRequestId?: string },
) {
  const clientRequestId = safeText(args.clientRequestId, 160);
  if (!clientRequestId) {
    return createPersonaImageLibraryAssetFromUrl(args);
  }

  const operationId = buildPersonaLibraryOperationId({
    source: args.source,
    uid: args.uid,
    universeId: args.universeId,
    personaId: args.personaId,
    clientRequestId,
    imageUrl: args.imageUrl,
  });
  const lease = await claimProviderOperationOrThrow(operationId);
  if (lease.kind === "replay") {
    const replayAssetId = safeText(toUnknownRecord(lease.result).assetId, 160);
    if (!replayAssetId) throw new Error("persona_library_asset_replay_missing");
    const replayAsset = await getPersonaImageLibraryAsset({ uid: args.uid, assetId: replayAssetId });
    if (!replayAsset) throw new Error("persona_library_asset_replay_missing");
    return replayAsset;
  }

  try {
    const asset = await createPersonaImageLibraryAssetFromUrl(args);
    await lease.complete({ assetId: asset.assetId, source: args.source });
    return asset;
  } catch (error) {
    await lease.release();
    throw error;
  }
}

async function handlePOST(body: TutorProfileImageGenerateRequest, user: AuthenticatedUserType) {
  try {
    const uid = String(user?.uid || user?.ID || "").trim();
    if (!uid) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    let baseImages = Array.isArray(body?.baseImages) ? body.baseImages.filter((item) => Boolean(item?.data)) : [];
    const referenceUrl = safeText(body?.referenceImageUrl, 2000);
    // 클라이언트가 base64로 변환하지 못한 경우(private Gen Studio 이미지 등) 서버가 referenceImageUrl에서 직접 해석한다.
    if (baseImages.length === 0 && referenceUrl) {
      baseImages = await resolveTutorProfileReferenceBaseImagesFromUrl(referenceUrl, user);
    }

    const effectiveBody = { ...body, baseImages };
    const { prompt, templateKey } = await buildTutorProfileImagePromptPayload({ body: effectiveBody });
    const personaRecord = toUnknownRecord(body?.persona);
    const universeId = safeText(personaRecord.universeId, 160);
    const personaId = safeText(personaRecord.pid, 160);

    const googleDefaultModel = await resolveSystemDefaultModelName({ provider: "google", modality: "image" });
    const provider = resolveImageProvider({
      bodyProvider: undefined,
      modelName: safeText(body?.modelName, 120) || googleDefaultModel,
    });
    const requestedModelName = safeText(body?.modelName, 120) || (await resolveSystemDefaultModelName({ provider, modality: "image" }));
    const clientRequestId = safeText(body?.clientRequestId, 160);
    const policyError = await validateTemplateReferencePolicy({ ...effectiveBody, templateKey }, provider);
    if (policyError) {
      return NextResponse.json(
        { success: false, error: policyError.error, errorCode: policyError.errorCode },
        { status: 400 },
      );
    }
    const existingJob = clientRequestId
      ? await getImageGenJobByClientRequestId({ uid, clientRequestId, scope: "user" })
      : null;

    const result = await generateSaveAndBillImages({
      scope: "user",
      uid,
      user,
      universeId,
      provider,
      modelName: requestedModelName,
      prompt,
      baseImages,
      n: 1,
      aspectRatio: safeText(body?.aspectRatio, 20) || "2:3",
      size: safeText(body?.size, 40) || "1K",
      metaRoute: "app/tutors/profile-image/generate",
      appBillingKey: IMAGE_STUDIO_NAMESPACE_KEY,
      templateKey,
      requestMeta: {
        generationMode: "template",
        extraPrompt: safeText(body?.brief, 500),
        variables: body?.variables || {},
        clientRequestId: clientRequestId || undefined,
        source: { service: "tutors", surface: "tutor-profile" },
      },
      existingJobId: String(existingJob?.jobId || "").trim() || undefined,
    });

    const imageUrl = String(result?.data?.images?.[0] || "").trim();
    if (!result?.ok || !imageUrl) {
      return NextResponse.json({ success: false, error: "tutor_profile_image_generate_failed" }, { status: 500 });
    }

    const referenceAsset = referenceUrl
      ? await createPersonaImageLibraryAssetWithReplay({
          uid,
          universeId,
          personaId,
          clientRequestId,
          source: "imported",
          imageUrl: referenceUrl,
          generation: {
            templateKey: safeText(body?.referenceTemplateKey, 160),
            modelName: safeText(body?.modelName, 160),
          },
          tags: ["persona-reference"],
        }).catch(() => null)
      : null;

    const libraryAsset = await createPersonaImageLibraryAssetWithReplay({
      uid,
      universeId,
      personaId,
      clientRequestId,
      source: "generated",
      imageUrl,
      generation: {
        templateKey,
        modelName: safeText(body?.modelName, 160) || requestedModelName,
      },
      reference: {
        sourceAssetId: String(referenceAsset?.assetId || ""),
      },
      tags: ["persona-generated"],
    });

    return NextResponse.json({
      success: true,
      data: {
        imageUrl: libraryAsset.storage.optimizedUrl || imageUrl,
        templateKey,
        libraryAsset,
        ...(referenceAsset ? { referenceAsset } : {}),
      },
      billing: {
        coins: Number(result?.data?.coins || 0),
      },
    });
  } catch (error) {
    const errInfo = toUnknownRecord(error);
    const message = String(errInfo.message || "tutor_profile_image_generate_failed");
    const errorCode = String(errInfo.errorCode || "").trim();
    const templateKey = String(errInfo.templateKey || "").trim();
    const accessLevel = String(errInfo.accessLevel || "").trim();
    const status =
      typeof errInfo.status === "number"
        ? errInfo.status
        : (statusMap as Record<string, number | undefined>)[errorCode] ||
          (message === "persona_or_brief_required" ? 400 : message === "UNAUTHORIZED" ? 401 : 500);

    return NextResponse.json(
      {
        success: false,
        error: message,
        ...(errorCode ? { errorCode } : {}),
        ...(templateKey ? { templateKey } : {}),
        ...(accessLevel ? { accessLevel } : {}),
      },
      { status },
    );
  }
}

export const POST = withAuth(handlePOST, undefined, "tutors/profile-image:generate", { bodyParser: "json" });
