"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { useGenStudioModelCatalog } from "hooks/app/useGenStudioModelCatalog";
import {
  customTempleteLabel,
  extractPromptVariables,
  findMissingRequiredPromptVariables,
  getImagePromptCustomParamKey,
  IMAGE_PROMPT_OPTION_CUSTOM,
  IMAGE_PROMPT_OPTION_NONE,
  parsePromptOptionToken,
  renderContentPrompt,
} from "utils/lab";
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  BottomSheetDialog,
  Label,
  Preloader,
  SelectGroupCard,
  Switch,
  dialog,
  ImageDropzone,
} from "@amu-labs/ui";
import { ImageOverlayDrawingDialog } from "components/module/image/ImageOverlayDrawingDialog";
import { ImageBox } from "components/module/image";
import { LoginDialog } from "components/module/auth";
import { CoinBalance } from "components/module/commerce";
import { UniverseCoinSummary } from "components/module/admin/universe";
import { logger } from "utils/log";
import { Lang, lang } from "components/module/i18n";
import type { UserScopeType, TextProviderType } from "types/ai";
import type { FormScopeType } from "types/ui";
import {
  AI_GEN_CONTENT_LIMIT,
  DEFAULT_TEXT_MODEL_BY_PROVIDER,
  TEXT_MODEL_MAP,
  TEXT_PROVIDER_TYPES,
  supportsTextModelImageInput,
} from "consts/ai";
import { getCatalogDefaultModelByProvider } from "utils/app/genStudioCatalogClient";
import {
  CONTENT_LENGTH_CUSTOM_VALUE,
  CONTENT_LENGTH_PRESET_OPTIONS,
  CONTENT_OUTPUT_FORMAT_OPTIONS,
  CONTENT_PLATFORM_CUSTOM_VALUE,
  CONTENT_PLATFORM_OPTIONS,
  DEFAULT_CONTENT_OUTPUT_FORMAT,
} from "consts/app";
import { getGenStudioTemplateArticleUrl, subscribePromptListChanged, loadStudioContentPromptItems } from "utils/app";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import type {
  BaseImageType,
  ContentAssetMetaType,
  ContentAssetPreviewType,
  ContentStudioApplyContentArgsType,
  ContentStudioDoneMetaType,
  ContentStudioReferenceImageType,
  PromptVisibilityType,
} from "types/app";
import { Check, ImagePlus, Minus, Plus, RefreshCcw, SlidersVertical, Settings2, X } from "lucide-react";
import { isPublicGenStudioSurface, trackGaEvent } from "utils/analytics/ga4";
import {
  cn,
  isDev,
  isMobileEnvironment,
  runAfterCurrentRender,
  supportsCameraCaptureInput,
  toErrorMessage,
} from "utils/common";
import { writeTextToClipboard } from "utils/helper";
import { FooterActions, type FooterAttachmentPreviewItem } from "./modules/preset-detail/FooterActions";
import { TemplateUsageBanner } from "./modules/preset-detail/TemplateUsageBanner";
import { RecentGeneratedContents } from "./modules/RecentGeneratedContents";
import { ContentAssetViewer } from "./modules/ContentAssetViewer";
import { ContentPreviewLoadNotice } from "./modules/ContentPreviewLoadNotice";
import { useRecentContentAssets } from "./hooks/useRecentContentAssets";
import { useContentStudioGeneration, type ContentStudioGenerationRequest } from "./hooks/useContentStudioGeneration";
import { ContentStudioComposer } from "./modules/content-studio/ContentStudioComposer";
import { ContentStudioForm } from "./modules/content-studio/ContentStudioForm";
import { ContentStudioOutputList, ContentStudioResult } from "./modules/content-studio/ContentStudioResult";
import { StudioCreationWorkspace } from "./modules/StudioCreationWorkspace";
import { StudioSettingRow } from "./modules/StudioSettingRow";
import { StudioSettingSection } from "./modules/StudioSettingSection";

type VarSpec = { key: string; kind: FormScopeType; options?: string[]; required?: boolean; disabled?: boolean };
type ContentReferenceImage = ContentStudioReferenceImageType;
type ContentSettingDialogType =
  | null
  | "platform"
  | "language"
  | "providerModel"
  | "length"
  | "outputFormat"
  | "count"
  | "reference"
  | "advanced";

type Item = {
  key: string;
  title: string;
  templateText: string;
  templateScope?: "user" | "system";
  defaultParams?: {
    platform?: string;
    language?: string;
    length?: string;
    outputFormat?: string;
    [k: string]: unknown;
  };
};

const GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY = "__gen_studio_custom_prompt__";
const CONTENT_REFERENCE_IMAGE_LIMIT = 4;
const CONTENT_REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const GEN_STUDIO_GHOST_SCROLLBAR_CLASS = "scrollbar-ghost";

function fileToContentReferenceImage(file: File): Promise<ContentReferenceImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) {
        reject(new Error("invalid_image_data"));
        return;
      }
      resolve({
        mimeType: match[1],
        data: match[2],
        previewUrl: dataUrl,
        name: file.name || "image",
      });
    };
    reader.onerror = () => reject(new Error("image_read_failed"));
    reader.readAsDataURL(file);
  });
}

function isContentPlatformOption(value: string) {
  return (CONTENT_PLATFORM_OPTIONS as readonly string[]).includes(value) && value !== CONTENT_PLATFORM_CUSTOM_VALUE;
}

function getContentPlatformLabel(option: string) {
  if (option === CONTENT_PLATFORM_CUSTOM_VALUE) return lang({ ko: "기타", en: "Other" });
  return option;
}

function resolveContentPlatform(platform: string, customPlatform: string) {
  if (platform !== CONTENT_PLATFORM_CUSTOM_VALUE) return platform;
  return String(customPlatform || "").trim() || "other";
}

function isContentLengthPreset(value: string) {
  return (CONTENT_LENGTH_PRESET_OPTIONS as readonly string[]).includes(value);
}

function resolveContentLength(lengthPreset: string, customLength: string) {
  if (lengthPreset !== CONTENT_LENGTH_CUSTOM_VALUE) return lengthPreset;
  return String(customLength || "").trim() || "기타: 직접 입력";
}

function pickContentOutputFormat(value?: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const next = String(rawValue || "").trim();
  return (CONTENT_OUTPUT_FORMAT_OPTIONS as readonly string[]).includes(next) ? next : DEFAULT_CONTENT_OUTPUT_FORMAT;
}

function appendContentMetaForPreview(
  base: string,
  data: { platform?: string; language?: string; length?: string; outputFormat?: string },
) {
  const meta: string[] = [];
  if (data.platform?.trim()) meta.push(`Platform: ${data.platform.trim()}`);
  if (data.language?.trim()) meta.push(`Language: ${data.language.trim()}`);
  if (data.length?.trim()) meta.push(`Length: ${data.length.trim()}`);
  if (data.outputFormat?.trim()) meta.push(`Output Format: ${data.outputFormat.trim()}`);
  return meta.length ? `${base}\n\n${meta.join("\n")}` : base;
}

function normalizeSelectOptions(options?: string[]) {
  const seen = new Set<string>();
  const nextOptions: string[] = [];

  (options || []).forEach((option) => {
    const nextOption = String(option || "").trim();
    if (!nextOption || seen.has(nextOption)) return;
    seen.add(nextOption);
    nextOptions.push(nextOption);
  });

  return nextOptions;
}

