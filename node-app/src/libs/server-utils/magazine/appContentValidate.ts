import "server-only";

import crypto from "crypto";

import {
  APP_CONTENT_ARCHETYPES,
  APP_CONTENT_CONTRACT_TYPE,
  APP_CONTENT_COVER_GRAMMARS,
  APP_CONTENT_CURIOSITY_TYPES,
  APP_CONTENT_EXPERIENCE_LEVELS,
  APP_CONTENT_MODULE_TYPES,
  APP_CONTENT_NAMESPACE,
  APP_CONTENT_QUALITY_KEYS,
  APP_CONTENT_RESERVED_SLUGS,
  APP_CONTENT_ROLES,
  APP_CONTENT_SCHEMA_VERSION,
  APP_CONTENT_SLOT_CONTRACT_VERSION,
  appMagazineContentId,
  type AppContentCover,
  type AppMagazineContent,
} from "./appContentContract";
import { validateSlot } from "./magazineEmbedContract";

/**
 * @docHint
 * @purpose App 고도화 콘텐츠(app-content.v1) 저장 전 검증·살균·revision 계약
 * @process fail-closed 검증 -> prose 살균 -> revision 해시 (AIR-400 §4 기준)
 * @domain magazine-content-experience
 * @scope server-contract
 */

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const WP_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,199}$/;
const STATIC_APP_CONTENT_MODULES = ["static", "compare", "reveal", "checklist", "quiz"] as const;
const DYNAMIC_APP_CONTENT_MODULES: readonly string[] = APP_CONTENT_MODULE_TYPES.filter(
  (moduleType): moduleType is (typeof APP_CONTENT_MODULE_TYPES)[number] => !(STATIC_APP_CONTENT_MODULES as readonly string[]).includes(moduleType),
);

const PAIRED_FORBIDDEN_ELEMENT_PATTERN = /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const FORBIDDEN_TAG_PATTERN = /<\/?\s*(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi;
const EVENT_HANDLER_ATTR_PATTERN = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const FORBIDDEN_URL_PATTERN = /javascript\s*:|data\s*:\s*text\/html/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

/** §4.7 — 저장 시점 prose 살균. 살균 후에도 금지 패턴이 남으면 null 반환(거부). */
export function sanitizeProseHtml(html: string): string | null {
  const cleaned = html
    .replace(PAIRED_FORBIDDEN_ELEMENT_PATTERN, "")
    .replace(FORBIDDEN_TAG_PATTERN, "")
    .replace(EVENT_HANDLER_ATTR_PATTERN, " ");
  if (FORBIDDEN_URL_PATTERN.test(cleaned)) return null;
  return cleaned;
}

export function isAppContentSlug(value: unknown): value is string {
  return (
    typeof value === "string"
    && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)
    && value.length >= 1
    // contentId(amu:magazine:{slug})가 128자 식별자 한도를 넘지 않도록 한다.
    && value.length <= 115
    && !(APP_CONTENT_RESERVED_SLUGS as readonly string[]).includes(value)
  );
}

export type AppContentValidationResult =
  | { ok: true; content: AppMagazineContent }
  | { ok: false; reasonCode: "app_content_invalid"; issues: string[] };

