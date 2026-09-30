import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import {
  deduplicateMarketingTypoRules,
  findMarketingTypoRuleByIdentity,
  listMarketingTypoRules,
  updateMarketingTypoRuleStatus,
  upsertMarketingTypoRule,
} from "libs/database/marketing";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { assertMarketingUniverseAccess, listAccessibleMarketingUniverseIds } from "libs/marketing/operator/access";
import {
  MARKETING_TYPO_RULE_SEVERITY,
  MARKETING_TYPO_RULE_STATUS,
  MARKETING_TYPO_RULE_TYPE,
  type MarketingTypoRuleSeverity,
  type MarketingTypoRuleStatus,
  type MarketingTypoRuleType,
} from "models/marketing";

/**
 * @docHint
 * @purpose API 라우트(marketing / typo-rules) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  오탈자 사전 rule 조회/상태 변경  JSON 응답 반환
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toSafeString(value: unknown, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

function toCsvValues(raw?: string | null, max = 80) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((value) => toSafeString(value, max))
        .filter(Boolean),
    ),
  );
}

function toLimit(raw?: string | null) {
  const next = Number(raw || 80);
  return Math.max(1, Math.min(200, Number.isFinite(next) ? Math.floor(next) : 80));
}

function toAllowedValues<T extends string>(values: string[], allowed: readonly T[]) {
  return values.filter((value): value is T => allowed.includes(value as T));
}

function toStringArray(values: unknown, limit = 20, maxLength = 200) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : String(values || "").split(","))
        .map((value: unknown) => toSafeString(value, maxLength))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function getMongoErrorCode(error: unknown) {
  return Number((error as { code?: unknown })?.code || 0);
}

export const GET = withAuth(
  async (_data, user, request?: NextRequest) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const searchParams = request ? new URL(request.url).searchParams : undefined;
      const requestedUniverseId = toSafeString(searchParams?.get("universeId"), 120);
      const status = toAllowedValues(toCsvValues(searchParams?.get("status"), 20), MARKETING_TYPO_RULE_STATUS);
      const severity = toAllowedValues(toCsvValues(searchParams?.get("severity"), 20), MARKETING_TYPO_RULE_SEVERITY);

      let universeIds: string[] = [];
      if (requestedUniverseId) {
        const access = await assertMarketingUniverseAccess({ user, universeId: requestedUniverseId });
        if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        universeIds = [access.universeId];
      } else {
        universeIds = await listAccessibleMarketingUniverseIds(user);
      }
      if (universeIds.length === 0) {
        return NextResponse.json({ success: true, data: { items: [], scope: "global" } });
      }

      const items = await listMarketingTypoRules({
        universeIds,
        status: status.length > 0 ? status : undefined,
        severity: severity.length > 0 ? severity : undefined,
        pattern: toSafeString(searchParams?.get("pattern"), 200),
        channel: toSafeString(searchParams?.get("channel"), 40),
        limit: toLimit(searchParams?.get("limit")),
      });

      return NextResponse.json({ success: true, data: { items, scope: "global" } });
    }, 20000),
  undefined,
  "marketing_typo_rules_list",
);

export const POST = withAuth(
  async (data, user) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const universeId = toSafeString(data?.universeId, 120);
      const action = toSafeString(data?.action, 40) || "status";
      const ruleId = toSafeString(data?.ruleId, 160);
      const pattern = toSafeString(data?.pattern, 200);
      const type = (toSafeString(data?.type, 20) || "literal") as MarketingTypoRuleType;
      const status = (toSafeString(data?.status, 20) || (action === "disable" ? "disabled" : "")) as MarketingTypoRuleStatus;
      const severity = toSafeString(data?.severity, 20) as MarketingTypoRuleSeverity;
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      if (action === "deduplicate") {
        const result = await deduplicateMarketingTypoRules({
          universeId: access.universeId,
          updatedBy: toSafeString(user?.userEmail || user?.userEmailLower, 200),
        });
        return NextResponse.json({ success: true, data: { ...result, scope: "global" } });
      }
      if (action !== "create" && !ruleId) {
        return NextResponse.json({ success: false, error: "rule_id_required" }, { status: 400 });
      }
      if ((action === "create" || action === "update") && !pattern) {
        return NextResponse.json({ success: false, error: "pattern_required" }, { status: 400 });
      }
      if (!MARKETING_TYPO_RULE_TYPE.includes(type)) {
        return NextResponse.json({ success: false, error: "invalid_type" }, { status: 400 });
      }
      if (!MARKETING_TYPO_RULE_STATUS.includes(status)) {
        return NextResponse.json({ success: false, error: "invalid_status" }, { status: 400 });
      }
      if (severity && !MARKETING_TYPO_RULE_SEVERITY.includes(severity)) {
        return NextResponse.json({ success: false, error: "invalid_severity" }, { status: 400 });
      }

      let item = null;
      try {
        if (action === "create" || action === "update") {
          const duplicate = await findMarketingTypoRuleByIdentity({
            universeId: access.universeId,
            type,
            pattern,
            excludeRuleId: action === "update" ? ruleId : undefined,
          });
          if (duplicate) {
            return NextResponse.json({ success: false, error: "duplicate_typo_rule" }, { status: 409 });
          }
          item = await upsertMarketingTypoRule({
            universeId: access.universeId,
            ruleId: action === "update" ? ruleId : undefined,
            type,
            pattern,
            status,
            severity: severity || undefined,
            expected: toStringArray(data?.expected, 10, 120),
            reason: toSafeString(data?.reason, 500),
            channels: toStringArray(data?.channels, 20, 40),
            source: "operator_manual",
            updatedBy: toSafeString(user?.userEmail || user?.userEmailLower, 200),
          });
        } else {
          item = await updateMarketingTypoRuleStatus({
            universeId: access.universeId,
            ruleId,
            status,
            severity: severity || undefined,
            updatedBy: toSafeString(user?.userEmail || user?.userEmailLower, 200),
          });
        }
      } catch (error) {
        if (getMongoErrorCode(error) === 11000) {
          return NextResponse.json({ success: false, error: "duplicate_typo_rule" }, { status: 409 });
        }
        throw error;
      }
      if (!item) return NextResponse.json({ success: false, error: "rule_not_found" }, { status: 404 });

      return NextResponse.json({ success: true, data: { item } });
    }, 20000),
  (data) => {
    if (!data) return { valid: false, error: "no body" };
    const action = toSafeString(data?.action, 40) || "status";
    if (!toSafeString(data?.universeId, 120)) return { valid: false, error: "universeId_required" };
    if (action === "deduplicate") return { valid: true };
    if (action !== "create" && !toSafeString(data?.ruleId, 160)) return { valid: false, error: "ruleId_required" };
    if ((action === "create" || action === "update") && !toSafeString(data?.pattern, 200)) {
      return { valid: false, error: "pattern_required" };
    }
    if (!toSafeString(data?.status, 20) && action !== "disable") return { valid: false, error: "status_required" };
    return { valid: true };
  },
  "marketing_typo_rule_update",
);
