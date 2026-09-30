/**
 * ChromaKey v2 — fallback 멱등 operation ID 유틸리티 (CK-204)
 *
 * 순수 함수 — server-only 의존성 없음, 테스트에서 직접 import 가능.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global
 */

import crypto from "crypto";

/** source SHA + uid + engineVersion → 결정적 fallback operation ID */
export function buildFallbackOperationId(params: {
  uid: string;
  sourceSha256: string;
  engineVersion?: string;
}): string {
  const { uid, sourceSha256, engineVersion = "v2.0.0" } = params;
  const payload = `${uid}|${sourceSha256}|${engineVersion}|fallback`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}