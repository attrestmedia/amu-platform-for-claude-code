import "server-only";

import { randomUUID } from "node:crypto";
import { getModel } from "libs/database/modelCache";
import { MONGODB_GAME_URL } from "consts/env/server";
import {
  NarrativePilotMetricSchema,
  NARRATIVE_PILOT_METRIC_VALUES,
  type INarrativePilotMetricDocument,
  type NarrativePilotMetricType,
} from "models/game";

/**
 * @docHint
 * @purpose Play 파일럿 내부 allowlist cohort 계측 (OOC-053)
 * @process allowlist metric enum  idempotencyKey dedupe  PII 차단 sanitize  관리자 대시보드 집계
 * @domain play-narrative
 * @scope server
 */

async function getPilotMetricModel() {
  return getModel<INarrativePilotMetricDocument>(
    MONGODB_GAME_URL,
    "NarrativePilotMetric",
    NarrativePilotMetricSchema,
    "narrative_pilot_metrics",
  );
}

/** detail에 저장 가능한 화이트리스트 키 — PII(이메일·이름·IP·자유 텍스트)는 저장하지 않는다 */
const ALLOWED_DETAIL_KEYS = new Set([
  "difficulty",
  "score",
  "beatId",
  "attemptIndex",
  "rarityTier",
  "speciesId",
  "archetypeId",
  "attributeId",
  "chapter",
]);

function looksLikePii(value: string) {
  return /@|\b\d{1,3}(\.\d{1,3}){3}\b/i.test(value) || value.length > 60;
}

function sanitizeDetail(detail: Record<string, unknown> | undefined) {
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(detail || {})) {
    if (!ALLOWED_DETAIL_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === "string" && value.length <= 60 && !looksLikePii(value)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/** 계측 기록 — (universeId, metric, idempotencyKey) unique로 중복 이벤트를 흡수한다. 실패해도 흐름을 막지 않는다. */
export async function recordPilotMetric(input: {
  uid: string;
  universeId: string;
  metric: NarrativePilotMetricType;
  idempotencyKey: string;
  detail?: Record<string, unknown>;
}) {
  try {
    if (!NARRATIVE_PILOT_METRIC_VALUES.includes(input.metric)) return { recorded: false };
    const idempotencyKey = String(input.idempotencyKey || "").trim().slice(0, 160);
    if (!idempotencyKey) return { recorded: false };
    const model = await getPilotMetricModel();
    await model.findOneAndUpdate(
      { universeId: input.universeId, metric: input.metric, idempotencyKey },
      {
        $setOnInsert: {
          metricId: `pm_${randomUUID().replace(/-/g, "")}`,
          uid: String(input.uid || "").trim().slice(0, 160),
          universeId: input.universeId,
          metric: input.metric,
          idempotencyKey,
          detail: sanitizeDetail(input.detail),
        },
      },
      { upsert: true, new: true },
    ).lean();
    return { recorded: true };
  } catch {
    // 계측 실패는 본래 흐름을 막지 않는다 (fail-open)
    return { recorded: false };
  }
}

export type PlayPilotDashboard = {
  cohortSize: number;
  observation: { firstAt: string | Date | null; lastAt: string | Date | null };
  metrics: Array<{ metric: string; count: number }>;
  creation: { attempts: number; retries: number; retryRate: number };
  rarityDistribution: Array<{ rarityTier: string; count: number }>;
  discovery: { attempts: number; completions: number; completionRate: number };
};

/** 관리자 대시보드 집계 — 개인 식별 필드는 반환하지 않는다 (uid 목록 미포함). */
export async function aggregatePilotDashboard(universeId: string): Promise<PlayPilotDashboard> {
  const model = await getPilotMetricModel();
  const [counts, window] = await Promise.all([
    model.aggregate([{ $match: { universeId } }, { $group: { _id: "$metric", count: { $sum: 1 } } }]),
    model.aggregate([
      { $match: { universeId } },
      { $group: { _id: null, firstAt: { $min: "$createdAt" }, lastAt: { $max: "$createdAt" }, uids: { $addToSet: "$uid" } } },
    ]),
  ]);
  const metricMap = new Map(counts.map((row) => [String(row._id), Number(row.count) || 0]));
  const attempts = metricMap.get("creation_attempt") || 0;
  const retries = metricMap.get("creation_retry") || 0;
  const discoveryAttempts = metricMap.get("discovery_attempt") || 0;
  const discoveryCompletions = metricMap.get("discovery_completed") || 0;
  const genesisModel = (await import("libs/database/game/characterGenesisRepo")).getCharacterGenesisProfileModel();
  const rarityCounts = await (await genesisModel)
    .aggregate([{ $match: { universeId } }, { $group: { _id: "$rarityTier", count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .then((rows) => rows.map((row) => ({ rarityTier: String(row._id), count: Number(row.count) || 0 })));
  const first = window[0]?.firstAt ?? null;
  const last = window[0]?.lastAt ?? null;
  return {
    cohortSize: Number(window[0]?.uids?.length || 0),
    observation: { firstAt: first, lastAt: last },
    metrics: [...metricMap.entries()].map(([metric, count]) => ({ metric, count })).sort((a, b) => b.count - a.count),
    creation: { attempts, retries, retryRate: attempts > 0 ? Number((retries / attempts).toFixed(4)) : 0 },
    rarityDistribution: rarityCounts,
    discovery: {
      attempts: discoveryAttempts,
      completions: discoveryCompletions,
      completionRate: discoveryAttempts > 0 ? Number((discoveryCompletions / discoveryAttempts).toFixed(4)) : 0,
    },
  };
}
