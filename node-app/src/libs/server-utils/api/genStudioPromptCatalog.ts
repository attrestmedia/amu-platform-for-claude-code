import "server-only";

import { listContentPrompts, listImagePrompts } from "libs/database/lab";
import type { ImagePromptInputPolicyType } from "types/app";
import { INTERNAL_PROMPT_ACCESS_LEVELS } from "utils/app/promptAccess";
import { toUnknownRecord, toTimestamp } from "utils/common/typeUtils";

export type GenStudioPromptCatalogType = "all" | "image" | "content";

type PromptCatalogArgs = {
  type?: GenStudioPromptCatalogType;
  q?: string;
  category?: string;
  enabled?: boolean;
  limit?: number;
  includeTemplateText?: boolean;
};

type PromptCatalogItem = {
  type: Exclude<GenStudioPromptCatalogType, "all">;
  key: string;
  title: string;
  enabled: boolean;
  categories: string[];
  tags: string[];
  usageTip: string;
  version: number;
  defaultParamKeys: string[];
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
  inputPolicy?: ImagePromptInputPolicyType;
  templateText?: string;
  templateTextTruncated?: boolean;
};

/** 목록 조회에서 templateText를 잘라 내보내는 기준 길이. key 정확 일치 조회는 전문을 반환한다. */
export const TEMPLATE_TEXT_PREVIEW_MAX_CHARS = 12000;

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toStringList(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => toSafeString(value))
    .filter(Boolean);
}

function toBoundedLimit(raw: unknown, fallback = 50, min = 1, max = 100) {
  const value = Number(raw || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function toUpdatedAtTime(value: unknown) {
  return toTimestamp(value);
}

function toDefaultParamKeys(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.keys(raw as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
}

function toTemplateText(raw: unknown) {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function toImageInputPolicy(raw: unknown): ImagePromptInputPolicyType | undefined {
  const inputPolicy = toUnknownRecord(raw);
  const referenceImage = toUnknownRecord(inputPolicy.referenceImage);
  if (Object.keys(referenceImage).length === 0) return undefined;

  return {
    referenceImage: {
      required: referenceImage.required === true,
      minCount: Number.isFinite(Number(referenceImage.minCount)) ? Math.max(0, Math.floor(Number(referenceImage.minCount))) : undefined,
      maxCount: Number.isFinite(Number(referenceImage.maxCount)) ? Math.max(0, Math.floor(Number(referenceImage.maxCount))) : undefined,
      enforceInCustomMode: referenceImage.enforceInCustomMode !== false,
    },
  };
}

function toTemplateTextFields(raw: unknown, full: boolean) {
  const text = toTemplateText(raw);
  if (full || text.length <= TEMPLATE_TEXT_PREVIEW_MAX_CHARS) {
    return { templateText: text, templateTextTruncated: false };
  }
  return { templateText: text.slice(0, TEMPLATE_TEXT_PREVIEW_MAX_CHARS), templateTextTruncated: true };
}

function normalizePromptItem(
  type: Exclude<GenStudioPromptCatalogType, "all">,
  row: unknown,
  includeTemplateText: boolean,
  fullTemplateText: boolean,
): PromptCatalogItem {
  const r = toUnknownRecord(row);
  return {
    type,
    key: toSafeString(r.key),
    title: toSafeString(r.title),
    enabled: r.enabled !== false,
    categories: toStringList(r.categories),
    tags: toStringList(r.tags),
    usageTip: type === "image" ? toSafeString(r.usageTip) : "",
    version: Number(r.version || 1),
    defaultParamKeys: toDefaultParamKeys(r.defaultParams),
    createdAt: (r.createdAt as string | Date | null) || null,
    updatedAt: (r.updatedAt as string | Date | null) || null,
    ...(type === "image" ? { inputPolicy: toImageInputPolicy(r.inputPolicy) } : {}),
    ...(includeTemplateText ? toTemplateTextFields(r.templateText, fullTemplateText) : {}),
  };
}

/**
 * @docHint
 * @purpose Gen Studio 프롬프트 카탈로그 조회
 * @process image/content prompt 저장소 병렬 조회  정규화  정렬  제한 수 적용
 * @domain lab
 * @scope server
 */
export async function listGenStudioPromptCatalog(args: PromptCatalogArgs) {
  const type = args.type || "all";
  const includeTemplateText = args.includeTemplateText === true;
  const limit = toBoundedLimit(args.limit, 50, 1, 100);
  const q = toSafeString(args.q) || undefined;
  const category = toSafeString(args.category) || undefined;
  const enabled = typeof args.enabled === "boolean" ? args.enabled : undefined;

  const [imageRows, contentRows] = await Promise.all([
    type === "content"
      ? Promise.resolve([])
      : listImagePrompts({ q, category, enabled, accessLevels: INTERNAL_PROMPT_ACCESS_LEVELS }),
    type === "image"
      ? Promise.resolve([])
      : listContentPrompts({ q, category, enabled, accessLevels: INTERNAL_PROMPT_ACCESS_LEVELS }),
  ]);

  // 검색어가 특정 key와 정확히 일치하면 단건 조회로 보고 templateText 전문을 반환한다.
  // (에이전트/MCP의 read → modify → write 왕복이 프리뷰 절단으로 깨지는 것을 막는다)
  const exactKey = (q || "").toLowerCase();
  const isExactKeyMatch = (row: unknown) =>
    exactKey.length > 0 && toSafeString(toUnknownRecord(row).key).toLowerCase() === exactKey;

  const imageItems = (imageRows || []).map((row: unknown) =>
    normalizePromptItem("image", row, includeTemplateText, isExactKeyMatch(row)),
  );
  const contentItems = (contentRows || []).map((row: unknown) =>
    normalizePromptItem("content", row, includeTemplateText, isExactKeyMatch(row)),
  );

  const items = [...imageItems, ...contentItems]
    .sort((a, b) => {
      const updatedDiff = toUpdatedAtTime(b.updatedAt) - toUpdatedAtTime(a.updatedAt);
      if (updatedDiff !== 0) return updatedDiff;
      const titleDiff = a.title.localeCompare(b.title);
      if (titleDiff !== 0) return titleDiff;
      const typeDiff = a.type.localeCompare(b.type);
      if (typeDiff !== 0) return typeDiff;
      return a.key.localeCompare(b.key);
    })
    .slice(0, limit);

  return {
    type,
    limit,
    q: q || "",
    category: category || "",
    enabled,
    includeTemplateText,
    countByType: {
      image: imageItems.length,
      content: contentItems.length,
    },
    items,
  };
}
