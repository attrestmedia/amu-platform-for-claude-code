/**
 * @docHint
 * @purpose PRS-006 hold·증거 조회와 런타임 사이의 안정된 인터페이스를 제공한다.
 * @process 활성 hold·notice_observed 이벤트 조회  hold LKG 보존  조회 실패 로그·안전 기본값 반환
 * @domain legal-policy
 * @scope policy-release-signals
 */

import "server-only";
import { hasPolicyReleaseEvents } from "libs/database/legal/policyReleaseEventRepo";
import { listActivePolicyReleaseHolds } from "libs/database/legal/policyReleaseHoldRepo";

let activeHoldsLastKnownGood: readonly string[] | null = null;
let holdReadFailureLogged = false;
let evidenceReadFailureLogged = false;

export async function getActivePolicyReleaseHolds(): Promise<readonly string[]> {
  try {
    const holds = await listActivePolicyReleaseHolds();
    const releaseIds = holds.map(({ releaseId }) => releaseId);
    activeHoldsLastKnownGood = releaseIds;
    holdReadFailureLogged = false;
    return releaseIds;
  } catch {
    if (!holdReadFailureLogged) {
      console.error("[policyReleaseSignals] active hold lookup failed");
      holdReadFailureLogged = true;
    }
    return activeHoldsLastKnownGood ?? [];
  }
}

export async function getPolicyReleaseEvidence(
  releaseIds: readonly string[],
): Promise<readonly { releaseId: string; kind: "notice_observed" }[]> {
  try {
    const events = await hasPolicyReleaseEvents(releaseIds, ["notice_observed"]);
    evidenceReadFailureLogged = false;
    return events as readonly { releaseId: string; kind: "notice_observed" }[];
  } catch {
    if (!evidenceReadFailureLogged) {
      console.error("[policyReleaseSignals] notice evidence lookup failed");
      evidenceReadFailureLogged = true;
    }
    return [];
  }
}

export function __resetPolicyReleaseSignalsForTest() {
  activeHoldsLastKnownGood = null;
  holdReadFailureLogged = false;
  evidenceReadFailureLogged = false;
}
