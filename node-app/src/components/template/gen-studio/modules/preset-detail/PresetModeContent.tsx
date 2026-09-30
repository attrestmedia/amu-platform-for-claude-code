"use client";

import React from "react";
import {
  Button,
  Label,
  Textarea,
  Error,
  Switch,
  ScrollArea,
  BottomSheetDialog,
  SelectGroupCard,
  ImageDropzone,
} from "@amu-labs/ui";
import { ModelSelectBottomSheet } from "components/module/model-select";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import type { ImageProviderType } from "types/ai";
import type { PromptVisibilityType } from "types/app";
import { cn } from "utils/common";
import { logger } from "utils/log";
import { renderAspectOptionLabel } from "utils/ai";
import { clampAspectForProvider, inferProviderFromModelName } from "utils/app";
import type { CatalogImageModelOption } from "utils/app/genStudioCatalogClient";
import {
  customTempleteLabel,
  extractPromptVariables,
  getImagePromptCustomParamKey,
  IMAGE_PROMPT_OPTION_CUSTOM,
  IMAGE_PROMPT_OPTION_NONE,
  normalizeLabel,
  parsePromptOptionToken,
  REFERENCE_STRENGTH_OPTIONS,
  renderImagePrompt,
  type ReferenceStrengthType,
} from "utils/lab";
import {
  AI_GEN_IMAGE_LIMIT,
  DEFAULT_IMAGE_MODEL_BY_PROVIDER,
  type ImageModelNameType,
  type SupportedAspectRatio,
} from "consts/ai";
import { normalizeSelectedModelNames, toggleSelectedModelName, type PromptModelLockResolution } from "utils/app";
import { getPerImageCost, resolveMediaBillingStrategy } from "utils/payment";
import type { SettingDialogType, VarSpec } from "./types";
import { AspectPreviewBox } from "./SettingControls";
import { StudioSettingRow } from "../StudioSettingRow";
import { StudioSettingSection } from "../StudioSettingSection";
import {
  Plus,
  Minus,
  Settings,
  Settings2,
  Check,
  X,
  Edit3,
  Eraser,
  MessageCircleHeart,
  ImagePlus,
  Eye,
  SlidersVertical,
  SquareTerminal,
} from "lucide-react";

function getSelectOptionLabel(raw: string) {
  const [head] = String(raw || "").split(";");
  return normalizeLabel((head || raw || "").trim());
}

function getImageModelBillingInfo(provider: ImageProviderType, modelName: string, variant?: string) {
  const billingStrategy = resolveMediaBillingStrategy({ provider, modelName, modality: "image", variant });
  return {
    perImage: getPerImageCost(provider, modelName, "image", variant),
    isUsageBilled: billingStrategy === "token" || billingStrategy === "hybrid",
  };
}

// 적용된 참고/모델 이미지 chip — 본문 참고 이미지 섹션용 (Phase 4 본문화, 기존 footer chip 재현)
function AppliedReferenceChip({
  src,
  alt,
  label,
  removeAriaLabel,
  onRemove,
}: {
  src: string;
  alt: string;
  label?: { ko: string; en: string };
  removeAriaLabel: string;
  onRemove?: () => void;
}) {
  return (
    <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2">
      <ImageBox src={src} alt={alt} height={80} objectFit="object-cover" className="rounded-lg" />
      {label ? (
        <span className="pointer-events-none absolute bottom-0 left-0 max-w-full truncate rounded-tr bg-black/65 px-1 text-[0.6rem] leading-4 text-white">
          <Lang text={label} />
        </span>
      ) : null}
      {onRemove ? (
        <Button
          variant="blank"
          size="icon-xs"
          rounded="full"
          onClick={onRemove}
          className="absolute right-0.5 top-0.5 h-4 w-4 bg-red-500/85 text-white"
          aria-label={removeAriaLabel}
        >
          <X className="h-2.5 w-2.5" />
        </Button>
      ) : null}
    </div>
  );
}

type RecentImageEditTargetType = "reference";

