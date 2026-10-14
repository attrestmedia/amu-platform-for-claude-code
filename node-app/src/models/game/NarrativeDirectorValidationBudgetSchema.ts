import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose Narrative Director 비운영 검증 예산의 원자적 예약·정산 저장 모델
 * @process 고정 상한 기록  provider dispatch별 예약 항목 append  실제 usage 정산 추적
 * @domain narrative-runtime.validation-budget
 * @scope database
 */

export const NARRATIVE_DIRECTOR_VALIDATION_CONSUMERS = ["chat", "relationship_proposal"] as const;
export const NARRATIVE_DIRECTOR_VALIDATION_ENTRY_OUTCOMES = ["reserved", "settled", "settlement_overrun"] as const;

export interface INarrativeDirectorValidationBudgetEntry {
  reservationId: string;
  reservedAt: Date;
  settledAt: Date | null;
  consumer: (typeof NARRATIVE_DIRECTOR_VALIDATION_CONSUMERS)[number];
  provider: string;
  model: string;
  estimatedUsd: number;
  actualUsd: number | null;
  outcome: (typeof NARRATIVE_DIRECTOR_VALIDATION_ENTRY_OUTCOMES)[number];
}

export interface INarrativeDirectorValidationBudgetDocument extends Document {
  budgetId: string;
  maxAttempts: number;
  maxTotalUsd: number;
  maxPerRequestUsd: number;
  attempts: number;
  reservedUsd: number;
  settledUsd: number;
  entries: INarrativeDirectorValidationBudgetEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const NarrativeDirectorValidationBudgetEntrySchema = new Schema<INarrativeDirectorValidationBudgetEntry>(
  {
    reservationId: { type: String, required: true },
    reservedAt: { type: Date, required: true },
    settledAt: { type: Date, default: null },
    consumer: { type: String, enum: NARRATIVE_DIRECTOR_VALIDATION_CONSUMERS, required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    estimatedUsd: { type: Number, required: true, min: 0 },
    actualUsd: { type: Number, default: null, min: 0 },
    outcome: { type: String, enum: NARRATIVE_DIRECTOR_VALIDATION_ENTRY_OUTCOMES, required: true, default: "reserved" },
  },
  { _id: false, strict: true },
);

export const NarrativeDirectorValidationBudgetSchema = new Schema<INarrativeDirectorValidationBudgetDocument>(
  {
    budgetId: { type: String, required: true, unique: true, index: true, immutable: true },
    maxAttempts: { type: Number, required: true, min: 1, immutable: true },
    maxTotalUsd: { type: Number, required: true, min: 0, immutable: true },
    maxPerRequestUsd: { type: Number, required: true, min: 0, immutable: true },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    reservedUsd: { type: Number, required: true, min: 0, default: 0 },
    settledUsd: { type: Number, required: true, min: 0, default: 0 },
    entries: { type: [NarrativeDirectorValidationBudgetEntrySchema], default: [] },
  },
  { timestamps: true, strict: true, collection: "narrative_director_validation_budgets" },
);
