import "server-only";
import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MARKETING_TYPO_RULE_GLOBAL_SCOPE,
  MARKETING_TYPO_RULE_SEVERITY,
  MARKETING_TYPO_RULE_STATUS,
  MARKETING_TYPO_RULE_TYPE,
  MarketingTypoRuleSchema,
  type IMarketingTypoRuleDocument,
  type MarketingTypoRuleSeverity,
  type MarketingTypoRuleStatus,
  type MarketingTypoRuleType,
} from "models/marketing";
import type { MarketingChannel } from "consts/marketing/queue";

const TYPO_RULE_COLLECTION = "marketing_typo_rules";

type MarketingTypoRuleRow = {
  _id?: unknown;
  ruleId?: string;
  universeId?: string;
  status?: MarketingTypoRuleStatus;
  severity?: MarketingTypoRuleSeverity;
  type?: MarketingTypoRuleType;
  pattern?: string;
  expected?: string[];
  reason?: string;
  channels?: MarketingChannel[];
  occurrenceCount?: number;
  firstSeenAt?: Date | null;
  lastSeenAt?: Date | null;
  lastSeen?: Record<string, unknown>;
  evidence?: Array<Record<string, unknown>>;
  source?: string;
  meta?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
};

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toSafeString(value: unknown, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

function normalizeRulePattern(value: unknown) {
  return toSafeString(value, 200).normalize("NFC");
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

function normalizeRuleType(value: unknown): MarketingTypoRuleType {
  const text = toSafeString(value, 20);
  return MARKETING_TYPO_RULE_TYPE.includes(text as MarketingTypoRuleType) ? (text as MarketingTypoRuleType) : "literal";
}

function normalizeRuleStatus(value: unknown, fallback: MarketingTypoRuleStatus = "candidate"): MarketingTypoRuleStatus {
  const text = toSafeString(value, 20);
  return MARKETING_TYPO_RULE_STATUS.includes(text as MarketingTypoRuleStatus) ? (text as MarketingTypoRuleStatus) : fallback;
}

function normalizeRuleSeverity(value: unknown, fallback: MarketingTypoRuleSeverity = "review"): MarketingTypoRuleSeverity {
  const text = toSafeString(value, 20);
  return MARKETING_TYPO_RULE_SEVERITY.includes(text as MarketingTypoRuleSeverity) ? (text as MarketingTypoRuleSeverity) : fallback;
}

function normalizeChannels(value: unknown) {
  return toStringArray(value, 20, 40) as MarketingChannel[];
}

async function getMarketingTypoRuleModel() {
  return await getModel<IMarketingTypoRuleDocument>(
    MONGODB_MARKETING_URL,
    "MarketingTypoRule",
    MarketingTypoRuleSchema,
    TYPO_RULE_COLLECTION,
  );
}

type MarketingTypoRuleQuery = {
  universeId?: string;
  universeIds?: string[];
  status?: MarketingTypoRuleStatus | MarketingTypoRuleStatus[];
  severity?: MarketingTypoRuleSeverity | MarketingTypoRuleSeverity[];
  pattern?: string;
  channel?: string;
  limit?: number;
  page?: number;
};

export async function recordMarketingTypoCandidate(input: {
  universeId: string;
  type?: MarketingTypoRuleType | string;
  pattern: string;
  expected?: unknown;
  reason?: string;
  channels?: unknown;
  channel?: string;
  field?: string;
  context?: string;
  jobId?: string;
  source?: string;
  createdBy?: string;
  modelName?: string;
  meta?: Record<string, unknown>;
}) {
  const model = await getMarketingTypoRuleModel();
  const authorizationUniverseId = toSafeString(input.universeId, 120);
  const type = normalizeRuleType(input.type);
  const pattern = normalizeRulePattern(input.pattern);
  if (!authorizationUniverseId || !pattern) return null;
  const existingIdentity = await findMarketingTypoRuleByIdentity({
    universeId: authorizationUniverseId,
    type,
    pattern,
  });

  const now = new Date();
  const evidence = {
    jobId: toSafeString(input.jobId, 160),
    channel: toSafeString(input.channel, 40),
    field: toSafeString(input.field, 80),
    context: toSafeString(input.context, 500),
    modelName: toSafeString(input.modelName, 160),
    detectedAt: now,
  };
  const set: Record<string, unknown> = {
    lastSeenAt: now,
    lastSeen: evidence,
    source: toSafeString(input.source, 80) || "ai",
    updatedBy: toSafeString(input.createdBy, 200),
    updatedAt: now,
    ...(input.meta ? { meta: input.meta } : {}),
  };
  if (typeof input.expected !== "undefined") set.expected = toStringArray(input.expected, 10, 120);
  if (typeof input.reason !== "undefined") set.reason = toSafeString(input.reason, 500);
  if (typeof input.channels !== "undefined") set.channels = normalizeChannels(input.channels);

  return await model
    .findOneAndUpdate(
      existingIdentity?._id
        ? { _id: existingIdentity._id }
        : { universeId: MARKETING_TYPO_RULE_GLOBAL_SCOPE, type, pattern },
      {
        $set: set,
        $setOnInsert: {
          ruleId: makeId("marketing_typo_rule"),
          universeId: MARKETING_TYPO_RULE_GLOBAL_SCOPE,
          status: "candidate",
          severity: "review",
          firstSeenAt: now,
          createdBy: toSafeString(input.createdBy, 200),
          createdAt: now,
        },
        $inc: {
          occurrenceCount: 1,
        },
        $push: {
          evidence: {
            $each: [evidence],
            $slice: -25,
          },
        },
      },
      { new: true, upsert: true },
    )
    .lean();
}

function getTypoRuleIdentity(rule: Pick<MarketingTypoRuleRow, "type" | "pattern">) {
  return `${normalizeRuleType(rule.type)}\u0000${normalizeRulePattern(rule.pattern)}`;
}

function sortTypoRuleGroup(rows: MarketingTypoRuleRow[]) {
  return [...rows].sort((left, right) => {
    const globalGap =
      Number(toSafeString(right.universeId, 120) === MARKETING_TYPO_RULE_GLOBAL_SCOPE) -
      Number(toSafeString(left.universeId, 120) === MARKETING_TYPO_RULE_GLOBAL_SCOPE);
    if (globalGap) return globalGap;
    const statusGap =
      TYPO_RULE_STATUS_PRIORITY[normalizeRuleStatus(right.status)] -
      TYPO_RULE_STATUS_PRIORITY[normalizeRuleStatus(left.status)];
    if (statusGap) return statusGap;
    return toDateValue(right.updatedAt) - toDateValue(left.updatedAt);
  });
}

function mergeTypoRuleGroup(group: MarketingTypoRuleRow[]): MarketingTypoRuleRow | null {
  const sorted = sortTypoRuleGroup(group);
  const base = sorted[0];
  if (!base) return null;
  const evidence = Array.from(
    new Map(
      sorted
        .flatMap((rule) => (Array.isArray(rule.evidence) ? rule.evidence : []))
        .map((item) => [JSON.stringify(item), item]),
    ).values(),
  )
    .sort((left, right) => toDateValue(right?.detectedAt) - toDateValue(left?.detectedAt))
    .slice(0, 25);
  const channelLists = sorted.map((rule) => normalizeChannels(rule.channels));
  const channels = channelLists.some((items) => items.length === 0)
    ? []
    : Array.from(new Set(channelLists.flat()));
  const firstSeenValues = sorted.map((rule) => toDateValue(rule.firstSeenAt)).filter((value) => value > 0);
  const lastSeenValues = sorted.map((rule) => toDateValue(rule.lastSeenAt)).filter((value) => value > 0);
  const latestSeenRule = [...sorted].sort(
    (left, right) => toDateValue(right.lastSeenAt) - toDateValue(left.lastSeenAt),
  )[0];
  const latestUpdatedAt = Math.max(...sorted.map((rule) => toDateValue(rule.updatedAt)), 0);
  const earliestCreatedAt = Math.min(
    ...sorted.map((rule) => toDateValue(rule.createdAt)).filter((value) => value > 0),
  );

  return {
    ...base,
    universeId: MARKETING_TYPO_RULE_GLOBAL_SCOPE,
    type: normalizeRuleType(base.type),
    pattern: normalizeRulePattern(base.pattern),
    status: sorted
      .map((rule) => normalizeRuleStatus(rule.status))
      .sort((left, right) => TYPO_RULE_STATUS_PRIORITY[right] - TYPO_RULE_STATUS_PRIORITY[left])[0],
    severity: sorted
      .map((rule) => normalizeRuleSeverity(rule.severity))
      .sort((left, right) => TYPO_RULE_SEVERITY_PRIORITY[right] - TYPO_RULE_SEVERITY_PRIORITY[left])[0],
    expected: toStringArray(sorted.flatMap((rule) => rule.expected || []), 10, 120),
    reason: sorted.map((rule) => toSafeString(rule.reason, 500)).find(Boolean) || "",
    channels,
    occurrenceCount: sorted.reduce((sum, rule) => sum + Math.max(0, Number(rule.occurrenceCount || 0)), 0),
    firstSeenAt: firstSeenValues.length > 0 ? new Date(Math.min(...firstSeenValues)) : null,
    lastSeenAt: lastSeenValues.length > 0 ? new Date(Math.max(...lastSeenValues)) : null,
    lastSeen: latestSeenRule?.lastSeen || {},
    evidence,
    createdAt: Number.isFinite(earliestCreatedAt) ? new Date(earliestCreatedAt) : base.createdAt,
    updatedAt: latestUpdatedAt > 0 ? new Date(latestUpdatedAt) : base.updatedAt,
    meta: {
      ...(base.meta || {}),
      dictionaryScope: "global",
      effectiveMergedRuleCount: sorted.length,
    },
  } satisfies MarketingTypoRuleRow;
}

async function loadEffectiveMarketingTypoRules(params: MarketingTypoRuleQuery) {
  const model = await getMarketingTypoRuleModel();
  const rows = (await model.find({}).lean()) as unknown as MarketingTypoRuleRow[];
  const groups = new Map<string, MarketingTypoRuleRow[]>();
  for (const row of rows) {
    const identity = getTypoRuleIdentity(row);
    if (!normalizeRulePattern(row.pattern)) continue;
    groups.set(identity, [...(groups.get(identity) || []), row]);
  }

  const statuses = new Set(Array.isArray(params.status) ? params.status : params.status ? [params.status] : []);
  const severities = new Set(
    Array.isArray(params.severity) ? params.severity : params.severity ? [params.severity] : [],
  );
  const pattern = normalizeRulePattern(params.pattern);
  const channel = toSafeString(params.channel, 40);

  return Array.from(groups.values())
    .map(mergeTypoRuleGroup)
    .filter((rule): rule is MarketingTypoRuleRow => Boolean(rule))
    .filter((rule) => statuses.size === 0 || statuses.has(normalizeRuleStatus(rule.status)))
    .filter((rule) => severities.size === 0 || severities.has(normalizeRuleSeverity(rule.severity)))
    .filter((rule) => !pattern || normalizeRulePattern(rule.pattern) === pattern)
    .filter((rule) => {
      if (!channel) return true;
      const channels = normalizeChannels(rule.channels);
      return channels.length === 0 || channels.includes(channel as MarketingChannel);
    })
    .sort((left, right) => {
      const statusGap = normalizeRuleStatus(left.status).localeCompare(normalizeRuleStatus(right.status));
      if (statusGap) return statusGap;
      const occurrenceGap = Number(right.occurrenceCount || 0) - Number(left.occurrenceCount || 0);
      if (occurrenceGap) return occurrenceGap;
      return toDateValue(right.lastSeenAt || right.updatedAt) - toDateValue(left.lastSeenAt || left.updatedAt);
    });
}

export async function listMarketingTypoRules(params: MarketingTypoRuleQuery) {
  const rules = await loadEffectiveMarketingTypoRules(params);
  const limit = Math.max(1, Math.min(500, Number(params.limit || 100)));
  const page = Math.max(1, Math.floor(Number(params.page || 1)));
  return rules.slice((page - 1) * limit, page * limit);
}

export async function countMarketingTypoRules(params: MarketingTypoRuleQuery) {
  return (await loadEffectiveMarketingTypoRules(params)).length;
}

export async function findMarketingTypoRuleByIdentity(input: {
  universeId: string;
  type?: MarketingTypoRuleType | string;
  pattern: string;
  excludeRuleId?: string;
}) {
  const model = await getMarketingTypoRuleModel();
  const authorizationUniverseId = toSafeString(input.universeId, 120);
  const type = normalizeRuleType(input.type);
  const pattern = normalizeRulePattern(input.pattern);
  const excludeRuleId = toSafeString(input.excludeRuleId, 160);
  if (!authorizationUniverseId || !pattern) return null;

  const candidates = await model.find({ type }).select({ ruleId: 1, universeId: 1, type: 1, pattern: 1 }).lean();
  const excludedRule = candidates.find((candidate) => toSafeString(candidate.ruleId, 160) === excludeRuleId);
  if (excludedRule && normalizeRulePattern(excludedRule.pattern) === pattern) return null;
  return (
    candidates.find(
      (candidate) =>
        toSafeString(candidate.ruleId, 160) !== excludeRuleId && normalizeRulePattern(candidate.pattern) === pattern,
    ) || null
  );
}

const TYPO_RULE_STATUS_PRIORITY: Record<MarketingTypoRuleStatus, number> = {
  active: 4,
  candidate: 3,
  ignored: 2,
  disabled: 1,
};
const TYPO_RULE_SEVERITY_PRIORITY: Record<MarketingTypoRuleSeverity, number> = {
  blocking: 3,
  warning: 2,
  review: 1,
};

function toDateValue(value: unknown) {
  const time = value instanceof Date ? value.getTime() : new Date(String(value || "")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export async function deduplicateMarketingTypoRules(input: { universeId: string; updatedBy?: string }) {
  const model = await getMarketingTypoRuleModel();
  const authorizationUniverseId = toSafeString(input.universeId, 120);
  const emptyResult = {
    scannedCount: 0,
    duplicateGroupCount: 0,
    removedCount: 0,
    normalizedCount: 0,
    scopeMigratedCount: 0,
  };
  if (!authorizationUniverseId) return emptyResult;

  const rules = (await model.find({}).sort({ updatedAt: -1, _id: 1 }).lean()) as unknown as MarketingTypoRuleRow[];
  const groups = new Map<string, MarketingTypoRuleRow[]>();
  for (const rule of rules) {
    const key = getTypoRuleIdentity(rule);
    if (!normalizeRulePattern(rule.pattern)) continue;
    groups.set(key, [...(groups.get(key) || []), rule]);
  }

  let duplicateGroupCount = 0;
  let removedCount = 0;
  let normalizedCount = 0;
  let scopeMigratedCount = 0;
  const updatedBy = toSafeString(input.updatedBy, 200);

  for (const group of groups.values()) {
    const merged = mergeTypoRuleGroup(group);
    const sorted = sortTypoRuleGroup(group);
    const survivor = sorted[0];
    if (!survivor || !merged) continue;
    const duplicates = sorted.slice(1);
    const needsNormalization = normalizeRulePattern(survivor.pattern) !== toSafeString(survivor.pattern, 200);
    const needsScopeMigration = toSafeString(survivor.universeId, 120) !== MARKETING_TYPO_RULE_GLOBAL_SCOPE;
    if (duplicates.length === 0 && !needsNormalization && !needsScopeMigration) continue;

    const mergedSet: Record<string, unknown> = {
      universeId: MARKETING_TYPO_RULE_GLOBAL_SCOPE,
      type: merged.type,
      pattern: merged.pattern,
      status: merged.status,
      severity: merged.severity,
      expected: merged.expected,
      reason: merged.reason,
      channels: merged.channels,
      occurrenceCount: merged.occurrenceCount,
      firstSeenAt: merged.firstSeenAt,
      lastSeenAt: merged.lastSeenAt,
      lastSeen: merged.lastSeen,
      evidence: merged.evidence,
      updatedBy,
      updatedAt: new Date(),
      meta: {
        ...(merged.meta || {}),
        deduplicatedAt: new Date().toISOString(),
        mergedRuleCount: group.length,
      },
    };
    if (duplicates.length > 0) {
      duplicateGroupCount += 1;
      const removed = await model.deleteMany({ _id: { $in: duplicates.map((rule) => rule._id) } });
      removedCount += Number(removed.deletedCount || 0);
    }
    await model.updateOne({ _id: survivor._id }, { $set: mergedSet });
    if (needsNormalization) normalizedCount += 1;
    if (needsScopeMigration) scopeMigratedCount += 1;
  }

  return { scannedCount: rules.length, duplicateGroupCount, removedCount, normalizedCount, scopeMigratedCount };
}

export async function listAllActiveMarketingTypoRules(params: { universeId: string; channel?: string }) {
  if (!toSafeString(params.universeId, 120)) return [];
  return await loadEffectiveMarketingTypoRules({ status: "active", channel: params.channel });
}

export async function upsertMarketingTypoRule(input: {
  universeId: string;
  ruleId?: string;
  type?: MarketingTypoRuleType | string;
  pattern: string;
  status?: MarketingTypoRuleStatus | string;
  severity?: MarketingTypoRuleSeverity | string;
  expected?: unknown;
  reason?: string;
  channels?: unknown;
  source?: string;
  updatedBy?: string;
}) {
  const model = await getMarketingTypoRuleModel();
  const authorizationUniverseId = toSafeString(input.universeId, 120);
  const ruleId = toSafeString(input.ruleId, 160);
  const type = normalizeRuleType(input.type);
  const pattern = normalizeRulePattern(input.pattern);
  const status = normalizeRuleStatus(input.status, "active");
  const severity = normalizeRuleSeverity(input.severity, status === "active" ? "warning" : "review");
  if (!authorizationUniverseId || !pattern) return null;

  const now = new Date();
  const cond: Record<string, unknown> = ruleId
    ? { ruleId }
    : { universeId: MARKETING_TYPO_RULE_GLOBAL_SCOPE, type, pattern };
  const updatedBy = toSafeString(input.updatedBy, 200);
  const set: Record<string, unknown> = {
    type,
    pattern,
    status,
    severity,
    expected: toStringArray(input.expected, 10, 120),
    reason: toSafeString(input.reason, 500),
    channels: normalizeChannels(input.channels),
    source: toSafeString(input.source, 80) || "operator_manual",
    updatedBy,
    updatedAt: now,
  };

  if (status === "active") {
    set.approvedBy = updatedBy;
    set.approvedAt = now;
  }
  if (status === "ignored") {
    set.ignoredBy = updatedBy;
    set.ignoredAt = now;
  }
  if (status === "disabled") {
    set.disabledBy = updatedBy;
    set.disabledAt = now;
  }

  return await model
    .findOneAndUpdate(
      cond,
      {
        $set: set,
        $setOnInsert: {
          ruleId: makeId("marketing_typo_rule"),
          universeId: MARKETING_TYPO_RULE_GLOBAL_SCOPE,
          occurrenceCount: 0,
          firstSeenAt: null,
          lastSeenAt: null,
          lastSeen: {},
          evidence: [],
          createdBy: updatedBy,
          createdAt: now,
        },
      },
      { new: true, upsert: !ruleId },
    )
    .lean();
}

export async function updateMarketingTypoRuleStatus(input: {
  universeId: string;
  ruleId?: string;
  type?: MarketingTypoRuleType | string;
  pattern?: string;
  status: MarketingTypoRuleStatus | string;
  severity?: MarketingTypoRuleSeverity | string;
  expected?: unknown;
  reason?: string;
  channels?: unknown;
  updatedBy?: string;
}) {
  const model = await getMarketingTypoRuleModel();
  const authorizationUniverseId = toSafeString(input.universeId, 120);
  const ruleId = toSafeString(input.ruleId, 160);
  const pattern = normalizeRulePattern(input.pattern);
  const type = normalizeRuleType(input.type);
  const status = normalizeRuleStatus(input.status);
  const now = new Date();
  if (!authorizationUniverseId || (!ruleId && !pattern)) return null;

  let identityType = type;
  let identityPattern = pattern;
  if (ruleId) {
    const target = await model.findOne({ ruleId }).select({ type: 1, pattern: 1 }).lean();
    if (!target) return null;
    identityType = normalizeRuleType(target.type);
    identityPattern = normalizeRulePattern(target.pattern);
  }
  const identityCandidates = await model
    .find({ type: identityType })
    .select({ _id: 1, pattern: 1 })
    .lean();
  const identityIds = identityCandidates
    .filter((candidate) => normalizeRulePattern(candidate.pattern) === identityPattern)
    .map((candidate) => candidate._id);
  if (identityIds.length === 0) return null;

  const set: Record<string, unknown> = {
    status,
    updatedBy: toSafeString(input.updatedBy, 200),
    updatedAt: now,
  };
  if (input.severity) set.severity = normalizeRuleSeverity(input.severity, status === "active" ? "blocking" : "review");
  if (typeof input.expected !== "undefined") set.expected = toStringArray(input.expected, 10, 120);
  if (typeof input.reason !== "undefined") set.reason = toSafeString(input.reason, 500);
  if (typeof input.channels !== "undefined") set.channels = normalizeChannels(input.channels);
  if (status === "active") {
    set.approvedBy = toSafeString(input.updatedBy, 200);
    set.approvedAt = now;
  }
  if (status === "ignored") {
    set.ignoredBy = toSafeString(input.updatedBy, 200);
    set.ignoredAt = now;
  }
  if (status === "disabled") {
    set.disabledBy = toSafeString(input.updatedBy, 200);
    set.disabledAt = now;
  }

  await model.updateMany({ _id: { $in: identityIds } }, { $set: set });
  return await model.findOne({ _id: identityIds[0] }).lean();
}
