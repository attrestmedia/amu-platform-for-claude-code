import { NextRequest, NextResponse } from "next/server";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { TUTORS_SHARED_TEMPLATE_COLLECTION } from "libs/services/tutors/tutorsCollectionKey";
import { PersonaSchema, type IPersonaDocument } from "models/universe";
import {
  resolveLegacyGenStudioImageUrl,
  resolveStaleProfileImageUrl,
} from "libs/server-utils/lab/staleProfileImageUrlRepair";
import { logger } from "utils/log";
import type { PublicTutorGalleryItemType } from "types/ai";

export const runtime = "nodejs";

// 캐시 계약: 이 응답은 절대 개인화하지 않는다.
// proxy(src/proxy.ts)가 세션 없이 통과시키고 응답에 s-maxage 공유 캐시를 걸기 때문에,
// 여기서 쿠키·세션·사용자별 값을 읽는 순간 공유 캐시가 곧바로 유출 경로가 된다.
// 개인화가 필요하면 이 라우트를 확장하지 말고 인증이 필요한 별도 경로를 만든다.

function resolveLimit(request: NextRequest) {
  const raw = Number(new URL(request.url).searchParams.get("limit") || 8);
  return Math.max(1, Math.min(Number.isFinite(raw) ? Math.floor(raw) : 8, 12));
}

function shouldIncludeNoImage(request: NextRequest) {
  return new URL(request.url).searchParams.get("includeNoImage") === "true";
}

export async function GET(request: NextRequest) {
  try {
    const limit = resolveLimit(request);
    const includeNoImage = shouldIncludeNoImage(request);
    const TemplateModel = await getModel<IPersonaDocument>(
      MONGODB_PERSONA_URL,
      TUTORS_SHARED_TEMPLATE_COLLECTION,
      PersonaSchema,
      TUTORS_SHARED_TEMPLATE_COLLECTION,
    );
    const docs = await TemplateModel.find({
      isTemplate: true,
      visibility: "public",
      status: "active",
      ...(includeNoImage ? {} : { "profiles.default.0": { $exists: true, $ne: "" } }),
    })
      .select({ pid: 1, name: 1, profiles: 1 })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const rawItems = (docs || [])
      .map((doc) => ({
        pid: String(doc.pid || "").trim(),
        name: String(doc.name || "").trim(),
        imageUrl: String(doc.profiles?.default?.[0] || "").trim(),
      }))
      .filter((item) => item.pid && item.name && (includeNoImage || item.imageUrl));

    // 공개 전환 전 저장된 stale private Worker URL을 현재 공개 URL로 자가 복구한다.
    const data: PublicTutorGalleryItemType[] = await Promise.all(
      rawItems.map(async (item) => {
        if (!item.imageUrl) return item;
        const resolvedUrl = await resolveStaleProfileImageUrl(item.imageUrl);
        return {
          ...item,
          imageUrl: resolveLegacyGenStudioImageUrl(resolvedUrl) || resolvedUrl,
        };
      }),
    );

    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    logger.error("[tutors/public-gallery] 공개 튜터 갤러리 조회 실패:", error);
    return NextResponse.json({ success: false, data: [], error: "public_tutor_gallery_failed" }, { status: 500 });
  }
}
