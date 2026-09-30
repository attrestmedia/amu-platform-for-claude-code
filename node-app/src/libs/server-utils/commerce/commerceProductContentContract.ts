import { toUnknownRecord } from "utils/common/typeUtils";
import {
  buildSmartstoreDetailImageHtml,
  markdownToSmartstoreHtml,
  sanitizeSmartstoreDetailHtml,
  validateSmartstoreDetailHtml,
} from "utils/commerce/smartstoreDetailHtmlUtils";

/**
 * @docHint
 * @purpose SSM-204 상품 사실·필수 고시 기반 콘텐츠 계약. draft의 구조화 팩트를 읽기 전용 source packet으로
 *          추출하고, 생성 후보의 사실 단정(가격·재고·원산지·배송·연락처)을 패킷 대비 검증하며,
 *          이미지 순서와 정보 블록을 결합한 상세 페이지 HTML을 조립한다.
 * @process 팩트 추출 → claims 검증(미지원 단정 fail-closed) → 후보 프롬프트 구성 → 상세 페이지 조립
 * @domain commerce.naver
 * @scope server
 *
 * 계약 원칙:
 * - 가격·재고·원산지·배송·고시는 생성 모델이 추정하지 않는다. 패킷에 없는 팩트 단정은 unsupportedClaims로
 *   분류되고, 적용(apply-asset) 단계에서 차단된다(fail-closed).
 * - composer는 고시가 패킷에 없을 때 문장을 만들어내지 않는다. 누락 사실을 issue로 반환한다.
 * - 이 파일은 순수 로직만 둔다. DB·env 접근은 라우트 계층의 책임이다.
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toRecord(value: unknown) {
  return toUnknownRecord(value);
}

/** 소수점 없는 금액·수량 비교용. 쉼표·공백·통화기호·'원' 단위를 제거한 숫자 문자열을 돌려준다. */
function toNumericKey(value: string) {
  return value.replace(/[₩,\s원]/g, "");
}