export function PresetModeContent({
  isCustomMode,
  allowTemplateMode = true,
  imageDescriptionRequired = !isCustomMode,
  customPrompt,
  setCustomPrompt,
  onToggleCustomMode,
  onClearCustomPrompt,
  extra,
  usageTip,
  setExtra,
  sceneTemplate = "",
  onApplyRecommendedDescription,
  extraRef,
  showExtraError,
  setShowExtraError,
  extraTrimmed,
  imageProvider,
  availableAspects,
  size,
  availableGoogleSizes,
  imageModelOptions = [],
  fallbackModelName,
  modelLock,
  aspect,
  setAspect,
  setSize,
  modelNames,
  setModelNames,
  n,
  setN,
  activeSettingDialog,
  setActiveSettingDialog,
  baseImagePreviews,
  baseImageNames,
  onAddBaseImages,
  onRemoveBaseImage,
  onMoveBaseImage,
  onEditBaseImage,
  selectedRecentUrls,
  onToggleRecentUrl,
  onEditRecentImage,
  onApplyReferenceSelection,
  appliedReferenceItems = [],
  onRemoveAppliedReference,
  onOpenReferencePicker,
  referencePickerDisabled,
  cameraEnabled,
  onCameraRequest,
  addImageTooltip,
  onAdvancedOpen,
  referenceStrength,
  referenceStrengthLabel,
  onChangeReferenceStrength,
  varSpecs,
  vars,
  setVars,
  negative,
  setNegative,
  recentImages,
  maxRefImages,
  canAttachReference,
  referenceRequired,
  referenceMinCount,
  visibility,
  onChangeVisibility,
  isAdministrator: _isAdministrator,
}: {
  isCustomMode: boolean;
  allowTemplateMode?: boolean;
  imageDescriptionRequired?: boolean;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  onToggleCustomMode: () => void;
  onClearCustomPrompt: () => void;
  extra: string;
  usageTip?: string;
  setExtra: (v: string) => void;
  sceneTemplate?: string;
  onApplyRecommendedDescription?: (prompt: string) => void;
  extraRef: React.RefObject<HTMLTextAreaElement | null>;
  showExtraError: boolean;
  setShowExtraError: (v: boolean) => void;
  extraTrimmed: string;

  imageProvider: ImageProviderType;
  availableAspects: readonly SupportedAspectRatio[];
  size: string;
  availableGoogleSizes: readonly string[];
  imageModelOptions?: CatalogImageModelOption[];
  fallbackModelName: string;
  modelLock?: PromptModelLockResolution | null;
  aspect: SupportedAspectRatio;
  setAspect: (v: SupportedAspectRatio) => void;
  setSize: (v: string) => void;
  modelNames: ImageModelNameType[];
  setModelNames: React.Dispatch<React.SetStateAction<ImageModelNameType[]>>;
  n: number;
  setN: React.Dispatch<React.SetStateAction<number>>;
  activeSettingDialog: SettingDialogType;
  setActiveSettingDialog: (v: SettingDialogType) => void;

  baseImagePreviews: string[];
  baseImageNames: string[];
  onAddBaseImages: (files: File[]) => void | Promise<void>;
  onRemoveBaseImage: (index: number) => void;
  onMoveBaseImage: (from: number, to: number) => void;
  onEditBaseImage?: (index: number) => void;

  selectedRecentUrls: string[];
  onToggleRecentUrl: (url: string) => void;
  onEditRecentImage?: (args: { target: RecentImageEditTargetType; url: string }) => void | Promise<void>;
  onApplyReferenceSelection: (args: {
    selectedAttachedIndexes: number[];
    selectedRecentUrls: string[];
  }) => void | Promise<void>;
  appliedReferenceItems?: Array<{
    id: string;
    preview: string;
    name: string;
    origin: "attached" | "recent";
  }>;
  /** 적용된 참고 이미지 제거 — 본문 참고 이미지 섹션 chips (Phase 4 본문화) */
  onRemoveAppliedReference?: (index: number) => void;
  onOpenReferencePicker?: () => void;
  referencePickerDisabled?: boolean;
  cameraEnabled?: boolean;
  onCameraRequest?: () => boolean | Promise<boolean>;
  /** 참고 이미지가 필수인 템플릿의 추가 유도 문구 */
  addImageTooltip?: { ko: string; en: string };
  /** UX 계측(계약 §6): 사용자가 상세 설정(Advanced)을 열었을 때 */
  onAdvancedOpen?: () => void;
  referenceStrength: ReferenceStrengthType;
  referenceStrengthLabel: { ko: string; en: string };
  onChangeReferenceStrength: (value: ReferenceStrengthType) => void;

  varSpecs: VarSpec[];
  vars: Record<string, string>;
  setVars: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  negative: string;
  setNegative: (v: string) => void;
  recentImages?: string[];
  maxRefImages?: number;
  canAttachReference: boolean;
  referenceRequired: boolean;
  referenceMinCount: number;
  visibility: PromptVisibilityType;
  onChangeVisibility: (value: PromptVisibilityType) => void;
  isAdministrator?: boolean;
}) {
  const maxRef = Math.max(0, maxRefImages ?? 0);
  const remainingRefSlots = Math.max(0, maxRef - baseImagePreviews.length - selectedRecentUrls.length);
  const isRefLimited = maxRef > 0;
  const attachedIndexes = React.useMemo(() => baseImagePreviews.map((_, idx) => idx), [baseImagePreviews]);

  const settingDialogClasses = (isActive: boolean, className?: string) => {
    return cn(
      "flex w-full max-w-full min-w-0 gap-2 rounded-xl border-2 px-4 py-3 text-left transition-all bg-surface",
      isActive && "border-primary",
      className,
    );
  };

  const appliedCount = appliedReferenceItems.length;
  const hasAppliedRefs = appliedCount > 0;
  const imageDescriptionTemplate = String(sceneTemplate || "").trim();
  const recommendedDescriptionSpecs = React.useMemo(
    () => (imageDescriptionTemplate ? extractPromptVariables(imageDescriptionTemplate) : []),
    [imageDescriptionTemplate],
  );

  const recommendedDescriptionDefaultVars = React.useMemo(
    () =>
      recommendedDescriptionSpecs.reduce<Record<string, string>>((acc, spec) => {
        acc[spec.key] = spec.kind === "select" && spec.options?.[0] ? spec.options[0] : "";
        return acc;
      }, {}),
    [recommendedDescriptionSpecs],
  );

  const [recommendedDescriptionSheetTemplate, setRecommendedDescriptionSheetTemplate] = React.useState<string | null>(
    null,
  );
  // Advanced Settings 팝업의 활성 탭 — "negative" | "var:{변수 key}" (4차 개선)
  const [advancedTab, setAdvancedTab] = React.useState<string>("negative");

  const handleOpenAdvanced = React.useCallback(
    (tab: string) => {
      setAdvancedTab(tab);
      setActiveSettingDialog("advanced");
      onAdvancedOpen?.();
    },
    [onAdvancedOpen, setActiveSettingDialog],
  );

  // 고급 설정 리스트 row의 현재값 표시 (사용하지 않음 / 직접 설정 / 옵션 라벨 / 입력값)
  const getAdvancedValueLabel = (spec: VarSpec): string => {
    const raw = String(vars[spec.key] || "").trim();
    if (spec.kind !== "select") return raw || lang({ ko: "없음", en: "None" });
    if (raw === IMAGE_PROMPT_OPTION_NONE) return lang({ ko: "사용하지 않음", en: "Do not use" });
    if (raw === IMAGE_PROMPT_OPTION_CUSTOM) return lang({ ko: "직접 설정", en: "Custom" });
    return normalizeLabel(getSelectOptionLabel(raw)) || lang({ ko: "없음", en: "None" });
  };
  const [recommendedDescriptionDraft, setRecommendedDescriptionDraft] = React.useState<{
    template: string;
    vars: Record<string, string>;
  }>(() => ({
    template: imageDescriptionTemplate,
    vars: recommendedDescriptionDefaultVars,
  }));

  const isRecommendedDescriptionSheetOpen = recommendedDescriptionSheetTemplate === imageDescriptionTemplate;
  const recommendedDescriptionVars =
    recommendedDescriptionDraft.template === imageDescriptionTemplate
      ? recommendedDescriptionDraft.vars
      : recommendedDescriptionDefaultVars;
  const hasRecommendedDescriptionTemplate = !isCustomMode && imageDescriptionTemplate.length > 0;
  const recommendedDescriptionText = React.useMemo(
    () =>
      hasRecommendedDescriptionTemplate
        ? renderImagePrompt(undefined, imageDescriptionTemplate, { params: recommendedDescriptionVars }).trim()
        : "",
    [hasRecommendedDescriptionTemplate, imageDescriptionTemplate, recommendedDescriptionVars],
  );
  const isRecommendedDescriptionReady = React.useMemo(
    () =>
      recommendedDescriptionSpecs.every(
        (spec) => spec.kind !== "text" || String(recommendedDescriptionVars[spec.key] || "").trim().length > 0,
      ),
    [recommendedDescriptionSpecs, recommendedDescriptionVars],
  );

  const normalizedModelNames = React.useMemo(
    () =>
      modelLock
        ? ([modelLock.modelName] as ImageModelNameType[])
        : normalizeSelectedModelNames(
            modelNames as string[],
            String(fallbackModelName || DEFAULT_IMAGE_MODEL_BY_PROVIDER.google),
          ),
    [fallbackModelName, modelLock, modelNames],
  );
  const imageModelByName = React.useMemo(
    () =>
      Object.fromEntries(imageModelOptions.map((item) => [item.modelName, item])) as Record<
        string,
        CatalogImageModelOption
      >,
    [imageModelOptions],
  );
  const selectedModelDisplayLines = React.useMemo(
    () =>
      normalizedModelNames.map((modelName) => {
        const meta = imageModelByName[modelName];
        const provider = meta?.provider || inferProviderFromModelName(modelName);
        const label =
          meta?.displayName && meta.displayName !== modelName
            ? `${provider} · ${meta.displayName}`
            : `${provider} · ${modelName}`;
        return meta?.deprecated ? `${label} · deprecated` : label;
      }),
    [imageModelByName, normalizedModelNames],
  );
  // 모델 카드 단가 배지 제거(2차 정리) — 최종 비용의 authoritative display는 Bottom Action Bar 한 곳(계약 §3.8)
  const isMultiModelSelected = normalizedModelNames.length > 1;
  const hasReferenceInput =
    baseImagePreviews.length > 0 || selectedRecentUrls.length > 0 || appliedReferenceItems.length > 0;
  const hasGrokImagineReferenceConflict =
    hasReferenceInput && normalizedModelNames.includes("grok-imagine-image-2.0" as ImageModelNameType);
  const isOpenAIRefBlocked = false;
  const isReferenceOptionDisabled = isOpenAIRefBlocked;

  const selectableModels = imageModelOptions.filter(
    (item) =>
      !hasReferenceInput ||
      item.modelName !== "grok-imagine-image-2.0" ||
      normalizedModelNames.includes(item.modelName as ImageModelNameType),
  );

  const isExtraInvalid = imageDescriptionRequired && showExtraError && !extraTrimmed;

  const handleApplyRecommendedDescription = React.useCallback(() => {
    const text = String(recommendedDescriptionText || "").trim();
    if (!text || !isRecommendedDescriptionReady) return;
    onApplyRecommendedDescription?.(text);
    setRecommendedDescriptionSheetTemplate(null);
  }, [isRecommendedDescriptionReady, onApplyRecommendedDescription, recommendedDescriptionText]);

  const handleToggleCustomModeClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleCustomMode();
    },
    [onToggleCustomMode],
  );

  const handleClearCustomPromptClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onClearCustomPrompt();
    },
    [onClearCustomPrompt],
  );

  const renderRecentImageOption = React.useCallback(
    (args: {
      target: RecentImageEditTargetType;
      src: string;
      index: number;
      selected: boolean;
      disabled: boolean;
      onToggle: (url: string) => void;
    }) => (
      <div key={`${args.target}-recent-${args.index}`} className="relative shrink-0">
        <Button
          variant="blank"
          rounded="xl"
          onClick={() => {
            if (args.disabled) return;
            args.onToggle(args.src);
          }}
          className={cn(
            "group relative transition-all duration-200 hover:scale-[1.02]",
            args.selected && "border-2 border-secondary",
            args.disabled && "opacity-40 cursor-not-allowed",
          )}
        >
          <ImageBox
            src={args.src}
            alt={`${args.target}-recent-${args.index}`}
            height={120}
            objectFit="object-cover"
            className="rounded-[0.6rem]"
          />
          {args.selected && (
            <div className="absolute bottom-1 right-1 flex items-center justify-center bg-secondary rounded-full p-1">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
        </Button>
        {onEditRecentImage ? (
          <Button
            variant="blank"
            size="icon-xs"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (args.disabled) return;
              if (args.selected) args.onToggle(args.src);
              void onEditRecentImage({ target: args.target, url: args.src });
            }}
            disabled={args.disabled}
            aria-label={lang({
              ko: "최근 참고 이미지 편집",
              en: "Edit recent reference image",
            })}
            className="absolute bottom-1 left-1 z-10 rounded-full bg-background/90 text-primary-text shadow-sm ring-1 ring-border/60 backdrop-blur hover:bg-background"
          >
            <Edit3 className="h-3 w-3" />
          </Button>
        ) : null}
      </div>
    ),
    [onEditRecentImage],
  );

  const renderReferenceStrengthCards = React.useCallback(
    (args: {
      title: { ko: string; en: string };
      value: ReferenceStrengthType;
      onChange: (value: ReferenceStrengthType) => void;
      idPrefix: string;
    }) => (
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          <Lang text={args.title} />
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {REFERENCE_STRENGTH_OPTIONS.map((option) => {
            const isSelected = args.value === option.value;
            return (
              <Button
                key={`${args.idPrefix}-${option.value}`}
                variant="blank"
                rounded="xl"
                noWrap={false}
                onClick={() => args.onChange(option.value)}
                className={cn(
                  "h-auto flex-col items-start gap-1 border-2 bg-surface px-3 py-3 text-left",
                  isSelected && "border-primary bg-primary/10 text-primary",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2 text-xs font-semibold">
                  <Lang text={option.label} />
                  {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                </span>
                <span className="block mt-1 text-xxs leading-relaxed text-muted-foreground">
                  <Lang text={option.description} />
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    ),
    [],
  );

  // 이미지 설명 블록 (3차 정리):
  // - 커스텀 모드: 프롬프트가 주 입력 → 본문 최상단
  // - 템플릿 모드: 템플릿 프롬프트에 대한 '추가 프롬프트'(옵션) → 생성 액션 바로 위 하단
  const descriptionBlock = (
    <div className="relative space-y-2">
      <Label
        htmlFor="gen_creative_desc_input"
        required={imageDescriptionRequired}
        className="mb-0 w-full"
        labelClassName="text-sm font-medium text-muted-foreground"
        label={
          <span className="flex items-center gap-2">
            <SquareTerminal className="icon-xs" />
            {isCustomMode
              ? lang({ ko: "프롬프트 편집", en: "Edit Prompt" })
              : lang({ ko: "프롬프트 추가하기", en: "Add Prompt" })}
          </span>
        }
        {...(!isCustomMode && usageTip && { labelTooltip: { text: usageTip, defaultOpen: false } })}
        suffix={
          <div className="flex-y-center gap-3">
            {hasRecommendedDescriptionTemplate && (
              <Button
                variant="blank"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setRecommendedDescriptionSheetTemplate(imageDescriptionTemplate);
                }}
                className={cn("hover:text-primary", isRecommendedDescriptionSheetOpen && "text-primary")}
                aria-label={lang({ ko: "추천 이미지 설명 사용하기", en: "Use recommended image description" })}
                title={lang({
                  ko: `${recommendedDescriptionSpecs.length}개의 템플릿 옵션`,
                  en: `${recommendedDescriptionSpecs.length} template options`,
                })}
              >
                <MessageCircleHeart className="icon-xs" />
              </Button>
            )}

            {isCustomMode ? (
              <>
                <Button
                  variant="blank"
                  onClick={handleClearCustomPromptClick}
                  aria-label={lang({ ko: "직접 편집 프롬프트 모두 삭제", en: "Clear direct prompt" })}
                  className="text-muted-foreground hover:text-amber-600"
                >
                  <Eraser className="icon-xs" />
                </Button>

                {allowTemplateMode && (
                  <Button
                    variant="blank"
                    onClick={handleToggleCustomModeClick}
                    aria-label={lang({ ko: "프롬프트 직접 편집 닫기", en: "Close direct prompt edit" })}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <X className="icon-xs" />
                  </Button>
                )}
              </>
            ) : null}
          </div>
        }
      />

      <Label htmlFor="gen_creative_desc_input" variant="card" className="w-full">
        <Error
          isShow={isExtraInvalid}
          text={lang({
            ko: "이미지 설명은 필수 입력입니다.",
            en: "Image description is required.",
          })}
        >
          <Textarea
            id="gen_creative_desc_input"
            ref={extraRef}
            rows={isCustomMode ? 5 : 2}
            autoResize
            variant="card"
            value={isCustomMode ? customPrompt : extra}
            size="sm"
            onChange={(e) => {
              const v = e.target.value;
              if (isCustomMode) {
                setCustomPrompt(v);
              } else {
                setExtra(v);
                if (showExtraError && String(v || "").trim()) setShowExtraError(false);
              }
            }}
            placeholder={lang({
              ko: isCustomMode
                ? "원하는 이미지를 자유롭게 설명하세요..."
                : usageTip || "톤, 관점, 광 포함할 내용을 추가로 입력하세요.",
              en: isCustomMode
                ? "Describe your desired image..."
                : usageTip || "Add tone, perspective, light, and other details.",
            })}
            aria-invalid={isExtraInvalid}
            className={cn(
              "max-h-32 overflow-y-auto text-sm border-none p-0 dark:bg-transparent",
              isCustomMode && "font-mono",
              isExtraInvalid && "border-red-500",
            )}
          />
        </Error>
      </Label>

      {!isCustomMode && hasAppliedRefs && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
          <Check className="h-3 w-3 text-green-500" />
          <Lang
            text={{
              ko: `참고 강도: ${referenceStrengthLabel.ko}`,
              en: `Reference strength: ${referenceStrengthLabel.en}`,
            }}
          />
        </div>
      )}
    </div>
  );

  const OptionSectionClassName =
    "flex w-full items-start justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-left hover:text-primary";
  return (
    <>
      <div className="space-y-8">
        {/* 커스텀 모드: 프롬프트가 주 입력 — 본문 최상단 */}
        {isCustomMode ? descriptionBlock : null}

        {/* 참고 이미지 — 모델 이미지 기능은 첨부(참고) 이미지로 병합되어 제거됨 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ImagePlus className="icon-xs" />
              <Lang text={{ ko: "참고 이미지", en: "Reference Images" }} />
              {appliedCount > 0 ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-mono text-muted-foreground">
                  {appliedCount}
                </span>
              ) : null}
              {addImageTooltip && appliedCount === 0 ? (
                <span className="text-xxs text-amber-600">
                  <Lang text={addImageTooltip} />
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              {onOpenReferencePicker ? (
                <Button
                  variant="blank"
                  onClick={onOpenReferencePicker}
                  disabled={referencePickerDisabled}
                  className="flex items-center gap-1 rounded-lg border border-border/70 px-2 text-xs font-medium text-foreground hover:text-primary"
                >
                  <Plus className="icon-xs" />
                  <Lang text={{ ko: "추가", en: "Add" }} />
                </Button>
              ) : null}
            </div>
          </div>
          {appliedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 px-1">
              {appliedReferenceItems.map((item, index) => (
                <AppliedReferenceChip
                  key={`reference-${item.id}`}
                  src={item.preview}
                  alt={item.name}
                  label={item.origin === "attached" ? { ko: "첨부", en: "Attached" } : { ko: "최근", en: "Recent" }}
                  removeAriaLabel={lang({ ko: "첨부 이미지 제거", en: "Remove attached image" })}
                  onRemove={onRemoveAppliedReference ? () => onRemoveAppliedReference(index) : undefined}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* 이미지 설정 — row형 선택기(3차 정리): 현재 선택값만 표시, 클릭 시 BottomSheet에서 옵션 선택 */}
        <StudioSettingSection
          icon={<Settings2 className="icon-xs" />}
          title={<Lang text={{ ko: "이미지 기본 설정", en: "Image Settings" }} />}
        >

          {/* 비율 */}
          <StudioSettingRow
            label={<Lang text={{ ko: "비율", en: "Aspect Ratio" }} />}
            value={renderAspectOptionLabel(aspect)}
            onClick={() => setActiveSettingDialog("aspect")}
            ariaLabel={lang({
              ko: `비율 선택 (현재 ${renderAspectOptionLabel(aspect)})`,
              en: `Select aspect ratio (current ${renderAspectOptionLabel(aspect)})`,
            })}
          />

          {/* 해상도 — google provider에서 선택지가 둘 이상일 때만 노출 */}
          {imageProvider === "google" && availableGoogleSizes.length > 1 ? (
            <StudioSettingRow
              label={<Lang text={{ ko: "해상도", en: "Resolution" }} />}
              value={size}
              onClick={() => setActiveSettingDialog("resolution")}
              ariaLabel={lang({ ko: `해상도 선택 (현재 ${size})`, en: `Select resolution (current ${size})` })}
            />
          ) : null}

          {/* 모델 — row selector (BottomSheet selector 유지, 계약 §3.6) */}
          <StudioSettingRow
            label={<Lang text={{ ko: "생성 모델", en: "Generative Model" }} />}
            value={selectedModelDisplayLines.join(", ")}
            onClick={() => setActiveSettingDialog("model")}
            locked={Boolean(modelLock)}
            noWrap={false}
            ariaLabel={lang({
              ko: `모델 선택${modelLock ? " (이 템플릿은 모델이 고정되어 있습니다)" : ""}`,
              en: `Select models${modelLock ? " (fixed for this template)" : ""}`,
            })}
          />

          {/* 생성 개수 — stepper */}
          <div className={cn(OptionSectionClassName, "items-center")}>
            <p className="text-xs font-medium text-muted-foreground">
              <Lang text={{ ko: "생성 개수", en: "Count" }} />
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="blank"
                size="icon-xs"
                rounded="full"
                onClick={() => setN((v) => Math.max(1, v - 1))}
                disabled={n <= 1}
                aria-label={lang({ ko: "생성 개수 감소", en: "Decrease count" })}
                className="h-8 w-8 border-2 border-border/70 bg-surface text-primary hover:bg-muted"
              >
                <Minus className="icon-xs" />
              </Button>
              <span className="w-4 text-center text-base font-bold tabular-nums" aria-live="polite">
                {n}
              </span>
              <Button
                variant="blank"
                size="icon-xs"
                rounded="full"
                onClick={() => setN((v) => Math.min(AI_GEN_IMAGE_LIMIT, v + 1))}
                disabled={n >= AI_GEN_IMAGE_LIMIT}
                aria-label={lang({ ko: "생성 개수 증가", en: "Increase count" })}
                className="h-8 w-8 border-2 border-border/70 bg-surface text-primary hover:bg-muted"
              >
                <Plus className="icon-xs" />
              </Button>
            </div>
          </div>
        </StudioSettingSection>

        {isMultiModelSelected && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            <Lang
              text={{
                ko: "모델이 여러개 선택되어 있습니다. 예상 사용 코인을 확인하세요.",
                en: "Multiple models are selected. Check expected coin usage.",
              }}
            />
          </div>
        )}

        {hasGrokImagineReferenceConflict && (
          <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            <Lang
              text={{
                ko: "Grok Imagine 2.0은 참고 이미지 입력을 지원하지 않습니다. 이 모델을 해제하거나 참고 이미지를 제거해 주세요.",
                en: "Grok Imagine 2.0 does not support reference images. Deselect this model or remove the reference images.",
              }}
            />
          </div>
        )}

        {modelLock && (
          <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
            <Lang
              text={{
                ko: "이 템플릿은 품질 일관성을 위해 모델이 고정되어 있습니다. 생성 비용은 동일한 AI 과금 파이프라인으로 차감됩니다.",
                en: "This template uses a fixed model for quality consistency. Generation is billed through the same AI coin pipeline.",
              }}
            />
          </div>
        )}

        <ModelSelectBottomSheet
          portal={false}
          open={activeSettingDialog === "model"}
          onClose={() => setActiveSettingDialog(null)}
          title={lang({ ko: "모델 선택", en: "Select Models" })}
          selectedLabel={
            <Lang
              text={{
                ko: `선택된 모델 ${normalizedModelNames.length}개`,
                en: `${normalizedModelNames.length} model(s) selected`,
              }}
            />
          }
          selectedValues={normalizedModelNames}
          options={selectableModels.map((item) => {
            const modelName = item.modelName;
            const prov = (item.provider || inferProviderFromModelName(modelName)) as ImageProviderType;
            const billingInfo = getImageModelBillingInfo(prov, modelName, prov === "google" ? size : undefined);
            return {
              value: modelName,
              title: item.displayName || modelName,
              providerLabel: prov,
              description: modelName,
              coins: billingInfo.perImage,
              usageBilled: billingInfo.isUsageBilled,
              recommended: item.recommendedModel,
              deprecated: item.deprecated,
            };
          })}
          onSelect={(modelName) => {
            if (!selectableModels.some((candidate) => candidate.modelName === modelName)) return;
            setModelNames((prev) =>
              toggleSelectedModelName(
                prev as string[],
                modelName,
                String(fallbackModelName || DEFAULT_IMAGE_MODEL_BY_PROVIDER.google),
              ),
            );
          }}
        />

        {/* 공개 범위 — Basic 상시 노출(계약 §3.6). default/value semantics는 기존 정책 유지 */}
        <StudioSettingSection
          icon={<Eye className="icon-xs" />}
          title={<Lang text={{ ko: "공개 범위", en: "Visibility" }} />}
          contentClassName="space-y-0"
        >
          <Label variant="card" className="w-full">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-primary-text">
                  {visibility === "public" ? (
                    <Lang text={{ ko: "공개", en: "Public" }} />
                  ) : (
                    <Lang text={{ ko: "비공개", en: "Private" }} />
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {visibility === "public" ? (
                    <Lang
                      text={{
                        ko: "모두와 이미지, 프롬프트를 공유합니다.",
                        en: "Share images and prompts with everyone.",
                      }}
                    />
                  ) : (
                    <Lang
                      text={{
                        ko: "나만 볼 수 있습니다.",
                        en: "Only you can see it.",
                      }}
                    />
                  )}
                </span>
              </div>

              <Switch
                size="sm"
                checked={visibility === "public"}
                onCheckedChange={(checked) => onChangeVisibility(checked ? "public" : "private")}
                aria-label={lang({ ko: "공개 범위 전환", en: "Toggle visibility" })}
              />
            </div>
          </Label>
        </StudioSettingSection>

        {/* 고급 설정 — 금지 표현 + 템플릿 변수 옵션을 Advanced Settings 팝업 탭으로 관리(4차 개선) */}
        <StudioSettingSection
          icon={<SlidersVertical className="icon-xs" />}
          title={<Lang text={{ ko: "고급 설정", en: "Advanced Settings" }} />}
        >
          {/* 리스트 row: 선택된 템플릿 변수 옵션 목록 (템플릿 모드) */}
          {!isCustomMode &&
            varSpecs.map((spec) => (
              <StudioSettingRow
                key={spec.key}
                label={customTempleteLabel(spec.key, 24)}
                value={getAdvancedValueLabel(spec)}
                onClick={() => handleOpenAdvanced(`var:${spec.key}`)}
                disabled={spec.disabled}
                aria-label={lang({
                  ko: `고급 설정 열기 — ${customTempleteLabel(spec.key, 24)} (현재 ${getAdvancedValueLabel(spec)})`,
                  en: `Open advanced settings — ${customTempleteLabel(spec.key, 24)} (current ${getAdvancedValueLabel(spec)})`,
                })}
                labelClassName="min-w-18"
                noWrap={false}
              />
            ))}

          {/* 리스트 row: 금지 표현 */}
          <StudioSettingRow
            label={<Lang text={{ ko: "금지 표현", en: "Forbidden terms" }} />}
            value={negative ? <Lang text={{ ko: "입력됨", en: "Set" }} /> : <Lang text={{ ko: "없음", en: "None" }} />}
            onClick={() => handleOpenAdvanced("negative")}
            aria-label={lang({ ko: "고급 설정 열기 — 금지 표현", en: "Open advanced settings — forbidden terms" })}
          />
        </StudioSettingSection>

        {/* 추가 프롬프트 (템플릿 모드) — 옵션 입력, 생성 액션 바로 위(3차 정리) */}
        {!isCustomMode ? descriptionBlock : null}
      </div>

      <BottomSheetDialog
        portal={false}
        open={hasRecommendedDescriptionTemplate && isRecommendedDescriptionSheetOpen}
        onClose={() => setRecommendedDescriptionSheetTemplate(null)}
        title={lang({ ko: "추천 이미지 설명", en: "Recommended Image Description" })}
      >
        <div className="flex flex-col gap-4 p-4">
          <p className="px-1 pb-1 text-xs leading-relaxed text-muted-foreground">
            <Lang
              text={{
                ko: "템플릿 옵션을 선택하거나 직접 입력해 이미지 설명을 완성합니다.",
                en: "Complete the image description by selecting or entering template options.",
              }}
            />
          </p>

          <SelectGroupCard
            items={recommendedDescriptionSpecs}
            values={recommendedDescriptionVars}
            parseOptionToken={parsePromptOptionToken}
            onChangeValue={(key, value) =>
              setRecommendedDescriptionDraft((prev) => ({
                template: imageDescriptionTemplate,
                vars: {
                  ...(prev.template === imageDescriptionTemplate ? prev.vars : recommendedDescriptionDefaultVars),
                  [key]: value,
                },
              }))
            }
            formatLabel={(key) => customTempleteLabel(key, 36)}
            formatOptionLabel={getSelectOptionLabel}
            fitTextarea={true}
          />

          <div className="rounded-lg border bg-card px-3 py-3 text-xs leading-relaxed text-secondary-text">
            {recommendedDescriptionText || (
              <Lang
                text={{
                  ko: "옵션을 입력하면 조합된 설명이 여기에 표시됩니다.",
                  en: "The composed description appears here after you fill the options.",
                }}
              />
            )}
          </div>

          <Button
            variant="primary"
            disabled={!recommendedDescriptionText || !isRecommendedDescriptionReady}
            onClick={handleApplyRecommendedDescription}
            className="w-full"
          >
            <Lang text={{ ko: "추가 프롬프트에 적용", en: "Apply to Additional Prompt" }} />
          </Button>
        </div>
      </BottomSheetDialog>

      {/* 설정 다이얼로그들 — 비율/해상도/모델: row 클릭 시 옵션 선택 */}
      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "aspect"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "비율 선택", en: "Select Aspect Ratio" })}
      >
        <div className="grid grid-cols-3 gap-2 p-4">
          {availableAspects.map((r) => (
            <Button
              variant="blank"
              rounded="xl"
              key={r}
              onClick={() => {
                setAspect(clampAspectForProvider(imageProvider, r, normalizedModelNames[0]));
                setActiveSettingDialog(null);
              }}
              className={settingDialogClasses(aspect === r, "flex-col items-center")}
            >
              <AspectPreviewBox ratio={r} />
              <span className="text-xs font-semibold whitespace-nowrap">{renderAspectOptionLabel(r)}</span>
            </Button>
          ))}
        </div>
      </BottomSheetDialog>

      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "resolution"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "해상도 선택", en: "Select Resolution" })}
      >
        <div className="grid grid-cols-2 gap-2 p-4">
          {availableGoogleSizes.map((option) => (
            <Button
              key={option}
              variant="blank"
              rounded="xl"
              onClick={() => {
                setSize(option);
                setActiveSettingDialog(null);
              }}
              className={settingDialogClasses(size === option, "items-center justify-center")}
            >
              <span className="text-sm font-semibold">{option}</span>
            </Button>
          ))}
        </div>
      </BottomSheetDialog>

      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "reference"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "참고 이미지", en: "Reference Image" })}
      >
        <div className="p-4">
          {referenceRequired ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              <ImagePlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <Lang
                text={{
                  ko: `첨부 이미지가 필수입니다. 생성 전에 참고 이미지를 최소 ${referenceMinCount}장 적용해 주세요.`,
                  en: `An attached image is required. Apply at least ${referenceMinCount} reference image(s) before generating.`,
                }}
              />
            </div>
          ) : null}
          <ImageDropzone
            renderPreviewImage={({ src, alt }) => (
              <ImageBox src={src} alt={alt} height={120} objectFit="object-cover" className="rounded-xl" />
            )}
            onLog={(message, meta) => logger.warn(message, meta)}
            label={<Lang text={{ ko: "이미지 업로드", en: "Image Upload" }} />}
            size="xs"
            disabled={isReferenceOptionDisabled}
            addDisabled={!canAttachReference || (isRefLimited && baseImagePreviews.length >= maxRef)}
            addText={lang({ ko: "추가", en: "Add" })}
            previewUrl={baseImagePreviews[0] ?? undefined}
            valueText={baseImageNames[0] ?? undefined}
            multiple
            accept="image/*"
            camera={{
              enabled: cameraEnabled,
              disabled:
                isReferenceOptionDisabled ||
                !canAttachReference ||
                (isRefLimited && remainingRefSlots <= 0),
              label: <Lang text={{ ko: "촬영", en: "Capture" }} />,
              onRequest: onCameraRequest,
            }}
            hintText={
              <Lang
                text={{
                  ko: (
                    <span className="text-center">
                      이미지를 드래그앤드롭하거나
                      <br />
                      선택을 눌러주세요.
                    </span>
                  ),
                  en: (
                    <span className="text-center">
                      Please drag and drop the image
                      <br />
                      or click to select.
                    </span>
                  ),
                }}
              />
            }
            onPick={(file) => onAddBaseImages([file])}
            onPickMany={(files) => onAddBaseImages(files)}
            previewUrls={baseImagePreviews}
            previewNames={baseImageNames}
            previewTitle={
              <p className="text-xs font-medium text-muted-foreground">
                <Lang
                  text={{
                    ko: `첨부된 이미지 (${baseImagePreviews.length}장)`,
                    en: `Attached images (${baseImagePreviews.length})`,
                  }}
                />
                {isRefLimited && (
                  <span className="ml-2 text-xxs text-muted-foreground">
                    <Lang
                      text={{ ko: `참고/모델 합산 최대 ${maxRef}장`, en: `Max ${maxRef} reference/model images` }}
                    />
                  </span>
                )}
              </p>
            }
            previewSelectable={false}
            onRemovePreview={onRemoveBaseImage}
            onMovePreview={onMoveBaseImage}
            onEditPreview={onEditBaseImage}
          />

          {/* 최근 생성 이미지에서 선택 */}
          {recentImages && recentImages.length > 0 && !isReferenceOptionDisabled && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground mb-0">
                <Lang
                  text={{
                    ko: "최근 생성 이미지에서 선택",
                    en: "Select from recent images",
                  }}
                />
              </p>
              <ScrollArea className="w-full">
                <div className="flex gap-2 py-2">
                  {recentImages.map((src, i) => {
                    const isSelected = selectedRecentUrls.includes(src);
                    const isDisabled = isRefLimited && !isSelected && remainingRefSlots <= 0;
                    return renderRecentImageOption({
                      target: "reference",
                      src,
                      index: i,
                      selected: isSelected,
                      disabled: isDisabled,
                      onToggle: onToggleRecentUrl,
                    });
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {renderReferenceStrengthCards({
            title: { ko: "참고 강도", en: "Reference Strength" },
            value: referenceStrength,
            onChange: onChangeReferenceStrength,
            idPrefix: "reference-strength",
          })}

          <div className="pt-2 flex justify-end">
            <Button
              variant="primary"
              disabled={!canAttachReference || (selectedRecentUrls.length === 0 && baseImagePreviews.length === 0)}
              onClick={async () => {
                await onApplyReferenceSelection({
                  selectedAttachedIndexes: attachedIndexes,
                  selectedRecentUrls,
                });
                setActiveSettingDialog(null);
              }}
              className="w-full"
            >
              <Lang text={{ ko: "적용하기", en: "Apply" }} />
            </Button>
          </div>
        </div>
      </BottomSheetDialog>

      {/* Advanced Settings 팝업 — 상단 탭 버튼(금지 표현 + 각 변수)으로 옵션 전환 */}
      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "advanced"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "고급 설정", en: "Advanced Settings" })}
      >
        <div
          role="tablist"
          aria-label={lang({ ko: "고급 설정 항목", en: "Advanced settings sections" })}
          className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none"
        >
          <Button
            variant={advancedTab === "negative" ? "primary" : "outlinePrimary"}
            rounded="full"
            size="sm"
            role="tab"
            aria-selected={advancedTab === "negative"}
            onClick={() => setAdvancedTab("negative")}
            className="shrink-0 text-xs font-semibold"
          >
            <Lang text={{ ko: "금지 표현", en: "Forbidden terms" }} />
          </Button>
          {!isCustomMode &&
            varSpecs.map((spec) => {
              const tabId = `var:${spec.key}`;
              return (
                <Button
                  key={spec.key}
                  variant={advancedTab === tabId ? "primary" : "outlinePrimary"}
                  rounded="full"
                  size="sm"
                  role="tab"
                  aria-selected={advancedTab === tabId}
                  onClick={() => setAdvancedTab(tabId)}
                  className="shrink-0 text-xs font-semibold"
                >
                  {customTempleteLabel(spec.key, 16)}
                </Button>
              );
            })}
        </div>
        <div role="tabpanel" className="p-4">
          {advancedTab === "negative" ? (
            <Label
              variant="card"
              className="w-full"
              label={
                <div className="flex-y-center gap-1">
                  <Settings width={12} height={12} />
                  <Lang text={{ ko: "금지 표현", en: "Forbidden terms" }} />
                </div>
              }
            >
              <Textarea
                rows={3}
                variant="card"
                size="sm"
                autoResize
                value={negative}
                onChange={(e) => setNegative(e.target.value)}
                placeholder={lang({
                  ko: "로고, 워터마크, 왜곡, 잘림...",
                  en: "logo, watermark, blur...",
                })}
              />
            </Label>
          ) : null}

          {/* 템플릿 변수 탭 — 기존 옵션 카드 UI를 단일 카드로 재사용 (옵션 → 직접 설정하기 → 사용하지 않음 순서) */}
          {!isCustomMode && advancedTab.startsWith("var:")
            ? (() => {
                const spec = varSpecs.find((s) => `var:${s.key}` === advancedTab);
                if (!spec) return null;
                return (
                  <SelectGroupCard
                    key={spec.key}
                    showTitle={false}
                    fullWidth
                    className="mx-0"
                    items={[spec]}
                    values={vars}
                    parseOptionToken={parsePromptOptionToken}
                    onChangeValue={(key, value) => setVars((prev) => ({ ...prev, [key]: value }))}
                    selectNoneOption={{
                      value: IMAGE_PROMPT_OPTION_NONE,
                      label: { ko: "사용하지 않음", en: "Do not use" },
                    }}
                    selectCustomOption={{
                      value: IMAGE_PROMPT_OPTION_CUSTOM,
                      getValueKey: getImagePromptCustomParamKey,
                      label: { ko: "직접 설정하기", en: "Customize" },
                      placeholder: {
                        ko: "이 옵션에 직접 적용할 프롬프트를 입력하세요.",
                        en: "Enter the custom prompt for this option.",
                      },
                    }}
                  />
                );
              })()
            : null}
        </div>
      </BottomSheetDialog>
    </>
  );
}
