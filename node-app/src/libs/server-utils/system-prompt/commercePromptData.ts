import "server-only";
import { getModel } from "libs/database/modelCache";
import { listCommerceStorefrontProducts } from "libs/database/commerce";
import { UniverseDetailSchema, type IUniverseDetailDocument } from "models/universe";
import type { IProduct, IStoreKnowledge } from "types/game";
import { MONGODB_AMU_URL } from "consts/env/server";
import { logger } from "utils/log";
import { hasStoreKnowledgeContent } from "utils/commerce/storeKnowledgeUtils";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

type UniverseDetailLean = UnknownRecord;
type StorefrontProduct = UnknownRecord;

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process invalidateUniverseDetailPromptCache 중심 처리  입력 검증  핵심 로직  결과 포맷팅  이미지 파이프라인 호출 포함
 * @domain commerce
 * @scope server
 */

// Prompt용 UniverseDetail 중복 조회 방지 캐시
const DETAIL_CACHE_TTL_MS = 10_000;
const detailCache = new Map<string, { exp: number; value: UniverseDetailLean | null }>();
const detailInFlight = new Map<string, Promise<UniverseDetailLean | null>>();
const storefrontProductsCache = new Map<string, { exp: number; value: StorefrontProduct[] }>();
const storefrontProductsInFlight = new Map<string, Promise<StorefrontProduct[]>>();

function sweepDetailCache(now = Date.now()) {
  for (const [k, v] of detailCache.entries()) {
    if (!v || v.exp <= now) detailCache.delete(k);
  }
}

export function invalidateUniverseDetailPromptCache(universeId?: string) {
  if (universeId) {
    const uid = String(universeId || "").trim();
    if (!uid) return;
    detailCache.delete(uid);
    detailInFlight.delete(uid);
    storefrontProductsCache.delete(uid);
    storefrontProductsInFlight.delete(uid);
    return;
  }
  detailCache.clear();
  detailInFlight.clear();
  storefrontProductsCache.clear();
  storefrontProductsInFlight.clear();
}

