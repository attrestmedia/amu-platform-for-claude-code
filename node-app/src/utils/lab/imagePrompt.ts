import {
  cleanupPromptNoneMarkers,
  normalizeLabel,
  parsePromptOptionToken,
  PROMPT_NONE_LINE_MARKER,
} from "./promptTemplateUtils";
import {
  DEFAULT_MODEL_REFERENCE_STRENGTH,
  getReferenceStrengthPrompt,
  normalizeReferenceStrength,
  type ReferenceStrengthType,
} from "./referenceStrength";

/**
 * @docHint
 * @purpose imagePrompt 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공  템플릿 치환/라벨 정규화 포함
 * @domain ai-prompt
 * @scope global
 */

// 치환 토큰 추출: {key::placeholder} / {key::opt1|opt2|...} / {key*::required1|required2}
export type PromptVariableSpec = {
  key: string;
  kind: "select" | "text";
  options?: string[];
  placeholder?: string;
  required?: boolean;
};

export type PromptTemplateVariableField = "templateText" | "sceneTemplate";
export type PromptTemplateVariableIssue = {
  code:
    | "invalid_variable_key"
    | "invalid_required_marker"
    | "empty_select_option"
    | "select_requires_multiple_options"
    | "reserved_option_value"
    | "conflicting_variable_definition"
    | "invalid_condition_syntax"
    | "unknown_condition_variable"
    | "unmatched_condition_close"
    | "unclosed_condition"
    | "condition_nesting_limit";
  key?: string;
  field: PromptTemplateVariableField;
  message: string;
};

export const IMAGE_PROMPT_OPTION_NONE = "__amu_none__";
export const IMAGE_PROMPT_OPTION_CUSTOM = "__amu_custom__";
export const getImagePromptCustomParamKey = (key: string) => `${key}__custom`;

const IMAGE_PROMPT_VARIABLE_DEFAULT_PARAM_DENY = new Set([
  "provider",
  "modelName",
  "size",
  "aspectRatio",
  "negative",
  "previewImage",
  "modelSamples",
  "enabled",
  "categories",
  "tags",
]);

const INLINE_NEGATIVE_LABEL_RE = /^(?:\*\*)?\s*금지 표현\s*(?:\*\*)?\s*[:：]\s*/i;
const INLINE_NEGATIVE_SECTION_RE =
  /(?:^|\n)(?:(?:\*\*)?\s*아래의 표현은 이미지에 절대 포함 금지\s*(?:\*\*)?\s*\n+)?\s*(?:\*\*)?\s*금지 표현\s*(?:\*\*)?\s*[:：]\s*([\s\S]*)$/i;
const PROMPT_VARIABLE_TOKEN_RE = /\{([^{}:]+)::([\s\S]*?)\}/g;
const PROMPT_CONDITION_TAG_RE = /\{#if\s+([\s\S]*?)\}|\{\/if\}/g;
const PROMPT_CONDITION_EXPRESSION_RE = /^([\w\-가-힣 ]+)\s*(==|!=)\s*(?:"([^"\\]*)"|'([^'\\]*)')$/;
const PROMPT_CONDITION_MAX_DEPTH = 8;
const PROMPT_VARIABLE_KEY_RE = /^[\w\-가-힣 ]+$/;
const PROMPT_RESERVED_OPTION_VALUES = new Set([
  IMAGE_PROMPT_OPTION_NONE.toLowerCase(),
  IMAGE_PROMPT_OPTION_CUSTOM.toLowerCase(),
]);

export const SAFE_KEY = (s: string) => s.trim().replace(/[^\w\-가-힣 ]/g, "_");

export function parsePromptVariableKey(raw: unknown) {
  const rawKey = String(raw || "").trim();
  const required = rawKey.endsWith("*");
  const keySource = required ? rawKey.slice(0, -1).trim() : rawKey;
  if (!keySource || !PROMPT_VARIABLE_KEY_RE.test(keySource)) return null;
  return { key: SAFE_KEY(keySource), required };
}

type PromptCondition = {
  key: string;
  operator: "==" | "!=";
  value: string;
};

