import type { ICommerceProduct } from "types/commerce";
import type { IProduct, IStoreKnowledge } from "types/game";
import type { UnknownRecord } from "utils/common/typeUtils";
import { GAME_CONSTANTS as GC } from "consts/game";
import { useProductStore } from "store/commerce";
import { stripHtml } from "../common";
import { logger } from "../log";
import { hasStoreKnowledgeContent } from "./storeKnowledgeUtils";

/**
 * @docHint
 * @purpose commercePromptUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain commerce
 * @scope shared
 */

type ProductLike = Partial<IProduct> & Partial<ICommerceProduct>;

// 가격 포맷 (KRW, 간단 표기)
export const formatKRW = (n: number, s: boolean = true) => {
  if (typeof n !== "number" || isNaN(n)) return s ? "₩-" : "-원";
  return s ? `₩${n.toLocaleString("ko-KR")}` : `${n.toLocaleString("ko-KR")}원`;
};

// 커머스용 '상품 목록' 프롬프트 생성
type BuildOptions = {
  maxItems?: number; // 카탈로그에 포함할 최대 상품 수 (토큰 제어)
  groupByCategory?: boolean; // 카테고리별 그룹핑 여부
};

export function buildCommerceCatalogPrompt(products: ICommerceProduct[] = [], options: BuildOptions = {}) {
  const { maxItems = GC.COMMERCE.MAX_TOTAL_BUILD_PRODUCT } = options;

  // featured → displayOrder → title 순으로 안정 정렬
  const sorted = [...products].sort((a, b) => {
    const f = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    if (f !== 0) return f;
    const o = (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999);
    if (o !== 0) return o;
    return (a.title || "").localeCompare(b.title || "", "ko");
  });

  const sliced = sorted.slice(0, maxItems);

  // 카테고리 그룹핑 옵션
  const productInfos: UnknownRecord[] = [];
  for (const p of sliced) {
    const info: UnknownRecord = {};
    info["상품타입"] = p.itemType ?? "product";
    info["상품코드"] = p.id;
    info["상품명"] = p.title;
    info["상품요약정보"] = stripHtml(p.summary);
    if (typeof p.price === "number") {
      info["가격"] = p.price;
    } else if (typeof p.priceMin === "number") {
      info["가격"] = `${p.priceMin} ~ ${p.priceMax ?? ""}`.trim();
    } else if (p.priceText) {
      info["가격"] = p.priceText;
    }
    if (p.category) info["카테고리"] = p.category;
    if (typeof p.inStock === "boolean") info["재고"] = p.inStock ? "있음" : "없음";
    productInfos.push(info);
  }
  // NDJSON 형태로 라인 단위 출력 (LLM이 읽기 쉬우면서 토큰 효율적인 방식)
  const storeProductCatalog = productInfos.map((it) => JSON.stringify(it)).join("\n");
  logger.log("[commercePromptUtils] buildCommerceCatalogPrompt:", products);

  // 섹션 전체 블록 (태그로 범위 명확히 고정)
  return storeProductCatalog;
}

