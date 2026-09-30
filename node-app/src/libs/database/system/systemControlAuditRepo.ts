import "server-only";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  SystemControlAuditSchema,
  type ISystemControlAuditDocument,
  type SystemControlAuditActionType,
  type SystemControlAuditStatusType,
  type SystemControlAuditTargetType,
} from "models/system";

const SYSTEM_CONTROL_AUDIT_COLLECTION = "system_control_audits";

export type SystemControlAuditRepoInput = {
  auditId: string;
  requestId: string;
  targetType: SystemControlAuditTargetType;
  actionType: SystemControlAuditActionType;
  status?: SystemControlAuditStatusType;
  actorId: string;
  reason: string;
  confirmPolicy: {
    type: "reason_only" | "confirm_phrase";
    phrase?: string;
  };
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  summary: string[];
  rollbackOfAuditId?: string;
};

async function getSystemControlAuditModel() {
  return await getModel<ISystemControlAuditDocument>(
    MONGODB_AMU_URL,
    "SystemControlAudit",
    SystemControlAuditSchema,
    SYSTEM_CONTROL_AUDIT_COLLECTION,
  );
}

export async function createSystemControlAudit(entry: SystemControlAuditRepoInput) {
  const Model = await getSystemControlAuditModel();
  const doc = await Model.create({
    auditId: entry.auditId,
    requestId: entry.requestId,
    targetType: entry.targetType,
    actionType: entry.actionType,
    status: entry.status || "applied",
    actorId: entry.actorId,
    reason: entry.reason,
    confirmPolicy: entry.confirmPolicy,
    beforeSnapshot: entry.beforeSnapshot || {},
    afterSnapshot: entry.afterSnapshot || {},
    summary: entry.summary || [],
    rollbackOfAuditId: entry.rollbackOfAuditId || "",
  });
  return doc.toObject();
}

export async function listRecentSystemControlAudits(limit = 20) {
  const Model = await getSystemControlAuditModel();
  return await Model.find({})
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.max(1, Math.min(100, Number(limit || 20))))
    .lean<ISystemControlAuditDocument[]>();
}

export async function getSystemControlAuditByAuditId(auditId: string) {
  const Model = await getSystemControlAuditModel();
  return await Model.findOne({ auditId: String(auditId || "").trim() }).lean<ISystemControlAuditDocument | null>();
}

export async function markSystemControlAuditRolledBack(args: {
  auditId: string;
  rolledBackBy: string;
  rolledBackByAuditId: string;
}) {
  const Model = await getSystemControlAuditModel();
  return await Model.findOneAndUpdate(
    { auditId: String(args.auditId || "").trim() },
    {
      $set: {
        status: "rolled_back",
        rolledBackAt: new Date(),
        rolledBackBy: String(args.rolledBackBy || "").trim(),
        rolledBackByAuditId: String(args.rolledBackByAuditId || "").trim(),
      },
    },
    { new: true, lean: true },
  );
}