function parsePromptCondition(raw: unknown): PromptCondition | null {
  const match = PROMPT_CONDITION_EXPRESSION_RE.exec(String(raw || "").trim());
  if (!match) return null;
  const parsedKey = parsePromptVariableKey(match[1]);
  if (!parsedKey || parsedKey.required) return null;
  return {
    key: parsedKey.key,
    operator: match[2] as PromptCondition["operator"],
    value: match[3] ?? match[4] ?? "",
  };
}

function matchesPromptCondition(condition: PromptCondition, params: Record<string, unknown>) {
  const current = String(params[condition.key] ?? "").trim();
  const token = parsePromptOptionToken(current);
  // 확장 옵션은 값 전체가 길어지므로 라벨로도 조건을 비교한다(레거시 옵션은 label === raw 이므로 결과 동일).
  const matches = current === condition.value || (token.extended && token.label === condition.value);
  return condition.operator === "==" ? matches : !matches;
}

export function renderPromptConditionalBlocks(text: string, params: Record<string, unknown> = {}) {
  const source = String(text || "");
  const tagRe = new RegExp(PROMPT_CONDITION_TAG_RE.source, "g");
  const frames: Array<{ content: string; matches: boolean }> = [{ content: "", matches: true }];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(source))) {
    frames[frames.length - 1].content += source.slice(cursor, match.index);
    if (match[0] === "{/if}") {
      if (frames.length > 1) {
        const frame = frames.pop();
        if (frame?.matches) frames[frames.length - 1].content += frame.content;
      }
    } else {
      const condition = parsePromptCondition(match[1]);
      frames.push({ content: "", matches: Boolean(condition && matchesPromptCondition(condition, params)) });
    }
    cursor = match.index + match[0].length;
  }

  frames[frames.length - 1].content += source.slice(cursor);
  return frames[0].content;
}

export function resolvePromptSelectOption(options: readonly string[] | undefined, value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  const exact = (options || []).find((option) => option.trim().toLowerCase() === normalized);
  if (exact) return exact;
  // 라벨만 전달된 값(에이전트/MCP 호출, 축약 저장값)도 동일 옵션으로 해석한다.
  return (options || []).find((option) => parsePromptOptionToken(option).label.toLowerCase() === normalized) || "";
}

