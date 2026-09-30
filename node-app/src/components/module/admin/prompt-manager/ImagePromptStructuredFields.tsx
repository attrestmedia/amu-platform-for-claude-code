"use client";

import {
  ASPECT_TO_OPENAI_COMPAT_SIZE,
  DEFAULT_IMAGE_ASPECT,
  DEFAULT_IMAGE_MODEL_BY_PROVIDER,
  IMAGE_REF_LIMIT_BY_PROVIDER,
  OPENAI_COMPAT_UI_RATIOS,
  getSupportedGoogleAspectRatios,
  getSupportedGoogleImageSizes,
  type SupportedAspectRatio,
} from "consts/ai";
import { Lang, lang } from "components/module/i18n";
import { Checkbox, Input, RadioGroup, RadioGroupItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea } from "@amu-labs/ui";
import { clampAspectForProvider, normalizeGoogleImageSizeForModel } from "utils/app";
import { jsonPretty } from "utils/data";
import { buildImageReferenceInputPolicy, normalizeImagePromptNegative, resolveImageReferencePolicy } from "utils/lab";
import type { ImagePromptDefaultParamsType, ImagePromptInputPolicyType, PromptItemExtendedType } from "types/app";
import type { ImageProviderType } from "types/ai";

const IMAGE_PROVIDER_OPTIONS: Array<{
  value: ImageProviderType;
  title: string;
  description: { ko: string; en: string };
}> = [
  {
    value: "google",
    title: DEFAULT_IMAGE_MODEL_BY_PROVIDER.google,
    description: { ko: "Gen Studio 기본 이미지 모델군", en: "Default Gen Studio image family" },
  },
  {
    value: "openai",
    title: DEFAULT_IMAGE_MODEL_BY_PROVIDER.openai,
    description: { ko: "편집/상품 보정 호환 모델군", en: "Editing-friendly image family" },
  },
  {
    value: "xai",
    title: DEFAULT_IMAGE_MODEL_BY_PROVIDER.xai,
    description: { ko: "대체 이미지 모델군", en: "Alternative image family" },
  },
  {
    value: "zai",
    title: DEFAULT_IMAGE_MODEL_BY_PROVIDER.zai,
    description: { ko: "GLM 이미지 모델군", en: "GLM image family" },
  },
];

