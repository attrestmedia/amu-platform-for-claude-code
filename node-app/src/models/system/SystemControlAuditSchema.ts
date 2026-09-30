import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

export const SYSTEM_CONTROL_AUDIT_TARGET_TYPES = ["model_catalog", "pricing_catalog", "system_flag"] as const;
export type SystemControlAuditTargetType = (typeof SYSTEM_CONTROL_AUDIT_TARGET_TYPES)[number];

export const SYSTEM_CONTROL_AUDIT_ACTION_TYPES = [
  "model_enabled_update",
  "default_model_update",
  "model_recommendation_update",
  "model_reasoning_effort_update",
  "model_admin_only_update",
  "model_status_update",
  "model_upsert",
  "model_delete",
  "pricing_update",
  "service_availability_update",
  "speech_runtime_controls_update",
  "jev_runtime_controls_update",
  "rollback",
] as const;
export type SystemControlAuditActionType = (typeof SYSTEM_CONTROL_AUDIT_ACTION_TYPES)[number];

export const SYSTEM_CONTROL_AUDIT_STATUS_TYPES = ["applied", "rolled_back"] as const;
export type SystemControlAuditStatusType = (typeof SYSTEM_CONTROL_AUDIT_STATUS_TYPES)[number];

export interface ISystemControlAuditDocument extends Document {
  auditId: string;
  requestId: string;
  targetType: SystemControlAuditTargetType;
  actionType: SystemControlAuditActionType;
  status: SystemControlAuditStatusType;
  actorId: string;
  reason: string;
  confirmPolicy: {
    type: "reason_only" | "confirm_phrase";
    phrase?: string;
  };
  beforeSnapshot: UnknownRecord;
  afterSnapshot: UnknownRecord;
  summary: string[];
  rollbackOfAuditId?: string;
  rolledBackAt?: Date | null;
  rolledBackBy?: string;
  rolledBackByAuditId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConfirmPolicySchema = new Schema(
  {
    type: { type: String, enum: ["reason_only", "confirm_phrase"], required: true },
    phrase: { type: String, default: "", trim: true },
  },
  { _id: false },
);

export const SystemControlAuditSchema = new Schema<ISystemControlAuditDocument>(
  {
    auditId: { type: String, required: true, unique: true, index: true, trim: true },
    requestId: { type: String, required: true, index: true, trim: true },
    targetType: { type: String, enum: SYSTEM_CONTROL_AUDIT_TARGET_TYPES, required: true, index: true },
    actionType: { type: String, enum: SYSTEM_CONTROL_AUDIT_ACTION_TYPES, required: true, index: true },
    status: { type: String, enum: SYSTEM_CONTROL_AUDIT_STATUS_TYPES, default: "applied", index: true },
    actorId: { type: String, required: true, index: true, trim: true },
    reason: { type: String, required: true, trim: true },
    confirmPolicy: { type: ConfirmPolicySchema, required: true },
    beforeSnapshot: { type: Schema.Types.Mixed, default: {} },
    afterSnapshot: { type: Schema.Types.Mixed, default: {} },
    summary: { type: [String], default: [] },
    rollbackOfAuditId: { type: String, default: "", index: true, trim: true },
    rolledBackAt: { type: Date, default: null },
    rolledBackBy: { type: String, default: "", trim: true },
    rolledBackByAuditId: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);