// 상점 지식을 knowledgeContext 문자열로 변환하는 유틸
export function buildStoreKnowledgeContext(sk?: IStoreKnowledge, options?: { faqLimit?: number }): string {
  if (!sk) return "";
  const faqLimit = options?.faqLimit ?? 6;

  const storeInfo: string[] = [];
  const storeDetailInfo: UnknownRecord = {};
  const brand = sk.brand || {};
  const brandLines = [brand.headline, brand.intro, brand.philosophy].map((item) => String(item || "").trim()).filter(Boolean);
  if (brand.productCategories?.length) storeDetailInfo["주요 취급 상품"] = brand.productCategories;
  if (brand.features?.length) storeDetailInfo["스토어 특징"] = brand.features;
  if (brand.externalStores?.length) storeDetailInfo["운영 중인 스토어"] = brand.externalStores;
  if (brandLines.length) storeInfo.push(`【비즈니스 개요】\n${brandLines.join("\n")}`);

  if (sk.support?.hours?.trim()) storeDetailInfo["운영시간"] = sk.support.hours.trim();
  if (sk.support?.outsideHoursMessage?.trim()) storeDetailInfo["운영시간 외 안내"] = sk.support.outsideHoursMessage.trim();
  if (sk.support?.consultationTopics?.length) storeDetailInfo["상담 내용"] = sk.support.consultationTopics;

  // 연락처
  const contacts: string[] = [];
  const contact = sk.support?.contact;
  if (contact?.csPhone?.trim()) contacts.push(`전화:${contact.csPhone.trim()}`);
  if (contact?.csEmail?.trim()) contacts.push(`이메일:${contact.csEmail.trim()}`);
  if (contact?.kakao?.trim()) contacts.push(`카카오:${contact.kakao.trim()}`);
  if (contacts.length) storeDetailInfo["연락처"] = contacts.join(" / ");

  if (hasStoreKnowledgeContent(sk.shipping)) storeDetailInfo["배송 정책"] = sk.shipping;
  if (hasStoreKnowledgeContent(sk.returns)) storeDetailInfo["반품/교환"] = sk.returns;
  if (hasStoreKnowledgeContent(sk.warranty)) storeDetailInfo["제품 품질 보증"] = sk.warranty;
  if (sk.care?.instructions?.length) storeDetailInfo["세탁/관리"] = sk.care.instructions;

  // FAQ (상위 N개만)
  if (Array.isArray(sk.faq) && sk.faq.length) {
    const pick = sk.faq.slice(0, faqLimit);
    const qna = [];
    for (const { q, a } of pick) {
      if (!q?.trim()) continue;
      const ans = a?.trim() ? ` — ${a.trim()}\n` : "";
      qna.push(`- Q: ${q.trim()}${ans}\n`);
    }
    storeDetailInfo["FAQ"] = qna.join("\n");
  }

  if (Object.keys(storeDetailInfo).length) storeInfo.push(JSON.stringify(storeDetailInfo));
  return storeInfo.join("\n");
}

// 선택된 상품만 상세 컨텍스트로 조합
export function buildSelectedProductDetailPrompt(
  products: ProductLike[] = [],
  opts: { maxProducts?: number; maxSpecItems?: number; maxValueLen?: number } = {},
) {
  const maxProducts = opts.maxProducts ?? 6;
  const productInfo: UnknownRecord = {};
  const sliced = products.slice(0, maxProducts);

  for (const p of sliced) {
    productInfo["상품타입"] = p.itemType ?? "product";
    productInfo["상품코드"] = p.id;
    productInfo["상품명"] = p.title;
    productInfo["상품상세"] = p.detail || p.summary;
  }

  if (!productInfo.length) return "";

  return `
<추천 및 관심 상품 정보>
  <required>현재 추천 또는 고객의 관심 상품 정보 목록으로 관련 상품 설명 요청 시 반드시 해당 상품에 대한 상세 정보를 참고하여 응답</required>

  ${JSON.stringify(productInfo)}
</추천 및 관심 상품 정보>`;
}

// 대화 텍스트에서 후보 상품을 뽑아 상세 섹션 블록을 만들어주는 헬퍼
export async function buildProductFocusSection(
  universeId: string,
  texts: string[],
  opts?: { limit?: number; minScore?: number },
) {
  const s = useProductStore.getState();
  await s.ensureLoaded(universeId);

  const joined = texts.filter(Boolean).join("\n");
  const limit = opts?.limit ?? GC.COMMERCE.MAX_PRODUCTS_PER_STAGE;
  const minScore = GC.COMMERCE.SEARCH_MIN_SCORE;

  // 바로 상품 배열로 스코어링
  const products = s.searchByText(universeId, joined, { limit, minScore });
  if (!products || products.length === 0) return "";

  return buildSelectedProductDetailPrompt(products, {
    maxProducts: limit,
    maxSpecItems: 8,
    maxValueLen: 80,
  });
}
