import type { ImagePromptCustomType } from "types/app";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { handleUserImageBasic } from "libs/server-utils/api/imageBasicHandler";
import { validatePromptOrBaseImage } from "libs/server-utils/api/routeValidators";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose 사용자 입력 프롬프트/원본 이미지 기반 AI 이미지 생성 및 개인 코인 과금
 * @process 프롬프트·원본이미지 유효성 검증  AI 프로바이더(OpenAI/Google/xAI) 이미지 생성  파일 저장  사용자 코인 차감  이미지 URL/차감 코인 반환
 * @domain ai
 * @scope global
 */

export const runtime = "nodejs";

const validate = validatePromptOrBaseImage;
async function handler(data: ImagePromptCustomType, user: AuthenticatedUserType) {
  return await handleUserImageBasic(data, user, { routeMeta: "ai/image" });
}

export const POST = withAuth<ImagePromptCustomType>(handler, validate, "ai/generate/basic-image");
