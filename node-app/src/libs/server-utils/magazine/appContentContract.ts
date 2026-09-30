import "server-only";

import type { MagazineArticleSlot } from "./magazineEmbedContract";

/**
 * @docHint
 * @purpose App 고도화 콘텐츠(/magazine/{slug})의 계약 타입·상수 — AIR-400 설계 계약 §4의 실행 정의
 * @process 타입과 식별자 규칙을 단일 계약 파일로 제공, 검증은 appContentValidate가 수행
 * @domain magazine-content-experience
 * @scope server-contract
 */

export const APP_CONTENT_CONTRACT_TYPE = "app-magazine-content" as const;
export const APP_CONTENT_SCHEMA_VERSION = "app-content.v1" as const;
export const APP_CONTENT_SLOT_CONTRACT_VERSION = "article-experience.v2" as const;
export const APP_CONTENT_NAMESPACE = "magazine" as const;

export const APP_MAGAZINE_CANONICAL_ORIGIN = "https://allmyuniverse.com";
export const APP_MAGAZINE_CONTENT_PATH = "/magazine" as const;

export const APP_CONTENT_CURIOSITY_TYPES = [
  "mystery",
  "contradiction",
  "comparison",
  "prediction",
  "detection",
  "decision",
  "reveal",
] as const;
export type AppContentCuriosityType = (typeof APP_CONTENT_CURIOSITY_TYPES)[number];

/** 9키 — brief 정본 그대로 (publisher.ts ARTICLE_EXPERIENCE_QUALITY_EVIDENCE_KEYS와 동일) */
export const APP_CONTENT_QUALITY_KEYS = [
  "curiosity",
  "surprise",
  "evidence",
  "participation",
  "payoff",
  "utility",
  "memorability",
  "continuation",
  "voice",
] as const;
export type AppContentQualityKey = (typeof APP_CONTENT_QUALITY_KEYS)[number];

/** 커버 문법 5종 — CONTENT-INTELLIGENCE Editorial Cover System 정본 그대로 */
export const APP_CONTENT_COVER_GRAMMARS = [
  "portrait",
  "still_life",
  "conceptual",
  "documentary",
  "graphic",
] as const;
export type AppContentCoverGrammar = (typeof APP_CONTENT_COVER_GRAMMARS)[number];

export const APP_CONTENT_EXPERIENCE_LEVELS = ["story", "enhanced", "interactive"] as const;
export type AppContentExperienceLevel = (typeof APP_CONTENT_EXPERIENCE_LEVELS)[number];

export const APP_CONTENT_ROLES = ["reach", "relationship", "trust", "expansion", "conversion"] as const;
export type AppContentRole = (typeof APP_CONTENT_ROLES)[number];

export const APP_CONTENT_ARCHETYPES = [
  "make",
  "experiment",
  "mystery",
  "decision",
  "teardown",
  "simulator",
  "build",
] as const;
export type AppContentArchetype = (typeof APP_CONTENT_ARCHETYPES)[number];

/**
 * moduleType 8종 — Manifest v1 slot 계약의 실제 enum 그대로
 * (static 읽기 모듈 5종 + 동적 서비스 모듈 3종. timeline은 계약에 존재하지 않는다)
 */
export const APP_CONTENT_MODULE_TYPES = [
  "static",
  "compare",
  "reveal",
  "checklist",
  "quiz",
  "image_embed",
  "content_embed",
  "tutors_embed",
] as const;
export type AppContentModuleType = (typeof APP_CONTENT_MODULE_TYPES)[number];

/** §8 예약 slug — /magazine/ 아래 WP 유지 경로와 node sitemap 충돌 방지 */
export const APP_CONTENT_RESERVED_SLUGS = ["page", "feed", "sitemap"] as const;

export interface AppContentSourceArticleRef {
  wpPostId: number;
  wpPostSlug: string;
  relationship: "upgrade" | "related";
}

export interface AppContentCoverArtDirection {
  grammar: AppContentCoverGrammar;
  scene: string;
  tension: string;
  textPolicy: string;
}

export interface AppContentCoverReview {
  mode: "renewal";
  decision: "retain" | "replace";
  previousAssetId: string;
  criteria: string[];
  reason: string;
}

export interface AppContentCover {
  coverAssetId: string;
  heroAssetId?: string;
  coverArtDirection: AppContentCoverArtDirection;
  coverReview?: AppContentCoverReview;
  provenance?: Record<string, unknown>;
}

/** 모듈의 실체는 slots[]에만 둔다 — 블록은 배치 정보만 갖는다(§4.3) */
export type AppContentBlock =
  | { blockId: string; sectionId: string; kind: "prose"; html: string }
  | { blockId: string; sectionId: string; kind: "module"; slotId: string };

export interface AppContentEpisode {
  sectionId: string;
  curiosityType: AppContentCuriosityType;
}

export interface AppContentSeo {
  /** QA-2 규칙으로 콘텐츠 생성 시점에 확정 — upgrade+같은 태스크는 false */
  indexable: boolean;
  /** self(별도) 또는 WP 원문 — §7 canonical 규칙 */
  canonicalUrl: string;
}

/** 콘텐츠가 직접 노출하는 주제. 관계 데이터는 topicId만 보관하고 label은 콘텐츠 계약에 남긴다. */
export interface AppContentTopicRef {
  topicId: string;
  topicKey: string;
  label: string;
}

export interface AppMagazineContent {
  contractType: typeof APP_CONTENT_CONTRACT_TYPE;
  schemaVersion: typeof APP_CONTENT_SCHEMA_VERSION;
  slotContractVersion: typeof APP_CONTENT_SLOT_CONTRACT_VERSION;
  /** amu:magazine:{slug} 3분절 고정 — post_id와 다른 namespace */
  contentId: string;
  namespace: typeof APP_CONTENT_NAMESPACE;
  slug: string;
  title: string;
  seoTitle: string;
  excerpt: string;
  heroLine: string;
  coldOpen: { problem: string; scene: string; tension: string };
  body: AppContentBlock[];
  episodes: AppContentEpisode[];
  slots?: MagazineArticleSlot[];
  qualityEvidence: Record<AppContentQualityKey, string>;
  experienceLevel: AppContentExperienceLevel;
  contentRole: AppContentRole;
  primaryArchetype: AppContentArchetype;
  supportingArchetype?: string;
  primaryQuestion: string;
  topicRefs?: AppContentTopicRef[];
  cover: AppContentCover;
  sourceArticle?: AppContentSourceArticleRef;
  seo: AppContentSeo;
}

export function appMagazineContentId(slug: string): string {
  return `amu:${APP_CONTENT_NAMESPACE}:${slug}`;
}

export function appMagazineContentPath(slug: string): string {
  return `${APP_MAGAZINE_CONTENT_PATH}/${slug}`;
}
