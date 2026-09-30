import "server-only";

import crypto from "crypto";
import { MONGODB_AMU_URL, NEXTAUTH_SECRET } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  AppMagazineContentSaveSchema,
  AppMagazinePersonalizationCounterSchema,
  AppMagazineReadingProgressSchema,
  AppMagazineTopicFollowSchema,
  AppMagazineTopicSchema,
  type AppMagazineCounterKind,
  type IAppMagazineContentSaveDocument,
  type IAppMagazinePersonalizationCounterDocument,
  type IAppMagazineReadingProgressDocument,
  type IAppMagazineTopicDocument,
  type IAppMagazineTopicFollowDocument,
} from "models/magazine";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose App Magazine 관계 데이터의 App 전용 저장소
 * @process ownerUid 서버 주입 -> 콘텐츠/주제 검증 -> 상한·단조 progress 적용 -> 최소 projection 반환
 * @domain magazine-content-experience
 * @scope server-repository
 */

const COLLECTIONS = {
  saves: "app_magazine_content_saves",
  follows: "app_magazine_topic_follows",
  progress: "app_magazine_reading_progress",
  topics: "app_magazine_topics",
  counters: "app_magazine_personalization_counters",
} as const;
const COUNTER_KIND = {
  saves: "content_save",
  follows: "topic_follow",
  progress: "reading_progress",
} as const satisfies Record<string, AppMagazineCounterKind>;
const MAX_SAVES = 500;
const MAX_FOLLOWS = 100;
const MAX_PROGRESS = 100;
const CURSOR_PREFIX = "amp1";

export type ContentRef = { kind: "app_content"; contentId: string; slug: string };
export type TopicRef = { kind: "app_topic"; topicId: string; topicKey: string };
export type SaveProjection = { contentRef: ContentRef; savedAt: string };
export type FollowProjection = { topicRef: TopicRef; followedAt: string };
export type ProgressProjection = {
  contentRef: ContentRef;
  contentRevision: string;
  position: { blockId: string; progressBps: number };
  lastReadAt: string;
  completedAt?: string;
  version: number;
};
export type Page<T> = { items: T[]; nextCursor: string | null };
export type RepoError = "not_found" | "limit_reached" | "conflict" | "invalid" | "unavailable";
export type RepoResult<T> = { ok: true; data: T } | { ok: false; error: RepoError };

