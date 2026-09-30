import mongoose, { Schema } from "mongoose";

export type AccountDeletionRequestStatus =
  | "requested"
  | "review_required"
  | "accepted"
  | "processing"
  | "completed"
  | "failed";
export type AccountDeletionFailureStage =
  | "preflight"
  | "wordpress_identity"
  | "wordpress_suspend"
  | "wordpress_delete"
  | "doc_r2_cleanup"
  | "finalization";

export interface AccountDeletionNotification {
  eventType: string;
  messageId: string;
  enqueuedAt: Date;
  accepted: boolean;
  errorCode?: string;
}

export type AccountDeletionAuditKind = "manual_hold" | "manual_release" | "manual_retry" | "auto_failed";

export interface AccountDeletionAuditEvent {
  kind: AccountDeletionAuditKind;
  actorHash: string;
  reasonCode: string;
  errorCode?: string;
  at: Date;
}

// SES-453 최종 파기 단계 체크포인트·감사 tombstone 상태.
// 각 단계 시각은 재실행 시 이미 완료된 단계를 건너뛰는 checkpoint로 쓰인다.
export interface AccountDeletionDestructionState {
  plannedAt?: Date;
  docR2CleanedAt?: Date;
  mongoCleanedAt?: Date;
  r2CleanedAt?: Date;
  tombstoneHash?: string;
  tombstoneAt?: Date;
}

export interface IAccountDeletionRequestDocument extends mongoose.Document {
  requestId: string;
  uid: string;
  identityHash: string;
  idempotencyKey: string;
  activeKey: string;
  legacyRequestId?: string;
  source: "platform" | "magazine";
  status: AccountDeletionRequestStatus;
  reasonCode?: string;
  workflowPhase?: "awaiting_finalization";
  failedStage?: AccountDeletionFailureStage;
  retryable?: boolean;
  retryCount: number;
  nextAttemptAt?: Date | null;
  leaseOwner?: string;
  leaseUntil?: Date | null;
  lastErrorCode?: string;
  lastErrorAt?: Date | null;
  deadLetteredAt?: Date | null;
  completedAt?: Date | null;
  manualAction?: {
    kind: "hold" | "retry" | "release";
    actorHash: string;
    reasonCode: string;
    at: Date;
  };
  notifications?: AccountDeletionNotification[];
  legalHold?: {
    reasonCode: string;
    actorHash: string;
    at: Date;
  };
  auditEvents?: AccountDeletionAuditEvent[];
  destruction?: AccountDeletionDestructionState;
  stages: {
    accessBlockedAt?: Date;
    wordpressSuspendedAt?: Date;
    wordpressDeletedAt?: Date;
    personalDataCleanupAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const AccountDeletionRequestSchema = new Schema<IAccountDeletionRequestDocument>(
  {
    requestId: { type: String, required: true, unique: true },
    uid: { type: String, required: true, index: true },
    identityHash: { type: String, required: true, index: true },
    idempotencyKey: { type: String, required: true },
    activeKey: { type: String, required: true },
    legacyRequestId: { type: String },
    source: { type: String, enum: ["platform", "magazine"], required: true },
    status: {
      type: String,
      enum: ["requested", "review_required", "accepted", "processing", "completed", "failed"],
      required: true,
      index: true,
    },
    reasonCode: { type: String },
    workflowPhase: { type: String, enum: ["awaiting_finalization"] },
    failedStage: {
      type: String,
      enum: ["preflight", "wordpress_identity", "wordpress_suspend", "wordpress_delete", "doc_r2_cleanup", "finalization"],
    },
    retryable: { type: Boolean, default: false },
    retryCount: { type: Number, required: true, min: 0, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    leaseOwner: { type: String, default: undefined },
    leaseUntil: { type: Date, default: null },
    lastErrorCode: { type: String, default: undefined },
    lastErrorAt: { type: Date, default: null },
    deadLetteredAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    manualAction: {
      kind: { type: String, enum: ["hold", "retry", "release"] },
      actorHash: { type: String, match: /^[a-f0-9]{64}$/ },
      reasonCode: { type: String },
      at: { type: Date },
    },
    notifications: [
      new Schema(
        {
          eventType: { type: String, required: true },
          messageId: { type: String, required: true },
          enqueuedAt: { type: Date, required: true },
          accepted: { type: Boolean, required: true },
          errorCode: { type: String },
        },
        { _id: false },
      ),
    ],
    legalHold: {
      reasonCode: { type: String },
      actorHash: { type: String, match: /^[a-f0-9]{64}$/ },
      at: { type: Date },
    },
    auditEvents: [
      new Schema(
        {
          kind: { type: String, enum: ["manual_hold", "manual_release", "manual_retry", "auto_failed"], required: true },
          actorHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
          reasonCode: { type: String, required: true },
          errorCode: { type: String },
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
    ],
    destruction: {
      plannedAt: { type: Date },
      docR2CleanedAt: { type: Date },
      mongoCleanedAt: { type: Date },
      r2CleanedAt: { type: Date },
      tombstoneHash: { type: String },
      tombstoneAt: { type: Date },
    },
    stages: {
      accessBlockedAt: { type: Date },
      wordpressSuspendedAt: { type: Date },
      wordpressDeletedAt: { type: Date },
      personalDataCleanupAt: { type: Date },
    },
  },
  { timestamps: true, strict: true, autoIndex: false, autoCreate: false },
);

AccountDeletionRequestSchema.index({ uid: 1, createdAt: -1 });
AccountDeletionRequestSchema.index(
  { source: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);
AccountDeletionRequestSchema.index(
  { activeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      activeKey: { $type: "string" },
      status: { $in: ["requested", "review_required", "accepted", "processing", "failed"] },
    },
  },
);
AccountDeletionRequestSchema.index(
  { source: 1, legacyRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: { legacyRequestId: { $type: "string" } },
  },
);
AccountDeletionRequestSchema.index(
  { status: 1, nextAttemptAt: 1, leaseUntil: 1, updatedAt: 1 },
  { name: "account_deletion_worker_claim" },
);