function normalizePromptBlock(value: unknown) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function tokenizeNegativePrompt(value: string) {
  return normalizePromptBlock(value)
    .replace(INLINE_NEGATIVE_LABEL_RE, "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasLegacyImagePromptNegativeSection(templateText: string) {
  return INLINE_NEGATIVE_SECTION_RE.test(normalizePromptBlock(templateText));
}

function splitImagePromptTemplate(templateText: string) {
  const normalized = normalizePromptBlock(templateText);
  const match = INLINE_NEGATIVE_SECTION_RE.exec(normalized);

  if (!match) {
    return {
      templateText: normalized,
      negative: "",
    };
  }

  return {
    templateText: normalized.slice(0, match.index).trim(),
    negative: tokenizeNegativePrompt(match[1]).join(", "),
  };
}

export function stripLegacyImagePromptNegativeSection(templateText: string) {
  return splitImagePromptTemplate(templateText).templateText;
}

export function normalizeImagePromptNegative(negative?: string) {
  const merged: string[] = [];
  const seen = new Set<string>();

  tokenizeNegativePrompt(String(negative || "")).forEach((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged.join(", ");
}

export function resolveImagePromptNegative(templateText: string, negative?: string) {
  const templateSplit = splitImagePromptTemplate(templateText);
  const merged: string[] = [];
  const seen = new Set<string>();

  [templateSplit.negative, normalizeImagePromptNegative(negative)]
    .flatMap((value) => tokenizeNegativePrompt(value))
    .forEach((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });

  return merged.join(", ");
}

export function parseOptions(raw: string): string[] {
  return String(raw || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSelectOptions(raw: string): string[] {
  if (!String(raw || "").includes("|")) return [];
  return parseOptions(raw);
}

export function filterImagePromptVariableDefaults(defaultParams?: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(defaultParams || {}).filter(([key]) => !IMAGE_PROMPT_VARIABLE_DEFAULT_PARAM_DENY.has(key)),
  );
}

export function extractPromptVariables(templateText: string): PromptVariableSpec[] {
  const found = new Map<string, PromptVariableSpec>();
  const baseTemplateText = stripLegacyImagePromptNegativeSection(templateText);
  const variableTokenRe = new RegExp(PROMPT_VARIABLE_TOKEN_RE.source, "g");

  let m: RegExpExecArray | null;

  while ((m = variableTokenRe.exec(String(baseTemplateText || "")))) {
    const parsedKey = parsePromptVariableKey(m[1]);
    const optsRaw = m[2];
    if (!parsedKey) continue;

    const { key, required } = parsedKey;
    const options = parseSelectOptions(optsRaw);

    const spec: PromptVariableSpec =
      options.length > 0
        ? { key, kind: "select", options, required }
        : { key, kind: "text", placeholder: String(optsRaw || "").trim(), required };

    if (!found.has(key)) found.set(key, spec);
  }
  return Array.from(found.values());
}

function getPromptVariableSignature(spec: PromptVariableSpec) {
  return JSON.stringify({
    kind: spec.kind,
    required: Boolean(spec.required),
    options: spec.options || [],
    placeholder: spec.placeholder || "",
  });
}

function validatePromptTemplateConditions(
  source: string,
  field: PromptTemplateVariableField,
  variableKeys: ReadonlySet<string>,
) {
  const issues: PromptTemplateVariableIssue[] = [];
  const tagRe = new RegExp(PROMPT_CONDITION_TAG_RE.source, "g");
  const openConditions: Array<{ key?: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(source))) {
    if (match[0] === "{/if}") {
      if (!openConditions.length) {
        issues.push({
          code: "unmatched_condition_close",
          field,
          message: `${field}: condition close tag has no matching opening tag`,
        });
      } else {
        openConditions.pop();
      }
      continue;
    }

    const condition = parsePromptCondition(match[1]);
    if (!condition) {
      issues.push({
        code: "invalid_condition_syntax",
        field,
        message: `${field}: condition must use {#if key == "value"} or {#if key != "value"}`,
      });
    } else if (!variableKeys.has(condition.key)) {
      issues.push({
        code: "unknown_condition_variable",
        key: condition.key,
        field,
        message: `${field}: ${condition.key} is not defined as a template variable`,
      });
    }
    openConditions.push({ key: condition?.key });
    if (openConditions.length > PROMPT_CONDITION_MAX_DEPTH) {
      issues.push({
        code: "condition_nesting_limit",
        key: condition?.key,
        field,
        message: `${field}: condition nesting exceeds ${PROMPT_CONDITION_MAX_DEPTH} levels`,
      });
    }
  }

  openConditions.forEach((condition) => {
    issues.push({
      code: "unclosed_condition",
      key: condition.key,
      field,
      message: `${field}: condition opening tag is not closed`,
    });
  });
  return issues;
}

export function validatePromptTemplateVariables(
  text: string,
  field: PromptTemplateVariableField = "templateText",
): PromptTemplateVariableIssue[] {
  const issues: PromptTemplateVariableIssue[] = [];
  const definitions = new Map<string, string>();
  const variableTokenRe = new RegExp(PROMPT_VARIABLE_TOKEN_RE.source, "g");
  const source = String(text || "");

  let match: RegExpExecArray | null;
  while ((match = variableTokenRe.exec(source))) {
    const rawKey = String(match[1] || "").trim();
    const rawValue = String(match[2] || "");
    const markerCount = (rawKey.match(/\*/g) || []).length;
    const validMarker = markerCount === 0 || (markerCount === 1 && rawKey.endsWith("*"));

    if (!validMarker) {
      issues.push({
        code: "invalid_required_marker",
        key: rawKey || undefined,
        field,
        message: `${field}: required marker must appear once at the end of the variable key`,
      });
      continue;
    }

    const parsedKey = parsePromptVariableKey(rawKey);
    if (!parsedKey) {
      issues.push({
        code: "invalid_variable_key",
        key: rawKey || undefined,
        field,
        message: `${field}: variable key is invalid`,
      });
      continue;
    }

    const isSelect = rawValue.includes("|");
    const rawOptions = isSelect ? rawValue.split("|").map((option) => option.trim()) : [];
    const options = rawOptions.filter(Boolean);

    if (isSelect && rawOptions.some((option) => !option)) {
      issues.push({
        code: "empty_select_option",
        key: parsedKey.key,
        field,
        message: `${field}: ${parsedKey.key} contains an empty select option`,
      });
    }
    if (isSelect && options.length < 2) {
      issues.push({
        code: "select_requires_multiple_options",
        key: parsedKey.key,
        field,
        message: `${field}: ${parsedKey.key} select requires at least two options`,
      });
    }
    if (options.some((option) => PROMPT_RESERVED_OPTION_VALUES.has(option.toLowerCase()))) {
      issues.push({
        code: "reserved_option_value",
        key: parsedKey.key,
        field,
        message: `${field}: ${parsedKey.key} uses a reserved select option`,
      });
    }

    const spec: PromptVariableSpec = isSelect
      ? { key: parsedKey.key, kind: "select", options, required: parsedKey.required }
      : {
          key: parsedKey.key,
          kind: "text",
          placeholder: rawValue.trim(),
          required: parsedKey.required,
        };
    const signature = getPromptVariableSignature(spec);
    const previous = definitions.get(parsedKey.key);
    if (previous && previous !== signature) {
      issues.push({
        code: "conflicting_variable_definition",
        key: parsedKey.key,
        field,
        message: `${field}: ${parsedKey.key} is defined with conflicting variable syntax`,
      });
      continue;
    }
    definitions.set(parsedKey.key, signature);
  }
  issues.push(...validatePromptTemplateConditions(source, field, new Set(definitions.keys())));

  return issues;
}

export function validatePromptTemplateFields(fields: {
  templateText: string;
  sceneTemplate?: string;
}): PromptTemplateVariableIssue[] {
  return [
    ...validatePromptTemplateVariables(fields.templateText, "templateText"),
    ...(String(fields.sceneTemplate || "").trim()
      ? validatePromptTemplateVariables(String(fields.sceneTemplate), "sceneTemplate")
      : []),
  ];
}

export function findMissingRequiredPromptVariables(
  templateText: string,
  variables: Record<string, unknown> = {},
): PromptVariableSpec[] {
  const activeTemplate = renderPromptConditionalBlocks(templateText, variables);
  return extractPromptVariables(activeTemplate).filter((spec) => {
    if (!spec.required) return false;
    const value = String(variables[spec.key] || "").trim();
    if (!value || value === IMAGE_PROMPT_OPTION_NONE || value === IMAGE_PROMPT_OPTION_CUSTOM) return true;
    return spec.kind === "select" && !resolvePromptSelectOption(spec.options, value);
  });
}

export function buildImagePromptVariableDefaults(templateText: string, defaultParams?: Record<string, unknown>) {
  const specs = extractPromptVariables(templateText);
  const filteredDefaults = filterImagePromptVariableDefaults(defaultParams);

  return specs.reduce<Record<string, string>>((acc, spec) => {
    const rawValue = String(filteredDefaults?.[spec.key] || "").trim();
    if (spec.kind === "select") {
      const options = spec.options || [];
      acc[spec.key] = options.includes(rawValue) ? rawValue : String(options[0] || "");
      return acc;
    }

    acc[spec.key] = rawValue;
    return acc;
  }, {});
}

// 이미지 생성 프롬프트 렌더러
export function renderImagePrompt(
  header: string | undefined,
  templateText: string,
  opts?: {
    extra?: string; // 사용자 추가 문장
    negative?: string; // 네거티브
    params?: Record<string, unknown>; // 변수 치환 값
  },
): string {
  const parts: string[] = [];
  const templateSplit = {
    templateText: stripLegacyImagePromptNegativeSection(templateText),
  };
  const resolvedNegative = resolveImagePromptNegative(templateText, opts?.negative);

  if (header?.trim()) parts.push(`다음의 설정을 정확하게 따르는 "${header.trim()}" 템플릿의 이미지를 생성하세요.`);

  const activeTemplate = renderPromptConditionalBlocks(templateSplit.templateText, opts?.params);
  const replaced = activeTemplate.replace(
    PROMPT_VARIABLE_TOKEN_RE,
    (whole, kRaw, optsRaw) => {
      const parsedKey = parsePromptVariableKey(kRaw);
      if (!parsedKey) return whole;

      const { key, required } = parsedKey;
      const paramValRaw = String(opts?.params?.[key] ?? "").trim();

      const options = parseSelectOptions(optsRaw);
      const isSelect = options.length > 0;
      // 확장 옵션(`라벨; 설명; 프롬프트`)은 프롬프트 분절을 원문 그대로 사용하고,
      // 레거시 옵션(구분자 없음)은 기존과 동일하게 normalizeLabel 결과를 사용한다.
      const formatOptionValue = (v: string) => {
        if (!v) return "";
        const token = parsePromptOptionToken(v);
        return token.extended ? token.prompt : normalizeLabel(v);
      };
      const requiredOption = required && isSelect ? options[0] || "" : "";

      if (requiredOption) {
        const selectedOption = resolvePromptSelectOption(options, paramValRaw);
        return formatOptionValue(selectedOption || requiredOption);
      }
      if (paramValRaw === IMAGE_PROMPT_OPTION_NONE)
        return requiredOption ? formatOptionValue(requiredOption) : isSelect ? PROMPT_NONE_LINE_MARKER : "";

      // 치환 우선순위: params > (select면 첫 옵션) > ""
      if (paramValRaw) {
        if (isSelect && paramValRaw === IMAGE_PROMPT_OPTION_CUSTOM) {
          return String(opts?.params?.[getImagePromptCustomParamKey(key)] || "").trim();
        }
        if (!isSelect) return paramValRaw;
        // 라벨만 저장된 값도 옵션 원문으로 되살린 뒤 치환한다.
        return formatOptionValue(resolvePromptSelectOption(options, paramValRaw) || paramValRaw);
      }
      if (options.length) {
        return formatOptionValue(options[0]);
      }
      return "";
    },
  );

  const cleaned = cleanupPromptNoneMarkers(replaced);
  if (opts?.extra?.trim()) parts.push(`장면:\n${opts.extra.trim()}`);
  if (cleaned.trim()) parts.push(cleaned.trim());
  if (resolvedNegative)
    parts.push(`**절대 포함금지:** 이 목록의 요소들은 절대 이미지에 추가하거나 반영하지 말것\n${resolvedNegative}`);
  return parts.join("\n\n");
}

export function appendModelIdentityInstruction(
  prompt: string,
  modelImageCount: number,
  referenceImageCount: number,
  modelReferenceStrength?: ReferenceStrengthType,
) {
  const base = String(prompt || "");
  if (modelImageCount <= 0) return base;
  const strength = normalizeReferenceStrength(modelReferenceStrength || DEFAULT_MODEL_REFERENCE_STRENGTH);
  const detailMessage = getReferenceStrengthPrompt(strength, "model");

  const instruction = [
    "**모델 이미지 인물 일관성 지시:**",
    `- 첨부 이미지 중 처음 ${modelImageCount}장은 모델 이미지입니다.`,
    `- ${detailMessage}`,
    strength === "preserve"
      ? "- 생성 결과에 여러 명의 인물이 등장하면 모델 이미지 순서대로 인물 #1, #2, #3에 매칭하여 각 모델 이미지 속 인물과 동일하고 일관된 모습으로 생성하세요."
      : "- 생성 결과에 여러 명의 인물이 등장하면 모델 이미지 순서대로 인물 #1, #2, #3의 스타일/인상 기준으로 참고하세요.",
    strength === "preserve"
      ? "- 여러 명의 인물이 등장하지 않거나 인물 수가 명확하지 않으면 첫 번째 모델 이미지 속 인물과 동일하고 일관된 모습으로 생성하세요."
      : "- 여러 명의 인물이 등장하지 않거나 인물 수가 명확하지 않으면 첫 번째 모델 이미지를 우선 참고하세요.",
    referenceImageCount > 0
      ? `- 모델 이미지 뒤의 ${referenceImageCount}장은 참고 이미지이며, 구도/색감/소재/질감 참고용으로만 사용하고 모델 인물의 정체성을 바꾸지 마세요.`
      : "- 모델 이미지의 인물 정체성을 유지하되, 사용자가 요청한 장면과 스타일에 맞게 생성하세요.",
  ].join("\n");

  return base ? `${instruction}\n\n${base}` : instruction;
}
