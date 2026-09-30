import "server-only";
import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingKeywordClusterSchema,
  MarketingKeywordProfileSchema,
  MarketingKeywordSettingsSchema,
  type IMarketingKeywordClusterDocument,
  type IMarketingKeywordProfileDocument,
  type IMarketingKeywordSettingsDocument,
} from "models/marketing";
import {
  DEFAULT_MARKETING_KEYWORD_CLUSTER_SEEDS,
  normalizeMarketingKeywordClusterScope,
  normalizeMarketingKeywordKey,
} from "consts/marketing/keywordCluster";
import {
  MARKETING_UPLOAD_POLICY_CHANNELS,
  normalizeMarketingUploadPolicyChannels,
} from "consts/marketing/uploadPolicy";

/**
 * @docHint
 * @purpose 네이버 키워드 전략 설정/클러스터 원장/프로필 CRUD — universe 전역 기본 + 동적 클러스터 + 프로필
 * @process 설정 upsert(단일 문서) / 클러스터 lazy seed·upsert·soft delete / 프로필 목록·단건·upsert·soft delete
 * @domain marketing
 * @scope server
 */

const SETTINGS_COLLECTION = "marketing_keyword_settings";
const CLUSTER_COLLECTION = "marketing_keyword_clusters";
const PROFILE_COLLECTION = "marketing_keyword_profiles";

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toSafeString(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function toKeywordList(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((v) => toSafeString(v, 80)).filter(Boolean))).slice(0, max);
}

function normalizeProfileKey(value: unknown): string {
  return normalizeMarketingKeywordKey(value) || "profile";
}

async function getSettingsModel() {
  return await getModel<IMarketingKeywordSettingsDocument>(
    MONGODB_MARKETING_URL,
    "MarketingKeywordSettings",
    MarketingKeywordSettingsSchema,
    SETTINGS_COLLECTION,
  );
}

async function getClusterModel() {
  return await getModel<IMarketingKeywordClusterDocument>(
    MONGODB_MARKETING_URL,
    "MarketingKeywordCluster",
    MarketingKeywordClusterSchema,
    CLUSTER_COLLECTION,
  );
}

async function getProfileModel() {
  return await getModel<IMarketingKeywordProfileDocument>(
    MONGODB_MARKETING_URL,
    "MarketingKeywordProfile",
    MarketingKeywordProfileSchema,
    PROFILE_COLLECTION,
  );
}

// ---------- 설정 (universe당 1문서) ----------

export async function getMarketingKeywordSettings(universeId: string) {
  const model = await getSettingsModel();
  return await model.findOne({ universeId: toSafeString(universeId, 120) }).lean();
}

