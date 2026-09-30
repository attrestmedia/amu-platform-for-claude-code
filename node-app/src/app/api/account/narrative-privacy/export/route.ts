import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { exportUserNarrativeData } from "libs/database/game";
import { getNarrativeConsent, resolveNarrativePilotEligibility } from "libs/server-utils/narrative/narrativeLifecycle";
import { NARRATIVE_LIFECYCLE_POLICY } from "types/game";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Personal Canon 데이터 이동권(export)·파일럿 eligibility 조회 API
 * @process 인증 UID 사용  삭제 allowlist와 동일 12종 컬렉션 읽기 전용 export  신뢰형 미성년 판정 포함
 * @domain narrative-privacy
 * @scope account-api
 */

function uidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

export const GET = withAuth(
  async (_body, user) => {
    const uid = uidOf(user);
    const [exports, consent, eligibility] = await Promise.all([
      exportUserNarrativeData(uid),
      getNarrativeConsent(uid),
      resolveNarrativePilotEligibility({ uid, pilotCohortEnabled: false }),
    ]);
    return NextResponse.json(
      {
        ok: true,
        policyVersion: NARRATIVE_LIFECYCLE_POLICY.version,
        generatedAt: new Date().toISOString(),
        preference: consent,
        pilotEligibility: {
          eligible: eligibility.eligible,
          isMinor: eligibility.isMinor,
          minorSource: eligibility.minorSource,
          note: "pilotCohortEnabled는 파일럿 승인(G4) 전까지 항상 false다",
        },
        data: exports,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="amu-narrative-export-${uid}.json"`,
        },
      },
    );
  },
  undefined,
  "account:narrative-privacy:export",
  { bodyParser: "none" },
);
