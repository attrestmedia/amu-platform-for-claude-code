import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import {
  deleteMarketingContentImage,
  MarketingContentImageError,
  setMarketingContentImageRetention,
} from "libs/marketing/images/contentImageService";
import { toSafeString, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose Marketing Ops 업로드 이미지의 장기 보관 여부 변경 및 안전한 영구 삭제
 * @process 인증 → 유니버스 권한/입력 검증 → 보존 메타데이터 갱신 또는 참조 보호 확인 후 R2·레지스트리 삭제
 * @domain marketing
 * @scope admin-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const PATCH = withAuth<UnknownRecord>(
  async (data, user, _request, { params }: { params: Promise<{ assetId: string }> }) => {
    try {
      const universeId = toSafeString(data.universeId);
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      if (typeof data.retained !== "boolean") {
        throw new MarketingContentImageError("retained_boolean_required", 400);
      }

      const { assetId } = await params;
      const asset = await setMarketingContentImageRetention({
        universeId: access.universeId,
        assetId: toSafeString(assetId),
        retained: data.retained,
        updatedBy: toSafeString(user.userEmail || user.uid || user.ID),
      });
      return NextResponse.json({ success: true, data: { asset } });
    } catch (error) {
      if (error instanceof MarketingContentImageError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status });
      }
      throw error;
    }
  },
  undefined,
  "marketing_content_images_patch",
  { bodyParser: "json" },
);

export const DELETE = withAuth(
  async (_data, user, request, { params }: { params: Promise<{ assetId: string }> }) => {
    try {
      const search = new URL(request.url).searchParams;
      const universeId = toSafeString(search.get("universeId"));
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

      const { assetId } = await params;
      const result = await deleteMarketingContentImage({
        universeId: access.universeId,
        assetId: toSafeString(assetId),
        deletedBy: toSafeString(user.userEmail || user.uid || user.ID),
      });
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof MarketingContentImageError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status });
      }
      throw error;
    }
  },
  undefined,
  "marketing_content_images_delete",
  { bodyParser: "none" },
);