function validateCover(value: unknown, relationship: "upgrade" | "related" | undefined, issues: string[]): value is AppContentCover {
  if (!isRecord(value)) {
    issues.push("cover 블록이 필요합니다.");
    return false;
  }
  let valid = true;
  if (typeof value.coverAssetId !== "string" || !IDENTIFIER_PATTERN.test(value.coverAssetId)) {
    issues.push("cover.coverAssetId 식별자 규격을 만족하지 않습니다.");
    valid = false;
  }
  if (value.heroAssetId !== undefined) {
    if (typeof value.heroAssetId !== "string" || !IDENTIFIER_PATTERN.test(value.heroAssetId)) {
      issues.push("cover.heroAssetId 식별자 규격을 만족하지 않습니다.");
      valid = false;
    } else if (value.heroAssetId === value.coverAssetId) {
      issues.push("커버와 Hero는 서로 다른 asset이어야 합니다.");
      valid = false;
    }
  }
  const art = value.coverArtDirection;
  if (!isRecord(art)) {
    issues.push("cover.coverArtDirection{grammar,scene,tension,textPolicy} 4개 전부 필요합니다.");
    valid = false;
  } else {
    const grammars = APP_CONTENT_COVER_GRAMMARS as readonly string[];
    if (typeof art.grammar !== "string" || !grammars.includes(art.grammar)) {
      issues.push("coverArtDirection.grammar는 커버 문법 5종 중 하나여야 합니다.");
      valid = false;
    }
    for (const key of ["scene", "tension", "textPolicy"]) {
      if (!safeText(art[key], 2000)) {
        issues.push(`coverArtDirection.${key}은(는) 필수이며 2000자 이하여야 합니다.`);
        valid = false;
      }
    }
  }
  if (relationship === "upgrade") {
    const review = value.coverReview;
    if (!isRecord(review)) {
      issues.push("relationship=upgrade 콘텐츠에는 coverReview(리뉴얼 판정)가 필수입니다.");
      valid = false;
    } else {
      if (review.mode !== "renewal") {
        issues.push("coverReview.mode는 renewal이어야 합니다.");
        valid = false;
      }
      if (review.decision !== "retain" && review.decision !== "replace") {
        issues.push("coverReview.decision은 retain|replace 중 하나여야 합니다.");
        valid = false;
      }
      if (typeof review.previousAssetId !== "string" || !IDENTIFIER_PATTERN.test(review.previousAssetId)) {
        issues.push("coverReview.previousAssetId 식별자 규격을 만족하지 않습니다.");
        valid = false;
      }
      if (!Array.isArray(review.criteria) || review.criteria.length < 1 || review.criteria.length > 8 || !review.criteria.every((item) => safeText(item, 1000))) {
        issues.push("coverReview.criteria는 1개 이상 8개 이하의 판정 근거여야 합니다.");
        valid = false;
      }
      if (!safeText(review.reason, 4000)) {
        issues.push("coverReview.reason은 필수이며 4000자 이하여야 합니다.");
        valid = false;
      }
    }
  }
  if (value.provenance !== undefined && !isRecord(value.provenance)) {
    issues.push("cover.provenance는 객체여야 합니다.");
    valid = false;
  }
  return valid;
}

function validateBodyAndBindings(
  value: Record<string, unknown>,
  slotIds: Set<string>,
  issues: string[],
): Set<string> | null {
  const rawBody = value.body;
  if (!Array.isArray(rawBody) || rawBody.length < 1 || rawBody.length > 64) {
    issues.push("body는 1개 이상 64개 이하의 블록 배열이어야 합니다.");
    return null;
  }
  const blockIds = new Set<string>();
  const sectionOrder: string[] = [];
  for (const raw of rawBody) {
    if (!isRecord(raw)) {
      issues.push("body 블록은 객체여야 합니다.");
      return null;
    }
    const blockId = raw.blockId;
    const sectionId = raw.sectionId;
    if (typeof blockId !== "string" || !IDENTIFIER_PATTERN.test(blockId) || blockIds.has(blockId)) {
      issues.push("body 블록의 blockId는 문서 안에서 유일한 식별자여야 합니다.");
      return null;
    }
    blockIds.add(blockId);
    if (typeof sectionId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(sectionId)) {
      issues.push("body 블록의 sectionId 규격을 만족하지 않습니다.");
      return null;
    }
    if (sectionOrder[sectionOrder.length - 1] !== sectionId) {
      if (sectionOrder.includes(sectionId)) {
        issues.push("같은 sectionId의 블록은 연속된 묶음이어야 합니다(§4.3 규칙 1).");
        return null;
      }
      sectionOrder.push(sectionId);
    }
    if (raw.kind === "prose") {
      if (typeof raw.html !== "string" || raw.html.trim().length === 0 || raw.html.length > 50000) {
        issues.push(`prose 블록(${blockId})의 html은 1~50000자 문자열이어야 합니다.`);
        return null;
      }
      if (sanitizeProseHtml(raw.html) === null) {
        issues.push(`prose 블록(${blockId})의 html이 살균 후에도 금지 요소(script·iframe·form·javascript: 등)를 포함합니다.`);
        return null;
      }
      continue;
    }
    if (raw.kind === "module") {
      if (typeof raw.slotId !== "string" || !slotIds.has(raw.slotId)) {
        issues.push(`module 블록(${blockId})의 slotId가 slots[]에 없습니다.`);
        return null;
      }
      continue;
    }
    issues.push("body 블록의 kind는 prose|module 중 하나여야 합니다.");
    return null;
  }
  return new Set(sectionOrder);
}

function validateSlots(value: Record<string, unknown>, issues: string[]): Set<string> | null {
  const rawSlots = value.slots;
  if (rawSlots === undefined) return new Set();
  if (!Array.isArray(rawSlots) || rawSlots.length < 1 || rawSlots.length > 3) {
    issues.push("slots는 1~3개만 허용됩니다.");
    return null;
  }
  const slotIds = new Set<string>();
  let primaryCount = 0;
  for (const raw of rawSlots) {
    const parsed = validateSlot(raw);
    if (!parsed.ok) {
      issues.push(`slot이 Manifest v1 slot 계약을 만족하지 않습니다(${parsed.reasonCode}).`);
      return null;
    }
    if (slotIds.has(parsed.slot.slotId)) {
      issues.push("slotId는 문서 안에서 유일해야 합니다.");
      return null;
    }
    slotIds.add(parsed.slot.slotId);
    if (parsed.slot.interactionRole === "primary") primaryCount += 1;
  }
  if (primaryCount !== 1) {
    issues.push("slots 중 interactionRole=primary는 정확히 1개여야 합니다.");
    return null;
  }
  return slotIds;
}


