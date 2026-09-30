import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MagazineRenewalLogSchema,
  type IMagazineRenewalLogDocument,
} from "models/magazine";
import {
  MAGAZINE_RENEWAL_CONTRACT_TYPE,
  MAGAZINE_RENEWAL_SCHEMA_VERSION,
  type MagazineRenewalLog,
} from "./magazineRenewalContract";
import { validateMagazineRenewalLog } from "./magazineRenewalValidate";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 리뉴얼 이력 flat 로그의 node-app 저장소 — postId 멱등·발행 once-only 게이트 (MIR-201)
 * @process contract validation -> postId 기준 upsert(/rewind 금지) -> published 전환 once-only -> read projection
 * @domain magazine-renewal-log
 * @scope server-repository
 *
 * 상태 로그는 재시작 제어가 아니라 '모델·프롬프트별 성과 분석'을 남기는 것이 목적이다(thread §12).
 * 다축 상태 기계·임대·하트비트·데드레터·기대 리비전(동시성 제어) 같은 동시성 제약은 만들지 않는다(미채택 항목).
 * 멱등 보장은 ① postId unique 인덱스 ② published 전환의 `status !== published` 조건 갱신 ③ published 재지정 거부로 구성한다.
 */

const MODEL_NAME = "MagazineRenewalLog";
const COLLECTION_NAME = "magazine_renewal_log";

const FILTER = {
  contractType: MAGAZINE_RENEWAL_CONTRACT_TYPE,
  schemaVersion: MAGAZINE_RENEWAL_SCHEMA_VERSION,
} as const;

const SOURCE_VALUES = ["admin", "agent"] as const;

export type MagazineRenewalProjection = {
  log: MagazineRenewalLog;
  source: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MagazineRenewalReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: "not_found" | "unavailable" };

export type MagazineRenewalListResult<T> =
  | { ok: true; data: T[] }
  | { ok: false; error: "unavailable" };

export type MagazineRenewalWriteResult<T> =
  | { ok: true; data: T; created: boolean }
  | { ok: false; error: "validation_failed"; issues: string[] }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "already_published" }
  | { ok: false; error: "unavailable" };

async function getRenewalModel() {
  return getModel<IMagazineRenewalLogDocument>(MONGODB_AMU_URL, MODEL_NAME, MagazineRenewalLogSchema, COLLECTION_NAME);
}

