import { NextResponse } from "next/server";
import { COMMERCE_NAMESPACE_KEY } from "consts/app";
import { getContentAssetByAssetId } from "libs/database/lab";
import { getCommerceDraftByDraftId } from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftSuggestBasicInfo } from "libs/server-utils/api/routeValidators";
import { handleUniverseContentCustom } from "libs/server-utils/api/contentBasicHandler";
import { resolveSystemVisionTextModel } from "libs/server-utils/api/systemModelControl";
import { isSafeScrapeUrl } from "libs/server-utils/thirdparty/scraper";
import type { BaseImageType } from "types/app";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose 기본 정보 AI 자동완성 라우트. 상품 이미지(1단계에서 등록한 대표/추가 이미지)를
 *          멀티모달 텍스트 모델로 분석해 상품명·스마트스토어 상품명·소개·판매가·재고 후보를
 *          단일 JSON으로 반환한다. 템플릿 시스템이 아니라 필드 자동완성 목적의 경량 진입점이다.
 * @process draft 조회  이미지 URL 검증(SSRF)  base64 변환  비전 텍스트 모델 선택(서버 강제)
 *          유료 생성(과금)  JSON 파싱  필드 정규화  반환
 * @domain commerce.naver
 * @scope universe
 *
 * - 모델 선택은 서버가 한다. 클라이언트 모델 지정은 받지 않으며, resolveSystemVisionTextModel이
 *   이미지 입력 지원 모델만 고르고 generateAndBillContent의 이미지 입력 게이트가 이중으로 차단한다.
 * - 이미지에서 판단할 수 없는 판매가·재고는 null로 돌려받는다(추측 금지를 프롬프트에서 강제).
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

const MAX_IMAGES = 3;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function collectImageUrls(rawUrls: unknown, draftImages: unknown) {
  const fromRequest = Array.isArray(rawUrls)
    ? rawUrls.map((url) => toSafeString(url)).filter(Boolean)
    : [];
  const fromDraft = Array.isArray(draftImages)
    ? draftImages
        .map((image) => toSafeString((image as Record<string, unknown>)?.url))
        .filter(Boolean)
    : [];

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const url of [...fromRequest, ...fromDraft]) {
    if (!/^https?:\/\//i.test(url)) continue;
    // SSRF 방지 — 공개 http(s)만 허용(scraper의 안전 URL 판정 재사용)
    if (!isSafeScrapeUrl(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_IMAGES) break;
  }
  return urls;
}

async function fetchImageAsBase64(url: string): Promise<BaseImageType> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`image_fetch_failed(${res.status})`);
    const contentType = toSafeString(res.headers.get("content-type")).split(";")[0];
    if (contentType && !contentType.startsWith("image/")) throw new Error("not_an_image");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > IMAGE_MAX_BYTES) throw new Error("image_size_invalid");
    return { mimeType: contentType || "image/png", data: buffer.toString("base64") };
  } finally {
    clearTimeout(timer);
  }
}

