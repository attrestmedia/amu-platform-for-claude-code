import { withGuestOrAuth } from "libs/server-utils/api/apiMiddleware";
import { validateRequest } from "libs/server-utils/api/apiHelper";
import { handleUnifiedTextChatRequest } from "libs/server-utils/api/unifiedChat";
import { resolveProviderOrThrow } from "libs/server-utils/api/apiResolveHelper";
import type { TextProviderType } from "types/ai";

/**
 * @docHint
 * @purpose 커머스 전용 채팅 요청 처리
 * @process 요청 파싱  인증/권한 검증  커머스 정책/프롬프트 합성  모델 호출  메시지 저장  응답 반환
 * @domain commerce
 * @scope universe
 */

export const POST = withGuestOrAuth(
  async (data, user) => {
    const provider = resolveProviderOrThrow(data);
    // 커머스는 항상 유니버스 지갑 과금 → routeHint 강제
    return handleUnifiedTextChatRequest(provider as TextProviderType, { ...data, routeHint: "commerce" }, user);
  },
  validateRequest,
  "commerce/chat",
);
