import type {
  ImagePromptBodyType,
  ImagePromptCustomType,
  ImagePromptMetaType,
  ContentPromptBodyType,
  ContentPromptCustomType,
} from "types/app";
import { AI_GEN_IMAGE_LIMIT, AI_GEN_CONTENT_LIMIT } from "consts/ai";
import { studioRequestOrThrow } from "libs/api/ai";

const IMAGE_GENERATION_TIMEOUT_MS = 180_000;

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain lab
 * @scope client
 */

export async function generateImagesByPrompt(payload: ImagePromptBodyType) {
  const safeN = Math.max(1, Math.min(AI_GEN_IMAGE_LIMIT, Number(payload.n || 1)));
  const data = await studioRequestOrThrow<{ images: string[]; coins: number; assets?: ImagePromptMetaType[] }>({
    kind: "template-image",
    universeId: payload.universeId,
    body: { ...payload, n: safeN },
    timeoutMs: IMAGE_GENERATION_TIMEOUT_MS,
  });
  return data;
}

export async function generateImageByBasicPrompt(payload: ImagePromptCustomType) {
  const safeN = Math.max(1, Math.min(AI_GEN_IMAGE_LIMIT, Number(payload.n || 1)));
  const data = await studioRequestOrThrow<{ images: string[]; coins: number; assets?: ImagePromptMetaType[] }>({
    kind: "basic-image",
    universeId: payload.universeId,
    body: { ...payload, n: safeN },
    timeoutMs: IMAGE_GENERATION_TIMEOUT_MS,
  });
  return data;
}

/**
 * @deprecated Gen Studio 화면은 `enqueueStudioContentJob`(Job queue + 알림) 경로를 사용한다.
 * 동기 호출은 긴 출력에서 게이트웨이 타임아웃에 결과가 유실되므로 신규 화면에 쓰지 않는다.
 */
export async function generateContentByPrompt(payload: ContentPromptBodyType) {
  const safeN = Math.max(1, Math.min(AI_GEN_CONTENT_LIMIT, Number(payload.n || 1)));
  const data = await studioRequestOrThrow<{ contents: string[]; coins: number }>({
    kind: "template-content",
    universeId: payload.universeId,
    body: { ...payload, generationMode: payload.generationMode || "template", n: safeN },
  });
  return data;
}

export async function generateContentByBasicPrompt(payload: ContentPromptCustomType) {
  const safeN = Math.max(1, Math.min(AI_GEN_CONTENT_LIMIT, Number(payload.n || 1)));
  const data = await studioRequestOrThrow<{ contents: string[]; coins: number }>({
    kind: "basic-content",
    universeId: payload.universeId,
    body: { ...payload, generationMode: payload.generationMode || "custom", n: safeN },
  });
  return data;
}
