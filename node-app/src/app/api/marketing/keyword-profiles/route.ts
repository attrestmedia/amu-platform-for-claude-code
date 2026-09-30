import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import {
  countMarketingKeywordProfilesByCluster,
  deleteMarketingKeywordCluster,
  deleteMarketingKeywordProfile,
  getMarketingKeywordSettings,
  listMarketingKeywordClusters,
  listMarketingKeywordProfiles,
  upsertMarketingKeywordCluster,
  upsertMarketingKeywordProfile,
  upsertMarketingKeywordSettings,
} from "libs/database/marketing";

/**
 * @docHint
 * @purpose API 라우트(marketing / keyword-profiles) — 기본 앵커 설정 + 클러스터 원장 + 키워드 프로필 CRUD
 * @process 요청 파싱  인증/유니버스 권한 검증  kind(settings|cluster|profile)별 조회·upsert·soft delete  JSON 응답 반환
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toSafeString(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function featureGuard() {
  if (!isMarketingFeatureEnabled()) {
    return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
  }
  return null;
}

export const GET = withAuth(
  async (_data, user, request?: NextRequest) =>
    await withApiTimeout(async () => {
      const guard = featureGuard();
      if (guard) return guard;

      const universeId = toSafeString(request ? new URL(request.url).searchParams.get("universeId") : "", 120);
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

      const [settings, profiles, clusters] = await Promise.all([
        getMarketingKeywordSettings(access.universeId),
        listMarketingKeywordProfiles({ universeId: access.universeId }),
        listMarketingKeywordClusters({ universeId: access.universeId }),
      ]);
      return NextResponse.json({ success: true, data: { settings: settings ?? null, profiles, clusters } });
    }, 20000),
  undefined,
  "marketing_keyword_profiles_list",
);

export const POST = withAuth(
  async (data, user) =>
    await withApiTimeout(async () => {
      const guard = featureGuard();
      if (guard) return guard;

      const body = (data ?? {}) as Record<string, unknown>;
      const kind = toSafeString(body.kind, 30); // "settings" | "cluster" | "profile"
      const universeId = toSafeString(body.universeId, 120);
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

      const updatedBy = toSafeString(user?.userEmail || user?.userEmailLower, 200);

      if (kind === "settings") {
        const settings = await upsertMarketingKeywordSettings({
          universeId: access.universeId,
          defaultAnchorKeyword: body.defaultAnchorKeyword as string | undefined,
          defaultLookbackDays: body.defaultLookbackDays as number | undefined,
          defaultTimeUnit: body.defaultTimeUnit as "date" | "week" | "month" | undefined,
          defaultDevice: body.defaultDevice as "all" | "pc" | "mo" | undefined,
          marketingCriteria: body.marketingCriteria as Record<string, unknown> | undefined,
          updatedBy,
        });
        return NextResponse.json({ success: true, data: { settings } });
      }

      if (kind === "cluster") {
        const clusterKey = toSafeString(body.clusterKey, 60);
        if (!clusterKey) return NextResponse.json({ success: false, error: "clusterKey_required" }, { status: 400 });
        const cluster = await upsertMarketingKeywordCluster({
          universeId: access.universeId,
          clusterKey,
          clusterScope: body.clusterScope as string | undefined,
          labelKo: body.labelKo as string | undefined,
          labelEn: body.labelEn as string | undefined,
          descriptionKo: body.descriptionKo as string | undefined,
          descriptionEn: body.descriptionEn as string | undefined,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
          updatedBy,
        });
        return NextResponse.json({ success: true, data: { cluster } });
      }

      const profileKey = toSafeString(body.profileKey, 60);
      if (!profileKey) return NextResponse.json({ success: false, error: "profileKey_required" }, { status: 400 });

      const profile = await upsertMarketingKeywordProfile({
        universeId: access.universeId,
        profileKey,
        name: body.name as string | undefined,
        clusterKey: body.clusterKey as string | undefined,
        clusterScope: body.clusterScope as string | undefined,
        anchorKeyword: body.anchorKeyword as string | undefined,
        seedKeywords: body.seedKeywords,
        negativeKeywords: body.negativeKeywords,
        selectedKeyword: body.selectedKeyword as string | undefined,
        selectedReason: body.selectedReason as string | undefined,
        targetPersona: body.targetPersona as string | undefined,
        campaignId: body.campaignId as string | undefined,
        note: body.note as string | undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        updatedBy,
      });
      return NextResponse.json({ success: true, data: { profile } });
    }, 20000),
  (data) => {
    if (!data) return { valid: false, error: "no body" };
    if (!String((data as Record<string, unknown>)?.universeId ?? "").trim()) return { valid: false, error: "universeId_required" };
    return { valid: true };
  },
  "marketing_keyword_profiles_upsert",
);

export const DELETE = withAuth(
  async (_data, user, request?: NextRequest) =>
    await withApiTimeout(async () => {
      const guard = featureGuard();
      if (guard) return guard;

      const sp = request ? new URL(request.url).searchParams : undefined;
      const universeId = toSafeString(sp?.get("universeId"), 120);
      const kind = toSafeString(sp?.get("kind"), 30) || "profile"; // "profile" | "cluster"
      const hard = sp?.get("hard") === "true";
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

      if (kind === "cluster") {
        const clusterKey = toSafeString(sp?.get("clusterKey"), 60);
        if (!clusterKey) return NextResponse.json({ success: false, error: "clusterKey_required" }, { status: 400 });
        const inUse = await countMarketingKeywordProfilesByCluster({ universeId: access.universeId, clusterKey });
        const result = await deleteMarketingKeywordCluster({ universeId: access.universeId, clusterKey, hard });
        return NextResponse.json({ success: true, data: { ...result, profilesUsingCluster: inUse } });
      }

      const profileKey = toSafeString(sp?.get("profileKey"), 60);
      if (!profileKey) return NextResponse.json({ success: false, error: "profileKey_required" }, { status: 400 });

      const result = await deleteMarketingKeywordProfile({ universeId: access.universeId, profileKey, hard });
      return NextResponse.json({ success: true, data: result });
    }, 20000),
  undefined,
  "marketing_keyword_profiles_delete",
);
