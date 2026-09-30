/**
 * @docHint
 * @purpose Magazine Article Experience v2의 입력·Registry 판정·postMessage 계약
 * @process 엄격한 선언 검증  fail-closed Registry 판정  메시지 envelope 검증
 * @domain magazine-content-experience
 * @scope server-client-contract
 *
 * @note v2(2026-09-06, AIR-402 Phase 1) — 레거시 article-experience.v1 제거.
 *       대상 식별자를 postId 전용에서 `contentRef`(wp_post | app_content)로 일반화해
 *       standalone App 콘텐츠의 E3 서비스 연결을 지원한다(AIR-400 §4.6).
 *       Registry 허용목록도 allowedPostIds/allowedPostSlugs → allowedContentIds로 대체.
 */

export const MAGAZINE_EXPERIENCE_SCHEMA_VERSION = "article-experience.v2" as const;
export const MAGAZINE_RESOLVER_REQUEST_TYPE = "magazine-embed-resolve-request" as const;
export const MAGAZINE_RESOLVER_RESPONSE_TYPE = "magazine-embed-resolver-response" as const;
export const MAGAZINE_EMBED_MESSAGE_TYPE = "amu.article-experience.v2" as const;

export const MAGAZINE_SERVICE_KEYS = ["gen-studio", "tutors", "play", "store"] as const;
export type MagazineServiceKey = (typeof MAGAZINE_SERVICE_KEYS)[number];

export const MAGAZINE_CAPABILITIES = ["preview", "generate", "chat"] as const;
export type MagazineCapability = (typeof MAGAZINE_CAPABILITIES)[number];

export interface MagazineEmbedAllowedProps {
  allowlistedInputKeys: string[];
  allowlistedInitialValueKeys: string[];
}

export const MAGAZINE_DYNAMIC_MODULES = ["image_embed", "content_embed", "tutors_embed"] as const;
export type MagazineDynamicModule = (typeof MAGAZINE_DYNAMIC_MODULES)[number];

export const MAGAZINE_FALLBACK_VISIBILITIES = ["show", "omit"] as const;
export type MagazineFallbackVisibility = (typeof MAGAZINE_FALLBACK_VISIBILITIES)[number];

export const MAGAZINE_REASON_CODES = [
  "enabled",
  "manifest_invalid",
  "unsupported_schema_version",
  "declaration_not_found",
  "registry_unavailable",
  "registry_entry_missing",
  "unknown_service",
  "runtime_disabled",
  "exposure_disabled",
  "feature_flag_off",
  "kill_switch",
  "allowlist_mismatch",
  "capability_not_allowed",
  "template_not_allowed",
  "persona_not_allowed",
  "not_started",
  "expired",
  "auth_required",
  "context_revision_mismatch",
  "rate_limited",
  "internal_error",
] as const;
export type MagazineReasonCode = (typeof MAGAZINE_REASON_CODES)[number];

export const MAGAZINE_MESSAGE_EVENTS = [
  "READY",
  "RESIZE",
  "AUTH_REQUIRED",
  "GENERATION_STARTED",
  "GENERATION_SUCCEEDED",
  "GENERATION_FAILED",
  "TUTOR_QUESTION",
  "TUTOR_ANSWERED",
  "RETURN_REQUEST",
] as const;
export type MagazineMessageEvent = (typeof MAGAZINE_MESSAGE_EVENTS)[number];

/** 대상 콘텐츠 식별자 — wp_post(기존 기사) | app_content(standalone App 고도화 콘텐츠). post_id와 다른 namespace. */
export type MagazineContentRef =
  | { kind: "wp_post"; postId: number; postSlug: string }
  | { kind: "app_content"; contentId: string; slug: string };

/** Registry allowedContentIds와 declaration 저장 key에 쓰는 안정 문자열. app_content는 contentId 그대로, wp_post는 `wp:{postId}`. */
export function magazineContentRefId(ref: MagazineContentRef): string {
  return ref.kind === "wp_post" ? `wp:${ref.postId}` : ref.contentId;
}

export interface MagazineArticleDeclaration {
  contractType: "article-experience-declaration";
  schemaVersion: typeof MAGAZINE_EXPERIENCE_SCHEMA_VERSION;
  contentRef: MagazineContentRef;
  contentRole: string;
  primaryArchetype: string;
  supportingArchetype?: string | null;
  experienceLevel: string;
  primaryQuestion: string;
  slots: MagazineArticleSlot[];
  returnSectionId: string;
  experimentId?: string;
}