function renewalProjection(raw: unknown): MagazineRenewalProjection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const parsed = validateMagazineRenewalLog(value.log);
  if (!parsed.ok) return null;
  if (typeof value.source !== "string" || !SOURCE_VALUES.includes(value.source as (typeof SOURCE_VALUES)[number])) return null;
  if (typeof value.updatedBy !== "string" || !value.updatedBy.trim()) return null;
  const createdAt = new Date(value.createdAt as string | Date);
  const updatedAt = new Date(value.updatedAt as string | Date);
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) return null;
  // 저장 후 계약이 바뀌었으면 조용히 낡은 값을 서빙하지 않는다.
  return {
    log: parsed.log,
    source: value.source as string,
    updatedBy: value.updatedBy as string,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function actorOrNull(actor: string): string | null {
  const trimmed = actor.trim();
  return !trimmed || trimmed === "unknown" ? null : trimmed;
}

function sourceOrNull(source: unknown): (typeof SOURCE_VALUES)[number] | null {
  return typeof source === "string" && SOURCE_VALUES.includes(source as (typeof SOURCE_VALUES)[number])
    ? (source as (typeof SOURCE_VALUES)[number])
    : null;
}

function filterByPostId(postId: number): Record<string, unknown> {
  return { ...FILTER, postId };
}

function logUpdate(value: MagazineRenewalLog, source: string, actor: string): Record<string, unknown> {
  return {
    $set: {
      ...FILTER,
      renewalId: value.renewalId,
      postId: value.postId,
      contentId: value.contentId,
      status: value.status,
      aiModel: value.aiModel,
      log: value,
      source,
      updatedBy: actor,
    },
  };
}

/** 발행 전환은 `status !== published` 조건에서만 성공한다 — 같은 postId의 중복 발행을 원자적으로 막는다. */
function publishGuardFilter(postId: number): Record<string, unknown> {
  return { ...filterByPostId(postId), status: { $ne: "published" } };
}

export async function getMagazineRenewalByPostId(postId: number): Promise<MagazineRenewalReadResult<MagazineRenewalProjection>> {
  try {
    const model = await getRenewalModel();
    const data = renewalProjection(await model.findOne(filterByPostId(postId)).lean());
    return data ? { ok: true, data } : { ok: false, error: "not_found" };
  } catch (error) {
    logger.error("[magazine-renewal] read failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function isMagazineRenewalPublished(postId: number): Promise<boolean> {
  const result = await getMagazineRenewalByPostId(postId);
  return result.ok && result.data.log.status === "published";
}

export async function listMagazineRenewalLogs(args: { status?: MagazineRenewalLog["status"]; aiModel?: string; limit?: number; afterPostId?: number } = {}): Promise<MagazineRenewalListResult<MagazineRenewalProjection>> {
  const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));
  const filter: Record<string, unknown> = { ...FILTER };
  if (args.status) filter.status = args.status;
  if (args.aiModel?.trim()) filter.aiModel = args.aiModel.trim();
  if (args.afterPostId !== undefined && Number.isInteger(args.afterPostId) && args.afterPostId > 0) filter.postId = { $gt: args.afterPostId };
  try {
    const model = await getRenewalModel();
    const documents = await model.find(filter).sort({ postId: 1 }).limit(limit).lean();
    const data = documents.map(renewalProjection).filter((item): item is MagazineRenewalProjection => Boolean(item));
    return { ok: true, data };
  } catch (error) {
    logger.error("[magazine-renewal] list failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function upsertMagazineRenewalLog(input: unknown, args: { actor: string; source: "admin" | "agent" }): Promise<MagazineRenewalWriteResult<MagazineRenewalProjection>> {
  const parsed = validateMagazineRenewalLog(input);
  if (!parsed.ok) return { ok: false, error: "validation_failed", issues: parsed.issues };
  const actor = actorOrNull(args.actor);
  const source = sourceOrNull(args.source);
  if (!actor || !source) return { ok: false, error: "validation_failed", issues: ["감사 actor·source를 확인할 수 없습니다."] };

  const log = parsed.log;
  const postId = log.postId;
  const write = logUpdate(log, source, actor);

  try {
    const model = await getRenewalModel();

    // 발행 전환 — `status !== published` 조건에서만 성공한다. 같은 postId의 중복 발행을 원자적으로 막는다(멱등).
    if (log.status === "published") {
      const updateResult = await model.updateOne(publishGuardFilter(postId), write, { runValidators: true });
      if (updateResult.matchedCount === 1) {
        const saved = renewalProjection(await model.findOne(filterByPostId(postId)).lean());
        if (!saved) return { ok: false, error: "unavailable" };
        logger.info("[magazine-renewal] published (once-only guard)", { postId, slug: log.targetSlug, aiModel: log.aiModel });
        return { ok: true, data: saved, created: false };
      }
      // 조건 매치 실패 — 이미 발행됐거나, 아직 이력이 없는 postId다.
      const existing = await model.findOne(filterByPostId(postId)).lean();
      if (!existing) return { ok: false, error: "not_found" };
      if (existing.status === "published") return { ok: false, error: "already_published" };
      return { ok: false, error: "unavailable" };
    }

    // 발행 전 상태 — 이미 발행 확정된 post를 되돌리지 않는다(rewind 금지).
    const existing = await model.findOne(filterByPostId(postId)).lean();
    if (existing && existing.status === "published") return { ok: false, error: "already_published" };
    const result = await model.updateOne(filterByPostId(postId), write, { upsert: true, runValidators: true });
    const saved = renewalProjection(await model.findOne(filterByPostId(postId)).lean());
    if (!saved) return { ok: false, error: "unavailable" };
    logger.info("[magazine-renewal] upserted", { postId, status: log.status, created: result.upsertedCount === 1 });
    return { ok: true, data: saved, created: result.upsertedCount === 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/E11000|duplicate key/i.test(message)) return { ok: false, error: "already_published" };
    logger.error("[magazine-renewal] upsert failed", { error: message });
    return { ok: false, error: "unavailable" };
  }
}
