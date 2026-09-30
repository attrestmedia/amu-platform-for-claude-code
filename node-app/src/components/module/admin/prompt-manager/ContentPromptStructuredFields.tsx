"use client";

import { Lang, lang } from "components/module/i18n";
import { Input, RadioGroup, RadioGroupItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@amu-labs/ui";
import {
  CONTENT_LENGTH_CUSTOM_VALUE,
  CONTENT_LENGTH_PRESET_OPTIONS,
  CONTENT_OUTPUT_FORMAT_OPTIONS,
  CONTENT_PLATFORM_CUSTOM_VALUE,
  CONTENT_PLATFORM_OPTIONS,
  DEFAULT_CONTENT_OUTPUT_FORMAT,
} from "consts/app";
import { jsonPretty } from "utils/data";
import type { ContentPromptDefaultParamsType, PromptItemExtendedType } from "types/app";
import { isPlainObject as isPlainObjectShared, type UnknownRecord } from "utils/common/typeUtils";

const CONTENT_LANGUAGE_OPTIONS = [
  { value: "ko", label: { ko: "한국어", en: "Korean" } },
  { value: "en", label: { ko: "영어", en: "English" } },
] as const;
const KNOWN_CONTENT_DEFAULT_PARAM_KEYS = new Set(["platform", "language", "length", "outputFormat"]);

const isPlainObject = isPlainObjectShared;

function pickContentPlatform(raw?: string) {
  const value = String(raw || "").trim();
  return (CONTENT_PLATFORM_OPTIONS as readonly string[]).includes(value) && value !== CONTENT_PLATFORM_CUSTOM_VALUE
    ? value
    : "instagram";
}

function isContentPlatformOption(value: string) {
  return (CONTENT_PLATFORM_OPTIONS as readonly string[]).includes(value) && value !== CONTENT_PLATFORM_CUSTOM_VALUE;
}

function resolveCustomContentPlatform(raw?: string) {
  return String(raw || "").trim() || "other";
}

function getContentPlatformLabel(option: string) {
  if (option === CONTENT_PLATFORM_CUSTOM_VALUE) return lang({ ko: "기타", en: "Other" });
  return option;
}

function pickContentLanguage(raw?: string) {
  const value = String(raw || "").trim();
  return CONTENT_LANGUAGE_OPTIONS.some((option) => option.value === value) ? value : "ko";
}

function normalizeContentLength(raw?: string) {
  const value = String(raw || "").trim();
  return value || "instagram: 3-5문장 + 해시태그";
}

function resolveCustomContentLength(raw?: string) {
  return String(raw || "").trim() || "기타: 직접 입력";
}

function pickContentOutputFormat(raw?: string) {
  const value = String(raw || "").trim();
  return (CONTENT_OUTPUT_FORMAT_OPTIONS as readonly string[]).includes(value) ? value : DEFAULT_CONTENT_OUTPUT_FORMAT;
}

export type ContentPromptStructuredState = {
  platform: string;
  customPlatform: string;
  language: string;
  lengthPreset: string;
  customLength: string;
  outputFormat: string;
};

export function createContentPromptStructuredState(
  item?: Partial<PromptItemExtendedType>,
): ContentPromptStructuredState {
  const defaultParams = isPlainObject(item?.defaultParams)
    ? (item?.defaultParams as ContentPromptDefaultParamsType)
    : {};
  const length = normalizeContentLength(defaultParams.length);
  const isPreset = (CONTENT_LENGTH_PRESET_OPTIONS as readonly string[]).includes(length);
  const platform = String(defaultParams.platform || "").trim() || "instagram";
  const isPresetPlatform = isContentPlatformOption(platform);

  return {
    platform: isPresetPlatform ? platform : CONTENT_PLATFORM_CUSTOM_VALUE,
    customPlatform: isPresetPlatform ? "" : platform,
    language: pickContentLanguage(defaultParams.language),
    lengthPreset: isPreset ? length : CONTENT_LENGTH_CUSTOM_VALUE,
    customLength: isPreset ? "" : length,
    outputFormat: pickContentOutputFormat(defaultParams.outputFormat),
  };
}

export function createContentPromptExtraDefaultParamsText(defaultParams?: ContentPromptDefaultParamsType) {
  if (!isPlainObject(defaultParams)) return "";
  const extra = Object.fromEntries(
    Object.entries(defaultParams).filter(([key]) => !KNOWN_CONTENT_DEFAULT_PARAM_KEYS.has(String(key || ""))),
  );
  return jsonPretty(extra);
}

export function buildContentPromptDefaultParams(args: {
  state: ContentPromptStructuredState;
  extraDefaultParams?: UnknownRecord;
}) {
  const extra = isPlainObject(args.extraDefaultParams) ? { ...args.extraDefaultParams } : {};
  Object.keys(extra).forEach((key) => {
    if (KNOWN_CONTENT_DEFAULT_PARAM_KEYS.has(key)) delete extra[key];
  });

  const resolvedLength =
    args.state.lengthPreset === CONTENT_LENGTH_CUSTOM_VALUE
      ? resolveCustomContentLength(args.state.customLength)
      : normalizeContentLength(args.state.lengthPreset);

  return {
    ...extra,
    platform:
      args.state.platform === CONTENT_PLATFORM_CUSTOM_VALUE
        ? resolveCustomContentPlatform(args.state.customPlatform)
        : pickContentPlatform(args.state.platform),
    language: pickContentLanguage(args.state.language),
    length: resolvedLength,
    outputFormat: pickContentOutputFormat(args.state.outputFormat),
  } satisfies ContentPromptDefaultParamsType;
}

export function ContentPromptStructuredFields({
  value,
  onChange,
  extraDefaultParamsText,
  onChangeExtraDefaultParamsText,
}: {
  value: ContentPromptStructuredState;
  onChange: (next: ContentPromptStructuredState) => void;
  extraDefaultParamsText: string;
  onChangeExtraDefaultParamsText: (next: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border bg-background/60 p-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          <Lang text={{ ko: "콘텐츠 템플릿 설정", en: "Content Template Settings" }} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <Lang
            text={{
              ko: "플랫폼, 언어, 기본 길이, 출력 형식을 구조화된 메타로 관리합니다.",
              en: "Manage platform, language, default length, and output format as structured metadata.",
            }}
          />
        </p>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">
          <Lang text={{ ko: "기본 플랫폼 *", en: "Platform *" }} />
        </label>
        <Select value={value.platform} onValueChange={(next) => onChange({ ...value, platform: String(next || "") })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_PLATFORM_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {getContentPlatformLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value.platform === CONTENT_PLATFORM_CUSTOM_VALUE && (
          <Input
            className="mt-2"
            value={value.customPlatform}
            onChange={(event) => onChange({ ...value, customPlatform: event.target.value })}
            placeholder={lang({ ko: "예: newsletter, smartstore", en: "e.g. newsletter, smartstore" })}
          />
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground">
          <Lang text={{ ko: "기본 언어 *", en: "Language *" }} />
        </label>
        <RadioGroup
          value={value.language}
          onValueChange={(next) => onChange({ ...value, language: String(next || "") })}
          className="grid gap-2 md:grid-cols-2"
        >
          {CONTENT_LANGUAGE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3"
            >
              <RadioGroupItem value={option.value} id={`content-language-${option.value}`} />
              <span className="text-sm text-primary-text">
                <Lang text={option.label} />
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          <Lang text={{ ko: "기본 길이 *", en: "Length *" }} />
        </label>
        <Select
          value={value.lengthPreset}
          onValueChange={(next) =>
            onChange({
              ...value,
              lengthPreset: String(next || CONTENT_LENGTH_CUSTOM_VALUE),
              customLength: String(next || "") === CONTENT_LENGTH_CUSTOM_VALUE ? value.customLength : "",
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_LENGTH_PRESET_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
            <SelectItem value={CONTENT_LENGTH_CUSTOM_VALUE}>
              <Lang text={{ ko: "기타: 직접 입력", en: "Other: custom" }} />
            </SelectItem>
          </SelectContent>
        </Select>
        {value.lengthPreset === CONTENT_LENGTH_CUSTOM_VALUE && (
          <Input
            value={value.customLength}
            onChange={(event) => onChange({ ...value, customLength: event.target.value })}
            placeholder={lang({ ko: "예: 500-700자", en: "e.g. 500-700 chars" })}
          />
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground">
          <Lang text={{ ko: "출력 형식 *", en: "Output format *" }} />
        </label>
        <RadioGroup
          value={value.outputFormat}
          onValueChange={(next) => onChange({ ...value, outputFormat: String(next || DEFAULT_CONTENT_OUTPUT_FORMAT) })}
          className="grid gap-2 md:grid-cols-2"
        >
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3">
            <RadioGroupItem value="markdown/mermaid" id="content-output-format-markdown-mermaid" />
            <span className="text-sm text-primary-text">
              <Lang text={{ ko: "markdown/mermaid", en: "markdown/mermaid (default)" }} />
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3">
            <RadioGroupItem value="json" id="content-output-format-json" />
            <span className="text-sm text-primary-text">json</span>
          </label>
        </RadioGroup>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">
          <Lang text={{ ko: "고급 defaultParams (JSON)", en: "Advanced defaultParams (JSON)" }} />
        </label>
        <Textarea
          rows={4}
          value={extraDefaultParamsText}
          onChange={(event) => onChangeExtraDefaultParamsText(event.target.value)}
          autoResize
          placeholder={lang({
            ko: "플랫폼/언어/길이/출력 형식 외 확장 필드가 필요할 때만 입력하세요.",
            en: "Use only for extra fields beyond platform, language, length, and output format.",
          })}
        />
      </div>
    </div>
  );
}