const iso = (value: unknown) => new Date(value as string | Date).toISOString();
const asContentRef = (value: unknown): ContentRef | null => {
  if (!value || typeof value !== "object") return null;
  const ref = value as Partial<ContentRef>;
  return ref.kind === "app_content" && typeof ref.contentId === "string" && typeof ref.slug === "string" ? ref as ContentRef : null;
};
const asTopicRef = (value: unknown): TopicRef | null => {
  if (!value || typeof value !== "object") return null;
  const ref = value as Partial<TopicRef>;
  return ref.kind === "app_topic" && typeof ref.topicId === "string" && typeof ref.topicKey === "string" ? ref as TopicRef : null;
};
function saveProjection(raw: unknown): SaveProjection | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { contentRef?: unknown; savedAt?: unknown };
  const contentRef = asContentRef(value.contentRef);
  if (!contentRef || !value.savedAt) return null;
  return { contentRef, savedAt: iso(value.savedAt) };
}
function followProjection(raw: unknown): FollowProjection | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { topicRef?: unknown; followedAt?: unknown };
  const topicRef = asTopicRef(value.topicRef);
  if (!topicRef || !value.followedAt) return null;
  return { topicRef, followedAt: iso(value.followedAt) };
}
function progressProjection(raw: unknown): ProgressProjection | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { contentRef?: unknown; contentRevision?: unknown; position?: unknown; lastReadAt?: unknown; completedAt?: unknown; version?: unknown };
  const contentRef = asContentRef(value.contentRef);
  const position = value.position as { blockId?: unknown; progressBps?: unknown } | undefined;
  if (!contentRef || typeof value.contentRevision !== "string" || !position || typeof position.blockId !== "string"
    || typeof position.progressBps !== "number" || !value.lastReadAt || typeof value.version !== "number") return null;
  return {
    contentRef,
    contentRevision: value.contentRevision,
    position: { blockId: position.blockId, progressBps: position.progressBps },
    lastReadAt: iso(value.lastReadAt),
    ...(value.completedAt ? { completedAt: iso(value.completedAt) } : {}),
    version: value.version,
  };
}
function cursorOf(value: { at: string; id: string }) {
  const payload = Buffer.from(JSON.stringify({ p: CURSOR_PREFIX, a: value.at, i: value.id }), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", NEXTAUTH_SECRET).update(payload, "utf8").digest("base64url");
  return `${payload}.${signature}`;
}
function parseCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor || cursor.length > 512) return null;
  try {
    const [payload, signature] = cursor.split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", NEXTAUTH_SECRET).update(payload, "utf8").digest("base64url");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");
    if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { p?: unknown; a?: unknown; i?: unknown };
    const at = new Date(String(raw.a || ""));
    if (raw.p !== CURSOR_PREFIX || Number.isNaN(at.getTime()) || typeof raw.i !== "string" || raw.i.length > 128) return null;
    return { at, id: raw.i };
  } catch { return null; }
}
async function savesModel() { return getModel<IAppMagazineContentSaveDocument>(MONGODB_AMU_URL, "AppMagazineContentSave", AppMagazineContentSaveSchema, COLLECTIONS.saves); }
async function followsModel() { return getModel<IAppMagazineTopicFollowDocument>(MONGODB_AMU_URL, "AppMagazineTopicFollow", AppMagazineTopicFollowSchema, COLLECTIONS.follows); }
async function progressModel() { return getModel<IAppMagazineReadingProgressDocument>(MONGODB_AMU_URL, "AppMagazineReadingProgress", AppMagazineReadingProgressSchema, COLLECTIONS.progress); }
async function topicsModel() { return getModel<IAppMagazineTopicDocument>(MONGODB_AMU_URL, "AppMagazineTopic", AppMagazineTopicSchema, COLLECTIONS.topics); }
async function countersModel() { return getModel<IAppMagazinePersonalizationCounterDocument>(MONGODB_AMU_URL, "AppMagazinePersonalizationCounter", AppMagazinePersonalizationCounterSchema, COLLECTIONS.counters); }

/**
 * 사용자+종류별 남은 개수는 카운터 문서로 원자적 처리한다.
 * reserve는 count < 최대 인 행만 $inc하므로 count→create 경쟁에서도 하드캡을 절대 초과하지 않는다.
 * seedCount는 첫 카운터 행을 만들 때 실제 관계문 수로 초기화해 과거 데이터와 드리프트하지 않게 한다.
 */
async function reserveCounterSlot(ownerUid: string, kind: AppMagazineCounterKind, max: number, seedCount: number): Promise<boolean> {
  const model = await countersModel();
  await model.updateOne({ ownerUid, kind }, { $setOnInsert: { count: seedCount } }, { upsert: true });
  const slot = await model.findOneAndUpdate({ ownerUid, kind, count: { $lt: max } }, { $inc: { count: 1 } }, { new: true }).lean();
  return Boolean(slot);
}

async function releaseCounterSlot(ownerUid: string, kind: AppMagazineCounterKind): Promise<void> {
  try {
    await (await countersModel()).updateOne({ ownerUid, kind, count: { $gt: 0 } }, { $inc: { count: -1 } });
  } catch (error) {
    logger.error(`[app-magazine-personalization] release counter failed (${kind})`, { error: error instanceof Error ? error.message : "unknown" });
  }
}

async function resetCounterKind(ownerUid: string, kind: AppMagazineCounterKind): Promise<void> {
  await (await countersModel()).updateOne({ ownerUid, kind }, { $set: { count: 0 } }, { upsert: true });
}

function fail<T>(scope: string, error: unknown): RepoResult<T> {
  logger.error(`[app-magazine-personalization] ${scope} failed`, { error: error instanceof Error ? error.message : "unknown" });
  return { ok: false, error: "unavailable" };
}

