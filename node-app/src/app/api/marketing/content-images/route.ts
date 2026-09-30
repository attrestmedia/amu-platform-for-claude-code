import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import {
  listMarketingContentImages,
  MARKETING_CONTENT_IMAGE_MAX_BYTES,
  MarketingContentImageError,
  uploadMarketingContentImage,
} from "libs/marketing/images/contentImageService";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose Marketing Ops 검수 이미지의 R2 업로드 및 유니버스별 레지스트리 조회
 * @process 인증 → 유니버스 권한 검증 → 이미지 검증/R2 저장/DB 기록 또는 커서 목록 반환
 * @domain marketing
 * @scope admin-api
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function errorResponse(error: unknown) {
  if (error instanceof MarketingContentImageError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  throw error;
}

export const GET = withAuth(
  async (_data, user, request) => {
    try {
      const search = new URL(request.url).searchParams;
      const universeId = toSafeString(search.get("universeId"));
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

      const result = await listMarketingContentImages({
        universeId: access.universeId,
        limit: Number(search.get("limit") || 60),
        cursor: toSafeString(search.get("cursor")),
      });
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return errorResponse(error);
    }
  },
  undefined,
  "marketing_content_images_get",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (_data, user, request) => {
    try {
      const contentType = toSafeString(request.headers.get("content-type")).toLowerCase();
      if (!contentType.includes("multipart/form-data")) {
        throw new MarketingContentImageError("multipart_form_data_required", 400);
      }

      const form = await request.formData();
      const universeId = toSafeString(form.get("universeId"));
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

      const file = form.get("file");
      if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
        throw new MarketingContentImageError("image_file_required", 400);
      }

      const imageFile = file as File;
      if (imageFile.size > MARKETING_CONTENT_IMAGE_MAX_BYTES) {
        throw new MarketingContentImageError("image_too_large", 413);
      }
      const body = Buffer.from(await imageFile.arrayBuffer());
      const asset = await uploadMarketingContentImage({
        universeId: access.universeId,
        jobId: toSafeString(form.get("jobId")),
        originalFilename: imageFile.name,
        mimeType: imageFile.type,
        body,
        retained: ["1", "true"].includes(toSafeString(form.get("retain")).toLowerCase()),
        requestedBy: toSafeString(user.userEmail || user.uid || user.ID),
      });
      return NextResponse.json({ success: true, data: { asset } }, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  },
  undefined,
  "marketing_content_images_post",
  { bodyParser: "none" },
);
