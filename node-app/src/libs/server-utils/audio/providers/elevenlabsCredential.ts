import "server-only";

import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import { normalizeApiKey } from "./elevenlabsSpeech";

/**
 * @docHint
 * @purpose ElevenLabs 런타임 API 키 해석
 * @process DB 활성 자격증명 조회  형식 확인  키 반환
 * @domain speech
 * @scope server
 *
 * EL-201. **환경변수를 읽지 않는다.** 다른 AI provider와 같이 DB 자격증명(`ai.elevenlabs.default`)만
 * 근거로 삼는다(platformAiClients.ts와 동일 계약). 키의 위치가 둘이면 회전할 때 한 곳만 바뀌어
 * 조용히 옛 키가 살아남는다.
 *
 * provider adapter(elevenlabsSpeech.ts)와 파일을 나눈 이유는 계층 때문이다. adapter는 apiKey를
 * 주입받는 순수 HTTP 모듈이라 DB·env 없이 테스트된다. 자격증명 해석을 그 안에 두면 adapter를
 * import하는 것만으로 DB 환경변수가 필요해진다.
 *
 * 활성 자격증명이 없으면 resolver가 PLATFORM_CREDENTIAL_UNAVAILABLE(503)을 던진다. 이 함수 호출 전에
 * assertSpeechProviderCapabilityOrThrow가 routable 상한을 먼저 확인하므로 평시에는 여기까지 오지 않는다.
 */
export async function resolveElevenLabsApiKey() {
  const credential = await resolvePlatformCredential("ai.elevenlabs.default");
  return normalizeApiKey(credential.payload.apiKey);
}