/** 콘텐츠 publish/upsert 경로에서 호출한다. topicKey/label은 App 콘텐츠가 정본이다. */
export async function ensureAppMagazineTopics(topicRefs: Array<{ topicId: string; topicKey: string; label: string }> | undefined) {
  if (!topicRefs?.length) return { ok: true as const };
  try {
    const model = await topicsModel();
    await Promise.all(topicRefs.map((topic) => model.updateOne(
      { topicId: topic.topicId },
      // retired registry 항목은 콘텐츠 재저장만으로 되살리지 않는다.
      { $set: { topicKey: topic.topicKey, label: topic.label }, $setOnInsert: { createdAt: new Date(), status: "active" } },
      { upsert: true },
    )));
    return { ok: true as const };
  } catch (error) { return fail<never>("ensure topics", error); }
}

export async function getActiveAppMagazineTopic(topicKey: string): Promise<RepoResult<{ topicId: string; topicKey: string }>> {
  try {
    const document = await (await topicsModel()).findOne({ topicKey, status: "active" }).lean();
    if (!document || typeof document.topicId !== "string") return { ok: false, error: "not_found" };
    return { ok: true, data: { topicId: document.topicId, topicKey } };
  } catch (error) { return fail("get topic", error); }
}

/** retired 주제는 새 팔로우만 막고 기존 관계의 조회·해제 식별은 유지한다. */
export async function getAppMagazineTopic(topicKey: string): Promise<RepoResult<{ topicId: string; topicKey: string }>> {
  try {
    const document = await (await topicsModel()).findOne({ topicKey }).lean();
    if (!document || typeof document.topicId !== "string") return { ok: false, error: "not_found" };
    return { ok: true, data: { topicId: document.topicId, topicKey } };
  } catch (error) { return fail("get topic", error); }
}

export async function getContentSave(ownerUid: string, contentId: string): Promise<RepoResult<SaveProjection | null>> {
  try {
    const document = await (await savesModel()).findOne({ ownerUid, "contentRef.contentId": contentId }).lean();
    return { ok: true, data: document ? saveProjection(document) : null };
  } catch (error) { return fail("get save", error); }
}

export async function putContentSave(ownerUid: string, contentRef: ContentRef): Promise<RepoResult<SaveProjection>> {
  try {
    const model = await savesModel();
    const existing = await model.findOne({ ownerUid, "contentRef.contentId": contentRef.contentId }).lean();
    if (existing) {
      const data = saveProjection(existing);
      return data ? { ok: true, data } : { ok: false, error: "unavailable" };
    }
    if (!(await reserveCounterSlot(ownerUid, COUNTER_KIND.saves, MAX_SAVES, await model.countDocuments({ ownerUid })))) {
      return { ok: false, error: "limit_reached" };
    }
    const created = await model.create({ ownerUid, contentRef, savedAt: new Date() });
    const data = saveProjection(created.toObject());
    return data ? { ok: true, data } : { ok: false, error: "unavailable" };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      await releaseCounterSlot(ownerUid, COUNTER_KIND.saves);
      const existing = await getContentSave(ownerUid, contentRef.contentId);
      return existing.ok && existing.data ? { ok: true, data: existing.data } : { ok: false, error: "unavailable" };
    }
    await releaseCounterSlot(ownerUid, COUNTER_KIND.saves);
    return fail("put save", error);
  }
}

export async function deleteContentSave(ownerUid: string, contentId: string): Promise<RepoResult<{ deleted: boolean }>> {
  try {
    const result = await (await savesModel()).deleteOne({ ownerUid, "contentRef.contentId": contentId });
    if (result.deletedCount > 0) await releaseCounterSlot(ownerUid, COUNTER_KIND.saves);
    return { ok: true, data: { deleted: result.deletedCount > 0 } };
  } catch (error) { return fail("delete save", error); }
}