export interface MagazineArticleSlot {
  slotId: string;
  sectionId: string;
  interactionRole: "primary" | "supporting";
  intent: string;
  moduleType: string;
  staticFallback: string;
  fallbackVisibility?: MagazineFallbackVisibility;
  serviceKey?: MagazineServiceKey;
  templateKey?: string;
  contextKey?: string;
  allowedProps?: MagazineEmbedAllowedProps | Record<string, unknown>;
}

export interface MagazineResolveContext {
  contentRef: MagazineContentRef;
  sectionId: string;
  experienceId: string;
  experienceLevel: string;
  returnSectionId: string;
  parentOrigin?: string;
  issueLaunchToken?: boolean;
}

export interface MagazineEmbedRegistryEntry {
  contractType: "magazine-embed-registry";
  schemaVersion: typeof MAGAZINE_EXPERIENCE_SCHEMA_VERSION;
  integrationId: string;
  serviceKey: MagazineServiceKey;
  productMaturity: "development" | "pilot" | "beta" | "stable";
  magazineExposure: "disabled" | "article" | "context-link" | "service-page" | "global";
  renderMode: "wp-native" | "app-embed" | "context-link";
  capabilities: MagazineCapability[];
  allowedContentIds?: string[];
  allowedTemplateKeys?: string[];
  allowedTutorPersonaIds?: string[];
  owner: string;
  rationale: string;
  reviewedAt: Date | string;
  startsAt?: Date | string;
  expiresAt?: Date | string;
  runtimeEnabled: boolean;
  authRequired: boolean;
  billingMode: "none" | "metered" | "subscription" | "unknown";
  contextRevision: string;
  contextHash: string;
  killSwitch: boolean;
}

export interface MagazineRegistryResolutionConfig {
  runtimeEnabled: boolean;
  killSwitch: boolean;
  featureFlagEnabled: boolean;
  allowedParentOrigins: string[];
}

export interface MagazineResolverRequest {
  contractType: typeof MAGAZINE_RESOLVER_REQUEST_TYPE;
  schemaVersion: typeof MAGAZINE_EXPERIENCE_SCHEMA_VERSION;
  declaration: unknown;
  slot: unknown;
  context: unknown;
}

export interface MagazineResolverSuccessData {
  enabled: boolean;
  reasonCode: MagazineReasonCode;
  serviceKey: MagazineServiceKey;
  renderMode: "app-embed" | "context-link";
  capabilities: MagazineCapability[];
  contextRevision: string;
  returnUrl: string;
  integrationId?: string;
  embedUrl?: string;
}

export interface MagazineResolverSuccessResponse {
  contractType: typeof MAGAZINE_RESOLVER_RESPONSE_TYPE;
  schemaVersion: typeof MAGAZINE_EXPERIENCE_SCHEMA_VERSION;
  ok: true;
  data: MagazineResolverSuccessData;
  meta: { requestId: string };
}

export interface MagazineResolverErrorResponse {
  contractType: typeof MAGAZINE_RESOLVER_RESPONSE_TYPE;
  schemaVersion: typeof MAGAZINE_EXPERIENCE_SCHEMA_VERSION;
  ok: false;
  error: {
    code: "INVALID_INPUT" | "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT" | "PRECONDITION_REQUIRED" | "RATE_LIMITED" | "INTERNAL_ERROR";
    message: string;
    retryable: boolean;
    details?: { reasonCode?: MagazineReasonCode; retryAfterSeconds?: number };
  };
  meta: { requestId: string };
}

export type MagazineResolverResponse = MagazineResolverSuccessResponse | MagazineResolverErrorResponse;

const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY = /^\p{L}[\p{L}\p{N}_.-]{0,63}$/u;
const SAFE_TEXT = /^(?![\s\S]*<\/?(?:script|iframe|object|embed|form)\b)(?![\s\S]*javascript:)(?![\s\S]*data:text\/html)[^<>]+$/i;

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: AnyRecord, required: string[], allowed: string[]) {
  const keys = Object.keys(value);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && keys.every((key) => allowed.includes(key));
}

function stringIn(value: unknown, values: readonly string[]) {
  return typeof value === "string" && values.includes(value);
}

