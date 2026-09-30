import { NextResponse } from "next/server";
import crypto from "crypto";
import { COMMERCE_NAMESPACE_KEY } from "consts/app";
import {
  attachCommerceDraftAssets,
  getCommerceDraftByDraftId,
  snapshotCommerceDraftRevision,
} from "libs/database/commerce";
import { getContentAssetByAssetId } from "libs/database/lab";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftGenerateProductContent } from "libs/server-utils/api/routeValidators";
import { handleUniverseContentCustom } from "libs/server-utils/api/contentBasicHandler";
import {
  buildCommerceProductContentPrompt,
  buildCommerceProductSourcePacket,
  isCommerceProductContentField,
  validateCommerceProductClaims,
  type CommerceProductContentField,
} from "libs/server-utils/commerce/commerceProductContentContract";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose SSM-204 상품 사실 기반 콘텐츠 후보 생성 라우트. draft의 구조화 팩트(source packet)를
 *          프롬프트에 주입해 title·summary·detailHtml 필드별 후보를 만들고,
 *          생성 결과의 사실 단정을 claims 검증으로 판정해 함께 반환한다.
 * @process draft 조회  packet 추출  필드별 AI 생성(과금)  content asset 연결  claims 검증  revision 기록
 * @domain commerce.naver
 * @scope universe
 *
 * - 요청된 필드마다 1회의 유료 생성 호출이 발생한다. 호출 전 비용 고지는 UI 책임이다.
 * - blocked 후보도 asset lineage는 남긴다(이미 과금된 자산의 흔적). 단 apply-asset 게이트가
 *   unsupported claims가 있는 후보의 적용을 차단한다(fail-closed).
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function buildCommerceProductContentClientRequestId(input: {
  universeId: string;
  draftId: string;
  revision: number;
  field: CommerceProductContentField;
  factsHash: string;
}) {
  const canonical = [input.universeId, input.draftId, input.revision, input.field, input.factsHash].join("|");
  return `commerce-product-content:${crypto.createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

type ProductContentCandidate = {
  field: CommerceProductContentField;
  assetId: string;
  text: string;
  blocked: boolean;
  claims: ReturnType<typeof validateCommerceProductClaims> | null;
  error: string;
};

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);

      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      // validator가 통과했으면 targetFields는 1~3개의 허용 필드다.
      const targetFields = Array.from(
        new Set(
          (Array.isArray(data?.targetFields) ? data.targetFields : [])
            .map((field: unknown) => toSafeString(field).toLowerCase())
            .filter((field: string) => isCommerceProductContentField(field)),
        ),
      ) as CommerceProductContentField[];

      if (!targetFields.length) {
        return NextResponse.json({ success: false, message: "생성할 필드를 지정해야 합니다." }, { status: 400 });
      }

      const packet = buildCommerceProductSourcePacket(draft);
      const extraPrompt = toSafeString(data?.extraPrompt);
      const revision = Number(draft.revision);
      if (!Number.isSafeInteger(revision) || revision < 1 || !packet.factsHash) {
        return NextResponse.json(
          { success: false, message: "상품 콘텐츠 생성에 필요한 draft revision을 확인할 수 없습니다." },
          { status: 409 },
        );
      }

      const candidates: ProductContentCandidate[] = [];
      let latestDraft: unknown = draft;
      let attachedAny = false;

      for (const field of targetFields) {
        const prompt = buildCommerceProductContentPrompt({ packet, field, extraPrompt });
        const generation = await handleUniverseContentCustom(
          {
            universeId,
            prompt,
            language: "ko",
            n: 1,
          },
          user,
          {
            routeMeta: `commerce/draft/generate/product-content/${field}`,
            appBillingKey: COMMERCE_NAMESPACE_KEY,
            kind: "commerce-product-content",
            clientRequestId: buildCommerceProductContentClientRequestId({
              universeId,
              draftId,
              revision,
              field,
              factsHash: packet.factsHash,
            }),
          },
        );

        if (!generation?.ok || !("data" in generation)) {
          candidates.push({
            field,
            assetId: "",
            text: "",
            blocked: false,
            claims: null,
            error: ("error" in generation ? generation.error : "") || "콘텐츠 생성에 실패했습니다.",
          });
          continue;
        }

        const assetIds = Array.isArray(generation.data?.assetIds) ? generation.data.assetIds : [];
        const assetId = toSafeString(assetIds[0]);
        if (!assetId) {
          candidates.push({ field, assetId: "", text: "", blocked: false, claims: null, error: "생성 결과 asset이 없습니다." });
          continue;
        }

        const existingContentAssetIds = Array.isArray((draft as { assets?: { contentAssetIds?: unknown[] } }).assets?.contentAssetIds)
          ? ((draft as { assets?: { contentAssetIds?: unknown[] } }).assets?.contentAssetIds || []).map(toSafeString)
          : [];
        if (!generation.data?.reused || !existingContentAssetIds.includes(assetId)) {
          latestDraft = await attachCommerceDraftAssets({
            draftId,
            updatedBy: String(user.ID || ""),
            contentAssetIds: [assetId],
          });
          attachedAny = true;
        }

        // attach는 draft가 삭제되면 null을 돌려준다(draftRepo.ts). null을 흘려보내면
        // "적용됨" 응답에 draft: null이 나가므로 apply-asset의 publish 락 가드와 같은 기준으로 끊는다.
        if (!latestDraft) {
          return NextResponse.json(
            { success: false, message: "draft를 찾을 수 없어 후보를 저장할 수 없습니다." },
            { status: 404 },
          );
        }

        // 생성된 asset 본문을 직접 읽어 claims 검증 대상 텍스트로 쓴다.
        const contentAsset = (await getContentAssetByAssetId(assetId)) as { content?: { text?: unknown } } | null;
        const text = toSafeString(contentAsset?.content?.text);
        const claims = validateCommerceProductClaims({ packet, field, text });

        candidates.push({ field, assetId, text, blocked: claims.blocked, claims, error: "" });
      }

      const appliedFields = candidates.filter((candidate) => candidate.assetId).map((candidate) => candidate.field);

      if (attachedAny && appliedFields.length) {
        await snapshotCommerceDraftRevision({
          draftId,
          actor: String(user.ID || ""),
          source: "ai_generate",
          summary: "상품 사실 기반 콘텐츠 후보 생성",
          patchMeta: {
            fields: appliedFields,
            factsHash: packet.factsHash,
            blockedFields: candidates.filter((candidate) => candidate.blocked).map((candidate) => candidate.field),
          },
        });
      }

      logger.info("스마트스토어 draft 상품 사실 기반 콘텐츠 후보 생성", {
        userId: user.ID,
        universeId,
        draftId,
        fields: targetFields,
        factsHash: packet.factsHash,
        generatedFields: appliedFields,
        blockedFields: candidates.filter((candidate) => candidate.blocked).map((candidate) => candidate.field),
      });

      return NextResponse.json({
        success: true,
        data: {
          draft: latestDraft,
          factsHash: packet.factsHash,
          candidates,
        },
      });

    } catch (error) {
      logger.error("스마트스토어 draft 상품 사실 기반 콘텐츠 후보 생성 실패:", error);
      const status = Number((error as { status?: unknown })?.status);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "상품 콘텐츠 후보 생성 중 오류가 발생했습니다.") },
        { status: Number.isInteger(status) && status >= 400 && status < 600 ? status : 500 },
      );
    }
  },
  (data) => validateCommerceDraftGenerateProductContent({ ...data, draftId: data?.draftId || "__from_route__" }),
  "universe_commerce_draft_generate_product_content",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
