import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { COMMERCE_NAMESPACE_KEY } from "consts/app";
import { handleUniverseContentBasic, type ContentBasicBody } from "libs/server-utils/api/contentBasicHandler";
import { validateTemplateKey } from "libs/server-utils/api/routeValidators";
import type { BaseImageType, PromptGenType, PromptVisibilityType } from "types/app";
import type { TextProviderType } from "types/ai";

/**
 * @docHint
 * @purpose 커머스 유니버스 템플릿 콘텐츠 생성 및 유니버스 코인 과금
 * @process templateKey 조회/치환  유니버스 권한 확인  텍스트 생성  코인 차감  결과 반환
 * @domain commerce
 * @scope universe
 */

export const runtime = "nodejs";

type Body = {
  universeId: string;
  templateKey: string;
  generationMode?: PromptGenType;
  variables?: Record<string, string>;
  extraPrompt?: string;
  platform?: string;
  language?: string;
  length?: string;
  outputFormat?: string;
  n?: number;
  modelName?: string;
  provider?: TextProviderType;
  temperature?: number;
  maxOutputTokens?: number;
  baseImages?: BaseImageType[];
  visibility?: PromptVisibilityType;
};

const validate = validateTemplateKey;
async function handler(data: Body, user: unknown) {
  const out = await handleUniverseContentBasic(data as ContentBasicBody, user, {
    routeMeta: "commerce/content",
    appBillingKey: COMMERCE_NAMESPACE_KEY,
  });
  return out;
}

export const POST = withAuth<Body>(handler, validate, "commerce/generate/template-content", {
  checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
});
