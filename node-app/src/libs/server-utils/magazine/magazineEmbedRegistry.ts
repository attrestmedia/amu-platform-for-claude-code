import "server-only";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { MagazineEmbedRegistrySchema, type IMagazineEmbedRegistryDocument } from "models/magazine";
import type { MagazineEmbedRegistryEntry, MagazineServiceKey } from "./magazineEmbedContract";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Magazine Embed Registry 읽기 전용 저장소
 * @process DB 조회 실패를 빈 허용목록으로 변환하여 fail-closed resolver에 전달
 * @domain magazine-content-experience
 * @scope server-repository
 */

const MODEL_NAME = "MagazineEmbedRegistry";
const COLLECTION_NAME = "magazine_embed_registry";

export type MagazineRegistryReadResult =
  | { ok: true; entries: MagazineEmbedRegistryEntry[] }
  | { ok: false; entries: []; error: "unavailable" };

export type MagazineRegistryExpiryStatus = "no_expiry" | "active" | "expiring_soon" | "expired" | "invalid";
export const MAGAZINE_REGISTRY_EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

export function getMagazineRegistryExpiryStatus(
  expiresAt: Date | string | undefined,
  nowMs = Date.now(),
  warningWindowMs = MAGAZINE_REGISTRY_EXPIRY_WARNING_MS,
): MagazineRegistryExpiryStatus {
  if (expiresAt === undefined || expiresAt === null || String(expiresAt).trim() === "") return "no_expiry";
  const expiryMs = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return "invalid";
  if (expiryMs <= nowMs) return "expired";
  return expiryMs - nowMs <= warningWindowMs ? "expiring_soon" : "active";
}

function normalizeEntry(raw: unknown): MagazineEmbedRegistryEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.contractType !== "magazine-embed-registry" || value.schemaVersion !== "article-experience.v2") return null;
  if (typeof value.integrationId !== "string" || typeof value.serviceKey !== "string" || typeof value.contextRevision !== "string" || typeof value.contextHash !== "string") return null;
  return {
    contractType: "magazine-embed-registry",
    schemaVersion: "article-experience.v2",
    integrationId: value.integrationId,
    serviceKey: value.serviceKey as MagazineServiceKey,
    productMaturity: value.productMaturity as MagazineEmbedRegistryEntry["productMaturity"],
    magazineExposure: value.magazineExposure as MagazineEmbedRegistryEntry["magazineExposure"],
    renderMode: value.renderMode as MagazineEmbedRegistryEntry["renderMode"],
    capabilities: Array.isArray(value.capabilities) ? value.capabilities.filter((item): item is MagazineEmbedRegistryEntry["capabilities"][number] => typeof item === "string") : [],
    allowedContentIds: Array.isArray(value.allowedContentIds) ? value.allowedContentIds.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [],
    allowedTemplateKeys: Array.isArray(value.allowedTemplateKeys) ? value.allowedTemplateKeys.filter((item): item is string => typeof item === "string") : [],
    allowedTutorPersonaIds: Array.isArray(value.allowedTutorPersonaIds) ? value.allowedTutorPersonaIds.filter((item): item is string => typeof item === "string") : [],
    owner: String(value.owner || ""),
    rationale: String(value.rationale || ""),
    reviewedAt: value.reviewedAt as Date | string,
    startsAt: value.startsAt as Date | string | undefined,
    expiresAt: value.expiresAt as Date | string | undefined,
    runtimeEnabled: value.runtimeEnabled === true,
    authRequired: value.authRequired === true,
    billingMode: value.billingMode as MagazineEmbedRegistryEntry["billingMode"],
    contextRevision: value.contextRevision,
    contextHash: value.contextHash,
    killSwitch: value.killSwitch === true,
  };
}

async function getRegistryModel() {
  return getModel<IMagazineEmbedRegistryDocument>(MONGODB_AMU_URL, MODEL_NAME, MagazineEmbedRegistrySchema, COLLECTION_NAME);
}

