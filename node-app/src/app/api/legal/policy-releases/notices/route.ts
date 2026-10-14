/**
 * @docHint
 * @purpose 공개 홈 배너에 표시할 정책 공고·최근 시행 릴리스를 제공한다.
 * @process runtime 판별  정책별 상태 계산  개인정보 없는 no-store 응답
 * @domain legal-policy
 * @scope policy-release-notices-api
 */

import { NextResponse } from "next/server";
import { resolvePolicy } from "consts/legal/policyRelease/resolver";
import type { ManifestPolicyId } from "consts/legal/policyRelease/types";
import { getPolicyReleaseRuntime, type PolicyReleaseRuntime } from "libs/server-utils/legal/policyReleaseRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PolicyNotice = {
  policyId: "terms" | "privacy" | "refund";
  releaseId: string;
  version: string;
  kind: "upcoming" | "recently_effective";
  noticeAt: string;
  effectiveAt: string;
  href: string;
};

const POLICY_NOTICE_SOURCES: readonly {
  manifestPolicyId: ManifestPolicyId;
  policyId: PolicyNotice["policyId"];
  href: string;
}[] = [
  {
    manifestPolicyId: "terms-of-service",
    policyId: "terms",
    href: "https://allmyuniverse.com/terms-conditions/",
  },
  {
    manifestPolicyId: "privacy-policy",
    policyId: "privacy",
    href: "https://allmyuniverse.com/privacy-policy/",
  },
  {
    manifestPolicyId: "refund-return-policy",
    policyId: "refund",
    href: "https://allmyuniverse.com/refund-policy/",
  },
];

function buildPolicyNoticeItems(runtimeValue: PolicyReleaseRuntime, nowMs: number): PolicyNotice[] {
  if (runtimeValue.mode !== "manifest") return [];

  return POLICY_NOTICE_SOURCES.flatMap(({ manifestPolicyId, policyId, href }) => {
    const policy = runtimeValue.manifest.policies[manifestPolicyId];
    const releasesById = new Map(policy.releases.map((release) => [release.releaseId, release]));
    const selection = resolvePolicy(runtimeValue.manifest, manifestPolicyId, nowMs);
    const items: PolicyNotice[] = [];

    for (const releaseId of selection.announced) {
      const release = releasesById.get(releaseId);
      if (!release || release.status === "cancelled") continue;
      items.push({
        policyId,
        releaseId,
        version: release.version,
        kind: "upcoming",
        noticeAt: release.noticeAt,
        effectiveAt: release.effectiveAt,
        href,
      });
    }

    for (const releaseId of selection.recentlyEffective) {
      const release = releasesById.get(releaseId);
      if (!release || release.status === "cancelled") continue;
      items.push({
        policyId,
        releaseId,
        version: release.version,
        kind: "recently_effective",
        noticeAt: release.noticeAt,
        effectiveAt: release.effectiveAt,
        href,
      });
    }

    return items;
  });
}

type PolicyNoticeRequestContext = {
  params?: unknown;
  // In-process fixture injection for the contract test; HTTP request data cannot set this value.
  testOverrides?: { runtime: PolicyReleaseRuntime; nowMs: number };
};

export async function GET(_request: Request, context?: PolicyNoticeRequestContext) {
  const runtimeValue = context?.testOverrides?.runtime ?? getPolicyReleaseRuntime();
  const nowMs = context?.testOverrides?.nowMs ?? Date.now();
  const items = buildPolicyNoticeItems(runtimeValue, nowMs);

  return NextResponse.json(
    { ok: true, items },
    { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
  );
}