/** 안정 직렬화(키 정렬) 후 FNV-1a 32bit hex. 팩트가 하나라도 바뀌면 hash가 바뀐다. */
function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = toRecord(value);
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function fnv1aHex(input: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/* ─────────────────────────────────────────────
 * source packet
 * ───────────────────────────────────────────── */

export type CommerceProductFactPacket = {
  productFacts: {
    productName: string;
    salePrice: string;
    stockQuantity: string;
    statusType: string;
  };
  origin: {
    originAreaCode: string;
    originAreaName: string;
    originContent: string;
  };
  logistics: {
    shippingPolicyText: string;
    returnPolicyText: string;
    asPolicyText: string;
  };
  notice: {
    productInfoProvidedNoticeType: string;
    payloadEntries: Array<{ name: string; value: string }>;
  };
  images: Array<{ url: string; role: string; sortOrder: number }>;
  factsHash: string;
};
export function buildCommerceProductSourcePacket(draft: unknown): CommerceProductFactPacket {
  const record = toRecord(draft);
  const smartstore = toRecord(record.smartstore);
  const display = toRecord(record.display);
  const origin = toRecord(smartstore.origin);
  const logistics = toRecord(smartstore.logistics);
  const notice = toRecord(smartstore.notice);
  const noticePayload = toRecord(notice.payload);

  const packet = {
    productFacts: {
      productName: toSafeString(smartstore.channelProductName || smartstore.productName || display.title),
      salePrice: toSafeString(smartstore.salePrice ?? display.price),
      stockQuantity: toSafeString(smartstore.stockQuantity),
      statusType: toSafeString(smartstore.statusType),
    },
    origin: {
      originAreaCode: toSafeString(origin.originAreaCode),
      originAreaName: toSafeString(origin.originAreaName),
      originContent: toSafeString(origin.content ?? origin.originContent),
    },
    logistics: {
      shippingPolicyText: toSafeString(logistics.shippingPolicyText),
      returnPolicyText: toSafeString(logistics.returnPolicyText),
      asPolicyText: toSafeString(logistics.asPolicyText),
    },
    notice: {
      productInfoProvidedNoticeType: toSafeString(notice.productInfoProvidedNoticeType),
      payloadEntries: Object.entries(noticePayload)
        .map(([name, value]) => ({ name, value: toSafeString(value) }))
        .filter((entry) => entry.value.length > 0),
    },
    images: (Array.isArray(smartstore.images) ? smartstore.images : [])
      .map((image, index) => {
        const row = toRecord(image);
        const sortOrderRaw = Number(row.sortOrder);
        return {
          url: toSafeString(row.url),
          role: toSafeString(row.role) || "detail",
          sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : index + 1,
        };
      })
      .filter((image) => /^https?:\/\//i.test(image.url))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };

  // factsHash는 팩트 직렬화 기반이다. 이미지 순서는 조립 재료일 뿐 팩트가 아니므로 제외한다.
  return { ...packet, factsHash: fnv1aHex(stableStringify(packet)) };
}

/* ─────────────────────────────────────────────
 * claims 검증
 * ───────────────────────────────────────────── */

export type CommerceProductClaimCode =
  | "price_not_in_source"
  | "price_mismatch"
  | "discount_not_in_source"
  | "stock_not_in_source"
  | "stock_mismatch"
  | "sold_out_urgency_not_in_source"
  | "origin_not_in_source"
  | "delivery_not_in_source"
  | "shipping_cost_not_in_source"
  | "contact_not_in_source"
  | "price_from_source"
  | "stock_from_source"
  | "origin_from_source"
  | "delivery_from_source"
  | "contact_from_source";

export type CommerceProductUnsupportedClaim = {
  code: CommerceProductClaimCode;
  matchedText: string;
  reason: string;
};

export type CommerceProductAllowedClaim = {
  code: CommerceProductClaimCode;
  matchedText: string;
  sourceField: string;
};

export type CommerceProductClaimsVerdict = {
  field: string;
  allowedClaims: CommerceProductAllowedClaim[];
  unsupportedClaims: CommerceProductUnsupportedClaim[];
  blocked: boolean;
};

// 가격: 숫자 + (선택 선행 ₩) + 원 / 원대. "원산지"처럼 숫자 없는 '원'은 잡지 않는다.
// ₩ 접두사만으로 원이 붙지 않는 형태("₩29,800")도 검출한다. "2만 9천원"류 한국어 수사는 미검출이며,
// 과잉검출(합법 문구 차단)보다 놓침이 나은 유형은 아니므로 후속 보강 대상으로 남긴다.
const PRICE_PATTERN = /(?:₩\s*)?(\d{1,3}(?:,\d{3})+|\d+)\s*원(?:대)?|₩\s*(\d{1,3}(?:,\d{3})+)/g;
// 할인율·할인 표현. 패킷에는 할인 정보가 없으므로 단정 자체가 추정이다.
// (?<!\d)는 소재 함유율("면 100%")을 할인으로 오판하지 않기 위한 자리표시자다.
const DISCOUNT_PATTERN = /(?<!\d)\d{1,2}\s*%|할인|초특가|최저가/g;
// 재고 수량 단정.
const STOCK_PATTERN = /(?:재고|수량)\s*[:：]?\s*(\d{1,3}(?:,\d{3})*)/g;
// 품절 임박류 긴급성 단정.
const SOLD_OUT_URGENCY_PATTERN = /품절\s*임박|품절임박|품절\s*직전|마감\s*임박/g;
// 원산지 단정: 흔한 산지 접미사 + '원산지:' 라벨.
const ORIGIN_TOKEN_PATTERN = /(국산|국내산|한국산|중국산|미국산|일본산|프랑스산|이탈리아산|영국산|독일산|베트남산|인도네시아산|태국산)/g;
const ORIGIN_LABEL_PATTERN = /원산지\s*[:：]\s*([가-힣A-Za-z\s]{1,24})/g;
// 배송 시점 단정.
const DELIVERY_PATTERN = /(당일\s*(?:출고|배송)|익일\s*(?:출고|배송)|\d{1,2}\s*일\s*(?:이내|내 도착|도착)|내일\s*도착)/g;
// 배송비·무료배송 단정. 배송 정책에 근거가 없으면 모델이 만든 사실이다.
const SHIPPING_COST_PATTERN = /(무료\s*배송|무료배송|배송비|택배비)/g;
// 연락처 단정.
const PHONE_PATTERN = /0\d{1,2}-\d{3,4}-\d{4}/g;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, "");
}

function collectMatches(text: string, pattern: RegExp) {
  const matches: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[0]) matches.push(match[0]);
  }
  return matches;
}