export async function listMagazineEmbedRegistryEntries(serviceKey?: MagazineServiceKey): Promise<MagazineRegistryReadResult> {
  try {
    const model = await getRegistryModel();
    const query = serviceKey ? { contractType: "magazine-embed-registry", schemaVersion: "article-experience.v2", serviceKey } : { contractType: "magazine-embed-registry", schemaVersion: "article-experience.v2" };
    const documents = await model.find(query).lean();
    const entries = documents.map(normalizeEntry).filter((entry): entry is MagazineEmbedRegistryEntry => Boolean(entry));
    return { ok: true, entries };
  } catch (error) {
    logger.error("[magazine-embed-registry] registry read failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, entries: [], error: "unavailable" };
  }
}

export async function getMagazineEmbedRegistryEntry(integrationId: string): Promise<MagazineRegistryReadResult> {
  try {
    const model = await getRegistryModel();
    const document = await model.findOne({ contractType: "magazine-embed-registry", schemaVersion: "article-experience.v2", integrationId }).lean();
    const entry = normalizeEntry(document);
    return { ok: true, entries: entry ? [entry] : [] };
  } catch (error) {
    logger.error("[magazine-embed-registry] registry entry read failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, entries: [], error: "unavailable" };
  }
}

export type MagazineRegistryUpsertResult =
  | { ok: true; entry: MagazineEmbedRegistryEntry; created: boolean; updatedAt: string }
  | { ok: false; error: "validation_failed"; issues: string[] }
  | { ok: false; error: "conflict"; issues?: undefined }
  | { ok: false; error: "unavailable"; issues?: undefined };

const SERVICE_KEYS = ["gen-studio", "tutors", "play", "store"] as const;
const MATURITIES = ["development", "pilot", "beta", "stable"] as const;
const EXPOSURES = ["disabled", "article", "context-link", "service-page", "global"] as const;
const RENDER_MODES = ["wp-native", "app-embed", "context-link"] as const;
const CAPABILITIES = ["preview", "generate", "chat"] as const;
const BILLING_MODES = ["none", "metered", "subscription", "unknown"] as const;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

/**
 * 승인 없이 노출을 켤 수 없도록 쓰기 시점에 게이트를 강제한다.
 * owner·rationale·reviewedAt는 항상 필수이며, Magazine에 실제로 노출되는 항목
 * (magazineExposure !== "disabled" 이고 runtimeEnabled)은 expiry와 article allowlist를 추가로 요구한다.
 */
export function validateMagazineEmbedRegistryInput(input: unknown): { ok: true; value: MagazineEmbedRegistryEntry } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "");

  // 런타임 평가기(magazineEmbedContract IDENTIFIER)와 같은 형식을 쓰기 시점에 강제한다.
  // 쓰기만 통과하고 런타임에서 internal_error로 영구 차단되는 값을 만들지 않는다.
  const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
  const REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

  const integrationId = str("integrationId");
  if (!IDENTIFIER.test(integrationId)) issues.push("integrationId는 소문자 영숫자로 시작하는 1~128자의 [a-z0-9._:-] 조합이어야 합니다.");

  const serviceKey = str("serviceKey");
  if (!SERVICE_KEYS.includes(serviceKey as (typeof SERVICE_KEYS)[number])) issues.push(`serviceKey는 ${SERVICE_KEYS.join("|")} 중 하나여야 합니다.`);

  const productMaturity = str("productMaturity");
  if (!MATURITIES.includes(productMaturity as (typeof MATURITIES)[number])) issues.push(`productMaturity는 ${MATURITIES.join("|")} 중 하나여야 합니다.`);

  const magazineExposure = str("magazineExposure");
  if (!EXPOSURES.includes(magazineExposure as (typeof EXPOSURES)[number])) issues.push(`magazineExposure는 ${EXPOSURES.join("|")} 중 하나여야 합니다.`);

  const renderMode = str("renderMode");
  if (!RENDER_MODES.includes(renderMode as (typeof RENDER_MODES)[number])) issues.push(`renderMode는 ${RENDER_MODES.join("|")} 중 하나여야 합니다.`);

  const capabilities = asStringArray(raw.capabilities);
  if (capabilities.some((item) => !CAPABILITIES.includes(item as (typeof CAPABILITIES)[number]))) issues.push(`capabilities는 ${CAPABILITIES.join("|")}만 허용합니다.`);

  const billingMode = str("billingMode") || "unknown";
  if (!BILLING_MODES.includes(billingMode as (typeof BILLING_MODES)[number])) issues.push(`billingMode는 ${BILLING_MODES.join("|")} 중 하나여야 합니다.`);

  const owner = str("owner");
  if (!IDENTIFIER.test(owner)) issues.push("owner는 소문자 영숫자로 시작하는 [a-z0-9._:-] 식별자여야 합니다(예: content-platform). 런타임 평가기가 같은 형식을 요구합니다.");
  const rationale = str("rationale");
  if (rationale.length < 10) issues.push("rationale은 10자 이상으로 노출 사유를 남기세요.");

  const contextRevision = str("contextRevision");
  if (!REVISION.test(contextRevision)) issues.push("contextRevision은 영숫자로 시작하는 [A-Za-z0-9._:-] 식별자여야 합니다.");
  const contextHash = str("contextHash");
  if (!/^[a-f0-9]{64}$/.test(contextHash)) issues.push("contextHash는 64자리 소문자 hex여야 합니다.");

  const parseDate = (key: string, required: boolean) => {
    const value = raw[key];
    if (value === undefined || value === null || value === "") {
      if (required) issues.push(`${key}는 필수입니다.`);
      return undefined;
    }
    const parsed = new Date(value as string | number | Date);
    if (Number.isNaN(parsed.getTime())) {
      issues.push(`${key}가 유효한 날짜가 아닙니다.`);
      return undefined;
    }
    return parsed;
  };
  const reviewedAt = parseDate("reviewedAt", true);
  const startsAt = parseDate("startsAt", false);
  const expiresAt = parseDate("expiresAt", false);
  if (startsAt && expiresAt && startsAt.getTime() >= expiresAt.getTime()) issues.push("startsAt은 expiresAt보다 앞서야 합니다.");

  // 읽기 경로(refMatched)와 같은 형식(안정 contentRefId 문자열)을 쓰기 시점에 강제한다.
  const allowedContentIds = asStringArray(raw.allowedContentIds);
  // 레지스트리는 독자 resolve 매 요청마다 전량 로드된다. 거대 엔트리 하나가 전체에 비용을 물리지 않도록 상한을 둔다.
  const ARRAY_LIMIT = 200;
  for (const [key, list] of [["allowedContentIds", allowedContentIds], ["allowedTemplateKeys", asStringArray(raw.allowedTemplateKeys)], ["allowedTutorPersonaIds", asStringArray(raw.allowedTutorPersonaIds)]] as const) {
    if (list.length > ARRAY_LIMIT) issues.push(`${key}는 최대 ${ARRAY_LIMIT}개까지 허용합니다.`);
  }
  const runtimeEnabled = raw.runtimeEnabled === true;
  const killSwitch = raw.killSwitch === true;
  const authRequired = raw.authRequired !== false;

  // SERVICE-ROLE-MAP §13 Product Maturity × Magazine Exposure 매트릭스.
  // 레지스트리는 노출 수준의 선언 SSOT이므로 정책 위반 레코드를 저장하지 않는다.
  const EXPOSURE_MATRIX: Record<string, readonly string[]> = {
    development: ["disabled"],
    pilot: ["disabled", "article"],
    beta: ["disabled", "article", "context-link", "service-page"],
    stable: ["disabled", "article", "context-link", "service-page", "global"],
  };
  const allowedExposures = EXPOSURE_MATRIX[productMaturity];
  if (allowedExposures && !allowedExposures.includes(magazineExposure)) {
    issues.push(`productMaturity=${productMaturity}에는 magazineExposure=${magazineExposure}를 허용하지 않습니다. 허용: ${allowedExposures.join("|")} (SERVICE-ROLE-MAP 매트릭스)`);
  }

  // 실제 노출 항목은 승인 게이트를 추가로 요구한다.
  const exposesToReaders = runtimeEnabled && magazineExposure !== "disabled" && !killSwitch;
  if (exposesToReaders) {
    // expiry 요구는 pilot 한정이다. G-CI-03이 expiry를 Pilot 요건으로만 규정하고,
    // 읽기 계약(magazineEmbedContract)도 pilot에만 하드 요구한다. 기사는 evergreen이므로
    // beta·stable의 상시 노출이 정상 상태이며, 여기서 전 성숙도에 시한을 강제하면
    // 읽기 계약이 허용하는 상태를 쓰기 경로가 표현하지 못한다.
    if (productMaturity === "pilot" && !expiresAt) {
      issues.push("productMaturity=pilot 항목은 expiresAt이 필수입니다. 시한 없는 파일럿을 만들지 않습니다.");
    }
    if (allowedContentIds.length === 0) {
      issues.push("독자에게 노출되는 항목은 allowedContentIds로 대상 콘텐츠 범위를 제한해야 합니다.");
    }
    if (productMaturity === "development") issues.push("productMaturity=development는 독자 노출 대상이 아닙니다.");
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      contractType: "magazine-embed-registry",
      schemaVersion: "article-experience.v2",
      integrationId,
      serviceKey,
      productMaturity,
      magazineExposure,
      renderMode,
      capabilities,
      allowedContentIds,
      allowedTemplateKeys: asStringArray(raw.allowedTemplateKeys),
      allowedTutorPersonaIds: asStringArray(raw.allowedTutorPersonaIds),
      owner,
      rationale,
      reviewedAt: reviewedAt as Date,
      startsAt,
      expiresAt,
      runtimeEnabled,
      authRequired,
      billingMode,
      contextRevision,
      contextHash,
      killSwitch,
    } as MagazineEmbedRegistryEntry,
  };
}