export function validateAppMagazineContent(value: unknown): AppContentValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, reasonCode: "app_content_invalid", issues: ["입력이 객체가 아닙니다."] };

  const required = [
    "contractType", "schemaVersion", "slotContractVersion", "contentId", "namespace", "slug",
    "title", "seoTitle", "excerpt", "heroLine", "coldOpen", "body", "episodes", "qualityEvidence",
    "experienceLevel", "contentRole", "primaryArchetype", "primaryQuestion", "cover", "seo",
  ];
  const allowed = [...required, "slots", "supportingArchetype", "sourceArticle", "topicRefs"];
  for (const key of required) {
    if (!(key in value)) return { ok: false, reasonCode: "app_content_invalid", issues: [`필수 필드 누락: ${key}`] };
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) return { ok: false, reasonCode: "app_content_invalid", issues: [`허용되지 않은 필드: ${key}`] };
  }

  if (value.contractType !== APP_CONTENT_CONTRACT_TYPE) issues.push("contractType은 app-magazine-content여야 합니다.");
  if (value.schemaVersion !== APP_CONTENT_SCHEMA_VERSION) issues.push("schemaVersion은 app-content.v1이어야 합니다.");
  if (value.slotContractVersion !== APP_CONTENT_SLOT_CONTRACT_VERSION) issues.push("slotContractVersion은 article-experience.v2여야 합니다.");
  if (value.namespace !== APP_CONTENT_NAMESPACE) issues.push("namespace는 magazine이어야 합니다.");

  if (!isAppContentSlug(value.slug)) {
    issues.push("slug는 1~115자 kebab-case이며 page·feed·sitemap 예약어를 쓸 수 없습니다.");
  } else if (value.contentId !== appMagazineContentId(value.slug)) {
    issues.push("contentId는 amu:magazine:{slug} 3분절이어야 합니다.");
  }

  for (const [key, max] of [["title", 200], ["seoTitle", 200], ["excerpt", 400], ["heroLine", 400], ["primaryQuestion", 400]] as const) {
    if (!safeText(value[key], max)) issues.push(`${key}은(는) 필수이며 ${max}자 이하여야 합니다.`);
  }
  if (value.supportingArchetype !== undefined && !safeText(value.supportingArchetype, 80)) {
    issues.push("supportingArchetype은 80자 이하여야 합니다.");
  }

  if (value.topicRefs !== undefined) {
    if (!Array.isArray(value.topicRefs) || value.topicRefs.length < 1 || value.topicRefs.length > 5) {
      issues.push("topicRefs는 제공 시 1개 이상 5개 이하입니다.");
    } else {
      const topicIds = new Set<string>();
      const topicKeys = new Set<string>();
      for (const raw of value.topicRefs) {
        if (!isRecord(raw)
          || typeof raw.topicId !== "string" || !/^amu:magazine-topic:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.topicId)
          || typeof raw.topicKey !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.topicKey)
          || raw.topicId !== `amu:magazine-topic:${raw.topicKey}`
          || !safeText(raw.label, 80)
          || topicIds.has(raw.topicId) || topicKeys.has(raw.topicKey)) {
          issues.push("topicRefs는 고유한 amu:magazine-topic:{topicKey}와 80자 이하 label을 가져야 합니다.");
          break;
        }
        topicIds.add(raw.topicId);
        topicKeys.add(raw.topicKey);
      }
    }
  }

  const coldOpen = value.coldOpen;
  if (!isRecord(coldOpen)) {
    issues.push("coldOpen{problem,scene,tension} 3개 전부 필요합니다.");
  } else {
    for (const key of ["problem", "scene", "tension"]) {
      if (!safeText(coldOpen[key], 2000)) issues.push(`coldOpen.${key}은(는) 필수이며 2000자 이하여야 합니다.`);
    }
  }


  const slotIds = validateSlots(value, issues);
  const sectionIds = slotIds === null ? null : validateBodyAndBindings(value, slotIds, issues);
  if (sectionIds) {
    const rawEpisodes = value.episodes;
    if (!Array.isArray(rawEpisodes) || rawEpisodes.length < 1 || rawEpisodes.length > 32) {
      issues.push("episodes는 1개 이상 32개 이하여야 합니다.");
    } else {
      const episodeSections = new Set<string>();
      for (const raw of rawEpisodes) {
        if (!isRecord(raw) || typeof raw.sectionId !== "string" || !sectionIds.has(raw.sectionId) || episodeSections.has(raw.sectionId)
          || typeof raw.curiosityType !== "string" || !(APP_CONTENT_CURIOSITY_TYPES as readonly string[]).includes(raw.curiosityType)) {
          issues.push("episodes 항목은 body에 존재하는 sectionId와 curiosityType 7종 중 하나로 1:1 대응해야 합니다(§4.3 규칙 2).");
          break;
        }
        episodeSections.add(raw.sectionId);
      }
    }
    const rawSlots = value.slots;
    if (Array.isArray(rawSlots)) {
      for (const raw of rawSlots) {
        if (isRecord(raw) && typeof raw.sectionId === "string" && !sectionIds.has(raw.sectionId)) {
          issues.push(`slot(${String(raw.slotId)})의 sectionId가 body에 없습니다.`);
          break;
        }
      }
    }
  }


  const evidence = value.qualityEvidence;
  if (!isRecord(evidence)) {
    issues.push("qualityEvidence는 9키 객체여야 합니다.");
  } else {
    for (const key of APP_CONTENT_QUALITY_KEYS) {
      if (!safeText(evidence[key], 4000)) issues.push(`qualityEvidence.${key}은(는) 필수이며 4000자 이하여야 합니다.`);
    }
    for (const key of Object.keys(evidence)) {
      if (!(APP_CONTENT_QUALITY_KEYS as readonly string[]).includes(key)) issues.push(`qualityEvidence에 허용되지 않은 키가 있습니다: ${key}`);
    }
  }

  if (typeof value.experienceLevel !== "string" || !(APP_CONTENT_EXPERIENCE_LEVELS as readonly string[]).includes(value.experienceLevel)) {
    issues.push("experienceLevel은 story|enhanced|interactive 중 하나여야 합니다.");
  }
  if (typeof value.contentRole !== "string" || !(APP_CONTENT_ROLES as readonly string[]).includes(value.contentRole)) {
    issues.push("contentRole은 reach|relationship|trust|expansion|conversion 중 하나여야 합니다.");
  }
  if (typeof value.primaryArchetype !== "string" || !(APP_CONTENT_ARCHETYPES as readonly string[]).includes(value.primaryArchetype)) {
    issues.push("primaryArchetype은 7종 Archetype 중 하나여야 합니다.");
  }

  const sourceArticle = value.sourceArticle;
  let relationship: "upgrade" | "related" | undefined;
  if (sourceArticle !== undefined) {
    if (!isRecord(sourceArticle)
      || typeof sourceArticle.wpPostId !== "number" || !Number.isInteger(sourceArticle.wpPostId) || sourceArticle.wpPostId < 1
      || typeof sourceArticle.wpPostSlug !== "string" || !WP_SLUG_PATTERN.test(sourceArticle.wpPostSlug)
      || (sourceArticle.relationship !== "upgrade" && sourceArticle.relationship !== "related")) {
      issues.push("sourceArticle은 wpPostId·wpPostSlug·relationship(upgrade|related)를 만족해야 합니다.");
    } else {
      relationship = sourceArticle.relationship;
    }
  }

  let coverValid = false;
  if (isRecord(value.cover)) {
    coverValid = validateCover(value.cover, relationship, issues);
  } else {
    issues.push("cover 블록이 필요합니다.");
  }

  const seo = value.seo;
  if (!isRecord(seo) || typeof seo.indexable !== "boolean" || typeof seo.canonicalUrl !== "string"
    || !/^https:\/\/[^\s]{1,480}$/.test(seo.canonicalUrl)) {
    issues.push("seo는 indexable(boolean)과 https canonicalUrl을 만족해야 합니다.");
  }

  if (value.experienceLevel === "interactive" && (!Array.isArray(value.slots)
    || !(value.slots as unknown[]).some((slot) => isRecord(slot) && typeof slot.moduleType === "string"
      && DYNAMIC_APP_CONTENT_MODULES.includes(slot.moduleType)))) {
    issues.push("E3 interactive 콘텐츠는 동적 서비스 모듈 slot 1개 이상이 필요합니다.");
  }

  if (issues.length > 0 || !coverValid || !sectionIds) {
    return { ok: false, reasonCode: "app_content_invalid", issues };
  }
  return { ok: true, content: value as unknown as AppMagazineContent };
}

/** §4.7 — 콘텐츠 계약 본문만 해시한다. createdAt·updatedAt·revision은 대상에서 제외(CAS 보호). */
export function appMagazineContentRevision(content: AppMagazineContent): string {
  const { createdAt: _createdAt, updatedAt: _updatedAt, revision: _revision, ...rest } = content as unknown as Record<string, unknown>;
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(rest))).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}