export function validateCommerceProductClaims(input: {
  packet: CommerceProductFactPacket;
  field: string;
  text: string;
}): CommerceProductClaimsVerdict {
  const { packet, field } = input;
  const text = String(input.text || "");
  const allowedClaims: CommerceProductAllowedClaim[] = [];
  const unsupportedClaims: CommerceProductUnsupportedClaim[] = [];

  const pushUnsupported = (code: CommerceProductClaimCode, matchedText: string, reason: string) => {
    if (unsupportedClaims.some((claim) => claim.code === code && claim.matchedText === matchedText)) return;
    unsupportedClaims.push({ code, matchedText, reason });
  };

  // 배송비·택배비 문맥의 금액("배송비 2,500원")은 가격 단정이 아니므로 price 검출에서 제외한다.
  const shippingCostPositions: Array<[number, number]> = [];
  for (const match of text.matchAll(SHIPPING_COST_PATTERN)) {
    const start = match.index ?? 0;
    shippingCostPositions.push([start, start + (match[0]?.length || 0)]);
  }
  const nearShippingCost = (index: number) =>
    shippingCostPositions.some(([start, end]) => index >= start && index <= end + 16);

  // ── 가격
  for (const match of text.matchAll(PRICE_PATTERN)) {
    if (nearShippingCost(match.index ?? 0)) continue;
    const matchedText = match[0] || "";
    const numberKey = toNumericKey(matchedText);
    if (!packet.productFacts.salePrice) {
      pushUnsupported("price_not_in_source", matchedText, "상품 판매가가 초안에 등록되어 있지 않아 가격을 단정할 수 없습니다.");
      continue;
    }
    if (toNumericKey(packet.productFacts.salePrice) !== numberKey) {
      pushUnsupported("price_mismatch", matchedText, `초안 판매가(${packet.productFacts.salePrice})와 다른 가격을 단정했습니다.`);
      continue;
    }
    allowedClaims.push({ code: "price_from_source", matchedText, sourceField: "smartstore.salePrice" });
  }

  // ── 할인. 고시 payload 등 패킷 텍스트에 같은 표현이 있으면(소재 함유율 등) 검출에서 제외한다.
  const packetText = normalizeWhitespace(
    [...packet.notice.payloadEntries.map((entry) => entry.value), packet.productFacts.productName].join(" "),
  );
  for (const match of collectMatches(text, DISCOUNT_PATTERN)) {
    if (packetText.includes(normalizeWhitespace(match))) continue;
    pushUnsupported("discount_not_in_source", match, "할인·최저가 정보는 초안에 없어 단정할 수 없습니다.");
  }

  // ── 재고 수량
  for (const match of text.matchAll(STOCK_PATTERN)) {
    const quantity = match[1] || "";
    const matchedText = match[0] || "";
    if (!packet.productFacts.stockQuantity) {
      pushUnsupported("stock_not_in_source", matchedText, "재고 수량이 초안에 등록되어 있지 않아 단정할 수 없습니다.");
      continue;
    }
    if (toNumericKey(packet.productFacts.stockQuantity) !== toNumericKey(quantity)) {
      pushUnsupported("stock_mismatch", matchedText, `초안 재고(${packet.productFacts.stockQuantity})와 다른 수량을 단정했습니다.`);
      continue;
    }
    allowedClaims.push({ code: "stock_from_source", matchedText, sourceField: "smartstore.stockQuantity" });
  }

  // ── 품절 임박 긴급성
  for (const match of collectMatches(text, SOLD_OUT_URGENCY_PATTERN)) {
    const soldOut = toNumericKey(packet.productFacts.stockQuantity) === "0";
    if (!soldOut) {
      pushUnsupported("sold_out_urgency_not_in_source", match, "품절 임박 여부는 재고가 0이 아닌 이상 단정할 수 없습니다.");
    }
  }

  // ── 원산지
  const originSource = `${packet.origin.originAreaName} ${packet.origin.originContent}`.trim();
  for (const match of collectMatches(text, ORIGIN_TOKEN_PATTERN)) {
    if (!originSource) {
      pushUnsupported("origin_not_in_source", match, "원산지 정보가 초안에 등록되어 있지 않아 단정할 수 없습니다.");
      continue;
    }
    if (normalizeWhitespace(originSource).includes(normalizeWhitespace(match))) {
      allowedClaims.push({ code: "origin_from_source", matchedText: match, sourceField: "smartstore.origin" });
      continue;
    }
    pushUnsupported("origin_not_in_source", match, `초안 원산지(${originSource})와 다른 산지를 단정했습니다.`);
  }
  for (const match of text.matchAll(ORIGIN_LABEL_PATTERN)) {
    const labeledOrigin = (match[1] || "").trim();
    if (!labeledOrigin) continue;
    if (!originSource || !normalizeWhitespace(originSource).includes(normalizeWhitespace(labeledOrigin))) {
      pushUnsupported("origin_not_in_source", match[0] || "", "원산지 라벨 값이 초안에 등록된 원산지와 일치하지 않습니다.");
    }
  }

  // ── 배송 시점
  const shippingSource = normalizeWhitespace(packet.logistics.shippingPolicyText);
  for (const match of collectMatches(text, DELIVERY_PATTERN)) {
    if (!shippingSource) {
      pushUnsupported("delivery_not_in_source", match, "배송 정책이 초안에 등록되어 있지 않아 배송 시점을 단정할 수 없습니다.");
      continue;
    }
    if (shippingSource.includes(normalizeWhitespace(match))) {
      allowedClaims.push({
        code: "delivery_from_source",
        matchedText: match,
        sourceField: "smartstore.logistics.shippingPolicyText",
      });
      continue;
    }
    pushUnsupported("delivery_not_in_source", match, "배송 정책 문구에서 확인되지 않는 배송 시점을 단정했습니다.");
  }

  // ── 배송비·무료배송 (P0-1: 배송 팩트의 나머지 절반. 정책 문구에 근거가 없으면 모델이 만든 사실이다)
  for (const match of collectMatches(text, SHIPPING_COST_PATTERN)) {
    if (shippingSource.includes(normalizeWhitespace(match))) {
      allowedClaims.push({
        code: "delivery_from_source",
        matchedText: match,
        sourceField: "smartstore.logistics.shippingPolicyText",
      });
      continue;
    }
    pushUnsupported("shipping_cost_not_in_source", match, "배송비 정보는 초안 배송 정책에서 확인되지 않아 단정할 수 없습니다.");
  }

  // ── 연락처
  const contactSource = normalizeWhitespace(
    [
      packet.logistics.asPolicyText,
      packet.logistics.returnPolicyText,
      ...packet.notice.payloadEntries.map((entry) => entry.value),
    ].join(" "),
  );
  for (const match of collectMatches(text, PHONE_PATTERN)) {
    if (!contactSource || !contactSource.includes(normalizeWhitespace(match))) {
      pushUnsupported("contact_not_in_source", match, "초안에 등록되지 않은 연락처를 단정했습니다.");
      continue;
    }
    allowedClaims.push({ code: "contact_from_source", matchedText: match, sourceField: "smartstore.notice.payload" });
  }

  return {
    field,
    allowedClaims,
    unsupportedClaims,
    // fail-closed: 미지원 단정이 하나라도 있으면 적용을 막는다.
    blocked: unsupportedClaims.length > 0,
  };
}

