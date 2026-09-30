import "server-only";
import crypto from "crypto";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process hashToken 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain security
 * @scope shared
 */

// 해시토큰 가져오기
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").substring(0, 32);
}
