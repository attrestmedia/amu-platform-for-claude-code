import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { handleUserContentBasic, type ContentBasicBody } from "libs/server-utils/api/contentBasicHandler";
import { CONTENT_STUDIO_NAMESPACE_KEY } from "consts/app/services";
import { validateTemplateKey } from "libs/server-utils/api/routeValidators";
import type { BaseImageType, PromptGenType, PromptVisibilityType } from "types/app";
import type { TextProviderType } from "types/ai";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose Lab 콘텐츠 프롬프트 템플릿 기반 텍스트 생성 및 개인 코인 과금
 * @process templateKey 템플릿 조회  변수 치환  인증/권한 검증  텍스트 생성  코인 차감  결과 반환
 * @domain ai
 * @scope global
 */

export const runtime = "nodejs";

type Body = {
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
async function handler(data: Body, user: AuthenticatedUserType) {
  const out = await handleUserContentBasic(data as ContentBasicBody, user, {
    routeMeta: "ai/content",
    appBillingKey: CONTENT_STUDIO_NAMESPACE_KEY,
  });
  return out;
}

export const POST = withAuth<Body>(handler, validate, "ai/generate/template-content");