function safeStr(v: unknown, max = 500) {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function safeJson(v: unknown, max = 1200) {
  if (v == null) return "";
  try {
    const s = JSON.stringify(v);
    return safeStr(s, max);
  } catch {
    return "";
  }
}

function normalizeMoney(v: unknown) {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return safeStr(v, 64);
}

function normalizeBoolLike(v: unknown, defaultValue = true) {
  if (v == null) return defaultValue;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (!s) return defaultValue;
  if (["0", "false", "no", "n", "off", "soldout", "outofstock", "out-of-stock"].includes(s)) return false;
  return true;
}

// (중요) buildCommercePolicyPrompt가 `"상품타입": "product"` 패턴 검사 - JSON 텍스트 형태로 생성
export function buildCatalogSectionForPrompt(items: ReadonlyArray<IProduct | UnknownRecord>, opts?: { maxItems?: number }) {
  const maxItems = Math.max(1, Math.min(opts?.maxItems ?? 60, 200));
  const listRaw = Array.isArray(items) ? (items as IProduct[]) : [];

  const sorted = [...listRaw].sort((a, b) => {
    const ao = typeof a?.order === "number" ? a.order : 0;
    const bo = typeof b?.order === "number" ? b.order : 0;
    return ao - bo;
  });

  const sliced = sorted.slice(0, maxItems);

  // itemType 판정 (비어있으면 product 취급)
  const hasProduct = sliced.some((p) => String(p?.itemType || "product").toLowerCase() === "product");
  const hasService = sliced.some((p) => String(p?.itemType || "").toLowerCase() === "service");

  // 기본은 product (비어있는 데이터 때문에 service로 떨어지는 버그 방지)
  const catalogType = hasService && !hasProduct ? "service" : "product";

  const list = sliced.map((p) => {
    const id = safeStr(p?.id, 80);
    const title = safeStr(p?.title, 140);
    const category = safeStr(p?.category, 80);

    const itemTypeRaw = safeStr(p?.itemType, 16).toLowerCase();
    const itemType = itemTypeRaw === "service" ? "service" : "product"; // 강제 정규화

    const priceTypeRaw = safeStr(p?.priceType, 16).toLowerCase();
    const priceType = ["fixed", "range", "text"].includes(priceTypeRaw) ? priceTypeRaw : "";

    const price = priceType === "fixed" ? normalizeMoney(p?.price) : "";
    const priceMin = priceType === "range" ? normalizeMoney(p?.priceMin) : "";
    const priceMax = priceType === "range" ? normalizeMoney(p?.priceMax) : "";
    const priceText = priceType === "text" ? safeStr(p?.priceText, 80) : "";

    const summary = safeStr(p?.summary, 320);
    const detail = safeStr(p?.detail, 400);
    const specs = safeJson(p?.specs, 900);
    const url = safeStr(p?.url, 320);
    const image = safeStr(p?.image, 320);
    const imageFit = safeStr(p?.imageFit, 16);
    const inStock = normalizeBoolLike((p as unknown as UnknownRecord)?.inStock, true);
    const order = typeof p?.order === "number" ? p.order : 0;

    return {
      코드: id || "",
      이름: title || "",
      카테고리: category || "",
      상품분류: itemType, // product | service
      가격유형: priceType || "",
      가격: price || "",
      가격최소: priceMin || "",
      가격최대: priceMax || "",
      가격텍스트: priceText || "",
      요약: summary || "",
      상세: detail || "",
      스펙: specs || "",
      재고있음: !!inStock,
      이미지: image || "",
      이미지Fit: imageFit || "",
      링크: url || "",
      정렬순서: String(order),
    };
  });

  const payload: UnknownRecord = {
    상품타입: catalogType,
    혼합여부: hasProduct && hasService ? true : false,
    항목수: list.length,
    목록: list,
  };

  let text = JSON.stringify(payload, null, 2);

  // 프롬프트 토큰/길이 폭주 방지
  if (text.length > 24000) {
    const keep = Math.max(5, Math.floor(maxItems / 2));
    const trimmed = { ...payload, 목록: list.slice(0, keep), 항목수: Math.min(list.length, keep) };
    text = JSON.stringify(trimmed, null, 2);
  }

  return text;
}

export function buildStoreKnowledgeContextForPrompt(storeKnowledge: IStoreKnowledge | UnknownRecord | null | undefined, faqLimit = 6) {
  const sk = storeKnowledge as IStoreKnowledge | null;
  if (!sk) return "";

  const brand = sk.brand || {};
  const headline = safeStr(brand.headline, 300);
  const intro = safeStr(brand.intro, 1400);
  const philosophy = safeStr(brand.philosophy, 600);
  const productCategories = Array.isArray(brand.productCategories) ? brand.productCategories.map((item) => safeStr(item, 160)).filter(Boolean) : [];
  const features = Array.isArray(brand.features) ? brand.features.map((item) => safeStr(item, 220)).filter(Boolean) : [];
  const externalStores = Array.isArray(brand.externalStores)
    ? (brand.externalStores as unknown as UnknownRecord[])
        .map((item) => `${safeStr(item?.label, 80)} ${safeStr(item?.url, 240)}`.trim())
        .filter(Boolean)
    : [];

  const support = sk.support || {};
  const hours = safeStr(support.hours, 400);
  const outsideHoursMessage = safeStr(support.outsideHoursMessage, 400);
  const topics = Array.isArray(support.consultationTopics) ? support.consultationTopics.map((item) => safeStr(item, 160)).filter(Boolean) : [];

  const contact = toUnknownRecord(support.contact);
  const csPhone = safeStr(contact.csPhone, 80);
  const csEmail = safeStr(contact.csEmail, 120);
  const kakao = safeStr(contact.kakao, 120);

  const shipping = sk.shipping || {};
  const returns = sk.returns || {};
  const warranty = sk.warranty || {};
  const care = sk.care || {};

  const faqs = Array.isArray(sk?.faq) ? sk!.faq : [];
  const faqText = faqs
    .slice(0, Math.max(0, Math.min(faqLimit, 20)))
    .map((f: UnknownRecord) => {
      const q = safeStr(f?.q ?? f?.question, 200);
      const a = safeStr(f?.a ?? f?.answer, 600);
      if (!q && !a) return "";
      return `- Q: ${q}\n  A: ${a}`;
    })
    .filter(Boolean)
    .join("\n");

  const blocks = [
    headline || intro || philosophy
      ? `브랜드:\n${[headline, intro, philosophy].filter(Boolean).join("\n")}`
      : "",
    productCategories.length ? `주요 취급 상품:\n- ${productCategories.join("\n- ")}` : "",
    features.length ? `스토어 특징:\n- ${features.join("\n- ")}` : "",
    externalStores.length ? `운영 중인 스토어:\n- ${externalStores.join("\n- ")}` : "",
    hours ? `운영시간:\n${hours}` : "",
    outsideHoursMessage ? `운영시간 외 안내:\n${outsideHoursMessage}` : "",
    topics.length ? `상담 내용:\n- ${topics.join("\n- ")}` : "",
    csPhone || csEmail || kakao
      ? `연락/지원:\n- 전화: ${csPhone || "-"}\n- 이메일: ${csEmail || "-"}\n- 카카오: ${kakao || "-"}`
      : "",
    hasStoreKnowledgeContent(shipping)
      ? (() => {
          const s = toUnknownRecord(shipping);
          const notesText = Array.isArray(s.notes)
            ? (s.notes as string[]).map((item) => `- ${safeStr(item, 240)}`).join("\n")
            : "";
          return `배송:\n- 택배사: ${safeStr(s.courier, 120) || "-"}\n- 기본 배송비: ${safeStr(s.baseFee, 120) || "-"}\n- 무료 배송 기준: ${safeStr(s.freeShippingThreshold, 120) || "-"}\n- 발송 기준: ${safeStr(s.cutoffTime, 240) || "-"}\n- 평균 배송: ${safeStr(s.averageLeadTime, 120) || "-"}\n- 배송 조회: ${safeStr(s.trackingGuide, 300) || "-"}\n${notesText}`;
        })()
      : "",
    hasStoreKnowledgeContent(returns)
      ? (() => {
          const r = toUnknownRecord(returns);
          const listText = ["freeCases", "customerPaysCases", "unavailableCases", "processSteps"]
            .map((key) =>
              Array.isArray(r[key])
                ? `${key}: ${(r[key] as string[]).map((item) => safeStr(item, 220)).filter(Boolean).join(" / ")}`
                : "",
            )
            .filter(Boolean)
            .join("\n");
          return `반품/교환:\n- 가능 기간: ${safeStr(r.windowDays, 120) || "-"}\n- 고객 부담 비용: ${safeStr(r.customerFee, 120) || "-"}\n- 환불 안내: ${safeStr(r.refundGuide, 300) || "-"}\n${listText}`;
        })()
      : "",
    hasStoreKnowledgeContent(warranty) || hasStoreKnowledgeContent(care)
      ? (() => {
          const w = toUnknownRecord(warranty);
          const c = toUnknownRecord(care);
          const exclusions = Array.isArray(w.exclusions)
            ? (w.exclusions as string[]).map((item) => safeStr(item, 220)).filter(Boolean).join(" / ")
            : "-";
          const instructions = Array.isArray(c.instructions)
            ? (c.instructions as string[]).map((item) => safeStr(item, 220)).filter(Boolean).join(" / ")
            : "-";
          return `품질/관리:\n- 보증 요약: ${safeStr(w.summary, 400) || "-"}\n- 보증 기간: ${safeStr(w.period, 120) || "-"}\n- 보증 제외: ${exclusions}\n- 관리 방법: ${instructions}`;
        })()
      : "",
    faqText ? `FAQ:\n${faqText}` : "",
  ].filter(Boolean);

  return blocks.join("\n\n").trim();
}

async function getUniverseDetailModel(universeId: string) {
  const modelName = `${universeId}_details`;
  return await getModel<IUniverseDetailDocument>(MONGODB_AMU_URL, modelName, UniverseDetailSchema, modelName);
}

export async function loadUniverseDetailForPrompt(universeId: string): Promise<UniverseDetailLean | null> {
  const uid = (universeId || "").trim();
  if (!uid) return null;

  if (!MONGODB_AMU_URL) {
    logger.warn("[commercePromptData] MONGODB_AMU_URL가 없습니다. UniverseDetail 로드를 스킵합니다.", {
      universeId: uid,
    });
    return null;
  }

  const now = Date.now();
  const cached = detailCache.get(uid);
  if (cached && cached.exp > now) return cached.value;

  const inflight = detailInFlight.get(uid);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const Model = await getUniverseDetailModel(uid);
      const doc =
        ((await Model.findOne({ universeId: uid })
          .select({ universeId: 1, metadata: 1, settings: 1 })
          .lean()
          .exec()) as UniverseDetailLean | null) || null;

      sweepDetailCache(now);
      detailCache.set(uid, { value: doc, exp: now + DETAIL_CACHE_TTL_MS });
      return doc;
    } catch {
      logger.warn("[commercePromptData] UniverseDetail 로드 실패:", { universeId: uid });
      sweepDetailCache(now);
      detailCache.set(uid, { value: null, exp: now + Math.min(DETAIL_CACHE_TTL_MS, 3000) });
      return null;
    }
  })().finally(() => {
    detailInFlight.delete(uid);
  });

  detailInFlight.set(uid, p);
  return await p;
}

export async function loadStorefrontProductsForPrompt(universeId: string): Promise<StorefrontProduct[]> {
  const uid = (universeId || "").trim();
  if (!uid) return [];

  const now = Date.now();
  const cached = storefrontProductsCache.get(uid);
  if (cached && cached.exp > now) return cached.value;

  const inflight = storefrontProductsInFlight.get(uid);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const docs = await listCommerceStorefrontProducts(uid);
      const products = (Array.isArray(docs) ? (docs as UnknownRecord[]) : []).map((item) => ({
        ...item,
        id: item?.productId || item?.id || "",
        order: typeof item?.displayOrder === "number" ? item.displayOrder : item?.order,
      }));
      storefrontProductsCache.set(uid, { value: products, exp: now + DETAIL_CACHE_TTL_MS });
      return products;
    } catch {
      logger.warn("[commercePromptData] Storefront projection 로드 실패:", { universeId: uid });
      storefrontProductsCache.set(uid, { value: [], exp: now + Math.min(DETAIL_CACHE_TTL_MS, 3000) });
      return [];
    }
  })().finally(() => {
    storefrontProductsInFlight.delete(uid);
  });

  storefrontProductsInFlight.set(uid, p);
  return await p;
}