export type ContentPromptPickerProps = {
  mode?: UserScopeType;
  universeId?: string;
  onClose?: () => void;
  onDone?: (contents: string[], coins?: number, meta?: ContentStudioDoneMetaType) => void;
  onApplyContent?: (args: ContentStudioApplyContentArgsType) => Promise<void> | void;
  initialTemplateKey?: string;
  initialMode?: "template" | "custom";
  header?: ReactNode;
  resultOpen?: boolean;
  onResultOpenChange?: (open: boolean) => void;
  resultReturnFocusRef?: RefObject<HTMLButtonElement | null>;
  onViewableResultsChange?: (hasResults: boolean) => void;
  onRecentContentsChanged?: () => void;
  surface?: "default" | "embedded";
  embedSessionId?: string;
  allowedTemplateVariableKeys?: readonly string[];
  requiredTemplateVariableKeys?: readonly string[];
  lockedTemplateVariableKeys?: readonly string[];
  initialTemplateVariables?: Readonly<Record<string, string>>;
  initialOutputVisibility?: PromptVisibilityType;
  allowCustomPrompt?: boolean;
  onGenerationStarted?: (payload: { requestId: string; jobCount: number }) => void;
  onGenerationFailed?: (payload: { requestId: string; errorCode: string }) => void;
};