/* ─────────────────────────────────────────────
 * 후보 생성 프롬프트
 * ───────────────────────────────────────────── */

export const COMMERCE_PRODUCT_CONTENT_FIELDS = ["title", "summary", "detailHtml"] as const;
export type CommerceProductContentField = (typeof COMMERCE_PRODUCT_CONTENT_FIELDS)[number];

export function isCommerceProductContentField(value: unknown): value is CommerceProductContentField {
  return (COMMERCE_PRODUCT_CONTENT_FIELDS as readonly string[]).includes(String(value));
}

const FIELD_INSTRUCTIONS: Record<CommerceProductContentField, string> = {
  title: "상품명 후보 1개를 한 줄로 작성한다. 브랜드·모델명 추측 금지.",
  summary: "상품 요약 1~2문장을 작성한다. 목록 화면에서 보이는 짧은 소개문이다.",
  detailHtml: "상세 설명 본문을 마크다운(## 소제목, - 목록)으로 작성한다. 표는 사용하지 않는다.",
};

/**
 * 패킷 팩트를 프롬프트에 주입한다. 패킷에 없는 항목은 "정보 없음"으로 명시해 모델이 추정할 여지를 없앤다.
 */
export function buildCommerceProductContentPrompt(input: {
  packet: CommerceProductFactPacket;
  field: CommerceProductContentField;
  extraPrompt?: string;
}) {
  const { packet, field } = input;
  const facts = [
    `- 상품명: ${packet.productFacts.productName || "(정보 없음 — 임의로 만들지 않는다)"}`,
    `- 판매가: ${packet.productFacts.salePrice || "(정보 없음 — 가격을 단정하지 않는다)"}`,
    `- 재고: ${packet.productFacts.stockQuantity || "(정보 없음 — 수량을 단정하지 않는다)"}`,
    `- 판매 상태: ${packet.productFacts.statusType || "(정보 없음)"}`,
    `- 원산지: ${packet.origin.originAreaName || packet.origin.originContent || "(정보 없음 — 원산지를 단정하지 않는다)"}`,
    `- 배송 정책: ${packet.logistics.shippingPolicyText || "(정보 없음 — 배송 시점을 단정하지 않는다)"}`,
    `- 교환/반품: ${packet.logistics.returnPolicyText || "(정보 없음)"}`,
    `- A/S: ${packet.logistics.asPolicyText || "(정보 없음 — 연락처를 만들지 않는다)"}`,
    `- 필수 고시 유형: ${packet.notice.productInfoProvidedNoticeType || "(정보 없음)"}`,
    ...packet.notice.payloadEntries.map((entry) => `- 고시 ${entry.name}: ${entry.value}`),
  ].join("\n");

  return [
    "너는 스마트스토어 상품 문구를 작성한다. 아래 '상품 사실'에 적힌 값만 사실로 사용할 수 있다.",
    "상품 사실에 없는 가격, 재고, 원산지, 배송 시점, 할인, 연락처, 인증, 효능을 절대 단정하지 않는다.",
    "확인되지 않은 정보는 아예 문장에서 빼라. 추측을 채워 넣지 않는다.",
    "",
    "## 상품 사실",
    facts,
    "",
    "## 작성 대상",
    FIELD_INSTRUCTIONS[field],
    input.extraPrompt ? `\n## 추가 지시\n${String(input.extraPrompt).trim()}` : "",
  ]
    .join("\n")
    .trim();
}

