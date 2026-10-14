/**
 * @docHint
 * @purpose PRS-006 정책 릴리스 hold 상태의 저장 필드와 검증 규칙을 정의한다.
 * @process hold 입력 검증  활성·해제 상태 저장  releaseId 인덱스 제공
 * @domain legal-policy
 * @scope policy-release-storage
 */
import mongoose, { type Document } from "mongoose";
import {
  POLICY_RELEASE_POLICY_IDS,
  type PolicyReleaseEventActor,
  type PolicyReleasePolicyId,
} from "./PolicyReleaseEventSchema";

export type PolicyReleaseHoldView = {
  releaseId: string;
  active: boolean;
  reason: string;
  setBy: string;
  setAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
};

export interface IPolicyReleaseHoldDocument extends Document {
  releaseId: string;
  policyId: PolicyReleasePolicyId;
  active: boolean;
  reason: string;
  setBy: PolicyReleaseEventActor;
  setAt: Date;
  releasedBy: `admin:${string}` | null;
  releasedAt: Date | null;
}

function isPolicyReleaseActor(value: unknown) {
  return typeof value === "string" && (value === "system:policy-release-cron" || value === "migration" || (value.startsWith("admin:") && value.length > 6));
}

export const PolicyReleaseHoldSchema = new mongoose.Schema<IPolicyReleaseHoldDocument>(
  {
    releaseId: { type: String, required: true, trim: true, maxlength: 80 },
    policyId: { type: String, required: true, enum: POLICY_RELEASE_POLICY_IDS },
    active: { type: Boolean, required: true, default: true },
    reason: { type: String, required: true, maxlength: 500 },
    setBy: {
      type: String,
      required: true,
      maxlength: 160,
      validate: { validator: isPolicyReleaseActor, message: "Invalid policy release hold actor" },
    },
    setAt: { type: Date, required: true },
    releasedBy: {
      type: String,
      default: null,
      maxlength: 160,
      validate: { validator: (value: unknown) => value == null || (typeof value === "string" && value.startsWith("admin:") && value.length > 6) },
    },
    releasedAt: { type: Date, default: null },
  },
  { strict: "throw" },
);

PolicyReleaseHoldSchema.index({ releaseId: 1 }, { unique: true, name: "policy_release_hold_release_id_unique" });
PolicyReleaseHoldSchema.index({ active: 1 }, { name: "policy_release_hold_active" });
