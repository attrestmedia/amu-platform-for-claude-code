import type { IStoreKnowledge } from "types/game";

/**
 * @docHint
 * @purpose 스마트스토어 구조화 메타데이터 저장 전 정리
 * @process 빈 문자열/배열/FAQ 제거  저장 가능 payload 반환
 * @domain commerce.storefront
 * @scope shared
 */

const cleanText = (value?: string | null) => String(value || "").trim();
const cleanList = (items?: string[]) => (Array.isArray(items) ? items.map(cleanText).filter(Boolean) : []);

export function hasStoreKnowledgeContent(value?: unknown): boolean {
  if (!value) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.some((item) => hasStoreKnowledgeContent(item));
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some((item) => hasStoreKnowledgeContent(item));
  return true;
}

export function sanitizeStoreKnowledge(value?: IStoreKnowledge): IStoreKnowledge | undefined {
  if (!value) return undefined;

  const brand = {
    headline: cleanText(value.brand?.headline),
    intro: cleanText(value.brand?.intro),
    philosophy: cleanText(value.brand?.philosophy),
    productCategories: cleanList(value.brand?.productCategories),
    features: cleanList(value.brand?.features),
    externalStores: (value.brand?.externalStores || [])
      .map((item) => ({ label: cleanText(item.label), url: cleanText(item.url) }))
      .filter((item) => item.label || item.url),
  };
  const support = {
    hours: cleanText(value.support?.hours),
    outsideHoursMessage: cleanText(value.support?.outsideHoursMessage),
    consultationTopics: cleanList(value.support?.consultationTopics),
    contact: {
      csPhone: cleanText(value.support?.contact?.csPhone),
      csEmail: cleanText(value.support?.contact?.csEmail),
      kakao: cleanText(value.support?.contact?.kakao),
    },
  };
  const shipping = {
    courier: cleanText(value.shipping?.courier),
    baseFee: cleanText(value.shipping?.baseFee),
    freeShippingThreshold: cleanText(value.shipping?.freeShippingThreshold),
    cutoffTime: cleanText(value.shipping?.cutoffTime),
    averageLeadTime: cleanText(value.shipping?.averageLeadTime),
    trackingGuide: cleanText(value.shipping?.trackingGuide),
    notes: cleanList(value.shipping?.notes),
  };
  const returns = {
    windowDays: cleanText(value.returns?.windowDays),
    customerFee: cleanText(value.returns?.customerFee),
    freeCases: cleanList(value.returns?.freeCases),
    customerPaysCases: cleanList(value.returns?.customerPaysCases),
    unavailableCases: cleanList(value.returns?.unavailableCases),
    processSteps: cleanList(value.returns?.processSteps),
    refundGuide: cleanText(value.returns?.refundGuide),
  };
  const warranty = {
    summary: cleanText(value.warranty?.summary),
    period: cleanText(value.warranty?.period),
    exclusions: cleanList(value.warranty?.exclusions),
  };
  const care = {
    instructions: cleanList(value.care?.instructions),
  };
  const faq = (value.faq || [])
    .map((item) => ({ q: cleanText(item.q), a: cleanText(item.a) }))
    .filter((item) => item.q && item.a);

  const next: IStoreKnowledge = {};
  if (hasStoreKnowledgeContent(brand)) next.brand = brand;
  if (hasStoreKnowledgeContent(support)) next.support = support;
  if (hasStoreKnowledgeContent(shipping)) next.shipping = shipping;
  if (hasStoreKnowledgeContent(returns)) next.returns = returns;
  if (hasStoreKnowledgeContent(warranty)) next.warranty = warranty;
  if (hasStoreKnowledgeContent(care)) next.care = care;
  if (faq.length) next.faq = faq;
  if (hasStoreKnowledgeContent(next)) next.updatedAt = value.updatedAt || new Date().toISOString();

  return hasStoreKnowledgeContent(next) ? next : undefined;
}
