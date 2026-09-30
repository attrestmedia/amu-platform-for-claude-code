import { CREDENTIALS_KMS_KEY } from "consts/env/server";
import { decryptSecretWithKey, encryptSecretWithKey } from "libs/secure/secretCipher";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process encryptSecret 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain security
 * @scope server
 */

export function encryptSecret(plain: string): string {
  return encryptSecretWithKey(plain, CREDENTIALS_KMS_KEY);
}

export function decryptSecret(packed: string): string {
  return decryptSecretWithKey(packed, CREDENTIALS_KMS_KEY);
}
