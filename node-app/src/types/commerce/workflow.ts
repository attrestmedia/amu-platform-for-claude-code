import type { UnknownRecord } from "utils/common/typeUtils";
import type {
  CommerceWorkflowErrorRecord,
  CommerceWorkflowLineage,
  CommerceWorkflowRunLifecycle,
  CommerceWorkflowStageRecord,
  CommerceWorkflowState,
} from "libs/server-utils/commerce/commerceWorkflowContract";

export type {
  CommerceWorkflowErrorRecord,
  CommerceWorkflowLineage,
  CommerceWorkflowRunLifecycle,
  CommerceWorkflowStageRecord,
  CommerceWorkflowStageStatus,
  CommerceWorkflowState,
} from "libs/server-utils/commerce/commerceWorkflowContract";

export interface ICommerceWorkflowRun {
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
  lastError?: CommerceWorkflowErrorRecord | UnknownRecord | null;
  cancelReason?: string;
  cancelledAt?: string | null;
  cancelledBy?: string;
  resume?: ICommerceWorkflowResumePoint;
  createdBy: string;
  updatedBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ICommerceWorkflowResumePoint {
  resumable: boolean;
  resumeStage: CommerceWorkflowState | null;
  resumeAction: "start_stage" | "retry_stage" | "await_stage";
  blockedStage: CommerceWorkflowState | null;
  lastError: CommerceWorkflowErrorRecord | null;
}