function safeText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && SAFE_TEXT.test(value);
}

function validIdentifier(value: unknown) {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function validSlug(value: unknown) {
  return typeof value === "string" && value.length <= 160 && SLUG.test(value);
}

function validKeyList(value: unknown) {
  return Array.isArray(value) && value.length <= 32 && new Set(value).size === value.length && value.every((item) => typeof item === "string" && KEY.test(item));
}

/** contentRef 검증 — wp_post(postId·postSlug) 또는 app_content(contentId·slug). */
function validContentRef(value: unknown): value is MagazineContentRef {
  if (!isRecord(value)) return false;
  if (value.kind === "wp_post") {
    if (Object.keys(value).some((key) => !["kind", "postId", "postSlug"].includes(key))) return false;
    return Number.isSafeInteger(value.postId) && (value.postId as number) > 0 && validSlug(value.postSlug);
  }
  if (value.kind === "app_content") {
    if (Object.keys(value).some((key) => !["kind", "contentId", "slug"].includes(key))) return false;
    return typeof value.contentId === "string" && IDENTIFIER.test(value.contentId) && validSlug(value.slug) && value.contentId === `amu:magazine:${value.slug}`;
  }
  return false;
}

export function isValidMagazineEmbedAllowedProps(value: unknown): value is MagazineEmbedAllowedProps {
  if (!isRecord(value) || !hasExactKeys(value, ["allowlistedInputKeys", "allowlistedInitialValueKeys"], ["allowlistedInputKeys", "allowlistedInitialValueKeys"])) return false;
  return validKeyList(value.allowlistedInputKeys) && validKeyList(value.allowlistedInitialValueKeys);
}

function validateTextList(value: unknown, min: number, max: number) {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => safeText(item, 4000));
}

function validateNativeProps(moduleType: string, value: unknown) {
  if (!isRecord(value)) return false;
  if (moduleType === "compare") {
    if (!hasExactKeys(value, ["left", "right", "criteria"], ["left", "right", "criteria"]) || !validateTextList(value.criteria, 1, 8)) return false;
    return [value.left, value.right].every((side) => isRecord(side) && hasExactKeys(side, ["label", "summary"], ["label", "summary"]) && safeText(side.label, 4000) && safeText(side.summary, 4000));
  }
  if (moduleType === "reveal") {
    if (!hasExactKeys(value, ["prompt", "items"], ["prompt", "items"]) || !safeText(value.prompt, 4000) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 12) return false;
    return value.items.every((item) => isRecord(item) && hasExactKeys(item, ["label", "detail"], ["label", "detail"]) && safeText(item.label, 4000) && safeText(item.detail, 4000));
  }
  if (moduleType === "checklist") {
    if (!hasExactKeys(value, ["items"], ["items"]) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 12) return false;
    return value.items.every((item) => isRecord(item) && hasExactKeys(item, ["label", "detail", "required"], ["label", "detail", "required"]) && safeText(item.label, 4000) && safeText(item.detail, 4000) && typeof item.required === "boolean");
  }
  if (moduleType === "quiz") {
    if (!hasExactKeys(value, ["question", "options", "correctOptionId", "explanation"], ["question", "options", "correctOptionId", "explanation"]) || !safeText(value.question, 4000) || !safeText(value.explanation, 4000) || typeof value.correctOptionId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(value.correctOptionId) || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 5) return false;
    const optionIds = new Set<string>();
    return value.options.every((item) => {
      if (!isRecord(item) || !hasExactKeys(item, ["id", "label"], ["id", "label"]) || typeof item.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(item.id) || optionIds.has(item.id) || !safeText(item.label, 4000)) return false;
      optionIds.add(item.id);
      return true;
    }) && optionIds.has(value.correctOptionId);
  }
  return false;
}

function validateCommonSlot(value: AnyRecord, allowed: string[]) {
  return hasExactKeys(value, ["slotId", "sectionId", "interactionRole", "intent", "moduleType", "staticFallback"], allowed)
    && validIdentifier(value.slotId)
    && validIdentifier(value.sectionId)
    && stringIn(value.interactionRole, ["primary", "supporting"])
    && stringIn(value.intent, ["evidence", "discovery", "tension", "decision", "application", "service_entry"])
    && safeText(value.staticFallback, 12000);
}