export async function listContentSaves(ownerUid: string, cursor?: string, limit = 30): Promise<RepoResult<Page<SaveProjection>>> {
  const parsed = cursor ? parseCursor(cursor) : { at: null, id: null };
  if (!parsed) return { ok: false, error: "invalid" };
  try {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const query: Record<string, unknown> = { ownerUid };
    if (parsed.at && parsed.id) query.$or = [{ savedAt: { $lt: parsed.at } }, { savedAt: parsed.at, "contentRef.contentId": { $lt: parsed.id } }];
    const rows = await (await savesModel()).find(query).sort({ savedAt: -1, "contentRef.contentId": -1 }).limit(boundedLimit + 1).lean();
    const items = rows.slice(0, boundedLimit).map(saveProjection).filter((item): item is SaveProjection => Boolean(item));
    const last = items[items.length - 1];
    return { ok: true, data: { items, nextCursor: rows.length > boundedLimit && last ? cursorOf({ at: last.savedAt, id: last.contentRef.contentId }) : null } };
  } catch (error) { return fail("list saves", error); }
}

export async function getTopicFollow(ownerUid: string, topicId: string): Promise<RepoResult<FollowProjection | null>> {
  try {
    const document = await (await followsModel()).findOne({ ownerUid, "topicRef.topicId": topicId }).lean();
    return { ok: true, data: document ? followProjection(document) : null };
  } catch (error) { return fail("get follow", error); }
}

export async function putTopicFollow(ownerUid: string, topicRef: TopicRef): Promise<RepoResult<FollowProjection>> {
  try {
    const model = await followsModel();
    const existing = await model.findOne({ ownerUid, "topicRef.topicId": topicRef.topicId }).lean();
    if (existing) {
      const data = followProjection(existing);
      return data ? { ok: true, data } : { ok: false, error: "unavailable" };
    }
    if (!(await reserveCounterSlot(ownerUid, COUNTER_KIND.follows, MAX_FOLLOWS, await model.countDocuments({ ownerUid })))) {
      return { ok: false, error: "limit_reached" };
    }
    const created = await model.create({ ownerUid, topicRef, followedAt: new Date() });
    const data = followProjection(created.toObject());
    return data ? { ok: true, data } : { ok: false, error: "unavailable" };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      await releaseCounterSlot(ownerUid, COUNTER_KIND.follows);
      const existing = await getTopicFollow(ownerUid, topicRef.topicId);
      return existing.ok && existing.data ? { ok: true, data: existing.data } : { ok: false, error: "unavailable" };
    }
    await releaseCounterSlot(ownerUid, COUNTER_KIND.follows);
    return fail("put follow", error);
  }
}

export async function deleteTopicFollow(ownerUid: string, topicId: string): Promise<RepoResult<{ deleted: boolean }>> {
  try {
    const result = await (await followsModel()).deleteOne({ ownerUid, "topicRef.topicId": topicId });
    if (result.deletedCount > 0) await releaseCounterSlot(ownerUid, COUNTER_KIND.follows);
    return { ok: true, data: { deleted: result.deletedCount > 0 } };
  } catch (error) { return fail("delete follow", error); }
}

export async function listTopicFollows(ownerUid: string, cursor?: string, limit = 30): Promise<RepoResult<Page<FollowProjection>>> {
  const parsed = cursor ? parseCursor(cursor) : { at: null, id: null };
  if (!parsed) return { ok: false, error: "invalid" };
  try {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const query: Record<string, unknown> = { ownerUid };
    if (parsed.at && parsed.id) query.$or = [{ followedAt: { $lt: parsed.at } }, { followedAt: parsed.at, "topicRef.topicId": { $lt: parsed.id } }];
    const rows = await (await followsModel()).find(query).sort({ followedAt: -1, "topicRef.topicId": -1 }).limit(boundedLimit + 1).lean();
    const items = rows.slice(0, boundedLimit).map(followProjection).filter((item): item is FollowProjection => Boolean(item));
    const last = items[items.length - 1];
    return { ok: true, data: { items, nextCursor: rows.length > boundedLimit && last ? cursorOf({ at: last.followedAt, id: last.topicRef.topicId }) : null } };
  } catch (error) { return fail("list follows", error); }
}

