import { NextResponse } from "next/server";
import * as serverEnv from "consts/env/server";

/**
 * @docHint
 * @purpose API 라우트((global) / health) 기능 요청 처리
 * @process GET 요청 파싱  필수 서버 env 검증  핵심 처리  JSON 응답 반환
 * @domain system
 * @scope public-api
 */

/**
 * 필수 서버 env를 헬스체크 범위에 포함시킨다.
 *
 * 배경: 이 라우트가 아무것도 import하지 않던 시절에는 런타임 env가 누락돼도 200을 반환했다.
 * 그 결과 node-deploy.sh의 배포 헬스체크가 통과해 자동 롤백이 발동하지 않은 채,
 * consts/env/server를 import하는 나머지 라우트만 전부 500으로 떨어지는 사고가 있었다
 * (2026-08-07 ALLOWED_IMAGE_DOMAINS 장애).
 *
 * consts/env/server는 top-level에서 필수 서버 env를 검증하고 누락 시 throw하므로,
 * 이 import만으로 env 누락이 헬스체크 500으로 드러나고 배포 자동 롤백이 동작한다.
 * 값을 읽지 않고 import만 하면 번들러가 제거할 여지가 있어 실제로 참조한다.
 * env 개수 자체는 노출하지 않고 boolean으로만 응답한다.
 */
const SERVER_ENV_LOADED = Object.keys(serverEnv).length > 0;

// 서버 헬스체크 엔드포인트
export async function GET() {
  return new NextResponse(JSON.stringify({ ok: true, env: SERVER_ENV_LOADED, ts: Date.now() }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
