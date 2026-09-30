import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "libs/server-utils/auth/authUtils";
import { getUserFromDB } from "libs/server-utils/auth/userRoleUtils";
import { mergeAuthAndDbUser } from "libs/server-utils/api/_helpers";
import {
  filterSelectableSystemModels,
  resolveSystemModelAccessActor,
  type SystemModelAccessActor,
} from "libs/server-utils/ai/systemModelAccess";
import { listGenStudioModelCatalog, type GenStudioModelCatalogSection, type GenStudioModelCatalogType } from "libs/server-utils/api/genStudioModelCatalog";
import { logger } from "utils/log";

import { extractCodedError } from "utils/common";

export const runtime = "nodejs";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toModelType(raw: string | null): GenStudioModelCatalogType | null {
  const value = toSafeString(raw).toLowerCase();
  if (!value) return "all";
  if (value === "all" || value === "audio" || value === "image" || value === "text" || value === "video") return value;
  return null;
}

export function filterSection(
  section?: GenStudioModelCatalogSection | null,
  access: SystemModelAccessActor = resolveSystemModelAccessActor(),
) {
  if (!section) return null;

  const providers = (section.providers || [])
    .map((provider) => {
      const models = filterSelectableSystemModels(provider.models || [], access);
      return {
        ...provider,
        modelCount: models.length,
        models,
      };
    })
    .filter((provider) => provider.modelCount > 0);

  return {
    totalProviders: providers.length,
    totalModels: providers.reduce((sum, provider) => sum + provider.modelCount, 0),
    countByProvider: Object.fromEntries(providers.map((provider) => [provider.provider, provider.modelCount])),
    providers,
  };
}

/**
 * @docHint
 * @purpose API 라우트(lab / gen-studio-model-catalog) 기능 요청 처리
 * @process 요청 파싱  서버 catalog 조회  프론트 노출 정책 필터링  JSON 응답 반환
 * @domain lab
 * @scope public-api
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser(request);
    let modelAccess = resolveSystemModelAccessActor();
    if (auth.verified) {
      const userId = String(auth.user.ID || "").trim();
      if (userId) {
        const userFromDB = await getUserFromDB(userId);
        const databaseUser =
          userFromDB && typeof userFromDB.toObject === "function" ? userFromDB.toObject() : userFromDB;
        const authenticatedUser = mergeAuthAndDbUser(auth.user, databaseUser || null);
        modelAccess = resolveSystemModelAccessActor(authenticatedUser);
      }
    }

    const searchParams = new URL(request.url).searchParams;
    const type = toModelType(searchParams.get("type"));

    if (type === null) {
      return NextResponse.json({ ok: false, error: "invalid_type", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    const result = await listGenStudioModelCatalog({ type });
    const image = filterSection(result.image, modelAccess);
    const text = filterSection(result.text, modelAccess);
    const video = filterSection(result.video, modelAccess);

    return NextResponse.json({
      ok: true,
      type: result.type,
      pricingRevision: result.pricingRevision,
      source: "server",
      policy: {
        hideDisabled: true,
        hideAdminOnly: !modelAccess.isAdministrator,
        showDeprecated: false,
      },
      image,
      text,
      video,
    });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, { message: "Failed to fetch catalog" });
    logger.error("[lab-gen-studio-model-catalog] failed", { error: message, errorCode });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
