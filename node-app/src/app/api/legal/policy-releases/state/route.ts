/**
 * @docHint
 * @purpose 공개 정책 릴리스 상태 조회 API를 제공한다.
 * @process 런타임 상태 구성  개인정보 없는 JSON 응답 반환
 * @domain legal-policy
 * @scope policy-release-state-api
 */

import { NextResponse } from "next/server";
import { PolicyReleaseUnavailableError } from "libs/server-utils/legal/policyReleaseRuntime";
import { buildPolicyReleaseState } from "libs/server-utils/legal/policyReleaseState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const state = await buildPolicyReleaseState();
    return NextResponse.json(state, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (!(error instanceof PolicyReleaseUnavailableError)) {
      console.error("[policyReleaseState] state response unavailable");
    }
    return NextResponse.json(
      { ok: false, errorCode: "POLICY_RELEASE_UNAVAILABLE" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
