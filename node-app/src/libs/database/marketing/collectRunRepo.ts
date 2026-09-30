import "server-only";
import crypto from "crypto";
import { MONGODB_MARKETING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MarketingCollectRunSchema,
  MarketingSocialCollectSettingsSchema,
  type IMarketingCollectRunDocument,
  type IMarketingSocialCollectSettingsDocument,
  type MarketingCollectRunTrigger,
} from "models/marketing";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 소셜 성과 자동 수집 설정(universe당 1문서)과 수집 실행 기록(run) CRUD
 * @process 설정 get/upsert/enabled 목록 조회 → 크론 대상 결정 / 실행 기록 create·최신 조회 → UI 상태 카드·운영 점검에 사용
 * @domain marketing
 * @scope server
 */

const SETTINGS_COLLECTION = "marketing_social_collect_settings";
const RUN_COLLECTION = "marketing_collect_runs";

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function toSafeString(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

async function getSettingsModel() {
  return await getModel<IMarketingSocialCollectSettingsDocument>(
    MONGODB_MARKETING_URL,
    "MarketingSocialCollectSettings",
    MarketingSocialCollectSettingsSchema,
    SETTINGS_COLLECTION,
  );
}

async function getRunModel() {
  return await getModel<IMarketingCollectRunDocument>(
    MONGODB_MARKETING_URL,
    "MarketingCollectRun",
    MarketingCollectRunSchema,
    RUN_COLLECTION,
  );
}

// ---------- 수집 설정 (universe당 1문서) ----------

export async function getMarketingSocialCollectSettings(universeId: string) {
  const model = await getSettingsModel();
  return await model.findOne({ universeId: toSafeString(universeId, 120) }).lean();
}

export async function listEnabledMarketingSocialCollectSettings() {
  const model = await getSettingsModel();
  return await model.find({ enabled: true }).limit(100).lean();
}

export async function upsertMarketingSocialCollectSettings(input: {
  universeId: string;
  enabled?: boolean;
  channels?: string[];
  rollingDays?: number;
  weeklyDeepDays?: number;
  linkedinVersion?: string;
  linkedinMemberAnalyticsEnabled?: boolean;
  updatedBy?: string;
}) {
  const model = await getSettingsModel();
  const universeId = toSafeString(input.universeId, 120);
  const set: Record<string, unknown> = { updatedBy: toSafeString(input.updatedBy, 120) };
  if (typeof input.enabled === "boolean") set.enabled = input.enabled;
  if (Array.isArray(input.channels)) {
    set.channels = Array.from(new Set(input.channels.map((value) => toSafeString(value, 40)).filter(Boolean))).slice(0, 10);
  }
  if (typeof input.rollingDays !== "undefined") {
    set.rollingDays = Math.min(Math.max(Number(input.rollingDays) || 14, 1), 30);
  }
  if (typeof input.weeklyDeepDays !== "undefined") {
    set.weeklyDeepDays = Math.min(Math.max(Number(input.weeklyDeepDays) || 0, 0), 180);
  }
  if (typeof input.linkedinVersion !== "undefined") {
    // Linkedin-Version 헤더는 YYYYMM 형식만 유효 — 그 외 입력은 빈 값(기본값 사용)으로 정리한다.
    const version = toSafeString(input.linkedinVersion, 6);
    set.linkedinVersion = /^\d{6}$/.test(version) ? version : "";
  }
  if (typeof input.linkedinMemberAnalyticsEnabled === "boolean") {
    set.linkedinMemberAnalyticsEnabled = input.linkedinMemberAnalyticsEnabled;
  }

  return await model
    .findOneAndUpdate(
      { universeId },
      { $set: set, $setOnInsert: { universeId } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
    .lean();
}

// ---------- 수집 실행 기록 ----------

// 수집이 수 분 단위로 걸리므로 실행 기록은 시작 시점에 running으로 생성하고(응답은 runId만 반환),
// 백그라운드 실행이 끝날 때 finishMarketingCollectRun으로 종료 상태를 기록한다.
export async function startMarketingCollectRun(input: {
  universeId: string;
  trigger: MarketingCollectRunTrigger;
  params?: UnknownRecord;
}) {
  const model = await getRunModel();
  const doc = await model.create({
    runId: makeId("marketing_collect_run"),
    universeId: toSafeString(input.universeId, 120),
    kind: "social_performance",
    trigger: input.trigger,
    status: "running",
    startedAt: new Date(),
    params: input.params || {},
  });
  return (doc.toObject?.() ?? doc) as IMarketingCollectRunDocument;
}

export async function finishMarketingCollectRun(input: {
  runId: string;
  ok: boolean;
  result?: UnknownRecord;
  channelResults?: UnknownRecord[];
  tokenWarnings?: string[];
  error?: string;
}) {
  const model = await getRunModel();
  return await model
    .findOneAndUpdate(
      { runId: toSafeString(input.runId, 120) },
      {
        $set: {
          status: input.ok ? "completed" : "failed",
          finishedAt: new Date(),
          result: input.result || {},
          channelResults: input.channelResults || [],
          tokenWarnings: input.tokenWarnings || [],
          error: toSafeString(input.error, 2000),
        },
      },
      { new: true },
    )
    .lean();
}

// 진행 중 run 조회 — 프로세스 비정상 종료로 running에 고착된 문서가 새 실행을 막지 않도록 stale 기준을 둔다.
export async function getActiveMarketingCollectRun(universeId: string, staleMinutes = 30) {
  const model = await getRunModel();
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);
  return await model
    .findOne({
      universeId: toSafeString(universeId, 120),
      kind: "social_performance",
      status: "running",
      startedAt: { $gte: cutoff },
    })
    .sort({ startedAt: -1 })
    .lean();
}

export async function listMarketingCollectRuns(params: { universeId: string; limit?: number }) {
  const model = await getRunModel();
  const limit = Math.max(1, Math.min(50, Number(params.limit || 10)));
  return await model
    .find({ universeId: toSafeString(params.universeId, 120), kind: "social_performance" })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function getLatestMarketingCollectRun(universeId: string) {
  const runs = await listMarketingCollectRuns({ universeId, limit: 1 });
  return runs[0] || null;
}