export async function getReadingProgress(ownerUid: string, contentId: string): Promise<RepoResult<ProgressProjection | null>> {
  try {
    const document = await (await progressModel()).findOne({ ownerUid, "contentRef.contentId": contentId }).lean();
    return { ok: true, data: document ? progressProjection(document) : null };
  } catch (error) { return fail("get progress", error); }
}

export async function advanceReadingProgress(ownerUid: string, input: { contentRef: ContentRef; contentRevision: string; blockId: string; progressBps: number }): Promise<RepoResult<ProgressProjection | null>> {
  if (input.progressBps < 500) return { ok: true, data: null };
  try {
    const model = await progressModel();
    const existing = await model.findOne({ ownerUid, "contentRef.contentId": input.contentRef.contentId });
    if (existing && existing.contentRevision !== input.contentRevision) return { ok: false, error: "conflict" };
    if (existing && input.progressBps < existing.position.progressBps) {
      const data = progressProjection(existing.toObject());
      return data ? { ok: true, data } : { ok: false, error: "unavailable" };
    }
    const now = new Date();
    const complete = input.progressBps >= 9000;
    // 90% 이상은 완독 상태로 정규화해 클라이언트별 진행률 표현 차이를 없앤다.
    const storedProgressBps = complete ? 10000 : input.progressBps;

    // 기존 행은 현재 progress 조건을 포함한 단일 update로 갱신해
    // 지연된 다중 탭 요청이 더 앞선 위치를 되돌리지 못하게 한다.
    if (existing) {
      const updated = await model.findOneAndUpdate(
        {
          _id: existing._id,
          ownerUid,
          contentRevision: input.contentRevision,
          "position.progressBps": { $lte: input.progressBps },
        },
        {
          $set: {
            contentRef: input.contentRef,
            contentRevision: input.contentRevision,
            position: { blockId: input.blockId, progressBps: storedProgressBps },
            lastReadAt: now,
            ...(complete ? { completedAt: existing.completedAt || now } : {}),
          },
          $inc: { version: 1 },
        },
        { new: true },
      ).lean();
      if (!updated) {
        const latest = await model.findOne({ ownerUid, "contentRef.contentId": input.contentRef.contentId }).lean();
        if (!latest || latest.contentRevision !== input.contentRevision) return { ok: false, error: "conflict" };
        const data = progressProjection(latest);
        return data ? { ok: true, data } : { ok: false, error: "unavailable" };
      }
      const data = progressProjection(updated);
      return data ? { ok: true, data } : { ok: false, error: "unavailable" };
    }

    // 신규 콘텐츠는 원자적 카운터로 최대 100건을 엄수한다.
    if (!(await reserveCounterSlot(ownerUid, COUNTER_KIND.progress, MAX_PROGRESS, await model.countDocuments({ ownerUid })))) {
      // 단일 요청이 카운터를 소진시켰는데 다른 요청이 같은 콘텐츠를 이미 생성한 경우 idempotent 반환
      const already = await model.findOne({ ownerUid, "contentRef.contentId": input.contentRef.contentId }).lean();
      if (already) {
        const data = progressProjection(already);
        return data ? { ok: true, data } : { ok: false, error: "unavailable" };
      }
      // 최근 100건 계약: 가장 오래 읽지 않은 기록을 하나 축출해 자리를 마련한다.
      const evicted = await model.findOneAndDelete({ ownerUid }).sort({ lastReadAt: 1, "contentRef.contentId": 1 });
      if (!evicted) return { ok: false, error: "limit_reached" };
      await releaseCounterSlot(ownerUid, COUNTER_KIND.progress);
      if (!(await reserveCounterSlot(ownerUid, COUNTER_KIND.progress, MAX_PROGRESS, 0))) return { ok: false, error: "limit_reached" };
    }

    const document = new model({
      ownerUid,
      contentRef: input.contentRef,
      contentRevision: input.contentRevision,
      position: { blockId: input.blockId, progressBps: storedProgressBps },
      lastReadAt: now,
      version: 1,
    });
    if (complete) document.completedAt = document.completedAt || now;
    try {
      await document.save();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        await releaseCounterSlot(ownerUid, COUNTER_KIND.progress);
        const latest = await getReadingProgress(ownerUid, input.contentRef.contentId);
        return latest.ok && latest.data ? { ok: true, data: latest.data } : { ok: false, error: "unavailable" };
      }
      await releaseCounterSlot(ownerUid, COUNTER_KIND.progress);
      throw error;
    }
    const data = progressProjection(document.toObject());
    return data ? { ok: true, data } : { ok: false, error: "unavailable" };
  } catch (error) { return fail("advance progress", error); }
}