export async function upsertMarketingKeywordSettings(input: {
  universeId: string;
  defaultAnchorKeyword?: string;
  defaultLookbackDays?: number;
  defaultTimeUnit?: "date" | "week" | "month";
  defaultDevice?: "all" | "pc" | "mo";
  marketingCriteria?: Record<string, unknown>;
  updatedBy?: string;
}) {
  const model = await getSettingsModel();
  const universeId = toSafeString(input.universeId, 120);
  const existing = input.marketingCriteria
    ? await model
        .findOne({ universeId })
        .select({ "marketingCriteria.version": 1, "marketingCriteria.uploadPolicy.version": 1 })
        .lean()
    : null;
  const set: Record<string, unknown> = { updatedBy: toSafeString(input.updatedBy, 120) };
  if (typeof input.defaultAnchorKeyword !== "undefined") {
    set.defaultAnchorKeyword = toSafeString(input.defaultAnchorKeyword, 80);
  }
  if (typeof input.defaultLookbackDays !== "undefined") {
    set.defaultLookbackDays = Math.min(Math.max(Number(input.defaultLookbackDays) || 90, 7), 730);
  }
  if (input.defaultTimeUnit) set.defaultTimeUnit = input.defaultTimeUnit;
  if (input.defaultDevice) set.defaultDevice = input.defaultDevice;
  const criteria = input.marketingCriteria;
  if (criteria) {
    const channelGuidance = criteria.channelGuidance as Record<string, unknown> | undefined;
    set["marketingCriteria.goal"] = toSafeString(criteria.goal, 1000);
    set["marketingCriteria.targetPersona"] = toSafeString(criteria.targetPersona, 1000);
    set["marketingCriteria.funnel"] = ["TOFU", "MOFU", "BOFU", "mixed"].includes(
      toSafeString(criteria.funnel, 20),
    )
      ? toSafeString(criteria.funnel, 20)
      : "mixed";
    set["marketingCriteria.primaryConversion"] = toSafeString(criteria.primaryConversion, 500);
    set["marketingCriteria.coreMessage"] = toSafeString(criteria.coreMessage, 2000);
    set["marketingCriteria.requiredTopics"] = toKeywordList(criteria.requiredTopics, 30);
    set["marketingCriteria.excludedTopics"] = toKeywordList(criteria.excludedTopics, 30);
    set["marketingCriteria.channelGuidance"] = Object.fromEntries(
      ["threads", "instagram", "linkedin", "naver_blog"].map((channel) => [
        channel,
        toSafeString(channelGuidance?.[channel], 1000),
      ]),
    );
    const uploadPolicy = criteria.uploadPolicy as Record<string, unknown> | undefined;
    const uploadPolicyChannels = (uploadPolicy?.channels || {}) as Record<string, unknown>;
    const existingUploadPolicy = existing?.marketingCriteria?.uploadPolicy as Record<string, unknown> | undefined;
    set["marketingCriteria.uploadPolicy"] = {
      timezone: "Asia/Seoul",
      version: Number(existingUploadPolicy?.version || 0) + 1,
      channels: normalizeMarketingUploadPolicyChannels(uploadPolicyChannels),
    };
    set["marketingCriteria.version"] = Number(existing?.marketingCriteria?.version || 0) + 1;
  }

  return await model
    .findOneAndUpdate(
      { universeId },
      {
        $set: set,
        $setOnInsert: { universeId },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
    .lean();
}

export async function updateMarketingUploadPolicy(input: {
  universeId: string;
  expectedVersion: number;
  channels: Record<string, unknown>;
  updatedBy?: string;
}) {
  const model = await getSettingsModel();
  const universeId = toSafeString(input.universeId, 120);
  const existing = await model
    .findOne({ universeId })
    .select({ marketingCriteria: 1 })
    .lean();

  if (!existing) return { ok: false as const, status: "not_found" as const };

  const marketingCriteria = (existing.marketingCriteria || {}) as Record<string, unknown>;
  const currentUploadPolicy = (marketingCriteria.uploadPolicy || {}) as Record<string, unknown>;
  const currentVersion = Math.max(0, Math.floor(Number(currentUploadPolicy.version) || 0));
  if (input.expectedVersion !== currentVersion) {
    return { ok: false as const, status: "version_conflict" as const, currentVersion };
  }

  const currentChannels = (currentUploadPolicy.channels || {}) as Record<string, unknown>;
  const mergedChannels = Object.fromEntries(
    MARKETING_UPLOAD_POLICY_CHANNELS.map((channel) => [
      channel,
      {
        ...((currentChannels[channel] || {}) as Record<string, unknown>),
        ...((input.channels[channel] || {}) as Record<string, unknown>),
      },
    ]),
  );
  const nextVersion = currentVersion + 1;
  const nextCriteriaVersion = Math.max(0, Math.floor(Number(marketingCriteria.version) || 0)) + 1;
  const updated = await model
    .findOneAndUpdate(
      { universeId, "marketingCriteria.uploadPolicy.version": currentVersion },
      {
        $set: {
          "marketingCriteria.uploadPolicy": {
            timezone: "Asia/Seoul",
            version: nextVersion,
            channels: normalizeMarketingUploadPolicyChannels(mergedChannels),
          },
          "marketingCriteria.version": nextCriteriaVersion,
          updatedBy: toSafeString(input.updatedBy, 120),
        },
      },
      { new: true },
    )
    .lean();

  if (!updated) return { ok: false as const, status: "version_conflict" as const, currentVersion };
  return { ok: true as const, settings: updated };
}

/** 마케팅 적합도 기준의 텍스트 필드별 저장 상한 — 스키마 maxlength와 동일하게 유지한다. */
const MARKETING_CRITERIA_TEXT_LIMITS = {
  goal: 1000,
  targetPersona: 1000,
  primaryConversion: 500,
  coreMessage: 2000,
} as const;

const MARKETING_CRITERIA_GUIDANCE_CHANNELS = ["threads", "instagram", "linkedin", "naver_blog"] as const;

/**
 * 마케팅 적합도 기준 부분 갱신(에이전트 경로).
 * 운영 UI의 "마케팅 기준 저장"은 전체 교체지만, 에이전트는 전달한 필드만 바꾼다.
 * uploadPolicy는 건드리지 않는다 — 갱신 경로가 updateMarketingUploadPolicy로 분리돼 있다.
 */
export async function updateMarketingCriteriaByAgent(input: {
  universeId: string;
  expectedVersion: number;
  criteria: Record<string, unknown>;
  updatedBy?: string;
}) {
  const model = await getSettingsModel();
  const universeId = toSafeString(input.universeId, 120);
  const existing = await model.findOne({ universeId }).select({ marketingCriteria: 1 }).lean();
  if (!existing) return { ok: false as const, status: "not_found" as const };

  const marketingCriteria = (existing.marketingCriteria || {}) as Record<string, unknown>;
  const currentVersion = Math.max(0, Math.floor(Number(marketingCriteria.version) || 0));
  if (input.expectedVersion !== currentVersion) {
    return { ok: false as const, status: "version_conflict" as const, currentVersion };
  }

  const set: Record<string, unknown> = {};
  for (const [field, max] of Object.entries(MARKETING_CRITERIA_TEXT_LIMITS)) {
    if (typeof input.criteria[field] === "undefined") continue;
    set[`marketingCriteria.${field}`] = toSafeString(input.criteria[field], max);
  }
  if (typeof input.criteria.funnel !== "undefined") {
    set["marketingCriteria.funnel"] = toSafeString(input.criteria.funnel, 20);
  }
  if (typeof input.criteria.requiredTopics !== "undefined") {
    set["marketingCriteria.requiredTopics"] = toKeywordList(input.criteria.requiredTopics, 30);
  }
  if (typeof input.criteria.excludedTopics !== "undefined") {
    set["marketingCriteria.excludedTopics"] = toKeywordList(input.criteria.excludedTopics, 30);
  }
  // 전달한 채널만 병합한다. 전체 교체하면 이번에 안 보낸 채널 지침이 빈 문자열로 유실된다.
  const channelGuidance = input.criteria.channelGuidance as Record<string, unknown> | undefined;
  if (channelGuidance) {
    const current = (marketingCriteria.channelGuidance || {}) as Record<string, unknown>;
    set["marketingCriteria.channelGuidance"] = Object.fromEntries(
      MARKETING_CRITERIA_GUIDANCE_CHANNELS.map((channel) => [
        channel,
        toSafeString(
          typeof channelGuidance[channel] === "undefined" ? current[channel] : channelGuidance[channel],
          1000,
        ),
      ]),
    );
  }

  if (!Object.keys(set).length) return { ok: false as const, status: "empty_patch" as const };

  set["marketingCriteria.version"] = currentVersion + 1;
  set.updatedBy = toSafeString(input.updatedBy, 120);

  const updated = await model
    .findOneAndUpdate({ universeId, "marketingCriteria.version": currentVersion }, { $set: set }, { new: true })
    .lean();

  if (!updated) return { ok: false as const, status: "version_conflict" as const, currentVersion };
  return { ok: true as const, settings: updated };
}

/**
 * 기본 앵커 설정 부분 갱신(에이전트 경로).
 * upsertMarketingKeywordSettings와 달리 문서를 생성하지 않는다 — 없는 유니버스에 설정을 만들지 않기 위해서다.
 * marketingCriteria는 건드리지 않으므로 criteria.version도 올리지 않는다.
 */
export async function updateMarketingKeywordSettingsByAgent(input: {
  universeId: string;
  settings: {
    defaultAnchorKeyword?: string;
    defaultLookbackDays?: number;
    defaultTimeUnit?: "date" | "week" | "month";
    defaultDevice?: "all" | "pc" | "mo";
  };
  updatedBy?: string;
}) {
  const model = await getSettingsModel();
  const universeId = toSafeString(input.universeId, 120);
  const existing = await model.findOne({ universeId }).select({ _id: 1 }).lean();
  if (!existing) return { ok: false as const, status: "not_found" as const };

  const set: Record<string, unknown> = {};
  if (typeof input.settings.defaultAnchorKeyword !== "undefined") {
    set.defaultAnchorKeyword = toSafeString(input.settings.defaultAnchorKeyword, 80);
  }
  if (typeof input.settings.defaultLookbackDays !== "undefined") {
    set.defaultLookbackDays = Math.min(Math.max(Number(input.settings.defaultLookbackDays) || 90, 7), 730);
  }
  if (input.settings.defaultTimeUnit) set.defaultTimeUnit = input.settings.defaultTimeUnit;
  if (input.settings.defaultDevice) set.defaultDevice = input.settings.defaultDevice;

  if (!Object.keys(set).length) return { ok: false as const, status: "empty_patch" as const };
  set.updatedBy = toSafeString(input.updatedBy, 120);

  const updated = await model.findOneAndUpdate({ universeId }, { $set: set }, { new: true }).lean();
  if (!updated) return { ok: false as const, status: "not_found" as const };
  return { ok: true as const, settings: updated };
}

// ---------- 클러스터 원장 ----------

/** 클러스터 목록 조회 — 비어 있으면 seed를 1회 부트스트랩(lazy seeding) */
export async function listMarketingKeywordClusters(args: { universeId: string; enabledOnly?: boolean }) {
  const model = await getClusterModel();
  const universeId = toSafeString(args.universeId, 120);
  const count = await model.countDocuments({ universeId });
  if (count === 0) {
    await model.insertMany(
      DEFAULT_MARKETING_KEYWORD_CLUSTER_SEEDS.map((seed, i) => ({
        clusterId: makeId("kwc"),
        universeId,
        clusterKey: seed.key,
        clusterScope: seed.scope,
        label: seed.label,
        description: seed.description ?? { ko: "", en: "" },
        sortOrder: i,
        enabled: true,
        status: "active",
        updatedBy: "seed",
      })),
      { ordered: false },
    );
  }
  const query: Record<string, unknown> = { universeId };
  if (args.enabledOnly) query.enabled = true;
  return await model.find(query).sort({ clusterScope: 1, sortOrder: 1, clusterKey: 1 }).lean();
}

export async function upsertMarketingKeywordCluster(input: {
  universeId: string;
  clusterKey: string;
  clusterScope?: string;
  labelKo?: string;
  labelEn?: string;
  descriptionKo?: string;
  descriptionEn?: string;
  sortOrder?: number;
  enabled?: boolean;
  updatedBy?: string;
}) {
  const model = await getClusterModel();
  const universeId = toSafeString(input.universeId, 120);
  const clusterKey = normalizeMarketingKeywordKey(input.clusterKey);
  if (!clusterKey) throw new Error("cluster_key_required");

  return await model
    .findOneAndUpdate(
      { universeId, clusterKey },
      {
        $set: {
          clusterScope: normalizeMarketingKeywordClusterScope(input.clusterScope),
          "label.ko": toSafeString(input.labelKo, 60) || clusterKey,
          "label.en": toSafeString(input.labelEn, 60),
          "description.ko": toSafeString(input.descriptionKo, 300),
          "description.en": toSafeString(input.descriptionEn, 300),
          ...(typeof input.sortOrder === "number" ? { sortOrder: input.sortOrder } : {}),
          ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
          status: "active",
          updatedBy: toSafeString(input.updatedBy, 120),
        },
        $setOnInsert: { clusterId: makeId("kwc"), universeId, clusterKey },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
    .lean();
}

/** soft delete 기본: enabled=false + status=deprecated. hard=true일 때만 실제 삭제. */
export async function deleteMarketingKeywordCluster(args: { universeId: string; clusterKey: string; hard?: boolean }) {
  const model = await getClusterModel();
  const universeId = toSafeString(args.universeId, 120);
  const clusterKey = normalizeMarketingKeywordKey(args.clusterKey);
  if (args.hard) {
    const res = await model.deleteOne({ universeId, clusterKey });
    return { deleted: res.deletedCount ?? 0, soft: false };
  }
  const doc = await model
    .findOneAndUpdate({ universeId, clusterKey }, { $set: { enabled: false, status: "deprecated" } }, { new: true })
    .lean();
  return { deleted: doc ? 1 : 0, soft: true };
}

/** 해당 클러스터를 참조 중인 활성 프로필 수 — 비활성 전 경고용 */
export async function countMarketingKeywordProfilesByCluster(args: { universeId: string; clusterKey: string }) {
  const model = await getProfileModel();
  return await model.countDocuments({
    universeId: toSafeString(args.universeId, 120),
    clusterKey: normalizeMarketingKeywordKey(args.clusterKey),
    enabled: true,
  });
}

// ---------- 키워드 프로필 ----------

export async function listMarketingKeywordProfiles(args: { universeId: string; enabledOnly?: boolean }) {
  const model = await getProfileModel();
  const query: Record<string, unknown> = { universeId: toSafeString(args.universeId, 120) };
  if (args.enabledOnly) query.enabled = true;
  return await model.find(query).sort({ clusterKey: 1, updatedAt: -1 }).lean();
}

export async function getMarketingKeywordProfile(args: { universeId: string; profileKey: string }) {
  const model = await getProfileModel();
  return await model
    .findOne({
      universeId: toSafeString(args.universeId, 120),
      profileKey: normalizeProfileKey(args.profileKey),
      enabled: true,
    })
    .lean();
}

export async function upsertMarketingKeywordProfile(input: {
  universeId: string;
  profileKey: string;
  name?: string;
  clusterKey?: string;
  clusterScope?: string;
  anchorKeyword?: string;
  seedKeywords?: unknown;
  negativeKeywords?: unknown;
  selectedKeyword?: string;
  selectedReason?: string;
  targetPersona?: string;
  campaignId?: string;
  note?: string;
  enabled?: boolean;
  ownerScope?: "global" | "universe";
  updatedBy?: string;
}) {
  const model = await getProfileModel();
  const universeId = toSafeString(input.universeId, 120);
  const profileKey = normalizeProfileKey(input.profileKey);

  // 앵커 변경 추적 — 기존 값과 달라질 때만 anchorChangedAt 갱신(지수 단절 시점 기록)
  const existing = await model.findOne({ universeId, profileKey }).lean();
  const nextAnchor = toSafeString(input.anchorKeyword, 80);
  const anchorChanged = Boolean(existing) && toSafeString(existing?.anchorKeyword, 80) !== nextAnchor;

  return await model
    .findOneAndUpdate(
      { universeId, profileKey },
      {
        $set: {
          name: toSafeString(input.name, 120) || profileKey,
          clusterKey: normalizeMarketingKeywordKey(input.clusterKey) || "ai-image",
          clusterScope: normalizeMarketingKeywordClusterScope(input.clusterScope),
          anchorKeyword: nextAnchor,
          ...(anchorChanged ? { anchorChangedAt: new Date() } : {}),
          seedKeywords: toKeywordList(input.seedKeywords),
          negativeKeywords: toKeywordList(input.negativeKeywords),
          ...(typeof input.selectedKeyword !== "undefined" ? { selectedKeyword: toSafeString(input.selectedKeyword, 80) } : {}),
          ...(typeof input.selectedReason !== "undefined" ? { selectedReason: toSafeString(input.selectedReason, 500) } : {}),
          targetPersona: toSafeString(input.targetPersona, 200),
          campaignId: toSafeString(input.campaignId, 120),
          note: toSafeString(input.note, 1000),
          ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
          ownerScope: input.ownerScope === "global" ? "global" : "universe",
          status: "active",
          updatedBy: toSafeString(input.updatedBy, 120),
        },
        $setOnInsert: { profileId: makeId("kwp"), universeId, profileKey },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
    .lean();
}

/** soft delete 기본: enabled=false + status=deprecated. hard=true일 때만 실제 삭제. */
export async function deleteMarketingKeywordProfile(args: { universeId: string; profileKey: string; hard?: boolean }) {
  const model = await getProfileModel();
  const universeId = toSafeString(args.universeId, 120);
  const profileKey = normalizeProfileKey(args.profileKey);
  if (args.hard) {
    const res = await model.deleteOne({ universeId, profileKey });
    return { deleted: res.deletedCount ?? 0, soft: false };
  }
  const doc = await model
    .findOneAndUpdate({ universeId, profileKey }, { $set: { enabled: false, status: "deprecated" } }, { new: true })
    .lean();
  return { deleted: doc ? 1 : 0, soft: true };
}
