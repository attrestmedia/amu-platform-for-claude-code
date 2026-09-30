import mongoose from "mongoose";
import { SPEECH_BUDGET_OWNERS } from "consts/system/speechRuntimeControls";

/**
 * @docHint
 * @purpose EL-204 speech 지출 누적 집계 (일·월)
 * @process provider 호출 성공 시 $inc  상한 판정 시 조회
 * @domain system-control
 * @scope server
 *
 * **컨테이너가 여러 대여도 하나의 문서를 나눠 쓴다.** 프로세스 로컬 카운터를 두면 컨테이너 수만큼
 * 상한이 곱해진다. 그래서 집계는 DB의 원자적 `$inc`로만 올린다.
 *
 * periodKey는 소비 시점의 KST 달력 경계다. provider 측 키 quota의 리셋 주기와 경계가 다를 수 있으며
 * (EL-R18) 두 값을 합치지 않는다 — 소유자가 다르다.
 */

export interface ISpeechBudgetUsageDocument extends mongoose.Document {
  environment: string;
  owner: string;
  provider: string;
  periodType: "day" | "month";
  /** KST 기준 "YYYY-MM-DD" 또는 "YYYY-MM" */
  periodKey: string;
  spentUsd: number;
  requestCount: number;
  /** 집계 문서는 무기한 보관할 이유가 없다. TTL로 정리한다. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const SpeechBudgetUsageSchema = new mongoose.Schema<ISpeechBudgetUsageDocument>(
  {
    environment: { type: String, required: true, index: true },
    owner: { type: String, required: true, enum: [...SPEECH_BUDGET_OWNERS] },
    provider: { type: String, required: true },
    periodType: { type: String, required: true, enum: ["day", "month"] },
    periodKey: { type: String, required: true },
    spentUsd: { type: Number, required: true, default: 0, min: 0 },
    requestCount: { type: Number, required: true, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// 이 조합이 곧 집계 단위다. unique가 없으면 동시 요청이 문서를 여러 개 만들어 상한이 새어 나간다.
SpeechBudgetUsageSchema.index(
  { environment: 1, owner: 1, provider: 1, periodType: 1, periodKey: 1 },
  { unique: true, name: "speech_budget_usage_period_unique" },
);
SpeechBudgetUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "speech_budget_usage_ttl" });
