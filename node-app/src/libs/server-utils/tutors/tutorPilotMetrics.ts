import "server-only";

import { randomUUID } from "node:crypto";
import { getModel } from "libs/database/modelCache";
import { MONGODB_GAME_URL } from "consts/env/server";
import {
  NarrativePilotMetricSchema,
  type INarrativePilotMetricDocument,
} from "models/game";
import { TUTORS_MEASUREMENT_SAFE_DETAIL_KEYS, TUTORS_NEW_MEASUREMENT_EVENTS } from "consts/tutorsMeasurement";
import type { Model } from "mongoose";

/**
 * @docHint
 * @purpose Tutors 파일럿 내부 allowlist cohort 계측 (OOC-063)
 * @process allowlist metric enum  idempotencyKey dedupe  PII 차단 sanitize  학습 guardrail·관리자 대시보드 집계
 * @domain tutors-narrative
 * @scope server
 */

export const TUTOR_PILOT_METRIC_VALUES = [
  "learning_completion",
  "correction_quality",
  "narrative_continuation",
  "opt_out",
  "magazine_return",
  // 저장 enum 호환 — 기존 Voice 파일럿 metric 값은 데이터 읽기·검증을 위해 유지한다.
  "voice_playback_start",
  "voice_playback_failure",
  "voice_text_only_fallback",
  "voice_latency_bucket",
  // TUTORS-200-D3 — 서버 원장 allowlist만 확장하며 발화 배선은 만들지 않는다.
  ...TUTORS_NEW_MEASUREMENT_EVENTS,
] as const;

export type TutorPilotMetricType = (typeof TUTOR_PILOT_METRIC_VALUES)[number];

async function getTutorPilotMetricModel(): Promise<Model<INarrativePilotMetricDocument>> {
  return getModel<INarrativePilotMetricDocument>(
    MONGODB_GAME_URL,
    "NarrativePilotMetric",
    NarrativePilotMetricSchema,
    "narrative_pilot_metrics",
  );
}

/** detail 저장 화이트리스트 — 학습 계측에 필요한 최소 키만. PII(이메일·이름·IP·자유 텍스트)는 저장하지 않는다. */
const ALLOWED_DETAIL_KEYS = new Set([
  "mode",
  "sessionState",
  "passed",
  "corrected",
  "score",
  "beatId",
  "reason",
  "attemptIndex",
  ...TUTORS_MEASUREMENT_SAFE_DETAIL_KEYS,
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

/** Tutors 계측 기록 — (universeId, metric, idempotencyKey) unique로 중복 이벤트를 흡수한다. 실패해도 학습 흐름을 막지 않는다. */
export async function recordTutorPilotMetric(input: {
  uid: string;
  universeId: string;
  metric: TutorPilotMetricType;
  idempotencyKey: string;
  detail?: Record<string, unknown>;
}) {
  try {
    if (!TUTOR_PILOT_METRIC_VALUES.includes(input.metric)) return { recorded: false };
    const idempotencyKey = String(input.idempotencyKey || "").trim().slice(0, 160);
    if (!idempotencyKey) return { recorded: false };
    const model = await getTutorPilotMetricModel();
    await model
      .findOneAndUpdate(
        { universeId: input.universeId, metric: input.metric, idempotencyKey },
        {
          $setOnInsert: {
            metricId: `tpm_${randomUUID().replace(/-/g, "")}`,
            uid: String(input.uid || "").trim().slice(0, 160),
            universeId: input.universeId,
            metric: input.metric,
            idempotencyKey,
            detail: sanitizeDetail(input.detail),
          },
        },
        { upsert: true, new: true },
      )
      .lean();
    return { recorded: true };
  } catch {
    // 계측 실패는 본래 학습 흐름을 막지 않는다 (fail-open)
    return { recorded: false };
  }
}

/** 학습 guardrail 기본 임계값 — narrative-on cohort가 off cohort보다 완료율이 threshold 이상 낮으면 서사 자동 중단을 권고한다. */
export const TUTOR_LEARNING_GUARDRAIL = {
  minSample: 10,
  degradationThreshold: 0.15,
} as const;

export type TutorLearningGuardrail = {
  degradation: boolean;
  recommendPauseNarrative: boolean;
  narrativeOn: { samples: number; completions: number; completionRate: number };
  narrativeOff: { samples: number; completions: number; completionRate: number };
  threshold: number;
  minSample: number;
  reason: string;
};

/**
 * 학습 성과 비열화 guardrail (OOC-063).
 * learning_completion 계측을 narrative on(guided/immersive) / off 두 집단으로 나눠 완료율을 비교한다.
 * 두 집단 모두 최소 표본을 채웠고 on 완료율이 off 완료율보다 threshold 이상 낮으면 서사 자동 중단을 권고한다.
 */
export async function evaluateTutorLearningGuardrail(
  universeId: string,
  options?: { minSample?: number; threshold?: number },
): Promise<TutorLearningGuardrail> {
  const minSample = options?.minSample ?? TUTOR_LEARNING_GUARDRAIL.minSample;
  const threshold = options?.threshold ?? TUTOR_LEARNING_GUARDRAIL.degradationThreshold;
  const model = await getTutorPilotMetricModel();
  const rows = await model
    .aggregate<{ _id: string; samples: number; completions: number }>([
      { $match: { universeId, metric: "learning_completion" } },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$detail.mode", "off"] }, "off", "on"] },
          samples: { $sum: 1 },
          completions: { $sum: { $cond: [{ $eq: ["$detail.passed", true] }, 1, 0] } },
        },
      },
    ])
    .then((result) =>
      result.map((row) => ({ _id: String(row._id), samples: Number(row.samples) || 0, completions: Number(row.completions) || 0 })),
    );
  const byMode = new Map(rows.map((row) => [row._id, row]));
  const narrativeOn = byMode.get("on") || { samples: 0, completions: 0 };
  const narrativeOff = byMode.get("off") || { samples: 0, completions: 0 };
  const onRate = narrativeOn.samples > 0 ? narrativeOn.completions / narrativeOn.samples : 0;
  const offRate = narrativeOff.samples > 0 ? narrativeOff.completions / narrativeOff.samples : 0;
  const sufficient = narrativeOn.samples >= minSample && narrativeOff.samples >= minSample;
  const degradation = sufficient && onRate < offRate - threshold;
  return {
    degradation,
    recommendPauseNarrative: degradation,
    narrativeOn: {
      samples: narrativeOn.samples,
      completions: narrativeOn.completions,
      completionRate: Number(onRate.toFixed(4)),
    },
    narrativeOff: {
      samples: narrativeOff.samples,
      completions: narrativeOff.completions,
      completionRate: Number(offRate.toFixed(4)),
    },
    threshold,
    minSample,
    reason: degradation
      ? "narrative_on_learning_degradation"
      : !sufficient
        ? "insufficient_sample_for_guardrail"
        : "no_degradation_detected",
  };
}

