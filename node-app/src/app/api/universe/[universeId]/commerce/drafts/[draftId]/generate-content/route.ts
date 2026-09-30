import { NextResponse } from "next/server";
import { COMMERCE_NAMESPACE_KEY } from "consts/app";
import { getCommerceDraftByDraftId, attachCommerceDraftAssets, snapshotCommerceDraftRevision } from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftGenerateContent } from "libs/server-utils/api/routeValidators";
import { handleUniverseContentBasic, handleUniverseContentCustom } from "libs/server-utils/api/contentBasicHandler";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / generate-content) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  AI 콘텐츠 생성  draft asset 연결  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);

      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      const hasTemplateKey = toSafeString(data?.templateKey).length > 0;
      const generation = hasTemplateKey
        ? await handleUniverseContentBasic(
            {
              universeId,
              templateKey: data?.templateKey,
              generationMode: data?.generationMode,
              variables: data?.variables,
              extraPrompt: data?.extraPrompt,
              platform: data?.platform,
              language: data?.language,
              length: data?.length,
              n: data?.n,
              modelName: data?.modelName,
              provider: data?.provider,
              temperature: data?.temperature,
              maxOutputTokens: data?.maxOutputTokens,
            },
            user,
            {
              routeMeta: "commerce/draft/generate/template-content",
              appBillingKey: COMMERCE_NAMESPACE_KEY,
            },
          )
        : await handleUniverseContentCustom(
            {
              universeId,
              prompt: data?.prompt,
              templateKey: data?.templateKey,
              extraPrompt: data?.extraPrompt,
              platform: data?.platform,
              language: data?.language,
              length: data?.length,
              n: data?.n,
              modelName: data?.modelName,
              provider: data?.provider,
              temperature: data?.temperature,
              maxOutputTokens: data?.maxOutputTokens,
            },
            user,
            {
              routeMeta: "commerce/draft/generate/basic-content",
              appBillingKey: COMMERCE_NAMESPACE_KEY,
            },
          );

      if (!generation?.ok || !("data" in generation)) {
        return NextResponse.json(
          { success: false, message: ("error" in generation ? generation.error : "") || "콘텐츠 생성에 실패했습니다." },
          { status: 400 },
        );
      }

      const assetIds = Array.isArray(generation.data?.assetIds) ? generation.data.assetIds : [];
      const updatedDraft =
        assetIds.length > 0
          ? await attachCommerceDraftAssets({
              draftId,
              updatedBy: String(user.ID || ""),
              contentAssetIds: assetIds,
            })
          : draft;

      await snapshotCommerceDraftRevision({
        draftId,
        actor: String(user.ID || ""),
        source: "ai_apply",
        summary: hasTemplateKey ? "AI 템플릿 콘텐츠 생성" : "AI 커스텀 콘텐츠 생성",
        patchMeta: {
          templateKey: toSafeString(data?.templateKey),
          prompt: toSafeString(data?.prompt).slice(0, 140),
          generatedCount: Array.isArray(generation.data?.contents) ? generation.data.contents.length : 0,
          assetCount: assetIds.length,
        },
      });

      logger.info("스마트스토어 draft AI 콘텐츠 생성 성공", {
        userId: user.ID,
        universeId,
        draftId,
        templateKey: toSafeString(data?.templateKey),
        generatedCount: Array.isArray(generation.data?.contents) ? generation.data.contents.length : 0,
        assetCount: assetIds.length,
      });

      return NextResponse.json({
        success: true,
        data: {
          draft: updatedDraft,
          generation: generation.data,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 draft AI 콘텐츠 생성 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "AI 콘텐츠 생성 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  (data) => validateCommerceDraftGenerateContent({ ...data, draftId: data?.draftId || "__from_route__" }),
  "universe_commerce_draft_generate_content",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
