import { Schema, type Document } from "mongoose";
import type { AgeAssuranceEnvironment, AgeAssuranceOutcome } from "types/identity/ageAssurance";

export interface IAgeAssuranceStateDocument extends Document {
  uid: string;
  outcome: AgeAssuranceOutcome;
  environment: AgeAssuranceEnvironment;
  provider: "toss_cert";
  verifiedAt: Date;
  expiresAt: Date;
  attemptId: string;
}

export const AgeAssuranceStateSchema = new Schema<IAgeAssuranceStateDocument>(
  {
    uid: { type: String, required: true, trim: true },
    outcome: { type: String, required: true, enum: ["ADULT", "MINOR", "FAILED", "EXPIRED", "CANCELLED", "UNKNOWN"] },
    environment: { type: String, required: true, enum: ["test", "live"], default: "test" },
    provider: { type: String, required: true, enum: ["toss_cert"], default: "toss_cert" },
    verifiedAt: { type: Date, required: true },
    // 30일은 임시 개발값이다. PTU-Q-014와 법무 판정 전에는 공개 범위에 적용하지 않는다.
    expiresAt: { type: Date, required: true },
    attemptId: { type: String, required: true },
  },
  { collection: "age_assurance_states", strict: "throw", versionKey: false },
);

AgeAssuranceStateSchema.index(
  { uid: 1 },
  { unique: true, name: "age_assurance_state_uid_unique" },
);
