import type { InstagramAuthMode } from "consts/thirdparty/instagram";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

/**
 * Instagram Login은 professional account 식별자로 user_id를 반환하고,
 * Facebook Login은 IG User object의 id를 사용한다. 모든 계정 검증 경로가
 * 동일한 우선순위를 사용하도록 응답 정규화를 한곳에서 수행한다.
 */
export function resolveInstagramAccountIdentity(value: unknown, authMode: InstagramAuthMode) {
  const account = toUnknownRecord(value);
  const id = toSafeString(account.id);
  const userId = toSafeString(account.user_id);
  const accountId = authMode === "instagram_login" ? userId || id : id || userId;

  return {
    accountId,
    username: toSafeString(account.username),
  };
}

export function getInstagramAccountIdentityFields(authMode: InstagramAuthMode) {
  return authMode === "instagram_login" ? ["id", "user_id", "username"] : ["id", "username"];
}
