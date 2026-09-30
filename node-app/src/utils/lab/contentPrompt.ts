import {
  getImagePromptCustomParamKey,
  IMAGE_PROMPT_OPTION_CUSTOM,
  IMAGE_PROMPT_OPTION_NONE,
  parsePromptVariableKey,
  parseOptions,
  renderPromptConditionalBlocks,
  resolvePromptSelectOption,
} from "./imagePrompt";
import { cleanupPromptNoneMarkers, normalizeLabel, PROMPT_NONE_LINE_MARKER } from "./promptTemplateUtils";

/**
 * @docHint
 * @purpose contentPrompt 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공  템플릿 치환/라벨 정규화 포함
 * @domain ai-prompt
 * @scope global
 */

// 치환 토큰 추출: {key::placeholder} / {key::opt1|opt2|...} / {key*::required1|required2}
export function renderContentPrompt(
  header: string | undefined,
  templateText: string,
  opts?: {
    extra?: string;
    params?: Record<string, string>;
  }
): string {
  const parts: string[] = [];
  if (header?.trim()) parts.push(header.trim());

  const activeTemplate = renderPromptConditionalBlocks(templateText, opts?.params);
  const replaced = activeTemplate.replace(/\{([^{}:]+)::([\s\S]*?)\}/g, (_whole, kRaw, optsRaw) => {
    const parsedKey = parsePromptVariableKey(kRaw);
    if (!parsedKey) return _whole;
    const { key, required } = parsedKey;
    const paramValRaw = (opts?.params?.[key] ?? "").trim();
    const options = String(optsRaw || "").includes("|") ? parseOptions(optsRaw) : [];
    const isSelect = options.length > 0;
    const formatOptionLabel = (v: string) => (v ? normalizeLabel(v) : "");
    const requiredOption = required && isSelect ? options[0] || "" : "";

    if (requiredOption) {
      const selectedOption = resolvePromptSelectOption(options, paramValRaw);
      return formatOptionLabel(selectedOption || requiredOption);
    }
    if (isSelect && paramValRaw === IMAGE_PROMPT_OPTION_NONE) {
      return PROMPT_NONE_LINE_MARKER;
    }
    if (isSelect && paramValRaw === IMAGE_PROMPT_OPTION_CUSTOM) {
      return String(opts?.params?.[getImagePromptCustomParamKey(key)] || "").trim();
    }
    if (paramValRaw) {
      return isSelect ? formatOptionLabel(paramValRaw) : paramValRaw;
    }
    if (options.length) {
      return formatOptionLabel(options[0]);
    }
    return "";
  });

  const cleaned = cleanupPromptNoneMarkers(replaced);
  if (cleaned.trim()) parts.push(cleaned.trim());
  if (opts?.extra?.trim()) parts.push(opts.extra.trim());
  return parts.join("\n\n");
}
