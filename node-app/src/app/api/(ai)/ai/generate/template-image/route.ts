import type { ImagePromptBodyType } from "types/app";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { handleUserImagePrompt } from "libs/server-utils/api/imagePromptHandler";
import { validateTemplateKey } from "libs/server-utils/api/routeValidators";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose Lab 이미지 프롬프트 템플릿 기반 AI 이미지 생성 및 개인 코인 과금
 * @process templateKey 템플릿 조회  변수 치환으로 프롬프트 렌더링  인증/권한 검증  AI 이미지 생성/저장  코인 차감  결과 반환
 * @domain ai
 * @scope global
 */

export const runtime = "nodejs";

const validate = validateTemplateKey;
async function handler(data: ImagePromptBodyType, user: AuthenticatedUserType) {
  return await handleUserImagePrompt(data, user);
}

export const POST = withAuth<ImagePromptBodyType>(handler, validate, "ai/generate/template-image");