export function validateSlot(value: unknown): { ok: true; slot: MagazineArticleSlot } | { ok: false; reasonCode: MagazineReasonCode } {
  if (!isRecord(value) || typeof value.moduleType !== "string") return { ok: false, reasonCode: "manifest_invalid" };
  const moduleType = value.moduleType;
  const common = ["slotId", "sectionId", "interactionRole", "intent", "moduleType", "staticFallback", "fallbackVisibility"];
  if (value.fallbackVisibility !== undefined && !stringIn(value.fallbackVisibility, MAGAZINE_FALLBACK_VISIBILITIES)) return { ok: false, reasonCode: "manifest_invalid" };
  if (value.fallbackVisibility === "omit" && !MAGAZINE_DYNAMIC_MODULES.includes(moduleType as MagazineDynamicModule)) return { ok: false, reasonCode: "manifest_invalid" };
  if (moduleType === "image_embed" || moduleType === "content_embed" || moduleType === "tutors_embed") {
    const allowed = [...common, "serviceKey", "templateKey", "contextKey", "allowedProps"];
    if (!validateCommonSlot(value, allowed) || !validIdentifier(value.contextKey) || !isValidMagazineEmbedAllowedProps(value.allowedProps)) return { ok: false, reasonCode: "manifest_invalid" };
    const expected = moduleType === "tutors_embed" ? "tutors" : "gen-studio";
    if (value.serviceKey !== expected) return { ok: false, reasonCode: "unknown_service" };
    if (moduleType !== "tutors_embed" && !validSlug(value.templateKey)) return { ok: false, reasonCode: "manifest_invalid" };
    return { ok: true, slot: value as unknown as MagazineArticleSlot };
  }

  const allowed = [...common, "allowedProps"];
  if (!validateCommonSlot(value, allowed)) return { ok: false, reasonCode: "manifest_invalid" };
  if (!["static", "compare", "reveal", "checklist", "quiz"].includes(moduleType)) return { ok: false, reasonCode: "manifest_invalid" };
  if (moduleType === "static") {
    if (Object.prototype.hasOwnProperty.call(value, "allowedProps")) return { ok: false, reasonCode: "manifest_invalid" };
  } else if (!validateNativeProps(moduleType, value.allowedProps)) {
    return { ok: false, reasonCode: "manifest_invalid" };
  }
  return { ok: true, slot: value as unknown as MagazineArticleSlot };
}

export function validateArticleDeclaration(value: unknown): { ok: true; declaration: MagazineArticleDeclaration } | { ok: false; reasonCode: MagazineReasonCode } {
  if (!isRecord(value)) return { ok: false, reasonCode: "manifest_invalid" };
  const allowed = ["contractType", "schemaVersion", "contentRef", "contentRole", "primaryArchetype", "supportingArchetype", "experienceLevel", "primaryQuestion", "slots", "returnSectionId", "experimentId"];
  const required = ["contractType", "schemaVersion", "contentRef", "contentRole", "primaryArchetype", "experienceLevel", "primaryQuestion", "slots", "returnSectionId"];
  if (value.schemaVersion !== MAGAZINE_EXPERIENCE_SCHEMA_VERSION) return { ok: false, reasonCode: "unsupported_schema_version" };
  if (!hasExactKeys(value, required, allowed) || value.contractType !== "article-experience-declaration") return { ok: false, reasonCode: "manifest_invalid" };
  if (!validContentRef(value.contentRef) || !stringIn(value.contentRole, ["reach", "relationship", "trust", "expansion", "conversion"]) || !stringIn(value.primaryArchetype, ["make", "experiment", "mystery", "decision", "teardown", "simulator", "build"]) || (value.supportingArchetype !== undefined && value.supportingArchetype !== null && !stringIn(value.supportingArchetype, ["make", "experiment", "mystery", "decision", "teardown", "simulator", "build"])) || !stringIn(value.experienceLevel, ["story", "enhanced", "interactive"]) || !safeText(value.primaryQuestion, 4000) || !validIdentifier(value.returnSectionId) || (value.experimentId !== undefined && !validIdentifier(value.experimentId))) {
    return { ok: false, reasonCode: "manifest_invalid" };
  }
  if (!Array.isArray(value.slots) || value.slots.length < 1 || value.slots.length > 3) return { ok: false, reasonCode: "manifest_invalid" };
  const slots: MagazineArticleSlot[] = [];
  const slotIds = new Set<string>();
  let primaryCount = 0;
  for (const rawSlot of value.slots) {
    const result = validateSlot(rawSlot);
    if (!result.ok) return result;
    if (slotIds.has(result.slot.slotId)) return { ok: false, reasonCode: "manifest_invalid" };
    slotIds.add(result.slot.slotId);
    if (result.slot.interactionRole === "primary") primaryCount += 1;
    slots.push(result.slot);
  }
  if (primaryCount !== 1) return { ok: false, reasonCode: "manifest_invalid" };
  // contentRef 충돌 검증 — 같은 contentRef를 다른 identifier로 쓰지 않는다.
  const refId = magazineContentRefId(value.contentRef);
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(refId) || refId.length > 128) return { ok: false, reasonCode: "manifest_invalid" };
  return { ok: true, declaration: { ...value, slots } as MagazineArticleDeclaration };
}

