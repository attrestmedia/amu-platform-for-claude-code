import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  AppMagazineContentSchema,
  type AppMagazineContentSource,
  type IAppMagazineContentDocument,
} from "models/magazine";
import type { AppMagazineContent } from "./appContentContract";
import {
  appMagazineContentRevision,
  isAppContentSlug,
  validateAppMagazineContent,
} from "./appContentValidate";
import { ensureAppMagazineTopics } from "./appMagazinePersonalizationRepo";
import { buildAppMagazineContentDeclaration } from "./appContentDeclaration";
import { upsertMagazineArticleDeclaration } from "./magazineArticleDeclaration";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose App 고도화 콘텐츠(app-content.v1)의 node-app 단일 저장소
 * @process contract validation -> slug별 upsert(CAS) -> SSR·sitemap read projection
 * @domain magazine-content-experience
 * @scope server-repository
 */

const MODEL_NAME = "AppMagazineContent";
const COLLECTION_NAME = "app_magazine_contents";
const CONTRACT_FILTER = {
  contractType: "app-magazine-content" as const,
  schemaVersion: "app-content.v1" as const,
};

export type AppMagazineContentProjection = {
  content: AppMagazineContent;
  revision: string;
  source: AppMagazineContentSource;
  updatedBy: string;
  updatedAt: string;
};

export type AppMagazineContentReadResult =
  | { ok: true; data: AppMagazineContentProjection }
  | { ok: false; error: "not_found" | "unavailable" };

export type AppMagazineContentListResult =
  | { ok: true; data: AppMagazineContentProjection[] }
  | { ok: false; error: "unavailable" };

export type AppMagazineContentUpsertResult =
  | { ok: true; data: AppMagazineContentProjection; created: boolean }
  | { ok: false; error: "validation_failed"; issues: string[] }
  | { ok: false; error: "conflict" }
  | { ok: false; error: "unavailable" };

async function getContentModel() {
  return getModel<IAppMagazineContentDocument>(
    MONGODB_AMU_URL,
    MODEL_NAME,
    AppMagazineContentSchema,
    COLLECTION_NAME,
  );
}

function projection(raw: unknown): AppMagazineContentProjection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<IAppMagazineContentDocument> & { content?: unknown; updatedAt?: unknown };
  const parsed = validateAppMagazineContent(value.content);
  if (!parsed.ok || typeof value.revision !== "string" || !/^[a-f0-9]{64}$/.test(value.revision)) return null;
  if (appMagazineContentRevision(parsed.content) !== value.revision) return null;
  if (typeof value.source !== "string" || !["admin", "agent"].includes(value.source)) return null;
  if (typeof value.updatedBy !== "string" || value.updatedBy.length === 0) return null;
  const updatedAt = new Date(value.updatedAt as string | Date);
  if (Number.isNaN(updatedAt.getTime())) return null;
  return {
    content: parsed.content,
    revision: value.revision,
    source: value.source as AppMagazineContentSource,
    updatedBy: value.updatedBy,
    updatedAt: updatedAt.toISOString(),
  };
}