/* ─────────────────────────────────────────────
 * 상세 페이지 composer
 * ───────────────────────────────────────────── */

export type CommerceProductDetailComposerIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

export type CommerceProductDetailComposerResult = {
  html: string;
  issues: CommerceProductDetailComposerIssue[];
  errors: CommerceProductDetailComposerIssue[];
  warnings: CommerceProductDetailComposerIssue[];
  ready: boolean;
};

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildInfoSectionHtml(sectionTitle: string, rows: Array<{ label: string; value: string }>) {
  const usableRows = rows.filter((row) => row.value);
  if (!usableRows.length) return "";
  const rowHtml = usableRows
    .map((row) => `<p><strong>${escapeHtmlText(row.label)}:</strong> ${escapeHtmlText(row.value)}</p>`)
    .join("");
  return `<h3>${escapeHtmlText(sectionTitle)}</h3>${rowHtml}`;
}

/**
 * 이미지 순서 + 후보 본문 + 정보 블록을 결합한 상세 페이지 HTML을 만든다.
 *
 * fail-closed 원칙: 패킷에 없는 고시·연락처·팩트를 문장으로 만들어내지 않는다.
 * 필수 고시 유형이 없거나, 유형이 있는데 고시 항목이 비어 있으면 error issue를 남기고 ready=false를 돌려준다.
 */