export async function upsertMagazineEmbedRegistryEntry(
  input: unknown,
  actor: string,
  expectedUpdatedAt?: string,
): Promise<MagazineRegistryUpsertResult> {
  const parsed = validateMagazineEmbedRegistryInput(input);
  if (!parsed.ok) return { ok: false, error: "validation_failed", issues: parsed.issues };

  // 보안 경계 쓰기는 귀속 불가 상태로 남기지 않는다.
  if (!actor || actor === "unknown") return { ok: false, error: "validation_failed", issues: ["감사 actor를 확인할 수 없어 등록을 거부했습니다."] };

  const FILTER = {
    contractType: "magazine-embed-registry" as const,
    schemaVersion: "article-experience.v2" as const,
    integrationId: parsed.value.integrationId,
  };

  try {
    const model = await getRegistryModel();
    const existing = await model.findOne(FILTER).lean();

    // 낙관적 잠금: 낡은 상태를 들고 있는 저장이 kill switch 같은 판정을 조용히 덮어쓰지 않게 한다.
    if (existing && expectedUpdatedAt) {
      const current = (existing as { updatedAt?: Date }).updatedAt;
      if (!current || new Date(current).toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
        return { ok: false, error: "conflict" };
      }
    }

    // 생략된 선택 날짜는 mongoose가 $set에서 키를 버려 기존 값이 남는다.
    // 응답·감사 로그와 DB가 어긋나지 않도록 명시적으로 $unset한다.
    const unset: Record<string, ""> = {};
    if (parsed.value.startsAt === undefined) unset.startsAt = "";
    if (parsed.value.expiresAt === undefined) unset.expiresAt = "";
    const update: Record<string, unknown> = { $set: parsed.value };
    if (Object.keys(unset).length > 0) update.$unset = unset;

    await model.updateOne(FILTER, update, { upsert: true, runValidators: true });
    const saved = await model.findOne(FILTER).lean();
    const savedUpdatedAt = new Date((saved as { updatedAt?: Date })?.updatedAt || Date.now()).toISOString();

    logger.info("[magazine-embed-registry] entry upserted", {
      actor,
      integrationId: parsed.value.integrationId,
      serviceKey: parsed.value.serviceKey,
      productMaturity: parsed.value.productMaturity,
      magazineExposure: parsed.value.magazineExposure,
      runtimeEnabled: parsed.value.runtimeEnabled,
      killSwitch: parsed.value.killSwitch,
      expiresAt: parsed.value.expiresAt ? new Date(parsed.value.expiresAt).toISOString() : "(none)",
      allowedContentIds: parsed.value.allowedContentIds,
      created: !existing,
      updatedAt: savedUpdatedAt,
    });
    return { ok: true, entry: parsed.value, created: !existing, updatedAt: savedUpdatedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    // unique 인덱스 경합은 영구 충돌이지 일시 장애가 아니다.
    if (/E11000|duplicate key/i.test(message)) {
      logger.warn("[magazine-embed-registry] upsert conflict", { actor, integrationId: parsed.value.integrationId });
      return { ok: false, error: "conflict" };
    }
    logger.error("[magazine-embed-registry] upsert failed", { error: message });
    return { ok: false, error: "unavailable" };
  }
}