export function validateMagazineResolverRequest(value: unknown): { ok: true; request: MagazineResolverRequest; declaration: MagazineArticleDeclaration; slot: MagazineArticleSlot; context: MagazineResolveContext } | { ok: false; reasonCode: MagazineReasonCode } {
  if (!isRecord(value)) return { ok: false, reasonCode: "manifest_invalid" };
  if (!hasExactKeys(value, ["contractType", "schemaVersion", "declaration", "slot", "context"], ["contractType", "schemaVersion", "declaration", "slot", "context"]) || value.contractType !== MAGAZINE_RESOLVER_REQUEST_TYPE) return { ok: false, reasonCode: "manifest_invalid" };
  if (value.schemaVersion !== MAGAZINE_EXPERIENCE_SCHEMA_VERSION) return { ok: false, reasonCode: "unsupported_schema_version" };
  const declarationResult = validateArticleDeclaration(value.declaration);
  if (!declarationResult.ok) return declarationResult;
  const slotResult = validateSlot(value.slot);
  if (!slotResult.ok) return slotResult;
  const declarationSlot = declarationResult.declaration.slots.find((item) => item.slotId === slotResult.slot.slotId);
  if (!declarationSlot || JSON.stringify(declarationSlot) !== JSON.stringify(slotResult.slot)) return { ok: false, reasonCode: "manifest_invalid" };
  if (!isRecord(value.context) || !hasExactKeys(value.context, ["contentRef", "sectionId", "experienceId", "experienceLevel", "returnSectionId"], ["contentRef", "sectionId", "experienceId", "experienceLevel", "returnSectionId", "parentOrigin", "issueLaunchToken"])) return { ok: false, reasonCode: "manifest_invalid" };
  const context = value.context as unknown as MagazineResolveContext;
  if (!validContentRef(context.contentRef) || magazineContentRefId(context.contentRef) !== magazineContentRefId(declarationResult.declaration.contentRef) || context.sectionId !== slotResult.slot.sectionId || context.experienceId !== slotResult.slot.slotId || context.experienceLevel !== declarationResult.declaration.experienceLevel || context.returnSectionId !== declarationResult.declaration.returnSectionId || (context.parentOrigin !== undefined && !isExactOrigin(context.parentOrigin)) || (context.issueLaunchToken !== undefined && typeof context.issueLaunchToken !== "boolean")) return { ok: false, reasonCode: "manifest_invalid" };
  return { ok: true, request: value as unknown as MagazineResolverRequest, declaration: declarationResult.declaration, slot: slotResult.slot, context };
}

export function isExactOrigin(value: unknown) {
  if (typeof value !== "string" || value.length > 300) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")) && !url.username && !url.password && !url.pathname.replace(/^\/$/, "") && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function asDate(value: Date | string | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function includesString(values: string[] | undefined, target: string) {
  return !values || values.length === 0 || values.includes(target);
}

/** 허용 대상 매칭 — 빈 allowedContentIds는 fail-closed로 차단한다(v1 allowedPostIds 계약 유지). */
function refMatched(entry: MagazineEmbedRegistryEntry, declarationContentRef: MagazineContentRef): boolean {
  const allowed = entry.allowedContentIds || [];
  if (allowed.length === 0) return false;
  return allowed.includes(magazineContentRefId(declarationContentRef));
}