export type TutorPilotDashboard = {
  cohortSize: number;
  observation: { firstAt: string | Date | null; lastAt: string | Date | null };
  metrics: Array<{ metric: string; count: number }>;
  learning: {
    completions: number;
    completionRate: number;
    byMode: Array<{ mode: string; samples: number; completions: number; completionRate: number }>;
  };
  correction: { corrections: number; qualityRate: number };
  narrative: { continuations: number; optOuts: number };
  guardrail: TutorLearningGuardrail;
};

/** 관리자 대시보드 집계 — 개인 식별 필드는 반환하지 않는다 (uid 목록 미포함). */
export async function aggregateTutorPilotDashboard(universeId: string): Promise<TutorPilotDashboard> {
  const model = await getTutorPilotMetricModel();
  const [counts, window, learningRows, correctionRows] = await Promise.all([
    model.aggregate([{ $match: { universeId } }, { $group: { _id: "$metric", count: { $sum: 1 } } }]),
    model.aggregate([
      { $match: { universeId } },
      { $group: { _id: null, firstAt: { $min: "$createdAt" }, lastAt: { $max: "$createdAt" }, uids: { $addToSet: "$uid" } } },
    ]),
    model.aggregate([
      { $match: { universeId, metric: "learning_completion" } },
      {
        $group: {
          _id: "$detail.mode",
          samples: { $sum: 1 },
          completions: { $sum: { $cond: [{ $eq: ["$detail.passed", true] }, 1, 0] } },
        },
      },
    ]),
    model.aggregate([
      { $match: { universeId, metric: "correction_quality" } },
      {
        $group: {
          _id: null,
          corrections: { $sum: 1 },
          corrected: { $sum: { $cond: [{ $eq: ["$detail.corrected", true] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const metricMap = new Map(counts.map((row) => [String(row._id), Number(row.count) || 0]));
  const byMode = learningRows.map((row) => {
    const mode = String(row._id ?? "unknown");
    const samples = Number(row.samples) || 0;
    const completions = Number(row.completions) || 0;
    return { mode, samples, completions, completionRate: samples > 0 ? Number((completions / samples).toFixed(4)) : 0 };
  });
  const totalSamples = byMode.reduce((acc, row) => acc + row.samples, 0);
  const totalCompletions = byMode.reduce((acc, row) => acc + row.completions, 0);
  const correctionTotal = Number(correctionRows[0]?.corrections || 0);
  const correctionCorrected = Number(correctionRows[0]?.corrected || 0);

  return {
    cohortSize: Number(window[0]?.uids?.length || 0),
    observation: { firstAt: window[0]?.firstAt ?? null, lastAt: window[0]?.lastAt ?? null },
    metrics: [...metricMap.entries()].map(([metric, count]) => ({ metric, count })).sort((a, b) => b.count - a.count),
    learning: {
      completions: totalCompletions,
      completionRate: totalSamples > 0 ? Number((totalCompletions / totalSamples).toFixed(4)) : 0,
      byMode,
    },
    correction: {
      corrections: correctionTotal,
      qualityRate: correctionTotal > 0 ? Number((correctionCorrected / correctionTotal).toFixed(4)) : 0,
    },
    narrative: {
      continuations: metricMap.get("narrative_continuation") || 0,
      optOuts: metricMap.get("opt_out") || 0,
    },
    guardrail: await evaluateTutorLearningGuardrail(universeId),
  };
}