export async function getAppMagazineContentBySlug(slug: string): Promise<AppMagazineContentReadResult> {
  if (!isAppContentSlug(slug)) return { ok: false, error: "not_found" };
  try {
    const model = await getContentModel();
    const document = await model.findOne({ ...CONTRACT_FILTER, slug }).lean();
    const data = projection(document);
    return data ? { ok: true, data } : { ok: false, error: "not_found" };
  } catch (error) {
    logger.error("[app-magazine-content] read failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

/** /magazine/sitemap.xml 수록용 — indexable=true만 반환한다(QA-7 §9 수록 규칙). */
export async function listIndexableAppMagazineContents(limit = 200): Promise<AppMagazineContentListResult> {
  const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  try {
    const model = await getContentModel();
    const documents = await model
      .find({ ...CONTRACT_FILTER, "content.seo.indexable": true })
      .sort({ updatedAt: -1 })
      .limit(boundedLimit)
      .lean();
    const data = documents.map(projection).filter((item): item is AppMagazineContentProjection => Boolean(item));
    return { ok: true, data };
  } catch (error) {
    logger.error("[app-magazine-content] indexable list failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}


export async function upsertAppMagazineContent(input: unknown, args: {
  actor: string;
  source: AppMagazineContentSource;
  expectedRevision?: string;
}): Promise<AppMagazineContentUpsertResult> {
  const parsed = validateAppMagazineContent(input);
  if (!parsed.ok) return { ok: false, error: "validation_failed", issues: parsed.issues };
  const actor = args.actor.trim();
  if (!actor || actor === "unknown") return { ok: false, error: "validation_failed", issues: ["감사 actor를 확인할 수 없습니다."] };

  const content = parsed.content;
  const revision = appMagazineContentRevision(content);
  try {
    // topic registry는 App 콘텐츠가 노출한 topicRefs로만 활성화한다.
    const topicResult = await ensureAppMagazineTopics(content.topicRefs);
    if (!topicResult.ok) return { ok: false, error: "unavailable" };
    const model = await getContentModel();
    const existing = await model.findOne({ ...CONTRACT_FILTER, slug: content.slug });
    if (existing) {
      const revisionChanged = existing.revision !== revision;
      if (args.expectedRevision !== undefined && args.expectedRevision !== existing.revision) {
        return { ok: false, error: "conflict" };
      }
      existing.content = content;
      existing.contentId = content.contentId;
      existing.namespace = "magazine";
      existing.revision = revision;
      existing.source = args.source;
      existing.updatedBy = actor;
      await existing.save();
      const data = projection(existing.toObject());
      if (!data) return { ok: false, error: "unavailable" };
      await ensureAppContentEmbedDeclaration(content, args);
      if (revisionChanged) await invalidateNarrationAfterContentWrite(content, args.actor);
      return { ok: true, data, created: false };
    }
    const created = await model.create({
      contractType: "app-magazine-content",
      schemaVersion: "app-content.v1",
      contentId: content.contentId,
      namespace: "magazine",
      slug: content.slug,
      content,
      revision,
      source: args.source,
      updatedBy: actor,
    });
    const data = projection(created.toObject());
    if (!data) return { ok: false, error: "unavailable" };
    await ensureAppContentEmbedDeclaration(content, args);
    return { ok: true, data, created: true };
  } catch (error) {
    logger.error("[app-magazine-content] upsert failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

/** 본문 revision·비공개 전환으로 이전 public narration을 독자 노출에서 제거하고 cleanup을 시도한다. */
async function invalidateNarrationAfterContentWrite(content: AppMagazineContent, actor: string) {
  try {
    // 서비스가 appContentRepo를 읽기 때문에 정적 import 순환을 피하고 쓰기 완료 후에만 로드한다.
    // eslint-disable-next-line import/no-cycle -- write 후 cleanup만 늦게 연결해 service의 read dependency 순환을 피한다.
    const { invalidateMagazineNarrationsForContent } = await import("./magazineNarrationService");
    const result = await invalidateMagazineNarrationsForContent({
      contentRef: { kind: "app_content", contentId: content.contentId, slug: content.slug },
      actor,
      reason: content.seo.indexable ? "article_revision_changed" : "article_unpublished",
    });
    if (!result.ok) logger.warn("[app-magazine-content] narration invalidation pending", { contentId: content.contentId, error: result.error });
  } catch (error) {
    // 본문 저장은 완료됐고 SSR은 revision mismatch/indexable gate로 즉시 fail-closed한다. cleanup은 retry 가능한 pending으로 남긴다.
    logger.warn("[app-magazine-content] narration invalidation unavailable", { contentId: content.contentId, error: error instanceof Error ? error.message : "unknown" });
  }
}

/** E3 동적 모듈이 있는 App 콘텐츠는 Embed resolver가 쓸 declaration(contentRef=app_content, v2)을 함께 등록한다. */
async function ensureAppContentEmbedDeclaration(content: AppMagazineContent, args: { actor: string; source: AppMagazineContentSource }) {
  const declaration = buildAppMagazineContentDeclaration(content);
  if (!declaration) return;
  const result = await upsertMagazineArticleDeclaration(declaration, { actor: args.actor, source: args.source === "admin" ? "admin" : "agent" });
  if (!result.ok) {
    logger.warn("[app-magazine-content] embed declaration register failed", { contentId: content.contentId, error: result.error });
  }
}