export function evaluateMagazineEmbedRegistry(args: {
  entry: MagazineEmbedRegistryEntry;
  declaration: MagazineArticleDeclaration;
  slot: MagazineArticleSlot;
  parentOrigin: string;
  nowMs?: number;
  config: MagazineRegistryResolutionConfig;
}): { enabled: true; entry: MagazineEmbedRegistryEntry } | { enabled: false; reasonCode: Exclude<MagazineReasonCode, "enabled"> } {
  const { entry, declaration, slot, parentOrigin, config } = args;
  const now = args.nowMs ?? Date.now();
  if (!IDENTIFIER.test(entry.integrationId) || !IDENTIFIER.test(entry.owner) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(entry.contextRevision) || !/^[a-f0-9]{64}$/.test(entry.contextHash) || !entry.capabilities.every((capability) => MAGAZINE_CAPABILITIES.includes(capability)) || !asDate(entry.reviewedAt) || (entry.startsAt !== undefined && !asDate(entry.startsAt)) || (entry.expiresAt !== undefined && !asDate(entry.expiresAt))) return { enabled: false, reasonCode: "internal_error" };
  if (!MAGAZINE_SERVICE_KEYS.includes(entry.serviceKey) || entry.serviceKey !== slot.serviceKey) return { enabled: false, reasonCode: "unknown_service" };
  if (!MAGAZINE_DYNAMIC_MODULES.includes(slot.moduleType as MagazineDynamicModule) || entry.renderMode !== "app-embed") return { enabled: false, reasonCode: "exposure_disabled" };
  if (!config.runtimeEnabled || !entry.runtimeEnabled) return { enabled: false, reasonCode: "runtime_disabled" };
  if (!config.featureFlagEnabled) return { enabled: false, reasonCode: "feature_flag_off" };
  if (config.killSwitch || entry.killSwitch) return { enabled: false, reasonCode: "kill_switch" };
  if (entry.magazineExposure !== "article") return { enabled: false, reasonCode: "exposure_disabled" };
  if (!isExactOrigin(parentOrigin) || !config.allowedParentOrigins.includes(parentOrigin)) return { enabled: false, reasonCode: "allowlist_mismatch" };
  if (entry.productMaturity === "development") return { enabled: false, reasonCode: "runtime_disabled" };
  if (entry.authRequired) return { enabled: false, reasonCode: "auth_required" };
  const startsAt = asDate(entry.startsAt);
  if (startsAt && startsAt.getTime() > now) return { enabled: false, reasonCode: "not_started" };
  const expiresAt = asDate(entry.expiresAt);
  if (expiresAt && expiresAt.getTime() <= now) return { enabled: false, reasonCode: "expired" };
  if (entry.productMaturity === "pilot" && (!expiresAt || expiresAt.getTime() <= now)) return { enabled: false, reasonCode: "expired" };
  if (!refMatched(entry, declaration.contentRef)) return { enabled: false, reasonCode: "allowlist_mismatch" };
  if (!includesString(entry.allowedTemplateKeys, slot.templateKey || "")) return { enabled: false, reasonCode: "template_not_allowed" };
  if (slot.moduleType === "tutors_embed" && !includesString(entry.allowedTutorPersonaIds, slot.contextKey || "")) return { enabled: false, reasonCode: "persona_not_allowed" };
  if (!entry.capabilities.length) return { enabled: false, reasonCode: "capability_not_allowed" };
  return { enabled: true, entry };
}

