/**
 * @docHint
 * @purpose PRS-006 정책 릴리스 이벤트의 저장 필드와 검증 규칙을 정의한다.
 * @process 이벤트 입력 검증  엄격한 스키마 적용  조회 인덱스 제공
 * @domain legal-policy
 * @scope policy-release-storage
 */
import mongoose, { type Document } from "mongoose";

export const POLICY_RELEASE_POLICY_IDS = ["terms-of-service", "privacy-policy", "refund-return-policy"] as const;
export type PolicyReleasePolicyId = (typeof POLICY_RELEASE_POLICY_IDS)[number];
export const POLICY_RELEASE_RUN_SCOPE = "-" as const;
export type PolicyReleaseEventPolicyId = PolicyReleasePolicyId | typeof POLICY_RELEASE_RUN_SCOPE;

export const POLICY_RELEASE_EVENT_KINDS = [
  "deployed_observed",
  "notice_observed",
  "activation_observed",
  "mismatch",
  "hold_set",
  "hold_released",
  "run_failed",
] as const;
export type PolicyReleaseEventKind = (typeof POLICY_RELEASE_EVENT_KINDS)[number];

export type PolicyReleaseEventActor = "system:policy-release-cron" | `admin:${string}` | "migration";

export type PolicyReleaseObservation = {
  releaseId: string | null;
  sha: string | null;
};

export type PolicyReleaseEventObserved = {
  node?: PolicyReleaseObservation;
  wpRest?: PolicyReleaseObservation;
  wpPublic?: PolicyReleaseObservation & { httpStatus: number | null };
};

export type PolicyReleaseEventInput = {
  eventKey: string;
  releaseId: string;
  policyId: PolicyReleaseEventPolicyId;
  kind: PolicyReleaseEventKind;
  manifestRevision: string | null;
  expectedAt?: Date | null;
  observedAt: Date;
  lagMs?: number | null;
  observed?: PolicyReleaseEventObserved;
  outcome: "ok" | "mismatch" | "failed" | "info";
  errorCode?: string | null;
  detail?: string | null;
  requestId?: string | null;
  runId?: string | null;
  actor: PolicyReleaseEventActor;
};

export interface IPolicyReleaseEventDocument extends Document, PolicyReleaseEventInput {
  createdAt: Date;
}

const ObservationSchema = new mongoose.Schema(
  {
    releaseId: { type: String, default: null, maxlength: 80 },
    sha: { type: String, default: null, maxlength: 64 },
  },
  { _id: false, strict: "throw" },
);

const PublicObservationSchema = new mongoose.Schema(
  {
    releaseId: { type: String, default: null, maxlength: 80 },
    sha: { type: String, default: null, maxlength: 64 },
    httpStatus: { type: Number, default: null, min: 100, max: 599 },
  },
  { _id: false, strict: "throw" },
);

const EventObservedSchema = new mongoose.Schema(
  {
    node: { type: ObservationSchema, default: undefined },
    wpRest: { type: ObservationSchema, default: undefined },
    wpPublic: { type: PublicObservationSchema, default: undefined },
  },
  { _id: false, strict: "throw" },
);

function isPolicyReleaseActor(value: unknown) {
  return typeof value === "string" && (value === "system:policy-release-cron" || value === "migration" || (value.startsWith("admin:") && value.length > 6));
}

export const PolicyReleaseEventSchema = new mongoose.Schema<IPolicyReleaseEventDocument>(
  {
    eventKey: { type: String, required: true, trim: true, maxlength: 300 },
    releaseId: { type: String, required: true, trim: true, maxlength: 80 },
    policyId: { type: String, required: true, enum: [...POLICY_RELEASE_POLICY_IDS, POLICY_RELEASE_RUN_SCOPE] },
    kind: { type: String, required: true, enum: POLICY_RELEASE_EVENT_KINDS },
    manifestRevision: { type: String, default: null, maxlength: 64 },
    expectedAt: { type: Date, default: null },
    observedAt: { type: Date, required: true },
    lagMs: { type: Number, default: null, min: 0 },
    observed: { type: EventObservedSchema, default: undefined },
    outcome: { type: String, required: true, enum: ["ok", "mismatch", "failed", "info"] },
    errorCode: { type: String, default: null, trim: true, maxlength: 80 },
    detail: { type: String, default: null, maxlength: 500 },
    requestId: { type: String, default: null, trim: true, maxlength: 128 },
    runId: { type: String, default: null, trim: true, maxlength: 128 },
    actor: {
      type: String,
      required: true,
      maxlength: 160,
      validate: { validator: isPolicyReleaseActor, message: "Invalid policy release event actor" },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" },
);

PolicyReleaseEventSchema.index({ eventKey: 1 }, { unique: true, name: "policy_release_event_key_unique" });
PolicyReleaseEventSchema.index({ releaseId: 1, kind: 1 }, { name: "policy_release_event_release_kind" });
PolicyReleaseEventSchema.index({ observedAt: -1 }, { name: "policy_release_event_observed_at" });
