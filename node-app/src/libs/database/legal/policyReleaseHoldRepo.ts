/**
 * @docHint
 * @purpose PRS-006 정책 릴리스 hold 상태와 감사 이벤트를 저장·조회한다.
 * @process 활성 hold 조회  경합 안전 설정  관리자 해제와 이벤트 기록
 * @domain legal-policy
 * @scope policy-release-storage
 */
import "server-only";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { recordPolicyReleaseEvent } from "libs/database/legal/policyReleaseEventRepo";
import {
  PolicyReleaseHoldSchema,
  type IPolicyReleaseHoldDocument,
  type PolicyReleaseEventActor,
  type PolicyReleaseHoldView,
  type PolicyReleasePolicyId,
} from "models/legal";

const HOLD_COLLECTION = "policy_release_holds";

export type { PolicyReleaseHoldView } from "models/legal";

async function holdModel() {
  return await getModel<IPolicyReleaseHoldDocument>(
    MONGODB_AMU_URL,
    "PolicyReleaseHold",
    PolicyReleaseHoldSchema,
    HOLD_COLLECTION,
  );
}

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === 11000);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toHoldView(row: IPolicyReleaseHoldDocument): PolicyReleaseHoldView {
  return {
    releaseId: row.releaseId,
    active: row.active,
    reason: row.reason,
    setBy: row.setBy,
    setAt: toIso(row.setAt) || "",
    releasedBy: row.releasedBy || null,
    releasedAt: toIso(row.releasedAt),
  };
}

export async function listActivePolicyReleaseHolds(): Promise<readonly PolicyReleaseHoldView[]> {
  const Model = await holdModel();
  const rows = await Model.find({ active: true }).sort({ setAt: -1 }).lean<IPolicyReleaseHoldDocument[]>();
  return rows.map(toHoldView);
}

export async function setPolicyReleaseHold(args: {
  releaseId: string;
  policyId: PolicyReleasePolicyId;
  reason: string;
  setBy: PolicyReleaseEventActor;
  runId?: string | null;
  manifestRevision: string | null;
}): Promise<{ changed: boolean }> {
  const Model = await holdModel();
  const observedAt = new Date();
  let changedHold: IPolicyReleaseHoldDocument | null;
  try {
    changedHold = await Model.findOneAndUpdate(
      { releaseId: args.releaseId, active: { $ne: true } },
      {
        $set: {
          releaseId: args.releaseId,
          policyId: args.policyId,
          active: true,
          reason: args.reason,
          setBy: args.setBy,
          setAt: observedAt,
          releasedBy: null,
          releasedAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<IPolicyReleaseHoldDocument | null>();
  } catch (error) {
    if (isDuplicateKey(error)) return { changed: false };
    throw error;
  }
  if (!changedHold) return { changed: false };

  const runId = args.runId ?? "manual";
  await recordPolicyReleaseEvent({
    eventKey: `${runId}:${args.releaseId}:hold_set`,
    releaseId: args.releaseId,
    policyId: args.policyId,
    kind: "hold_set",
    manifestRevision: args.manifestRevision,
    observedAt,
    outcome: "info",
    detail: args.reason,
    runId: args.runId ?? null,
    actor: args.setBy,
  });
  return { changed: true };
}

export async function releasePolicyReleaseHold(args: {
  releaseId: string;
  policyId: PolicyReleasePolicyId;
  reason: string;
  releasedBy: `admin:${string}`;
  requestId: string;
  manifestRevision: string | null;
}): Promise<{ changed: boolean }> {
  const Model = await holdModel();
  const releasedAt = new Date();
  const changedHold = await Model.findOneAndUpdate(
    { releaseId: args.releaseId, active: true },
    { $set: { active: false, releasedBy: args.releasedBy, releasedAt } },
    { new: true },
  ).lean<IPolicyReleaseHoldDocument | null>();
  if (!changedHold) return { changed: false };

  await recordPolicyReleaseEvent({
    eventKey: `${args.requestId}:${args.releaseId}:hold_released`,
    releaseId: args.releaseId,
    policyId: args.policyId,
    kind: "hold_released",
    manifestRevision: args.manifestRevision,
    observedAt: releasedAt,
    outcome: "info",
    detail: args.reason,
    requestId: args.requestId,
    actor: args.releasedBy,
  });
  return { changed: true };
}