export function validateMagazineLaunchClaims(args: {
  claims: { integrationId: string; serviceKey: MagazineServiceKey; contentRef: MagazineContentRef; templateKey?: string; contextKey?: string; parentOrigin: string; contextRevision: string; contextHash: string };
  entry: MagazineEmbedRegistryEntry;
  config: MagazineRegistryResolutionConfig;
  nowMs?: number;
}) {
  const { claims, entry, config } = args;
  const now = args.nowMs ?? Date.now();
  if (!IDENTIFIER.test(entry.integrationId) || !IDENTIFIER.test(entry.owner) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(entry.contextRevision) || !/^[a-f0-9]{64}$/.test(entry.contextHash) || !entry.capabilities.every((capability) => MAGAZINE_CAPABILITIES.includes(capability)) || !asDate(entry.reviewedAt) || (entry.startsAt !== undefined && !asDate(entry.startsAt)) || (entry.expiresAt !== undefined && !asDate(entry.expiresAt))) return { ok: false as const, reasonCode: "context_revision_mismatch" as const };
  if (claims.integrationId !== entry.integrationId || claims.serviceKey !== entry.serviceKey || claims.contextRevision !== entry.contextRevision || claims.contextHash !== entry.contextHash) return { ok: false as const, reasonCode: "context_revision_mismatch" as const };
  if (!config.runtimeEnabled || !entry.runtimeEnabled) return { ok: false as const, reasonCode: "runtime_disabled" as const };
  if (!config.featureFlagEnabled) return { ok: false as const, reasonCode: "feature_flag_off" as const };
  if (config.killSwitch || entry.killSwitch) return { ok: false as const, reasonCode: "kill_switch" as const };
  if (entry.magazineExposure !== "article" || entry.renderMode !== "app-embed") return { ok: false as const, reasonCode: "exposure_disabled" as const };
  if (entry.productMaturity === "development") return { ok: false as const, reasonCode: "runtime_disabled" as const };
  if (!config.allowedParentOrigins.includes(claims.parentOrigin)) return { ok: false as const, reasonCode: "allowlist_mismatch" as const };
  const startsAt = asDate(entry.startsAt);
  if (startsAt && startsAt.getTime() > now) return { ok: false as const, reasonCode: "not_started" as const };
  if (entry.authRequired) return { ok: false as const, reasonCode: "auth_required" as const };
  const expiresAt = asDate(entry.expiresAt);
  if ((expiresAt && expiresAt.getTime() <= now) || (entry.productMaturity === "pilot" && !expiresAt)) return { ok: false as const, reasonCode: "expired" as const };
  if (!refMatched(entry, claims.contentRef)) return { ok: false as const, reasonCode: "allowlist_mismatch" as const };
  if (!includesString(entry.allowedTemplateKeys, claims.templateKey || "")) return { ok: false as const, reasonCode: "template_not_allowed" as const };
  if (claims.serviceKey === "tutors" && !includesString(entry.allowedTutorPersonaIds, claims.contextKey || "")) return { ok: false as const, reasonCode: "persona_not_allowed" as const };
  return { ok: true as const };
}

export function buildResolverSuccess(args: { requestId: string; data: MagazineResolverSuccessData }): MagazineResolverSuccessResponse {
  return { contractType: MAGAZINE_RESOLVER_RESPONSE_TYPE, schemaVersion: MAGAZINE_EXPERIENCE_SCHEMA_VERSION, ok: true, data: args.data, meta: { requestId: args.requestId } };
}

export function buildResolverError(args: { requestId: string; code: MagazineResolverErrorResponse["error"]["code"]; message: string; retryable?: boolean; reasonCode?: MagazineReasonCode; retryAfterSeconds?: number }): MagazineResolverErrorResponse {
  const details = args.reasonCode || args.retryAfterSeconds ? { ...(args.reasonCode ? { reasonCode: args.reasonCode } : {}), ...(args.retryAfterSeconds ? { retryAfterSeconds: args.retryAfterSeconds } : {}) } : undefined;
  return { contractType: MAGAZINE_RESOLVER_RESPONSE_TYPE, schemaVersion: MAGAZINE_EXPERIENCE_SCHEMA_VERSION, ok: false, error: { code: args.code, message: args.message, retryable: args.retryable === true, ...(details ? { details } : {}) }, meta: { requestId: args.requestId } };
}

export function makeContextHash(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(4);
}

export function createProtocolMessage(args: { event: MagazineMessageEvent; messageId: string; nonce: string; requestId: string; payload?: Record<string, unknown> }) {
  return { type: MAGAZINE_EMBED_MESSAGE_TYPE, event: args.event, messageId: args.messageId, nonce: args.nonce, requestId: args.requestId, payload: args.payload || {} };
}

export function isValidProtocolMessage(value: unknown, expected: { event?: MagazineMessageEvent; nonce: string; requestId: string }): value is ReturnType<typeof createProtocolMessage> {
  if (!isRecord(value) || value.type !== MAGAZINE_EMBED_MESSAGE_TYPE || typeof value.event !== "string" || !MAGAZINE_MESSAGE_EVENTS.includes(value.event as MagazineMessageEvent) || !validIdentifier(value.messageId) || !validIdentifier(value.nonce) || !validIdentifier(value.requestId) || value.nonce !== expected.nonce || value.requestId !== expected.requestId || (expected.event && value.event !== expected.event)) return false;
  return isRecord(value.payload);
}
