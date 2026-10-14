/**
 * @docHint
 * @purpose PRS-006 정책 릴리스 이벤트를 멱등하게 저장하고 조회한다.
 * @process 이벤트 추가·중복 무시  evidence·최근 이벤트 조회
 * @domain legal-policy
 * @scope policy-release-storage
 */
import "server-only";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  PolicyReleaseEventSchema,
  type IPolicyReleaseEventDocument,
  type PolicyReleaseEventInput,
  type PolicyReleaseEventKind,
} from "models/legal";

const COLLECTION = "policy_release_events";

export type {
  PolicyReleaseEventActor,
  PolicyReleaseEventInput,
  PolicyReleaseEventKind,
  PolicyReleaseEventPolicyId,
  PolicyReleasePolicyId,
} from "models/legal";

export type PolicyReleaseEventView = Omit<PolicyReleaseEventInput, "expectedAt" | "observedAt"> & {
  expectedAt: string | null;
  observedAt: string;
  createdAt: string;
};

async function eventModel() {
  return await getModel<IPolicyReleaseEventDocument>(
    MONGODB_AMU_URL,
    "PolicyReleaseEvent",
    PolicyReleaseEventSchema,
    COLLECTION,
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

export async function recordPolicyReleaseEvent(input: PolicyReleaseEventInput): Promise<{ inserted: boolean }> {
  const Model = await eventModel();
  try {
    await Model.create(input);
    return { inserted: true };
  } catch (error) {
    if (isDuplicateKey(error)) return { inserted: false };
    throw error;
  }
}

export async function hasPolicyReleaseEvents(
  releaseIds: readonly string[],
  kinds: readonly PolicyReleaseEventKind[],
): Promise<readonly { releaseId: string; kind: PolicyReleaseEventKind }[]> {
  if (releaseIds.length === 0 || kinds.length === 0) return [];
  const Model = await eventModel();
  const rows = await Model.find({ releaseId: { $in: [...new Set(releaseIds)] }, kind: { $in: [...new Set(kinds)] } })
    .select({ releaseId: 1, kind: 1, _id: 0 })
    .lean<Array<{ releaseId: string; kind: PolicyReleaseEventKind }>>();
  return rows.map(({ releaseId, kind }) => ({ releaseId, kind }));
}

export async function listRecentPolicyReleaseEvents(opts: {
  limit?: number;
  kinds?: readonly PolicyReleaseEventKind[];
} = {}): Promise<readonly PolicyReleaseEventView[]> {
  if (opts.kinds && opts.kinds.length === 0) return [];
  const requestedLimit = opts.limit === undefined ? 50 : Number.isFinite(opts.limit) ? Math.trunc(opts.limit) : 50;
  const limit = Math.max(1, Math.min(200, requestedLimit));
  const query: Record<string, unknown> = opts.kinds ? { kind: { $in: [...new Set(opts.kinds)] } } : {};
  const Model = await eventModel();
  const rows = await Model.find(query).sort({ observedAt: -1 }).limit(limit).lean<IPolicyReleaseEventDocument[]>();
  return rows.map((row) => ({
    eventKey: row.eventKey,
    releaseId: row.releaseId,
    policyId: row.policyId,
    kind: row.kind,
    manifestRevision: row.manifestRevision,
    expectedAt: toIso(row.expectedAt),
    observedAt: toIso(row.observedAt) || "",
    lagMs: row.lagMs,
    observed: row.observed,
    outcome: row.outcome,
    errorCode: row.errorCode,
    detail: row.detail,
    requestId: row.requestId,
    runId: row.runId,
    actor: row.actor,
    createdAt: toIso(row.createdAt) || "",
  }));
}