export default function ContentPromptPicker({
  mode = "user",
  universeId,
  onClose,
  onDone,
  onApplyContent,
  initialTemplateKey,
  initialMode = "template",
  header,
  resultOpen: controlledResultOpen,
  onResultOpenChange,
  onViewableResultsChange,
  onRecentContentsChanged,
  surface,
  embedSessionId,
  allowedTemplateVariableKeys,
  requiredTemplateVariableKeys,
  lockedTemplateVariableKeys,
  initialTemplateVariables,
  initialOutputVisibility,
  allowCustomPrompt = true,
  onGenerationStarted,
  onGenerationFailed,
}: ContentPromptPickerProps) {
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { isAdministrator } = useUserData();
  const [internalResultOpen, setInternalResultOpen] = useState(false);
  const [isStaleResult, setIsStaleResult] = useState(false);
  const resultOpen = controlledResultOpen ?? internalResultOpen;
  const setResultOpen = useCallback(
    (open: boolean) => {
      if (controlledResultOpen === undefined) setInternalResultOpen(open);
      onResultOpenChange?.(open);
    },
    [controlledResultOpen, onResultOpenChange],
  );
  const {
    catalog: textCatalog,
    source: textCatalogSource,
    loading: textCatalogLoading,
  } = useGenStudioModelCatalog("text");

  const [provider, setProvider] = useState<TextProviderType>("google");
  const [modelName, setModelName] = useState<string>(DEFAULT_TEXT_MODEL_BY_PROVIDER.google);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [detail, setDetail] = useState<Item | null>(null);
  const [extra, setExtra] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [customPlatform, setCustomPlatform] = useState("");
  const [language, setLanguage] = useState("ko");
  const [length, setLength] = useState("instagram: 3-5문장 + 해시태그");
  const [customLength, setCustomLength] = useState("");
  const [outputFormat, setOutputFormat] = useState<string>(DEFAULT_CONTENT_OUTPUT_FORMAT);
  const [n, setN] = useState(1);
  const [varSpecs, setVarSpecs] = useState<VarSpec[]>([]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<ContentReferenceImage[]>([]);
  const [outputReferenceImages, setOutputReferenceImages] = useState<ContentReferenceImage[]>([]);
  const [outputAssetIds, setOutputAssetIds] = useState<string[]>([]);
  const [referenceImagesByAssetId, setReferenceImagesByAssetId] = useState<Record<string, ContentReferenceImage[]>>({});
  const [referenceImageDrafts, setReferenceImageDrafts] = useState<ContentReferenceImage[]>([]);
  const [editingReferenceImage, setEditingReferenceImage] = useState<{
    index: number;
    src: string;
    name: string;
  } | null>(null);
  const [referenceImageError, setReferenceImageError] = useState<string | null>(null);
  const [outputVisibility, setOutputVisibility] = useState<PromptVisibilityType>(initialOutputVisibility || "private");
  const [recentViewerAsset, setRecentViewerAsset] = useState<ContentAssetMetaType | ContentAssetPreviewType | null>(
    null,
  );
  const [activeSettingDialog, setActiveSettingDialog] = useState<ContentSettingDialogType>(null);
  const [advancedTab, setAdvancedTab] = useState<string>("");
  const [showTemplateBanner, setShowTemplateBanner] = useState(true);
  const [isLoginDrawerOpen, setIsLoginDrawerOpen] = useState(false);
  const footerWrapRef = useRef<HTMLDivElement | null>(null);
  const resultHeadingRef = useRef<HTMLParagraphElement | null>(null);
  const outputCountRef = useRef(0);
  const [footerHeightPx, setFooterHeightPx] = useState<number>(224);
  const isEmbedded = surface === "embedded" || Boolean(embedSessionId);
  const cameraCaptureAvailable = isDev || (isMobileEnvironment() && supportsCameraCaptureInput());
  const allowedTemplateVariableKeySet = useMemo(() => {
    if (!allowedTemplateVariableKeys) return null;
    const keys = (allowedTemplateVariableKeys || []).map((key) => String(key || "").trim()).filter(Boolean);
    return new Set(keys);
  }, [allowedTemplateVariableKeys]);
  const requiredTemplateVariableKeySet = useMemo(
    () => new Set((requiredTemplateVariableKeys || []).map((key) => String(key || "").trim()).filter(Boolean)),
    [requiredTemplateVariableKeys],
  );
  const lockedTemplateVariableKeySet = useMemo(
    () => new Set((lockedTemplateVariableKeys || []).map((key) => String(key || "").trim()).filter(Boolean)),
    [lockedTemplateVariableKeys],
  );
  const contentTemplateKey = !isCustomMode ? String(detail?.key || selected || initialTemplateKey || "").trim() : "";
  const contentTemplateTitle =
    String(detail?.title || "").trim() || lang({ ko: "콘텐츠 템플릿", en: "Content template" });
  const templateArticleUrl = getGenStudioTemplateArticleUrl(contentTemplateKey, "content");
  const handleOpenAdvanced = useCallback((tab: string) => {
    setAdvancedTab(tab);
    setActiveSettingDialog("advanced");
  }, []);
  const getAdvancedValueLabel = useCallback(
    (spec: VarSpec) => {
      const raw = String(vars[spec.key] || "").trim();
      if (spec.kind !== "select") return raw || lang({ ko: "없음", en: "None" });
      if (raw === IMAGE_PROMPT_OPTION_NONE) return lang({ ko: "사용하지 않음", en: "Do not use" });
      if (raw === IMAGE_PROMPT_OPTION_CUSTOM) return lang({ ko: "직접 설정", en: "Custom" });
      const [head] = raw.split(";");
      return customTempleteLabel(head || raw) || lang({ ko: "없음", en: "None" });
    },
    [vars],
  );
  const {
    filteredRows: filteredRecentRows,
    ownerFilter: recentOwnerFilter,
    setOwnerFilter: setRecentOwnerFilter,
    visibilityFilter: recentVisibilityFilter,
    setVisibilityFilter: setRecentVisibilityFilter,
    loading: recentLoading,
    managingAssetId: recentManagingAssetId,
    loadErrors: recentLoadErrors,
    load: loadRecentContents,
    updateVisibility: updateRecentVisibility,
    remove: removeRecentContent,
  } = useRecentContentAssets({
    isLoggedIn,
    mode,
    universeId,
    templateKey: contentTemplateKey,
  });
  const handleGenerationSuccess = useCallback(
    (result: {
      contents: string[];
      coins: number;
      templateKey: string;
      generationMode: ContentStudioDoneMetaType["generationMode"];
      visibility: PromptVisibilityType;
    }) => {
      setIsStaleResult(false);
      setResultOpen(true);
      void loadRecentContents();
      onRecentContentsChanged?.();

      if (isPublicGenStudioSurface()) {
        trackGaEvent("gen_studio_generate_success", {
          cta_location: "content_prompt_generate",
          destination_url: typeof window !== "undefined" ? window.location.href : "",
          template_key: result.templateKey,
          template_title: result.generationMode === "custom" ? "맞춤 프롬프트" : String(detail?.title || "").trim(),
          studio_scope: mode,
          entry_mode: "content",
          generation_mode: result.generationMode,
          model_names: modelName,
          model_count: 1,
          output_count: result.contents.length,
          output_visibility: result.visibility,
          coins_used: result.coins,
          failed_model_count: 0,
        });
      }
    },
    [detail?.title, loadRecentContents, mode, modelName, onRecentContentsChanged, setResultOpen],
  );
  const handleGenerationDone = useCallback(
    (contents: string[], coins: number, meta: ContentStudioDoneMetaType) => {
      const refs = referenceImages.map((image) => ({ ...image }));
      setOutputReferenceImages(refs);
      setOutputAssetIds(meta.assetIds || []);
      if (refs.length && meta.assetIds?.length) {
        setReferenceImagesByAssetId((previous) => {
          const next = { ...previous };
          meta.assetIds?.forEach((assetId) => {
            if (assetId) next[assetId] = refs;
          });
          return next;
        });
      }
      onDone?.(contents, coins, {
        ...meta,
        referenceImages: refs.length ? refs : undefined,
      });
    },
    [onDone, referenceImages],
  );
  const handleGenerationError = useCallback((error: unknown) => {
    void dialog.alert({
      variant: "danger",
      message: toErrorMessage(error) || lang({ ko: "콘텐츠 생성 실패", en: "Content generation failed" }),
    });
  }, []);
  const handleGenerationStarted = useCallback(
    (payload: { requestId: string; jobCount: number }) => {
      if (outputCountRef.current > 0) setIsStaleResult(true);
      onGenerationStarted?.(payload);
    },
    [onGenerationStarted],
  );
  const handleGenerationFailed = useCallback(
    (payload: { requestId: string; errorCode: string }) => {
      if (outputCountRef.current > 0) setIsStaleResult(true);
      onGenerationFailed?.(payload);
    },
    [onGenerationFailed],
  );
  const { loading, outputs, generate } = useContentStudioGeneration({
    mode,
    universeId,
    isEmbedded,
    embedSessionId,
    onDone: handleGenerationDone,
    onSuccess: handleGenerationSuccess,
    onError: (failure) => handleGenerationError(failure.error),
    onGenerationStarted: handleGenerationStarted,
    onGenerationFailed: handleGenerationFailed,
  });
  useEffect(() => {
    outputCountRef.current = outputs.length;
  }, [outputs.length]);
  const textSection = textCatalog?.text || null;
  const textProviderOptions = useMemo(
    () =>
      ((textSection?.providers || []).map((item) => item.provider) as TextProviderType[]).length > 0
        ? ((textSection?.providers || []).map((item) => item.provider) as TextProviderType[])
        : [...TEXT_PROVIDER_TYPES],
    [textSection],
  );
  const textDefaultModelByProvider = useMemo(
    () => ({
      ...Object.fromEntries(TEXT_PROVIDER_TYPES.map((item) => [item, DEFAULT_TEXT_MODEL_BY_PROVIDER[item]])),
      ...getCatalogDefaultModelByProvider(textSection),
    }),
    [textSection],
  );
  const textModelOptions = useMemo(() => {
    const catalogProvider = (textSection?.providers || []).find((item) => item.provider === provider);
    if (catalogProvider?.models?.length) return catalogProvider.models;
    return (((TEXT_MODEL_MAP as Record<string, readonly string[]>)[provider] || []) as string[]).map(
      (name: string) => ({
        name,
        displayName: name,
        upstreamModelName: name,
        adminOnly: false,
        supportsImageInput: supportsTextModelImageInput(name),
        deprecated: false,
      }),
    );
  }, [provider, textSection]);
  const selectedTextModelOption = textModelOptions.find((item) => item.name === modelName);
  const referenceImageInputEnabled =
    selectedTextModelOption?.supportsImageInput ?? supportsTextModelImageInput(modelName);

  const loadItems = useCallback(() => {
    loadStudioContentPromptItems({ enabled: true, isLoggedIn }).then(setItems).catch(logger.warn);
  }, [isLoggedIn]);

  useEffect(() => {
    loadItems();
    const off = subscribePromptListChanged((d) => {
      if (d.kind === "content") loadItems();
    });
    return () => off();
  }, [loadItems]);

  useEffect(() => {
    const el = footerWrapRef.current;
    if (typeof window === "undefined" || !el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const next = el.offsetHeight;
      if (next > 0) setFooterHeightPx((prev) => (prev === next ? prev : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 첫 항목 자동 선택(UX 통일)
  useEffect(
    function autoSelectFirstItem() {
      if (isCustomMode) return;
      // 비동기 로드된 items에서 기본 선택을 sync (외부 데이터에 따른 초기 상태)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!selected && items.length > 0) setSelected(items[0].key);
    },
    [isCustomMode, items, selected],
  );

  useEffect(
    function syncCustomModeFromProp() {
      const nextIsCustomMode = initialMode === "custom" && allowCustomPrompt;
      // controlled prop과 내부 상태 sync
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCustomMode(nextIsCustomMode);
      if (nextIsCustomMode) {
        setSelected("");
        setDetail(null);
        setVarSpecs([]);
        setVars({});
      }
    },
    [allowCustomPrompt, initialMode],
  );

  useEffect(
    function syncInitialTemplateKey() {
      if (!initialTemplateKey) return;
      // initialTemplateKey prop이 변경되면 내부 selected/customMode sync
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCustomMode(false);
      setSelected(initialTemplateKey);
    },
    [initialTemplateKey],
  );

  useEffect(
    function ensureProviderIsAvailable() {
      if (!textProviderOptions.length || textProviderOptions.includes(provider)) return;
      // 카탈로그(외부 시스템)에서 사용 불가한 provider를 sync
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProvider((textProviderOptions.includes("google") ? "google" : textProviderOptions[0]) || "google");
    },
    [provider, textProviderOptions],
  );

  useEffect(
    function ensureModelNameMatchesProvider() {
      const list = textModelOptions.map((item) => item.name);
      const def = String(
        (textDefaultModelByProvider as Record<string, string>)[provider] || textModelOptions[0]?.name || "",
      ).trim();
      if (!list.length || !def) return;
      // 카탈로그(외부 시스템)에서 모델 목록 변경 시 sync
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!list.includes(modelName)) setModelName(def);
    },
    [modelName, provider, textDefaultModelByProvider, textModelOptions],
  );

  useEffect(
    function syncDetailFromSelection() {
      if (!selected) {
        // 외부 데이터(selected/items) 변경에 따른 detail/varSpecs/vars sync
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDetail(null);
        setVarSpecs([]);
        setVars({});
        return;
      }
      const nextDetail = items.find((item) => item.key === selected) || null;
      setDetail(nextDetail);

      setPlatform("instagram");
      setCustomPlatform("");
      setLanguage("ko");
      setLength("instagram: 3-5문장 + 해시태그");
      setCustomLength("");
      setOutputFormat(DEFAULT_CONTENT_OUTPUT_FORMAT);
      setReferenceImages([]);
      setReferenceImageDrafts([]);
      setEditingReferenceImage(null);
      setReferenceImageError(null);
      if (nextDetail?.defaultParams?.platform) {
        const nextPlatform = String(nextDetail.defaultParams.platform).trim();
        if (isContentPlatformOption(nextPlatform)) {
          setPlatform(nextPlatform);
          setCustomPlatform("");
        } else {
          setPlatform(CONTENT_PLATFORM_CUSTOM_VALUE);
          setCustomPlatform(nextPlatform);
        }
      }
      if (nextDetail?.defaultParams?.language) setLanguage(String(nextDetail.defaultParams.language));
      if (nextDetail?.defaultParams?.length) {
        const nextLength = String(nextDetail.defaultParams.length).trim();
        if (isContentLengthPreset(nextLength)) {
          setLength(nextLength);
          setCustomLength("");
        } else {
          setLength(CONTENT_LENGTH_CUSTOM_VALUE);
          setCustomLength(nextLength);
        }
      }
      if (nextDetail?.defaultParams?.outputFormat)
        setOutputFormat(pickContentOutputFormat(nextDetail.defaultParams.outputFormat));

      const specs = extractPromptVariables(nextDetail?.templateText || "");
      const normalizedSpecs = specs.map((s) => {
        const isAllowed = !allowedTemplateVariableKeySet || allowedTemplateVariableKeySet.has(s.key);
        const isLocked =
          lockedTemplateVariableKeySet.has(s.key) ||
          lockedTemplateVariableKeySet.has(getImagePromptCustomParamKey(s.key));
        const next = {
          ...s,
          ...(s.kind === "select" ? { options: normalizeSelectOptions(s.options) } : {}),
          required: Boolean(s.required || requiredTemplateVariableKeySet.has(s.key)),
          disabled: !isAllowed || isLocked,
        };
        return next;
      });
      setVarSpecs(normalizedSpecs);
      const init: Record<string, string> = {};
      normalizedSpecs.forEach((s) => {
        const hasInitialValue = Object.prototype.hasOwnProperty.call(initialTemplateVariables || {}, s.key);
        init[s.key] = hasInitialValue
          ? String(initialTemplateVariables?.[s.key] || "")
          : s.kind === "select" && s.options?.[0]
            ? s.required
              ? s.options[0]
              : IMAGE_PROMPT_OPTION_NONE
            : "";
      });
      setVars(init);
    },
    [
      allowedTemplateVariableKeySet,
      initialTemplateVariables,
      items,
      lockedTemplateVariableKeySet,
      requiredTemplateVariableKeySet,
      selected,
    ],
  );

  const mergedExtraPrompt = String(extra || "").trim();
  const referenceImagePayload = useMemo<BaseImageType[]>(
    () => (referenceImageInputEnabled ? referenceImages.map(({ mimeType, data }) => ({ mimeType, data })) : []),
    [referenceImageInputEnabled, referenceImages],
  );

  const composed = detail
    ? renderContentPrompt(detail.title, detail.templateText, { extra: mergedExtraPrompt, params: vars })
    : "";
  const missingRequiredVariables = useMemo(
    () => (!isCustomMode && detail ? findMissingRequiredPromptVariables(detail.templateText, vars) : []),
    [detail, isCustomMode, vars],
  );
  const debugPromptPreview = useMemo(() => {
    const resolvedPlatform = resolveContentPlatform(platform, customPlatform);
    const resolvedLength = resolveContentLength(length, customLength);
    const base = isCustomMode ? [customPrompt, mergedExtraPrompt].filter(Boolean).join("\n\n") : composed;
    return appendContentMetaForPreview(base, {
      platform: resolvedPlatform,
      language,
      length: resolvedLength,
      outputFormat,
    });
  }, [
    composed,
    customLength,
    customPlatform,
    customPrompt,
    isCustomMode,
    language,
    length,
    mergedExtraPrompt,
    outputFormat,
    platform,
  ]);
  const appendReferenceImages = useCallback(
    async (
      files: File[],
      currentImages: ContentReferenceImage[],
      onChange: (images: ContentReferenceImage[]) => void,
    ) => {
      const remainingSlots = CONTENT_REFERENCE_IMAGE_LIMIT - currentImages.length;
      if (remainingSlots <= 0) {
        setReferenceImageError(
          lang({
            ko: `이미지는 최대 ${CONTENT_REFERENCE_IMAGE_LIMIT}장까지 첨부할 수 있습니다.`,
            en: `You can attach up to ${CONTENT_REFERENCE_IMAGE_LIMIT} images.`,
          }),
        );
        return;
      }

      const nextFiles = files.slice(0, remainingSlots);
      const nextImages: ContentReferenceImage[] = [];

      for (const file of nextFiles) {
        if (!file.type.startsWith("image/")) {
          setReferenceImageError(
            lang({ ko: "이미지 파일만 첨부할 수 있습니다.", en: "Only image files can be attached." }),
          );
          continue;
        }
        if (file.size > CONTENT_REFERENCE_IMAGE_MAX_BYTES) {
          setReferenceImageError(
            lang({
              ko: "이미지는 파일당 8MB 이하만 첨부할 수 있습니다.",
              en: "Each image must be 8MB or smaller.",
            }),
          );
          continue;
        }

        try {
          nextImages.push(await fileToContentReferenceImage(file));
        } catch {
          setReferenceImageError(lang({ ko: "이미지를 읽지 못했습니다.", en: "Failed to read the image." }));
        }
      }

      if (!nextImages.length) return;
      setReferenceImageError(null);
      onChange([...currentImages, ...nextImages].slice(0, CONTENT_REFERENCE_IMAGE_LIMIT));
    },
    [],
  );

  const handleAddReferenceImageDrafts = useCallback(
    async (files: File[]) => {
      await appendReferenceImages(files, referenceImageDrafts, setReferenceImageDrafts);
    },
    [appendReferenceImages, referenceImageDrafts],
  );

  const openReferenceDialog = useCallback(() => {
    if (!referenceImageInputEnabled) return;
    setReferenceImageDrafts(referenceImages.map((image) => ({ ...image })));
    setReferenceImageError(null);
    setActiveSettingDialog("reference");
  }, [referenceImageInputEnabled, referenceImages]);

  const closeReferenceDialog = useCallback(() => {
    setEditingReferenceImage(null);
    setReferenceImageDrafts([]);
    setReferenceImageError(null);
    setActiveSettingDialog(null);
  }, []);

  const applyReferenceImageDrafts = useCallback(() => {
    setReferenceImages(referenceImageDrafts.map((image) => ({ ...image })));
    setReferenceImageDrafts([]);
    setReferenceImageError(null);
    setActiveSettingDialog(null);
  }, [referenceImageDrafts]);

  const handleRemoveReferenceImageDraft = useCallback((index: number) => {
    setReferenceImageDrafts((prev) => prev.filter((_, i) => i !== index));
    setReferenceImageError(null);
  }, []);

  const handleEditReferenceImageDraft = useCallback(
    (index: number) => {
      const image = referenceImageDrafts[index];
      if (!image) return;
      setEditingReferenceImage({ index, src: image.previewUrl, name: image.name });
    },
    [referenceImageDrafts],
  );

  const handleApplyEditedReferenceImage = useCallback(
    async (file: File) => {
      if (!editingReferenceImage) return;
      const editedImage = await fileToContentReferenceImage(file);
      setReferenceImageDrafts((prev) =>
        prev.map((image, index) => (index === editingReferenceImage.index ? editedImage : image)),
      );
      setEditingReferenceImage(null);
    },
    [editingReferenceImage],
  );

  const handleRemoveReferenceImage = useCallback((index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
    setReferenceImageError(null);
  }, []);

  const copyText = useCallback(async (txt: string): Promise<boolean> => {
    try {
      await writeTextToClipboard(txt);
      return true;
    } catch {
      void dialog.alert({ variant: "danger", message: lang({ ko: "복사에 실패했습니다.", en: "Copy failed." }) });
      return false;
    }
  }, []);

  useEffect(() => {
    onViewableResultsChange?.(outputs.length > 0 || filteredRecentRows.length > 0);
  }, [filteredRecentRows.length, onViewableResultsChange, outputs.length]);

  useEffect(() => {
    if (!resultOpen) return;
    runAfterCurrentRender(() => resultHeadingRef.current?.focus());
  }, [resultOpen]);

  const reuseRecentContent = useCallback((row: ContentAssetMetaType) => {
    setIsCustomMode(true);
    setCustomPrompt(String(row?.text || ""));
    setRecentViewerAsset(null);
  }, []);

  const onGenerate = () => {
    if (!isLoggedIn) {
      void dialog.alert(lang({ ko: "로그인 후 이용할 수 있습니다.", en: "Please log in to use this feature." }));
      setIsLoginDrawerOpen(true);
      return;
    }
    if ((!isCustomMode && !detail) || (isCustomMode && !allowCustomPrompt)) return;
    if (!referenceImageInputEnabled && referenceImages.length > 0) {
      void dialog.alert(
        lang({
          ko: "선택한 모델은 이미지 입력을 지원하지 않습니다. 첨부 이미지를 제거하거나 다른 모델을 선택해 주세요.",
          en: "The selected model does not support image input. Remove the images or choose another model.",
        }),
      );
      return;
    }
    if (missingRequiredVariables.length > 0) {
      const missing = missingRequiredVariables[0];
      void dialog.alert(
        lang({
          ko: `${customTempleteLabel(missing.key)} 필수값을 입력하거나 선택해 주세요.`,
          en: `Enter or select the required ${customTempleteLabel(missing.key)} value.`,
        }),
      );
      return;
    }

    const requestGenerationMode = isCustomMode ? "custom" : "template";
    const requestTemplateKey = isCustomMode ? GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY : String(detail?.key || "").trim();
    const requestTemplateTitle = isCustomMode ? "맞춤 프롬프트" : String(detail?.title || "").trim();
    const requestDestinationUrl = typeof window !== "undefined" ? window.location.href : "";

    if (isPublicGenStudioSurface()) {
      trackGaEvent("gen_studio_generate_click", {
        cta_location: "content_prompt_generate",
        destination_url: requestDestinationUrl,
        template_key: requestTemplateKey,
        template_title: requestTemplateTitle,
        studio_scope: mode,
        entry_mode: "content",
        generation_mode: requestGenerationMode,
        model_names: modelName,
        model_count: 1,
        output_count: n,
        output_visibility: outputVisibility,
      });
    }

    const resolvedPlatform = resolveContentPlatform(platform, customPlatform);
    const resolvedLength = resolveContentLength(length, customLength);
    const request: ContentStudioGenerationRequest = {
      isCustomMode,
      templateKey: isCustomMode ? undefined : detail?.key,
      templateScope: isEmbedded ? "system" : detail?.templateScope,
      customPrompt,
      extraPrompt: mergedExtraPrompt,
      platform: resolvedPlatform,
      language,
      length: resolvedLength,
      outputFormat,
      n,
      modelName,
      provider,
      baseImages: referenceImagePayload,
      variables: vars,
      visibility: outputVisibility,
    };

    void generate(request);
  };

  const canGenerate =
    !loading &&
    (referenceImageInputEnabled || referenceImages.length === 0) &&
    (isCustomMode
      ? allowCustomPrompt && Boolean(customPrompt.trim())
      : Boolean(detail) && missingRequiredVariables.length === 0);

  const outputsContent = (
    <ContentStudioOutputList
      outputs={outputs}
      assetIds={outputAssetIds}
      referenceImages={outputReferenceImages}
      onCopy={(text) => void copyText(text)}
      onApplyContent={onApplyContent}
    />
  );

  // 결과 surface 본문(최근 생성 콘텐츠). 헤더는 호출부에서 위임 가능.
  // bare=true: 외곽 통합 헤더가 따로 있는 결과 패널에서 본문만 렌더
  const renderRecentContent = (opts?: { bare?: boolean; listClassName?: string }) => (
    <div className={cn("space-y-2", opts?.bare && "px-3 pt-3 pb-2")}>
      {!opts?.bare && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            <Lang text={{ ko: "최근 생성 콘텐츠", en: "Recent Contents" }} />
          </h3>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => void loadRecentContents()} disabled={recentLoading}>
              <RefreshCcw className="icon-xs mr-1" />
              <Lang text={{ ko: "새로고침", en: "Refresh" }} />
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isLoggedIn && (
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              rounded="full"
              variant={recentOwnerFilter === "all" ? "primary" : "outline"}
              onClick={() => setRecentOwnerFilter("all")}
            >
              <Lang text={{ ko: "전체", en: "All" }} />
            </Button>
            <Button
              size="xs"
              rounded="full"
              variant={recentOwnerFilter === "mine" ? "primary" : "outline"}
              onClick={() => setRecentOwnerFilter("mine")}
            >
              <Lang text={{ ko: "내 콘텐츠", en: "Mine" }} />
            </Button>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            size="xs"
            rounded="full"
            variant={recentVisibilityFilter === "all" ? "primary" : "outline"}
            onClick={() => setRecentVisibilityFilter("all")}
            disabled={!isLoggedIn}
          >
            <Lang text={{ ko: "공개+비공개", en: "All Visibility" }} />
          </Button>
          <Button
            size="xs"
            rounded="full"
            variant={recentVisibilityFilter === "public" ? "primary" : "outline"}
            onClick={() => setRecentVisibilityFilter("public")}
          >
            <Lang text={{ ko: "공개", en: "Public" }} />
          </Button>
          <Button
            size="xs"
            rounded="full"
            variant={recentVisibilityFilter === "private" ? "primary" : "outline"}
            onClick={() => setRecentVisibilityFilter("private")}
            disabled={!isLoggedIn}
          >
            <Lang text={{ ko: "비공개", en: "Private" }} />
          </Button>
        </div>
      </div>

      <ContentPreviewLoadNotice
        errors={recentLoadErrors}
        isLoggedIn={isLoggedIn}
        loading={recentLoading}
        onRetry={() => void loadRecentContents()}
      />

      {recentLoading ? (
        <div className="border rounded-lg p-4 flex-center">
          <Preloader />
        </div>
      ) : filteredRecentRows.length === 0 && !recentLoadErrors.public && !recentLoadErrors.owned ? (
        <div className="border border-dashed rounded-lg p-4 text-sm text-muted-foreground text-center">
          <Lang text={{ ko: "최근 생성된 콘텐츠가 없습니다.", en: "No recent generated content." }} />
        </div>
      ) : (
        <RecentGeneratedContents
          items={filteredRecentRows}
          layout="grid"
          templateTitleByKey={{ [contentTemplateKey]: contentTemplateTitle }}
          onSelect={setRecentViewerAsset}
          className={cn(opts?.listClassName ?? "max-h-[40vh] overflow-auto pr-1", GEN_STUDIO_GHOST_SCROLLBAR_CLASS)}
        />
      )}
    </div>
  );

  const contentResultBody = (
    <ContentStudioResult className="space-y-4">
      <div className="flex justify-end px-3 pt-3">
        <Button
          size="sm"
          variant="outline"
          rounded="full"
          onClick={() => void loadRecentContents()}
          disabled={recentLoading}
          aria-label={lang({ ko: "최근 생성 콘텐츠 새로고침", en: "Refresh recent contents" })}
        >
          <RefreshCcw className="icon-xs mr-1" />
          <Lang text={{ ko: "새로고침", en: "Refresh" }} />
        </Button>
      </div>
      {isStaleResult && outputs.length > 0 ? (
        <div
          className="mx-3 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700"
          role="status"
        >
          <Lang
            text={{
              ko: "새 생성 결과를 기다리는 동안 이전 결과를 표시하고 있습니다.",
              en: "Showing the previous result while the new generation is in progress.",
            }}
          />
        </div>
      ) : null}
      {outputs.length > 0 ? <div className="px-3 pt-3">{outputsContent}</div> : null}
      {renderRecentContent({ bare: true, listClassName: "overflow-visible pr-3" })}
    </ContentStudioResult>
  );

  const contentComposer = (
    <ContentStudioComposer
      isCustomMode={isCustomMode}
      customPrompt={customPrompt}
      extra={extra}
      onChangeCustomPrompt={setCustomPrompt}
      onChangeExtra={setExtra}
    />
  );

  const contentSettingsContent = (
    <div className="@container flex flex-col gap-5">
      <StudioSettingSection
        icon={<Settings2 className="icon-xs" />}
        title={<Lang text={{ ko: "작성 방식", en: "Writing Mode" }} />}
      >
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="blank"
            rounded="xl"
            noWrap={false}
            onClick={() => setIsCustomMode(false)}
            className={cn(
              "h-auto flex-col items-start gap-1 border-1 bg-surface px-4 py-3 text-left",
              !isCustomMode && "border-primary text-primary",
            )}
          >
            <span className="inline-flex w-full items-center justify-between gap-2 text-sm font-semibold">
              <Lang text={{ ko: "템플릿", en: "Template" }} />
              {!isCustomMode ? <Check className="h-4 w-4" /> : null}
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              <Lang text={{ ko: "선택한 템플릿 구조를 사용합니다.", en: "Use the selected template structure." }} />
            </span>
          </Button>
          <Button
            variant="blank"
            rounded="xl"
            noWrap={false}
            disabled={!allowCustomPrompt}
            onClick={() => {
              if (!isCustomMode && isPublicGenStudioSurface()) {
                trackGaEvent("gen_studio_custom_prompt_open", {
                  cta_location: "content_prompt_custom_toggle",
                  destination_url: typeof window !== "undefined" ? window.location.href : "",
                  template_key: String(detail?.key || selected || "").trim() || GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY,
                  template_title: String(detail?.title || "").trim() || "맞춤 프롬프트",
                  studio_scope: mode,
                  entry_mode: "content",
                });
              }
              setIsCustomMode(true);
            }}
            className={cn(
              "h-auto flex-col items-start gap-1 border-1 bg-surface px-4 py-3 text-left",
              isCustomMode && "border-primary text-primary",
            )}
          >
            <span className="inline-flex w-full items-center justify-between gap-2 text-sm font-semibold">
              <Lang text={{ ko: "직접 작성", en: "Custom" }} />
              {isCustomMode ? <Check className="h-4 w-4" /> : null}
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              <Lang text={{ ko: "하단 입력창의 프롬프트만 사용합니다.", en: "Use only the prompt in the dock." }} />
            </span>
          </Button>
        </div>
      </StudioSettingSection>

      <StudioSettingSection
        icon={<Settings2 className="icon-xs" />}
        title={<Lang text={{ ko: "기본 설정", en: "Basic Settings" }} />}
      >
        <StudioSettingRow
          label={<Lang text={{ ko: "플랫폼", en: "Platform" }} />}
          value={resolveContentPlatform(platform, customPlatform)}
          onClick={() => setActiveSettingDialog("platform")}
          ariaLabel={lang({
            ko: `플랫폼 선택 (현재 ${resolveContentPlatform(platform, customPlatform)})`,
            en: `Select platform (current ${resolveContentPlatform(platform, customPlatform)})`,
          })}
        />
        <StudioSettingRow
          label={<Lang text={{ ko: "언어", en: "Language" }} />}
          value={language === "ko" ? lang({ ko: "한국어", en: "Korean" }) : lang({ ko: "영어", en: "English" })}
          onClick={() => setActiveSettingDialog("language")}
          ariaLabel={lang({
            ko: `언어 선택 (현재 ${language === "ko" ? "한국어" : "영어"})`,
            en: `Select language (current ${language === "ko" ? "Korean" : "English"})`,
          })}
        />
        <StudioSettingRow
          label={<Lang text={{ ko: "생성 모델", en: "Generative Model" }} />}
          value={`${provider} · ${modelName}`}
          onClick={() => setActiveSettingDialog("providerModel")}
          ariaLabel={lang({
            ko: `모델 선택 (현재 ${provider} · ${modelName})`,
            en: `Select model (current ${provider} · ${modelName})`,
          })}
          noWrap={false}
        />
        <StudioSettingRow
          label={<Lang text={{ ko: "길이", en: "Length" }} />}
          value={resolveContentLength(length, customLength)}
          onClick={() => setActiveSettingDialog("length")}
          ariaLabel={lang({
            ko: `길이 선택 (현재 ${resolveContentLength(length, customLength)})`,
            en: `Select length (current ${resolveContentLength(length, customLength)})`,
          })}
        />
        <StudioSettingRow
          label={<Lang text={{ ko: "출력 형식", en: "Output Format" }} />}
          value={outputFormat}
          onClick={() => setActiveSettingDialog("outputFormat")}
          ariaLabel={lang({
            ko: `출력 형식 선택 (현재 ${outputFormat})`,
            en: `Select output format (current ${outputFormat})`,
          })}
        />
        <StudioSettingRow
          label={<Lang text={{ ko: "생성 개수", en: "Count" }} />}
          value={n}
          onClick={() => setActiveSettingDialog("count")}
          ariaLabel={lang({ ko: `생성 개수 선택 (현재 ${n})`, en: `Select count (current ${n})` })}
        />
      </StudioSettingSection>

      {!isCustomMode && varSpecs.length > 0 ? (
        <StudioSettingSection
          icon={<SlidersVertical className="icon-xs" />}
          title={<Lang text={{ ko: "고급 설정", en: "Advanced Settings" }} />}
        >
          {varSpecs.map((spec) => (
            <StudioSettingRow
              key={spec.key}
              label={customTempleteLabel(spec.key, 24)}
              value={getAdvancedValueLabel(spec)}
              onClick={() => handleOpenAdvanced(`var:${spec.key}`)}
              disabled={spec.disabled}
              ariaLabel={lang({
                ko: `고급 설정 열기 — ${customTempleteLabel(spec.key, 24)} (현재 ${getAdvancedValueLabel(spec)})`,
                en: `Open advanced settings — ${customTempleteLabel(spec.key, 24)} (current ${getAdvancedValueLabel(spec)})`,
              })}
              labelClassName="min-w-18"
              noWrap={false}
            />
          ))}
        </StudioSettingSection>
      ) : null}

      <StudioSettingSection
        icon={<Settings2 className="icon-xs" />}
        title={<Lang text={{ ko: "공유 범위", en: "Visibility" }} />}
        contentClassName="space-y-0"
      >
        <Label variant="card" className="w-full px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-primary-text">
                <Lang text={{ ko: "전체 공개", en: "Public" }} />
              </span>
              <span className="text-xs text-muted-foreground">
                <Lang
                  text={{
                    ko: "생성한 콘텐츠를 모두와 공유합니다.",
                    en: "Share generated content with everyone.",
                  }}
                />
              </span>
            </div>

            <Switch
              size="sm"
              checked={outputVisibility === "public"}
              disabled={isEmbedded}
              onCheckedChange={(checked) => setOutputVisibility(checked ? "public" : "private")}
              aria-label={lang({ ko: "공유 범위 전환", en: "Toggle visibility" })}
            />
          </div>
        </Label>
      </StudioSettingSection>
    </div>
  );

  const footerAttachmentPreviewItems: FooterAttachmentPreviewItem[] = referenceImages.map((image, index) => ({
    id: `${image.name}-${index}`,
    src: image.previewUrl,
    alt: image.name,
    label: { ko: "첨부", en: "Attached" },
    removeAriaLabel: lang({ ko: "첨부 이미지 제거", en: "Remove attached image" }),
    onRemove: () => handleRemoveReferenceImage(index),
  }));
  const contentReferenceContent = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ImagePlus className="icon-xs" />
          <Lang text={{ ko: "참고 이미지", en: "Reference Images" }} />
          {referenceImages.length > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-mono text-muted-foreground">
              {referenceImages.length}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="blank"
            onClick={openReferenceDialog}
            disabled={loading || !referenceImageInputEnabled}
            className="flex items-center gap-1 rounded-lg border border-border/70 px-2 text-xs font-medium text-foreground hover:text-primary"
          >
            <Plus className="icon-xs" />
            <Lang text={{ ko: "추가", en: "Add" }} />
          </Button>
        </div>
      </div>
      {referenceImages.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          {footerAttachmentPreviewItems.map((item) => (
            <div
              key={item.id}
              className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2"
            >
              <ImageBox src={item.src} alt={item.alt} height={80} objectFit="object-cover" className="rounded-lg" />
              {item.label ? (
                <span className="pointer-events-none absolute bottom-0 left-0 max-w-full truncate rounded-tr bg-black/65 px-1 text-[0.6rem] leading-4 text-white">
                  <Lang text={item.label} />
                </span>
              ) : null}
              <Button
                variant="blank"
                size="icon-xs"
                rounded="full"
                onClick={item.onRemove}
                className="absolute right-0.5 top-0.5 min-h-11 min-w-11 bg-red-500/85 text-white"
                aria-label={item.removeAriaLabel}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          <Lang
            text={{
              ko: referenceImageInputEnabled
                ? "콘텐츠 맥락을 보강할 이미지를 선택적으로 첨부하세요."
                : "선택한 모델은 이미지 입력을 지원하지 않습니다.",
              en: referenceImageInputEnabled
                ? "Optionally attach images to add context to the content."
                : "The selected model does not support image input.",
            }}
          />
        </p>
      )}
    </div>
  );
  const contentBodyContent = (
    <div className="flex flex-col gap-8">
      {contentReferenceContent}
      {contentSettingsContent}
      {contentComposer}
    </div>
  );

  const contentSettingDialogs = (
    <>
      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "platform"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "플랫폼", en: "Platform" })}
      >
        <div className="space-y-3 p-4">
          <Select value={platform} onValueChange={(next) => setPlatform(String(next))}>
            <SelectTrigger>
              <SelectValue placeholder={lang({ ko: "플랫폼", en: "Platform" })} />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_PLATFORM_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {getContentPlatformLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {platform === CONTENT_PLATFORM_CUSTOM_VALUE ? (
            <Input
              value={customPlatform}
              onChange={(event) => setCustomPlatform(event.target.value)}
              placeholder={lang({ ko: "플랫폼 직접 입력", en: "Enter platform" })}
            />
          ) : null}
          <Button className="w-full" onClick={() => setActiveSettingDialog(null)}>
            <Lang text={{ ko: "적용", en: "Apply" }} />
          </Button>
        </div>
      </BottomSheetDialog>

      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "language"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "언어", en: "Language" })}
      >
        <div className="grid grid-cols-2 gap-2 p-4">
          {[
            { value: "ko", label: { ko: "한국어", en: "Korean" } },
            { value: "en", label: { ko: "영어", en: "English" } },
          ].map((option) => (
            <Button
              key={option.value}
              variant="blank"
              rounded="xl"
              onClick={() => {
                setLanguage(option.value);
                setActiveSettingDialog(null);
              }}
              className={cn(
                "flex items-center justify-between h-auto border-2 bg-surface px-4 py-3 text-left",
                language === option.value && "border-primary bg-primary/10 text-primary",
              )}
            >
              <Lang text={option.label} />
              {language === option.value ? <Check className="h-4 w-4" /> : null}
            </Button>
          ))}
        </div>
      </BottomSheetDialog>

      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "providerModel"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "AI 모델", en: "AI Model" })}
      >
        <div className="space-y-3 p-4">
          <Select value={provider} onValueChange={(next) => setProvider(next as TextProviderType)}>
            <SelectTrigger>
              <SelectValue placeholder={lang({ ko: "프로바이더", en: "Provider" })} />
            </SelectTrigger>
            <SelectContent>
              {textProviderOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modelName} onValueChange={(next) => setModelName(String(next))}>
            <SelectTrigger>
              <SelectValue placeholder={lang({ ko: "모델", en: "Model" })} />
            </SelectTrigger>
            <SelectContent>
              {textModelOptions.map((item) => (
                <SelectItem key={item.name} value={item.name}>
                  {item.displayName && item.displayName !== item.name
                    ? `${item.displayName} · ${item.name}${item.adminOnly ? ` · ${lang({ ko: "관리자 전용", en: "Admin only" })}` : ""}${item.deprecated ? " · deprecated" : ""}`
                    : `${item.name}${item.adminOnly ? ` · ${lang({ ko: "관리자 전용", en: "Admin only" })}` : ""}${item.deprecated ? " · deprecated" : ""}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="w-full" onClick={() => setActiveSettingDialog(null)}>
            <Lang text={{ ko: "적용", en: "Apply" }} />
          </Button>
        </div>
      </BottomSheetDialog>

      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "length"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "콘텐츠 길이", en: "Content Length" })}
      >
        <div className="space-y-3 p-4">
          <Select
            value={length}
            onValueChange={(next) => {
              const nextLength = String(next || CONTENT_LENGTH_CUSTOM_VALUE);
              setLength(nextLength);
              if (nextLength !== CONTENT_LENGTH_CUSTOM_VALUE) setCustomLength("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={lang({ ko: "길이", en: "Length" })} />
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
          {length === CONTENT_LENGTH_CUSTOM_VALUE ? (
            <Input
              value={customLength}
              onChange={(event) => setCustomLength(event.target.value)}
              placeholder={lang({ ko: "길이 직접 입력", en: "Enter length" })}
            />
          ) : null}
          <Button className="w-full" onClick={() => setActiveSettingDialog(null)}>
            <Lang text={{ ko: "적용", en: "Apply" }} />
          </Button>
        </div>
      </BottomSheetDialog>

      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "outputFormat"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "출력 형식", en: "Output Format" })}
      >
        <div className="grid grid-cols-2 gap-2 p-4">
          {CONTENT_OUTPUT_FORMAT_OPTIONS.map((option) => (
            <Button
              key={option}
              variant="blank"
              rounded="xl"
              onClick={() => {
                setOutputFormat(pickContentOutputFormat(option));
                setActiveSettingDialog(null);
              }}
              className={cn(
                "flex items-center justify-between h-auto border-2 bg-surface px-4 py-3 text-left",
                outputFormat === option && "border-primary bg-primary/10 text-primary",
              )}
            >
              {option}
              {outputFormat === option ? <Check className="h-4 w-4" /> : null}
            </Button>
          ))}
        </div>
      </BottomSheetDialog>

      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "count"}
        onClose={() => setActiveSettingDialog(null)}
        title={lang({ ko: "생성 개수", en: "Count" })}
      >
        <div className="flex items-center justify-center gap-4 p-6">
          <Button
            variant="blank"
            rounded="xl"
            onClick={() => setN((value) => Math.max(1, value - 1))}
            className="h-10 w-10 rounded-full border-2 bg-surface flex-center text-primary"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-3xl font-bold tabular-nums">{n}</span>
          <Button
            variant="blank"
            rounded="xl"
            onClick={() => setN((value) => Math.min(AI_GEN_CONTENT_LIMIT, value + 1))}
            className="h-10 w-10 rounded-full border-2 bg-surface flex-center text-primary"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </BottomSheetDialog>

      {/* Advanced Settings 팝업 — 이미지 템플릿과 같은 탭형 옵션 선택 */}
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
          {varSpecs.map((spec) => {
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
          {!isCustomMode && advancedTab.startsWith("var:")
            ? (() => {
                const spec = varSpecs.find((item) => `var:${item.key}` === advancedTab);
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
                    onChangeValue={(key, value) => {
                      if (spec.disabled) return;
                      setVars((prev) => ({ ...prev, [key]: value }));
                    }}
                    formatLabel={(key) => customTempleteLabel(key, 36)}
                    formatOptionLabel={customTempleteLabel}
                    selectNoneOption={{
                      value: IMAGE_PROMPT_OPTION_NONE,
                      label: { ko: "사용하지 않음", en: "Do not use" },
                    }}
                    selectCustomOption={{
                      value: IMAGE_PROMPT_OPTION_CUSTOM,
                      getValueKey: getImagePromptCustomParamKey,
                      label: { ko: "직접 설정하기", en: "Customize" },
                      placeholder: {
                        ko: "이 옵션에 직접 적용할 내용을 입력하세요.",
                        en: "Enter the custom content for this option.",
                      },
                    }}
                  />
                );
              })()
            : null}
        </div>
      </BottomSheetDialog>

      <BottomSheetDialog
        portal={false}
        open={activeSettingDialog === "reference"}
        onClose={closeReferenceDialog}
        title={lang({ ko: "이미지 첨부", en: "Attach Image" })}
      >
        <div className="space-y-4 p-4">
          <ImageDropzone
            renderPreviewImage={({ src, alt }) => (
              <ImageBox src={src} alt={alt} height={120} objectFit="object-cover" className="rounded-xl" />
            )}
            onLog={(message, meta) => logger.warn(message, meta)}
            label={<Lang text={{ ko: "이미지 업로드", en: "Image Upload" }} />}
            size="xs"
            multiple
            accept="image/*"
            addText={lang({ ko: "추가", en: "Add" })}
            camera={{
              enabled: cameraCaptureAvailable,
              label: <Lang text={{ ko: "촬영", en: "Capture" }} />,
            }}
            hintText={
              <Lang
                text={{
                  ko: referenceImageInputEnabled
                    ? "콘텐츠 생성에 참고할 이미지 파일을 첨부하세요."
                    : "선택한 모델은 이미지 입력을 지원하지 않습니다.",
                  en: referenceImageInputEnabled
                    ? "Attach image files to use as content references."
                    : "The selected model does not support image input.",
                }}
              />
            }
            previewTitle={
              <div className="text-xxs text-secondary-text">
                <Lang
                  text={{
                    ko: `${referenceImageDrafts.length}/${CONTENT_REFERENCE_IMAGE_LIMIT}장 첨부됨`,
                    en: `${referenceImageDrafts.length}/${CONTENT_REFERENCE_IMAGE_LIMIT} images attached`,
                  }}
                />
              </div>
            }
            previewUrls={referenceImageDrafts.map((image) => image.previewUrl)}
            previewNames={referenceImageDrafts.map((image) => image.name)}
            previewSelectable={false}
            enableDragReorder={false}
            addDisabled={!referenceImageInputEnabled || referenceImageDrafts.length >= CONTENT_REFERENCE_IMAGE_LIMIT}
            error={referenceImageError}
            disabled={loading || !referenceImageInputEnabled}
            onPick={(file) => void handleAddReferenceImageDrafts([file])}
            onPickMany={(files) => void handleAddReferenceImageDrafts(files)}
            onEditPreview={handleEditReferenceImageDraft}
            onRemovePreview={handleRemoveReferenceImageDraft}
          />

          <Button
            variant="primary"
            className="w-full"
            disabled={!referenceImageInputEnabled}
            onClick={applyReferenceImageDrafts}
          >
            <Lang text={{ ko: "적용하기", en: "Apply" }} />
          </Button>
        </div>
      </BottomSheetDialog>

      {editingReferenceImage ? (
        <ImageOverlayDrawingDialog
          open={Boolean(editingReferenceImage)}
          onOpenChange={(open) => {
            if (!open) setEditingReferenceImage(null);
          }}
          imageSrc={editingReferenceImage.src}
          imageName={editingReferenceImage.name}
          onApply={handleApplyEditedReferenceImage}
        />
      ) : null}

      <ContentAssetViewer
        key={recentViewerAsset?.assetId || "recent-content-viewer"}
        asset={recentViewerAsset}
        templateTitle={contentTemplateTitle}
        referenceImages={recentViewerAsset ? referenceImagesByAssetId[recentViewerAsset.assetId] || [] : []}
        onApplyContent={onApplyContent}
        onClose={() => setRecentViewerAsset(null)}
        onReuse={reuseRecentContent}
        onToggleVisibility={async (row) => {
          if (row.assetId === recentManagingAssetId) return;
          const updated = await updateRecentVisibility(row);
          if (updated) {
            setRecentViewerAsset(updated);
            onRecentContentsChanged?.();
          }
        }}
        onDelete={async (row) => {
          if (row.assetId === recentManagingAssetId) return;
          const removed = await removeRecentContent(row);
          if (removed) {
            setRecentViewerAsset(null);
            onRecentContentsChanged?.();
          }
        }}
      />
    </>
  );

  return (
    <>
      <StudioCreationWorkspace
        header={header}
        notice={
          !textCatalogLoading && textCatalogSource === "fallback" ? (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 sm:px-6">
              <Lang
                text={{
                  ko: "서버 모델 catalog를 불러오지 못해 기본 텍스트 모델 목록으로 표시 중입니다.",
                  en: "The server model catalog is unavailable, so fallback text models are shown.",
                }}
              />
            </div>
          ) : null
        }
        topSlot={
          !isCustomMode && templateArticleUrl && showTemplateBanner ? (
            <TemplateUsageBanner
              articleUrl={templateArticleUrl}
              title={contentTemplateTitle}
              onClose={() => setShowTemplateBanner(false)}
            />
          ) : null
        }
        resultOpen={resultOpen}
        onResultOpenChange={setResultOpen}
        resultHeadingRef={resultHeadingRef}
        result={contentResultBody}
        resultTitle={{ ko: "생성 결과", en: "Generated Results" }}
        footerHeightPx={footerHeightPx}
        mainClassName="flex flex-col space-y-2 p-4 touch-pan-y [-webkit-overflow-scrolling:touch]"
        footer={
          <footer aria-label={lang({ ko: "콘텐츠 생성 액션", en: "Content generation actions" })}>
            <FooterActions
              ref={footerWrapRef}
              variant="action-bar"
              isGenerating={loading}
              disabled={!canGenerate || activeSettingDialog !== null}
              onClose={onClose || (() => undefined)}
              onGenerate={onGenerate}
              generateText={{ ko: "콘텐츠 생성", en: "Generate Content" }}
              generationTargetText={{ ko: "콘텐츠", en: "content" }}
              promptPreview={
                !isCustomMode
                  ? {
                      text: composed,
                      onCopy: () => copyText(composed),
                      debugText: debugPromptPreview,
                      canViewDebugPrompt: isAdministrator,
                    }
                  : undefined
              }
              balanceSlot={
                mode === "universe" && universeId ? (
                  <UniverseCoinSummary universeId={universeId} variant="compact" />
                ) : isLoggedIn ? (
                  <CoinBalance className="p-0 text-xxs" showLabel={false} iconSize={12} />
                ) : null
              }
            />
          </footer>
        }
      >
        <div className="flex flex-col gap-4">
          <ContentStudioForm>{contentBodyContent}</ContentStudioForm>
        </div>
      </StudioCreationWorkspace>
      {contentSettingDialogs}
      <LoginDialog open={isLoginDrawerOpen} onOpenChange={setIsLoginDrawerOpen} />
    </>
  );
}
