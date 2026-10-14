import { Schema, type Document } from "mongoose";
import type { AgeAssuranceAttemptStatus, AgeAssuranceEnvironment, AgeAssuranceOutcome } from "types/identity/ageAssurance";

export interface IAgeAssuranceAttemptDocument extends Document {
  uid: string;
  txId: string;
  nonce: string;
  status: AgeAssuranceAttemptStatus;
  environment: AgeAssuranceEnvironment;
  requestedAt: Date;
  expiresAt: Date;
  resultFetchedAt?: Date;
  outcome?: AgeAssuranceOutcome;
  consumed: boolean;
}

export const AgeAssuranceAttemptSchema = new Schema<IAgeAssuranceAttemptDocument>(
  {
    uid: { type: String, required: true, trim: true, index: true },
    txId: { type: String, required: true, trim: true },
    nonce: { type: String, required: true, select: false },
    status: { type: String, required: true, enum: ["requested", "completed", "failed", "expired"], default: "requested" },
    environment: { type: String, required: true, enum: ["test", "live"], default: "test" },
    requestedAt: { type: Date, required: true, index: true },
    expiresAt: { type: Date, required: true },
    resultFetchedAt: { type: Date },
    outcome: { type: String, enum: ["ADULT", "MINOR", "FAILED", "EXPIRED", "CANCELLED", "UNKNOWN"] },
    consumed: { type: Boolean, required: true, default: false },
  },
  { collection: "age_assurance_attempts", strict: "throw", versionKey: false },
);

AgeAssuranceAttemptSchema.index(
  { txId: 1 },
  { unique: true, name: "age_assurance_attempt_tx_id_unique" },
);
AgeAssuranceAttemptSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 86400, name: "age_assurance_attempt_expiry_ttl" },
);
