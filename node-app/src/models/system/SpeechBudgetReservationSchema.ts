import mongoose from "mongoose";
import { SPEECH_BILLING_UNIT_TYPES, type SpeechBillingUnitType } from "consts/ai/speechModel";
import { SPEECH_BUDGET_OWNERS, type SpeechBudgetOwnerType } from "consts/system/speechRuntimeControls";

export const SPEECH_BUDGET_RESERVATION_STATES = ["reserved", "settled", "released", "unknown_outcome"] as const;
export type SpeechBudgetReservationState = (typeof SPEECH_BUDGET_RESERVATION_STATES)[number];

export const SPEECH_BUDGET_RESERVATION_ACCOUNTING_STATES = ["held", "actual", "assumed_charged", "released"] as const;
export type SpeechBudgetReservationAccountingState = (typeof SPEECH_BUDGET_RESERVATION_ACCOUNTING_STATES)[number];

export interface ISpeechBudgetReservationDocument extends mongoose.Document {
  environment: string;
  reservationKey: string;
  requestHash: string;
  owner: SpeechBudgetOwnerType;
  provider: string;
  modelName: string;
  unit: SpeechBillingUnitType;
  estimatedQuantity: number;
  reservedUsd: number;
  actualUsd: number | null;
  dayKey: string;
  monthKey: string;
  state: SpeechBudgetReservationState;
  budgetAccounting: SpeechBudgetReservationAccountingState;
  reason: string | null;
  expiresAt: Date;
  resolvedAt: Date | null;
  retainUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @docHint
 * @purpose provider dispatch 전에 speech 지출 예약과 멱등 상태를 보관
 * @process reserve  settle/release/unknown terminal 전이  보존 기간 만료 정리
 * @domain system-control
 * @scope server
 */
export const SpeechBudgetReservationSchema = new mongoose.Schema<ISpeechBudgetReservationDocument>(
  {
    environment: { type: String, required: true },
    reservationKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    owner: { type: String, required: true, enum: [...SPEECH_BUDGET_OWNERS] },
    provider: { type: String, required: true, lowercase: true },
    modelName: { type: String, required: true },
    unit: { type: String, required: true, enum: [...SPEECH_BILLING_UNIT_TYPES] },
    estimatedQuantity: { type: Number, required: true, min: 0 },
    reservedUsd: { type: Number, required: true, min: 0 },
    actualUsd: { type: Number, default: null, min: 0 },
    dayKey: { type: String, required: true },
    monthKey: { type: String, required: true },
    state: { type: String, required: true, enum: [...SPEECH_BUDGET_RESERVATION_STATES] },
    budgetAccounting: { type: String, required: true, enum: [...SPEECH_BUDGET_RESERVATION_ACCOUNTING_STATES] },
    reason: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
    retainUntil: { type: Date, required: true },
  },
  { timestamps: true },
);

SpeechBudgetReservationSchema.index(
  { environment: 1, reservationKey: 1 },
  { unique: true, name: "speech_budget_reservation_key_unique" },
);
SpeechBudgetReservationSchema.index(
  { environment: 1, provider: 1, state: 1, expiresAt: 1 },
  { name: "speech_budget_reservation_sweep" },
);
SpeechBudgetReservationSchema.index({ retainUntil: 1 }, { expireAfterSeconds: 0, name: "speech_budget_reservation_ttl" });