export function composeCommerceProductDetailHtml(input: {
  packet: CommerceProductFactPacket;
  candidateHtml: string;
  options?: {
    includeImageSequence?: boolean;
    includeInfoBlocks?: boolean;
  };
}): CommerceProductDetailComposerResult {
  const { packet } = input;
  const includeImageSequence = input.options?.includeImageSequence !== false;
  const includeInfoBlocks = input.options?.includeInfoBlocks !== false;
  const issues: CommerceProductDetailComposerIssue[] = [];
  const sections: string[] = [];

  if (includeImageSequence && packet.images.length) {
    const imageHtml = packet.images.map((image) => buildSmartstoreDetailImageHtml(image.url)).join("");
    sections.push(`<div class="amu-smartstore-image-sequence">${imageHtml}</div>`);
  }

  const bodyHtml = markdownToSmartstoreHtml(input.candidateHtml);
  if (bodyHtml) sections.push(bodyHtml);

  if (includeInfoBlocks) {
    if (!packet.notice.productInfoProvidedNoticeType) {
      issues.push({
        code: "notice_type_missing",
        severity: "error",
        message:
          "필수 고시 유형(productInfoProvidedNoticeType)이 등록되어 있지 않습니다. 고시를 등록한 뒤 상세 페이지를 조립하세요.",
      });
    } else if (!packet.notice.payloadEntries.length) {
      issues.push({
        code: "notice_payload_missing",
        severity: "error",
        message: "고시 유형은 있지만 고시 항목(payload)이 비어 있습니다. 고시 항목을 등록한 뒤 조립하세요.",
      });
    }

    const infoHtml = [
      buildInfoSectionHtml("상품 정보", [
        { label: "상품명", value: packet.productFacts.productName },
        { label: "판매가", value: packet.productFacts.salePrice ? `${packet.productFacts.salePrice}원` : "" },
        { label: "재고", value: packet.productFacts.stockQuantity },
        { label: "판매 상태", value: packet.productFacts.statusType },
        { label: "원산지", value: packet.origin.originAreaName || packet.origin.originContent },
      ]),
      buildInfoSectionHtml("배송 · 교환/반품 · A/S", [
        { label: "배송", value: packet.logistics.shippingPolicyText },
        { label: "교환/반품", value: packet.logistics.returnPolicyText },
        { label: "A/S", value: packet.logistics.asPolicyText },
      ]),
      buildInfoSectionHtml("필수 고시", [
        { label: "고시 유형", value: packet.notice.productInfoProvidedNoticeType },
        ...packet.notice.payloadEntries.map((entry) => ({ label: entry.name, value: entry.value })),
      ]),
    ]
      .filter(Boolean)
      .join("");

    if (infoHtml) sections.push(infoHtml);
  }

  const html = sanitizeSmartstoreDetailHtml(sections.join(""));
  const htmlValidation = validateSmartstoreDetailHtml(html);
  htmlValidation.errors.forEach((issue) => {
    issues.push({ code: issue.code, severity: "error", message: issue.message.ko });
  });
  htmlValidation.warnings.forEach((issue) => {
    issues.push({ code: issue.code, severity: "warning", message: issue.message.ko });
  });

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    html,
    issues,
    errors,
    warnings,
    ready: errors.length === 0,
  };
}