export async function deleteReadingProgress(ownerUid: string, contentId: string): Promise<RepoResult<{ deleted: boolean }>> {
  try {
    const result = await (await progressModel()).deleteOne({ ownerUid, "contentRef.contentId": contentId });
    if (result.deletedCount > 0) await releaseCounterSlot(ownerUid, COUNTER_KIND.progress);
    return { ok: true, data: { deleted: result.deletedCount > 0 } };
  } catch (error) { return fail("delete progress", error); }
}

export async function listReadingProgress(ownerUid: string, cursor?: string, limit = 30): Promise<RepoResult<Page<ProgressProjection>>> {
  const parsed = cursor ? parseCursor(cursor) : { at: null, id: null };
  if (!parsed) return { ok: false, error: "invalid" };
  try {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const query: Record<string, unknown> = { ownerUid };
    if (parsed.at && parsed.id) query.$or = [{ lastReadAt: { $lt: parsed.at } }, { lastReadAt: parsed.at, "contentRef.contentId": { $lt: parsed.id } }];
    const rows = await (await progressModel()).find(query).sort({ lastReadAt: -1, "contentRef.contentId": -1 }).limit(boundedLimit + 1).lean();
    const items = rows.slice(0, boundedLimit).map(progressProjection).filter((item): item is ProgressProjection => Boolean(item));
    const last = items[items.length - 1];
    return { ok: true, data: { items, nextCursor: rows.length > boundedLimit && last ? cursorOf({ at: last.lastReadAt, id: last.contentRef.contentId }) : null } };
  } catch (error) { return fail("list progress", error); }
}

export async function exportAppMagazinePersonalization(ownerUid: string) {
  try {
    const [saveRows, followRows, progressRows] = await Promise.all([
      (await savesModel()).find({ ownerUid }).sort({ savedAt: -1, "contentRef.contentId": -1 }).limit(MAX_SAVES).lean(),
      (await followsModel()).find({ ownerUid }).sort({ followedAt: -1, "topicRef.topicId": -1 }).limit(MAX_FOLLOWS).lean(),
      (await progressModel()).find({ ownerUid }).sort({ lastReadAt: -1, "contentRef.contentId": -1 }).limit(MAX_PROGRESS).lean(),
    ]);
    return {
      ok: true as const,
      data: {
        sourceSystem: "app" as const,
        saves: saveRows.map(saveProjection).filter((item): item is SaveProjection => Boolean(item)),
        topicFollows: followRows.map(followProjection).filter((item): item is FollowProjection => Boolean(item)),
        readingProgress: progressRows.map(progressProjection).filter((item): item is ProgressProjection => Boolean(item)),
      },
    };
  } catch (error) { return fail("export", error); }
}

export async function deleteAllAppMagazinePersonalization(ownerUid: string) {
  try {
    const [saves, follows, progress] = await Promise.all([
      (await savesModel()).deleteMany({ ownerUid }),
      (await followsModel()).deleteMany({ ownerUid }),
      (await progressModel()).deleteMany({ ownerUid }),
      resetCounterKind(ownerUid, COUNTER_KIND.saves),
      resetCounterKind(ownerUid, COUNTER_KIND.follows),
      resetCounterKind(ownerUid, COUNTER_KIND.progress),
    ]);
    return { ok: true as const, data: { saves: saves.deletedCount, topicFollows: follows.deletedCount, readingProgress: progress.deletedCount } };
  } catch (error) { return fail("delete all", error); }
}