function parseSuggestedFields(rawText: string) {
  const text = toSafeString(rawText).replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toPositiveIntOrNull(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.floor(next) : null;
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);
      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      const imageUrls = collectImageUrls(data?.imageUrls, draft.smartstore?.images);
      if (imageUrls.length === 0) {
        return NextResponse.json(
          { success: false, message: "기본 정보를 작성하려면 먼저 상품 이미지를 등록해 주세요." },
          { status: 400 },
        );
      }

      const fetched = await Promise.allSettled(imageUrls.map((url) => fetchImageAsBase64(url)));
      const baseImages = fetched
        .filter((result): result is PromiseFulfilledResult<BaseImageType> => result.status === "fulfilled")
        .map((result) => result.value);
      if (baseImages.length === 0) {
        return NextResponse.json(
          { success: false, message: "상품 이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
          { status: 502 },
        );
      }

      // 멀티모달 강제 — 이미지 입력을 지원하는 활성 텍스트 모델만 서버에서 선택한다.
      const visionModel = await resolveSystemVisionTextModel();
      if (!visionModel) {
        return NextResponse.json(
          { success: false, message: "이미지를 읽을 수 있는 AI 모델이 현재 사용 불가능합니다." },
          { status: 503 },
        );
      }

      const prompt = [
        "첨부한 상품 이미지를 분석해 스마트스토어 등록에 필요한 기본 정보를 작성하세요.",
        "반드시 아래 키를 가진 JSON 객체만 출력합니다.",
        '{ "title": "...", "channelProductName": "...", "productName": "...", "summary": "...", "price": number|null, "stockQuantity": number|null }',
        "",
        "규칙:",
        "- title: 스토어 표시 상품명. 짧고 명확하게 40자 이내.",
        "- channelProductName: 스마트스토어 검색용 상품명. 핵심 키워드를 포함해 100자 이내.",
        "- productName: 네이버 등록용 원상품명. channelProductName보다 정제된 형태로 100자 이내.",
        "- summary: 짧은 상품 소개 1~2문장. 과장 표현 없이 사실 위주.",
        "- price: 이미지에 가격이 명확히 표시된 경우에만 정수(원), 판단할 수 없으면 null.",
        "- stockQuantity: 이미지에서 수량을 판단할 수 없으면 null. 절대 추측하지 않는다.",
        "- 브랜드·모델명은 이미지에 명확히 보이는 경우에만 사용하고, 없으면 일반 명사로 설명한다.",
      ].join("\n");

      const generation = await handleUniverseContentCustom(
        {
          universeId,
          prompt,
          baseImages,
          n: 1,
          language: "ko",
          provider: visionModel.provider,
          modelName: visionModel.modelName,
        },
        user,
        {
          routeMeta: "commerce/draft/suggest/basic-info",
          appBillingKey: COMMERCE_NAMESPACE_KEY,
        },
      );

      if (!generation?.ok || !("data" in generation)) {
        return NextResponse.json(
          { success: false, message: ("error" in generation ? generation.error : "") || "AI 생성에 실패했습니다." },
          { status: 502 },
        );
      }

      const assetIds = Array.isArray(generation.data?.assetIds) ? generation.data.assetIds : [];
      const assetId = toSafeString(assetIds[0]);
      const contentAsset = assetId ? ((await getContentAssetByAssetId(assetId)) as { content?: { text?: unknown } } | null) : null;
      const parsed = parseSuggestedFields(toSafeString(contentAsset?.content?.text));
      if (!parsed) {
        return NextResponse.json(
          { success: false, message: "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요." },
          { status: 502 },
        );
      }

      const fields = {
        title: toSafeString(parsed.title).slice(0, 200),
        channelProductName: toSafeString(parsed.channelProductName).slice(0, 200),
        productName: toSafeString(parsed.productName).slice(0, 200),
        summary: toSafeString(parsed.summary).slice(0, 2000),
        price: toPositiveIntOrNull(parsed.price),
        stockQuantity: toPositiveIntOrNull(parsed.stockQuantity),
      };

      logger.info("스마트스토어 draft 기본 정보 AI 자동완성", {
        userId: user.ID,
        universeId,
        draftId,
        assetId,
        provider: visionModel.provider,
        modelName: visionModel.modelName,
        imageCount: baseImages.length,
      });

      return NextResponse.json({
        success: true,
        data: {
          fields,
          assetId,
          model: visionModel.modelName,
        },
      });
    } catch (error: unknown) {
      logger.error("스마트스토어 draft 기본 정보 AI 자동완성 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "기본 정보 자동완성 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  // draftId는 경로 파라미터다 — withAuth는 body만 validator에 전달하므로 라우트에서 주입한다(apply-asset 동일 패턴).
  (data) => validateCommerceDraftSuggestBasicInfo({ ...data, draftId: data?.draftId || "__from_route__" }),
  "universe_commerce_draft_suggest_basic_info",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
