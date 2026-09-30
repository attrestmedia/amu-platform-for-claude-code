import { Schema, type Document } from "mongoose";
import {
  COMMERCE_WORKFLOW_RUN_LIFECYCLES,
  COMMERCE_WORKFLOW_STAGE_STATUSES,
  COMMERCE_WORKFLOW_STATES,
  type CommerceWorkflowLineage,
  type CommerceWorkflowRunLifecycle,
  type CommerceWorkflowStageRecord,
  type CommerceWorkflowState,
} from "libs/server-utils/commerce/commerceWorkflowContract";
import type { UnknownRecord } from "utils/common/typeUtils";

export interface ICommerceWorkflowRunDocument extends Document {
  runId: string;
  universeId: string;
  draftId: string;
  draftRevision: number;
  idempotencyKey: string;
  status: CommerceWorkflowState;
  currentStage: CommerceWorkflowState;
  lifecycle: CommerceWorkflowRunLifecycle;
  runRevision: number;
  stages: CommerceWorkflowStageRecord[];
  stageAttempts: Record<string, number>;
  lineage: CommerceWorkflowLineage;
  estimatedCost: number;
  appliedCost: number;
  lastError?: UnknownRecord | null;
  cancelReason: string;
  cancelledAt?: Date | null;
  cancelledBy: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowLineageSchema = new Schema(
  {
    modelReferenceKitIds: { type: [String], default: [] },
    inputAssetIds: { type: [String], default: [] },
    generationJobIds: { type: [String], default: [] },
    outputAssetIds: { type: [String], default: [] },
    selectedAssetIds: { type: [String], default: [] },
    publishJobId: { type: String, default: "" },
    marketingJobIds: { type: [String], default: [] },
    campaignIds: { type: [String], default: [] },
  },
  { _id: false },
);

const WorkflowStageSchema = new Schema(
  {
    stage: { type: String, enum: COMMERCE_WORKFLOW_STATES, required: true },
    status: { type: String, enum: COMMERCE_WORKFLOW_STAGE_STATUSES, required: true, default: "pending" },
    attempt: { type: Number, min: 1, max: 999, default: 1 },
    idempotencyKey: { type: String, default: "" },
    draftRevision: { type: Number, min: 0, default: 0 },
    estimatedCost: { type: Number, min: 0, default: 0 },
    appliedCost: { type: Number, min: 0, default: 0 },
    evidence: { type: WorkflowLineageSchema, default: () => ({}) },
    lastError: { type: Schema.Types.Mixed, default: null },
    startedAt: { type: String, default: "" },
    completedAt: { type: String, default: "" },
  },
  { _id: false },
);

export const CommerceWorkflowRunSchema = new Schema<ICommerceWorkflowRunDocument>(
  {
    runId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    draftId: { type: String, required: true, index: true },
    draftRevision: { type: Number, required: true, min: 1, index: true },
    idempotencyKey: { type: String, required: true, index: true },
    status: { type: String, enum: COMMERCE_WORKFLOW_STATES, required: true, default: "draft_created", index: true },
    currentStage: { type: String, enum: COMMERCE_WORKFLOW_STATES, required: true, default: "draft_created" },
    lifecycle: {
      type: String,
      enum: COMMERCE_WORKFLOW_RUN_LIFECYCLES,
      required: true,
      default: "active",
      index: true,
    },
    // 낙관적 동시성 토큰. 모든 stage 이벤트는 이 값을 CAS 조건으로 써서 잃어버린 갱신을 막는다.
    runRevision: { type: Number, required: true, min: 1, default: 1 },
    stages: { type: [WorkflowStageSchema], default: [] },
    stageAttempts: { type: Schema.Types.Mixed, default: () => ({}) },
    lineage: { type: WorkflowLineageSchema, default: () => ({}) },
    estimatedCost: { type: Number, min: 0, default: 0 },
    appliedCost: { type: Number, min: 0, default: 0 },
    lastError: { type: Schema.Types.Mixed, default: null },
    cancelReason: { type: String, default: "" },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, default: "" },
    createdBy: { type: String, required: true, index: true },
    updatedBy: { type: String, required: true, index: true },
  },
  { timestamps: true, collection: "commerce_workflow_runs" },
);

CommerceWorkflowRunSchema.index({ universeId: 1, idempotencyKey: 1 }, { unique: true });
CommerceWorkflowRunSchema.index({ universeId: 1, draftId: 1, draftRevision: 1, createdAt: -1 });
CommerceWorkflowRunSchema.index({ universeId: 1, status: 1, updatedAt: -1 });
CommerceWorkflowRunSchema.index({ universeId: 1, draftId: 1, lifecycle: 1, updatedAt: -1 });