const KNOWN_IMAGE_DEFAULT_PARAM_KEYS = new Set(["provider", "aspectRatio", "size", "negative"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pickImageDefaultProvider(raw?: string): ImageProviderType {
  return raw === "openai" || raw === "xai" || raw === "zai" || raw === "google" ? raw : "google";
}

function resolveAspectForProvider(provider: ImageProviderType, raw?: string) {
  const defaultModel = String(DEFAULT_IMAGE_MODEL_BY_PROVIDER[provider] || DEFAULT_IMAGE_MODEL_BY_PROVIDER.google);
  return clampAspectForProvider(provider, String(raw || DEFAULT_IMAGE_ASPECT), defaultModel);
}

function resolveSizeForProvider(provider: ImageProviderType, aspectRatio: SupportedAspectRatio, raw?: string) {
  if (provider === "google") {
    return normalizeGoogleImageSizeForModel(String(DEFAULT_IMAGE_MODEL_BY_PROVIDER.google), raw);
  }
  return String(ASPECT_TO_OPENAI_COMPAT_SIZE[aspectRatio] || ASPECT_TO_OPENAI_COMPAT_SIZE[DEFAULT_IMAGE_ASPECT]);
}

export type ImagePromptStructuredState = {
  provider: ImageProviderType;
  aspectRatio: SupportedAspectRatio;
  size: string;
  negative: string;
  referenceRequired: boolean;
  referenceMinCount: number;
  referenceMaxCount: number;
  enforceReferenceInCustomMode: boolean;
};

export function createImagePromptStructuredState(item?: Partial<PromptItemExtendedType>): ImagePromptStructuredState {
  const defaultParams = isPlainObject(item?.defaultParams) ? (item?.defaultParams as ImagePromptDefaultParamsType) : {};
  const provider = pickImageDefaultProvider(defaultParams?.provider);
  const aspectRatio = resolveAspectForProvider(provider, defaultParams?.aspectRatio) as SupportedAspectRatio;
  const size = resolveSizeForProvider(provider, aspectRatio, defaultParams?.size);
  const referencePolicy = resolveImageReferencePolicy(
    (isPlainObject(item?.inputPolicy) ? item?.inputPolicy : {}) as ImagePromptInputPolicyType,
    provider,
  );

  return {
    provider,
    aspectRatio,
    size,
    negative: normalizeImagePromptNegative(defaultParams?.negative),
    referenceRequired: referencePolicy.required,
    referenceMinCount: referencePolicy.minCount,
    referenceMaxCount: referencePolicy.maxCount,
    enforceReferenceInCustomMode: referencePolicy.enforceInCustomMode,
  };
}

export function createImagePromptExtraDefaultParamsText(defaultParams?: unknown) {
  if (!isPlainObject(defaultParams)) return "";
  const extra = Object.fromEntries(
    Object.entries(defaultParams).filter(([key]) => !KNOWN_IMAGE_DEFAULT_PARAM_KEYS.has(String(key || ""))),
  );
  return jsonPretty(extra);
}

export function buildImagePromptDefaultParams(args: {
  state: ImagePromptStructuredState;
  extraDefaultParams?: Record<string, unknown>;
}) {
  const extra: Record<string, unknown> = isPlainObject(args.extraDefaultParams) ? { ...args.extraDefaultParams } : {};
  Object.keys(extra).forEach((key) => {
    if (KNOWN_IMAGE_DEFAULT_PARAM_KEYS.has(key)) delete extra[key];
  });

  return {
    ...extra,
    provider: args.state.provider,
    aspectRatio: args.state.aspectRatio,
    size: resolveSizeForProvider(args.state.provider, args.state.aspectRatio, args.state.size),
    negative: normalizeImagePromptNegative(args.state.negative),
  } satisfies ImagePromptDefaultParamsType;
}

export function buildImagePromptInputPolicyFromState(state: ImagePromptStructuredState) {
  return buildImageReferenceInputPolicy({
    required: state.referenceRequired,
    minCount: state.referenceRequired ? Math.max(1, state.referenceMinCount) : 0,
    maxCount: state.referenceMaxCount,
    enforceInCustomMode: state.enforceReferenceInCustomMode,
    provider: state.provider,
  });
}

export function ImagePromptStructuredFields({
  value,
  onChange,
  extraDefaultParamsText,
  onChangeExtraDefaultParamsText,
  legacyNegativeDetected = false,
}: {
  value: ImagePromptStructuredState;
  onChange: (next: ImagePromptStructuredState) => void;
  extraDefaultParamsText: string;
  onChangeExtraDefaultParamsText: (next: string) => void;
  legacyNegativeDetected?: boolean;
}) {
  const aspectOptions =
    value.provider === "google"
      ? [...getSupportedGoogleAspectRatios(String(DEFAULT_IMAGE_MODEL_BY_PROVIDER.google))]
      : [...OPENAI_COMPAT_UI_RATIOS];
  const resolvedAspect = resolveAspectForProvider(value.provider, value.aspectRatio) as SupportedAspectRatio;
  const googleSizeOptions =
    value.provider === "google"
      ? [...getSupportedGoogleImageSizes(String(DEFAULT_IMAGE_MODEL_BY_PROVIDER.google))]
      : [];
  const resolvedSize = resolveSizeForProvider(value.provider, resolvedAspect, value.size);
  const referenceLimit = Math.max(1, Number(IMAGE_REF_LIMIT_BY_PROVIDER[value.provider] || 1));
  const maxCountOptions = Array.from({ length: referenceLimit }, (_, index) => String(index + 1));
  const minCountOptions = Array.from(
    { length: value.referenceRequired ? referenceLimit : referenceLimit + 1 },
    (_, index) => String(value.referenceRequired ? index + 1 : index),
  );
  const canEditReferenceMinCount = value.referenceRequired;

  const updateProvider = (provider: ImageProviderType) => {
    const nextAspect = resolveAspectForProvider(provider, value.aspectRatio) as SupportedAspectRatio;
    const nextLimit = Math.max(1, Number(IMAGE_REF_LIMIT_BY_PROVIDER[provider] || 1));
    const nextMin = Math.min(
      nextLimit,
      Math.max(value.referenceRequired ? 1 : 0, value.referenceRequired ? Math.max(1, value.referenceMinCount) : 0),
    );
    const nextMax = Math.min(nextLimit, Math.max(value.referenceRequired ? nextMin : 1, value.referenceMaxCount));

    onChange({
      ...value,
      provider,
      aspectRatio: nextAspect,
      size: resolveSizeForProvider(provider, nextAspect, value.size),
      referenceMinCount: nextMin,
      referenceMaxCount: nextMax,
    });
  };

  const updateAspectRatio = (aspectRatio: SupportedAspectRatio) => {
    onChange({
      ...value,
      aspectRatio,
      size: resolveSizeForProvider(value.provider, aspectRatio, value.size),
    });
  };

  const updateReferenceRequired = (required: boolean) => {
    const nextMin = required ? Math.max(1, value.referenceMinCount) : 0;
    const nextMax = Math.max(required ? nextMin : 1, value.referenceMaxCount);

    onChange({
      ...value,
      referenceRequired: required,
      referenceMinCount: nextMin,
      referenceMaxCount: nextMax,
    });
  };

  return (
    <div className="space-y-4 rounded-xl border bg-background/60 p-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          <Lang text={{ ko: "이미지 템플릿 설정", en: "Image Template Settings" }} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <Lang
            text={{
              ko: "기본 표현 모델군, 비율, 사이즈, 금지 표현과 참고 이미지 정책을 별도 메타로 관리합니다.",
              en: "Manage model family, ratio, size, negative prompt, and reference policy as structured metadata.",
            }}
          />
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          <Lang text={{ ko: "기본 모델군 *", en: "Provider *" }} />
        </label>
        <RadioGroup
          value={value.provider}
          onValueChange={(next) => updateProvider(next as ImageProviderType)}
          className="grid gap-2"
        >
          {IMAGE_PROVIDER_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface px-3 py-3"
            >
              <RadioGroupItem value={option.value} id={`image-provider-${option.value}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary-text">{option.value}</p>
                <p className="text-xs text-muted-foreground">{option.title}</p>
                <p className="mt-1 text-xxs text-muted-foreground">
                  <Lang text={option.description} />
                </p>
              </div>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">
            <Lang text={{ ko: "기본 비율 *", en: "Aspect ratio *" }} />
          </label>
          <Select value={resolvedAspect} onValueChange={(next) => updateAspectRatio(next as SupportedAspectRatio)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aspectOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">
            <Lang text={{ ko: "기본 사이즈 *", en: "Size *" }} />
          </label>
          {value.provider === "google" ? (
            <Select
              value={normalizeGoogleImageSizeForModel(String(DEFAULT_IMAGE_MODEL_BY_PROVIDER.google), value.size)}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  size: normalizeGoogleImageSizeForModel(
                    String(DEFAULT_IMAGE_MODEL_BY_PROVIDER.google),
                    String(next || ""),
                  ),
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {googleSizeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input value={resolvedSize} readOnly disabled />
          )}
          {value.provider !== "google" && (
            <p className="mt-1 text-xxs text-muted-foreground">
              <Lang
                text={{
                  ko: "OpenAI/xAI 계열은 비율에 맞는 호환 사이즈가 자동 적용됩니다.",
                  en: "OpenAI/xAI families use an aspect-compatible size automatically.",
                }}
              />
            </p>
          )}
        </div>
      </div>

      {legacyNegativeDetected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-700">
          <Lang
            text={{
              ko: "템플릿 본문 안의 레거시 `금지 표현` 섹션이 감지되었습니다. 저장 전 `금지 표현` 필드로 옮기고, 본문에서는 제거하세요.",
              en: "A legacy forbidden section was detected inside the template body. Move it into the negative field before saving.",
            }}
          />
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground">
          <Lang text={{ ko: "금지 표현", en: "Negative prompt" }} />
        </label>
        <Textarea
          rows={3}
          value={value.negative}
          onChange={(event) => onChange({ ...value, negative: event.target.value })}
          placeholder={lang({
            ko: "텍스트, 워터마크, 로고, 과포화, 흐림, 렌즈 플레어...",
            en: "text, watermark, logo, oversaturation, blur, lens flare...",
          })}
          autoResize
        />
      </div>

      <div className="space-y-3 rounded-xl border border-border/70 bg-card/50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary-text">
              <Lang text={{ ko: "참고 이미지 정책", en: "Reference image policy" }} />
            </p>
            <p className="text-xs text-muted-foreground">
              <Lang
                text={{
                  ko: "쇼핑몰 실상품 기준 템플릿은 여기서 참고 이미지 필수 여부를 제어합니다.",
                  en: "Control whether a template requires reference images.",
                }}
              />
            </p>
          </div>
          <Switch checked={value.referenceRequired} onCheckedChange={updateReferenceRequired} size="sm" />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">
              <Lang text={{ ko: "최소 참고 이미지 수", en: "Minimum refs" }} />
            </label>
            <Select
              value={String(value.referenceRequired ? Math.max(1, value.referenceMinCount) : 0)}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  referenceMinCount: value.referenceRequired ? Math.max(1, Number(next || 1)) : 0,
                  referenceMaxCount: Math.max(Number(next || 0), value.referenceMaxCount),
                })
              }
              disabled={!canEditReferenceMinCount}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {minCountOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">
              <Lang text={{ ko: "최대 참고 이미지 수", en: "Maximum refs" }} />
            </label>
            <Select
              value={String(Math.min(referenceLimit, Math.max(1, value.referenceMaxCount)))}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  referenceMaxCount: Math.min(
                    referenceLimit,
                    Math.max(value.referenceRequired ? value.referenceMinCount : 1, Number(next || 1)),
                  ),
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {maxCountOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-xs text-secondary-text">
          <Checkbox
            checked={value.enforceReferenceInCustomMode}
            onCheckedChange={(checked) =>
              onChange({
                ...value,
                enforceReferenceInCustomMode: checked === true,
              })
            }
          />
          <Lang
            text={{
              ko: "템플릿에서 `프롬프트 직접 편집`으로 전환해도 참고 이미지 정책 유지",
              en: "Keep the reference rule even after switching to direct prompt mode",
            }}
          />
        </label>
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
            ko: "previewImage, modelSamples 같은 추가 필드가 필요할 때만 입력하세요.",
            en: "Use only for extra fields such as previewImage or modelSamples.",
          })}
        />
      </div>
    </div>
  );
}
