"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  DEFAULT_IMAGE_ASPECT,
  DEFAULT_IMAGE_SIZE,
  SUPPORTED_ASPECT_RATIOS,
  ASPECT_TO_OPENAI_COMPAT_SIZE,
  DEFAULT_IMAGE_MODEL_BY_PROVIDER,
  OPENAI_COMPAT_UI_RATIOS,
  getSupportedOpenAIAspectRatios,
  type ImageModelNameType,
  type SupportedAspectRatio,
} from "consts/ai";
import type { GenStudioModelCatalogClientSection } from "libs/api/lab";
import type { ImageProviderType, UiScopeType, UserScopeType } from "types/ai";
import type {
  PromptItemType,
  PromptVisibilityType,
  PromptGenType,
  ImageStudioDoneMetaType,
  BaseImageType,
  PersonaArtifactContextType,
} from "types/app";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { Error, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { LoginDialog } from "components/module/auth";
import { ImageOverlayDrawingDialog } from "components/module/image/ImageOverlayDrawingDialog";
import { CoinBalance, CoinUsageDialog } from "components/module/commerce";
import { UniverseCoinUsageDialog } from "components/module/commerce/UniverseCoinUsageDialog";
import { UniverseCoinSummary } from "components/module/admin/universe";
import { PageSheetHeader } from "components/module/layout";
import { ImagePlus } from "lucide-react";
import {
  countImageReferenceInputs,
  DEFAULT_MODEL_REFERENCE_STRENGTH,
  DEFAULT_REFERENCE_STRENGTH,
  getReferenceStrengthOption,
  IMAGE_PROMPT_OPTION_CUSTOM,
  IMAGE_PROMPT_OPTION_NONE,
  isEcommerceImagePromptTemplate,
  appendModelIdentityInstruction,
  renderImagePrompt,
  resolveImageReferencePolicy,
  type ReferenceStrengthType,
} from "utils/lab";
import { persistCoinUpdated, getPerImageCost } from "utils/payment";
import {
  clampAspectForProvider,
  inferProviderFromModelName,
  normalizeGoogleImageSizeForModel,
  resolveGoogleImagePriceVariant,
  normalizeSelectedModelNames,
  getGenStudioTemplateArticleUrl,
  resolvePromptModelLock,
} from "utils/app";
import { createSha256Hex, isDev, isMobileEnvironment, supportsCameraCaptureInput } from "utils/common";
import { logger } from "utils/log";
import {
  AMU_NATIVE_REQUEST_CAMERA_CAPTURE,
  isNativeBridgeAvailable,
  nativeCameraPayloadToFile,
  requestNative,
  type AmuNativeCameraCapturePayload,
} from "utils/native";
import { isPublicGenStudioSurface, trackGaEvent } from "utils/analytics/ga4";
import { writeTextToClipboard } from "utils/helper";
import {
  getCatalogDefaultModelByProvider,
  getCatalogImageModelOptions,
  getCatalogReferenceLimitByProvider,
} from "utils/app/genStudioCatalogClient";
import { isImageProvider } from "utils/ai";
import { linkPersonaImageLibraryAsset } from "libs/api/persona/imageLibrary";
import { type GenerateActionError, runAfterCurrentRender, toUnknownRecord } from "utils/common";

import { FixedImageViewer } from "./FixedImageViewer";
import { PresetModeContent } from "./preset-detail/PresetModeContent";
import {
  ResultViewerBody,
  ResultViewerHeader,
  type ResultViewerGalleryActionsType,
  type ResultViewerGalleryFilterType,
  type ResultViewerGalleryStateType,
} from "./preset-detail/ResultViewer";
import { FooterActions } from "./preset-detail/FooterActions";
import { ImageAttachFailureDialog } from "./preset-detail/ImageAttachFailureDialog";
import type { SettingDialogType, VarSpec } from "./preset-detail/types";
import { usePresetHeaderActions } from "./preset-detail/HeaderActions";
import { useStudioRecentImages } from "./preset-detail/hooks/useStudioRecentImages";
import { useStudioGenerateAction } from "./preset-detail/hooks/useStudioGenerateAction";
import { useReferenceImageManager } from "./preset-detail/hooks/useReferenceImageManager";
import { usePresetDetailBootstrap } from "./preset-detail/hooks/usePresetDetailBootstrap";
import { useTemplateGallery } from "./preset-detail/hooks/useTemplateGallery";
import { useReferenceImageEditing } from "./preset-detail/hooks/useReferenceImageEditing";
import { TemplateUsageBanner } from "./preset-detail/TemplateUsageBanner";
import { StudioCreationWorkspace } from "./StudioCreationWorkspace";

// 생성 요청 페이로드 (구 useGenerateConfirmation에서 이동 — Confirm 다이얼로그 없이 제출 시점에 해시만 계산)
type PreparedGenerateRequest = {
  isCustomMode: boolean;
  templateKey?: string;
  templateScope?: UiScopeType;
  customPrompt: string;
  effectiveExtra: string;
  vars: Record<string, string>;
  aspect: SupportedAspectRatio;
  size: string;
  negative: string;
  n: number;
  modelNames: string[];
  baseImages: BaseImageType[];
  modelImages: BaseImageType[];
  referenceStrength: ReferenceStrengthType;
  modelReferenceStrength: ReferenceStrengthType;
  visibility: PromptVisibilityType;
  promptForConfirmation: string;
  requestTemplateKey?: string;
  requestTemplateTitle: string;
  requestEntrySessionKey: number;
  requestGenerationMode: PromptGenType;
  requestVisibility: PromptVisibilityType;
  requestDestinationUrl: string;
  requestTemplateLabel: string;
};
const GEN_STUDIO_LOGIN_REQUIRED_TEXT = {
  ko: "이미지 생성은 로그인 후 이용할 수 있습니다. 로그인한 뒤 다시 시도해 주세요.",
  en: "Image generation is available after login. Please sign in and try again.",
} as const;

export type PresetDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: PromptItemType | null;
  mode: UserScopeType;
  universeId?: string;
  initialMode?: "template" | "custom";
  customTemplateKey?: string;
  entrySessionKey: number;
  imageCatalogSection?: GenStudioModelCatalogClientSection | null;
  defaultImageModelByProvider?: Record<string, string>;
  initialReferenceImages?: Array<BaseImageType & { preview?: string; name?: string }>;
  initialModelImages?: Array<BaseImageType & { preview?: string; name?: string }>;
  initialTemplateVariables?: Readonly<Record<string, string>>;
  /** 진입 surface가 권장하는 시작 비율(사용자 변경 가능). 템플릿 defaultParams보다 우선한다. */
  initialAspectRatio?: string;
  /** 생성 멱등 seed. 같은 조건 재요청이 재과금되지 않게 한다 (SSM-203). */
  generationIdempotencySeed?: string;
  initialOutputVisibility?: PromptVisibilityType;
  allowedTemplateVariableKeys?: readonly string[];
  allowCustomPrompt?: boolean;
  requiredTemplateVariableKeys?: readonly string[];
  lockedTemplateVariableKeys?: readonly string[];
  personaArtifactContext?: PersonaArtifactContextType;
  onDone?: (images: string[], coins?: number, meta?: ImageStudioDoneMetaType) => void;
  onGenerationStarted?: (payload: { requestId: string; jobCount: number }) => void;
  onGenerationFailed?: (payload: { requestId: string; errorCode: string }) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: (templateKey: string) => void;
  bookmarkDisabled?: boolean;
  titleAs?: "page" | "sheet";
};

export function PresetDetailSheet({
  open,
  onOpenChange,
  detail,
  mode,
  universeId,
  initialMode = "template",
  customTemplateKey,
  entrySessionKey,
  imageCatalogSection,
  defaultImageModelByProvider,
  initialReferenceImages,
  initialModelImages,
  initialTemplateVariables,
  initialAspectRatio,
  generationIdempotencySeed,
  initialOutputVisibility = "private",
  allowedTemplateVariableKeys,
  allowCustomPrompt = true,
  requiredTemplateVariableKeys,
  lockedTemplateVariableKeys,
  personaArtifactContext,
  onDone,
  onGenerationStarted,
  onGenerationFailed,
  isBookmarked = false,
  onToggleBookmark,
  bookmarkDisabled = false,
  titleAs = "sheet",
}: PresetDetailSheetProps) {
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { isAdministrator } = useUserData();
  const fallbackImageModelName = String(defaultImageModelByProvider?.google || DEFAULT_IMAGE_MODEL_BY_PROVIDER.google);
  const imageModelOptions = useMemo(() => getCatalogImageModelOptions(imageCatalogSection), [imageCatalogSection]);
  const imageModelByName = useMemo(
    () =>
      Object.fromEntries(imageModelOptions.map((item) => [item.modelName, item])) as Record<
        string,
        (typeof imageModelOptions)[number]
      >,
    [imageModelOptions],
  );
  const referenceLimitByProvider = useMemo(
    () => getCatalogReferenceLimitByProvider(imageCatalogSection),
    [imageCatalogSection],
  );
  const effectiveDefaultImageModelByProvider = useMemo(
    () => ({
      ...DEFAULT_IMAGE_MODEL_BY_PROVIDER,
      ...getCatalogDefaultModelByProvider(imageCatalogSection),
      ...(defaultImageModelByProvider || {}),
    }),
    [defaultImageModelByProvider, imageCatalogSection],
  );

  // 상태 관리
  const [selectedModelNames, setSelectedModelNames] = useState<ImageModelNameType[]>([
    fallbackImageModelName as ImageModelNameType,
  ]);
  const [aspect, setAspect] = useState<SupportedAspectRatio>(DEFAULT_IMAGE_ASPECT as SupportedAspectRatio);
  const [size, setSize] = useState<string>(DEFAULT_IMAGE_SIZE);
  const [negative, setNegative] = useState("");
  const [extra, setExtra] = useState("");
  const [referenceStrength, setReferenceStrength] = useState<ReferenceStrengthType>(DEFAULT_REFERENCE_STRENGTH);
  const extraRef = useRef<HTMLTextAreaElement | null>(null);
  const [showExtraError, setShowExtraError] = useState(false);
  const [activeGenerateRequestId, setActiveGenerateRequestId] = useState<string | null>(null);

  const [n, setN] = useState(1);
  const [images, setImages] = useState<string[]>([]);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showTemplateBanner, setShowTemplateBanner] = useState<boolean>(true);

  const { pendingJobs, pendingCount, enqueueGenerate } = useStudioGenerateAction({
    mode,
    universeId,
    fallbackModelName: fallbackImageModelName,
    idempotencySeed: generationIdempotencySeed,
  });

  const openViewerWithList = useCallback((args: { src: string; index: number; list: string[] }) => {
    if (!args.src || args.list.length === 0) return;
    const selectedIndex = args.list.findIndex((src) => src === args.src);
    setViewerImages(args.list);
    setViewerIndex(selectedIndex >= 0 ? selectedIndex : args.index);
    setViewerSrc(args.src);
  }, []);

  const [outputVisibility, setOutputVisibility] = useState<PromptVisibilityType>(initialOutputVisibility);
  const [varSpecs, setVarSpecs] = useState<VarSpec[]>([]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const isCustomOnlyEntry = !detail && initialMode === "custom";
  const effectiveTemplateKey = detail?.key || (isCustomOnlyEntry ? customTemplateKey : undefined);
  const allowTemplateMode = Boolean(detail) && allowCustomPrompt;
  const isSheetOpenRef = useRef(open);
  const currentSheetContextRef = useRef({
    entrySessionKey,
    templateKey: effectiveTemplateKey,
  });

  const [isCustomMode, setIsCustomMode] = useState(() => isCustomOnlyEntry);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isLoginDrawerOpen, setIsLoginDrawerOpen] = useState(false);
  const [showLoginNotice, setShowLoginNotice] = useState(false);
  const [coinUsageOpen, setCoinUsageOpen] = useState(false);
  // Result Viewer (계약 §3.3): 사용자가 연 경우에만 표시. 생성 성공은 lifecycle(§3.3 fingerprint) 조건에서 자동 표시
  const [resultOpen, setResultOpen] = useState(false);
  // 최신 성공 batch의 성공 asset 수(§3.3 배지) — 세션 내 batch 기준, 진입 시 0(배지 없음)
  const [latestBatchCount, setLatestBatchCount] = useState(0);
  // 완료 batch가 생성된 시점의 Generation Fingerprint — stale 판정(§3.7)에 사용
  const [resultFingerprint, setResultFingerprint] = useState("");
  // Insufficient Coins 상태(§3.7) — 서버 COIN_INSUFFICIENT 에러로만 판정(클라이언트 임의 임계값 금지).
  // 잔액 확인·충전은 CTA 인접 balanceSlot(CoinBalance 버튼 → 사용 내역 → 충전) 경로.
  const [coinShortage, setCoinShortage] = useState(false);
  // advanced_used 계측(계약 §6): Advanced 값을 기본값에서 실제 변경했는가 (열어본 것 제외)
  const advancedUsedRef = useRef(false);
  // onGenerate 재시도 액션용 ref — 정의 순서 의존 없이 error handler에서 호출
  const onGenerateRef = useRef<() => void>(() => {});
  const [activeSettingDialog, setActiveSettingDialog] = useState<SettingDialogType>(null);
  const [recentVisibilityChangingSrc, setRecentVisibilityChangingSrc] = useState<string | null>(null);
  const cameraCaptureAvailable = useMemo(
    () =>
      open &&
      (isDev || isNativeBridgeAvailable() || (isMobileEnvironment() && supportsCameraCaptureInput())),
    [open],
  );
  const footerWrapRef = useRef<HTMLDivElement | null>(null);
  const resultHeadingRef = useRef<HTMLParagraphElement | null>(null);
  const resultTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [footerHeightPx, setFooterHeightPx] = useState<number>(224);
  const appliedInitialReferenceKeyRef = useRef("");
  const sheetTitle =
    String(detail?.title || "").trim() ||
    lang({
      ko: isCustomOnlyEntry ? "커스텀 프롬프트 생성" : "이미지 생성",
      en: isCustomOnlyEntry ? "Custom Prompt Generation" : "Image Creation",
    });
  const templateArticleUrl =
    isCustomOnlyEntry || effectiveTemplateKey === customTemplateKey
      ? ""
      : getGenStudioTemplateArticleUrl(effectiveTemplateKey);
  const defaultParams = useMemo(() => toUnknownRecord(detail?.defaultParams), [detail?.defaultParams]);
  const inputPolicy = useMemo(() => toUnknownRecord(detail?.inputPolicy), [detail?.inputPolicy]);

  const promptModelLock = useMemo(() => resolvePromptModelLock(defaultParams), [defaultParams]);

  const effectiveActiveSettingDialog = promptModelLock && activeSettingDialog === "model" ? null : activeSettingDialog;

  const normalizedSelectedModelNames = useMemo(
    () =>
      promptModelLock
        ? ([promptModelLock.modelName] as ImageModelNameType[])
        : normalizeSelectedModelNames(selectedModelNames as string[], fallbackImageModelName),
    [fallbackImageModelName, promptModelLock, selectedModelNames],
  );

  const primaryModelName = useMemo(() => {
    return normalizedSelectedModelNames[0] || (fallbackImageModelName as ImageModelNameType);
  }, [fallbackImageModelName, normalizedSelectedModelNames]);

  const {
    recentMetaBySrc,
    recentOwnerFilter,
    setRecentOwnerFilter,
    recentVisibilityFilter,
    setRecentVisibilityFilter,
    showFilterModule,
    showVisibilityFilterButtons,
    sourceGalleryImages,
    galleryImages,
    hasRecentImages,
    resetRecentState,
    scheduleRecentReload,
    applyGeneratedRecent,
    updateRecentVisibility,
    updateRecentTemplateKey,
    removeRecentImage,
  } = useStudioRecentImages({
    mode,
    universeId,
    templateKey: effectiveTemplateKey,
    isLoggedIn,
    fallbackImages: images,
  });

  const isCurrentGeneratePending = Boolean(
    activeGenerateRequestId && pendingJobs.some((job) => job.requestId === activeGenerateRequestId),
  );

  // 진입 세션이 바뀌면 배지·fingerprint·코인 부족 상태 초기화 (boot auto-open 없음 — Phase 1)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLatestBatchCount(0);
    setResultFingerprint("");
    setResultOpen(false);
    setCoinShortage(false);
    advancedUsedRef.current = false;
  }, [entrySessionKey]);

  // Result 열림 상태에서 닫혀야 하는 조건: 열람 가능한 결과가 소진된 경우
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (resultOpen && !hasRecentImages && !isCurrentGeneratePending) setResultOpen(false);
  }, [resultOpen, hasRecentImages, isCurrentGeneratePending]);

  const {
    sortText: templateGallerySortText,
    images: sortedTemplateGalleryImages,
    cycleSort: handleCycleTemplateGallerySort,
  } = useTemplateGallery({ galleryImages, recentMetaBySrc, effectiveTemplateKey });

  // FooterActions(이미지 설명 + 생성 버튼) 영역의 실제 높이를 추적해
  // 좌측/우측 패널의 paddingBottom과 모바일 dock 위치를 동적으로 일치시킨다.
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

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    runAfterCurrentRender(() => {
      if (cancelled) return;
      setReferenceStrength(DEFAULT_REFERENCE_STRENGTH);
    });

    return () => {
      cancelled = true;
    };
  }, [entrySessionKey, open]);

  useEffect(() => {
    isSheetOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    currentSheetContextRef.current = {
      entrySessionKey,
      templateKey: effectiveTemplateKey,
    };
  }, [entrySessionKey, effectiveTemplateKey]);

  // 파생 상태
  const imageProvider = useMemo<ImageProviderType>(() => {
    const rawProvider = imageModelByName[primaryModelName]?.provider || inferProviderFromModelName(primaryModelName);
    const inferred = isImageProvider(rawProvider) ? rawProvider : "";
    const fallback = isImageProvider(defaultParams.provider) ? defaultParams.provider : "google";

    if (inferred) return inferred;
    return fallback;
  }, [defaultParams, imageModelByName, primaryModelName]);

  const maxRefImages = useMemo(() => {
    const limits = normalizedSelectedModelNames
      .map((modelName) => {
        const provider = imageModelByName[modelName]?.provider || inferProviderFromModelName(String(modelName));
        return Number(referenceLimitByProvider[provider] || 0);
      })
      .filter((limit) => limit > 0);
    if (!limits.length) return 0;
    return Math.min(...limits);
  }, [imageModelByName, normalizedSelectedModelNames, referenceLimitByProvider]);
  const referencePolicy = useMemo(
    () => resolveImageReferencePolicy(inputPolicy, imageProvider),
    [imageProvider, inputPolicy],
  );
  const referenceHintVariant = useMemo(
    () => (isEcommerceImagePromptTemplate(detail) ? "ecommerce" : "default"),
    [detail],
  );

  const {
    baseImages,
    baseImagePreviews,
    baseImageNames,
    selectedRecentUrls,
    appliedRefs,
    imageAttachFailure,
    isDragging,
    clearImageAttachFailure,
    resetReferenceState,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    appendBaseImageFile,
    appendAndApplyBaseImageFile,
    replaceBaseImageAt,
    removeBaseImageAt,
    moveBaseImage,
    toggleSelectedRecentUrl,
    applyReferenceSelection,
    removeAppliedRefAt,
    mergeExtraWithReferenceHint,
    removeRecentReferenceByUrl,
    applyInitialBaseImages,
    canAttachReference,
  } = useReferenceImageManager({
    maxRefImages,
    imageProvider,
    activeSettingDialog: effectiveActiveSettingDialog,
    referenceHintVariant,
  });
  const hasAppliedRefs = appliedRefs.length > 0;
  const appliedRefCount = appliedRefs.length;

  const referenceImageEditorGroup = useMemo(
    () => ({
      count: baseImages.length,
      previews: baseImagePreviews,
      names: baseImageNames,
      appendFile: appendBaseImageFile,
      replaceAt: replaceBaseImageAt,
    }),
    [baseImageNames, baseImagePreviews, baseImages.length, appendBaseImageFile, replaceBaseImageAt],
  );
  const artifactEditingContext = useMemo(
    () => ({
      persona: personaArtifactContext,
      templateKey: String(detail?.key || "").trim(),
      templateTitle: String(detail?.title || "").trim(),
      referenceStrength,
    }),
    [detail?.key, detail?.title, personaArtifactContext, referenceStrength],
  );
  const {
    editingImage,
    pendingArtifactAssetIdsRef,
    handleEditBaseImage,
    handleEditRecentImage,
    handleApplyEditedImage,
    closeEditor: handleCloseImageEditor,
  } = useReferenceImageEditing({
    referenceImages: referenceImageEditorGroup,
    maxRefImages,
    artifact: artifactEditingContext,
    onCloseSettingDialog: () => setActiveSettingDialog(null),
  });

  const handleRequestNativeCameraCapture = useCallback(async (): Promise<boolean> => {
    if (!isNativeBridgeAvailable()) return false;

    try {
      const response = await requestNative<AmuNativeCameraCapturePayload>({
        type: AMU_NATIVE_REQUEST_CAMERA_CAPTURE,
        payload: {
          imageQuality: 92,
          maxWidth: 2048,
        },
        timeoutMs: 15000,
      });

      if (response.status !== "success") {
        // 사용자 취소는 조용히 종료, 그 외는 file input 경로로 폴백
        if (response.errorCode === "cancelled") return true;
        logger.warn("[PresetDetailSheet] native camera failed", response.errorCode || response.message || "unknown");
        return false;
      }

      const file = nativeCameraPayloadToFile(response.payload);
      if (!file) return false;

      const applied = await appendAndApplyBaseImageFile(file);
      if (applied) {
        toast.success(
          lang({ ko: "촬영 이미지를 참고 이미지로 추가했습니다.", en: "Captured image was added as a reference." }),
        );
      }
      return true;
    } catch (error) {
      logger.warn("[PresetDetailSheet] native camera bridge exception", error);
      return false;
    }
  }, [appendAndApplyBaseImageFile]);

  // 추가 프롬프트(이미지 설명)는 옵션 입력(3차 정리) — 필수 요구 제거, 템플릿은 변수만으로도 생성 가능
  const isImageDescriptionRequired = false;
  const effectiveShowExtraError = showExtraError && isImageDescriptionRequired;

  const effectiveExtraForPrompt = useMemo(
    () => mergeExtraWithReferenceHint(extra, appliedRefs, referenceStrength),
    [appliedRefs, extra, mergeExtraWithReferenceHint, referenceStrength],
  );

  const effectiveCustomPromptForPreview = useMemo(
    () => mergeExtraWithReferenceHint(customPrompt, appliedRefs, referenceStrength),
    [appliedRefs, customPrompt, mergeExtraWithReferenceHint, referenceStrength],
  );

  const availableAspects = useMemo<readonly SupportedAspectRatio[]>(() => {
    const selectedAspectLists = normalizedSelectedModelNames
      .map((modelName) => (imageModelByName[modelName]?.aspectRatios || []) as SupportedAspectRatio[])
      .filter((list) => list.length > 0);
    if (!selectedAspectLists.length) {
      if (imageProvider === "openai") return getSupportedOpenAIAspectRatios(primaryModelName);
      if (imageProvider === "xai") return OPENAI_COMPAT_UI_RATIOS as readonly SupportedAspectRatio[];
      return SUPPORTED_ASPECT_RATIOS;
    }
    return selectedAspectLists.reduce<SupportedAspectRatio[]>((acc, next, index) => {
      return index === 0 ? [...next] : acc.filter((ratio) => next.includes(ratio));
    }, []);
  }, [imageModelByName, imageProvider, normalizedSelectedModelNames, primaryModelName]);

  const availableGoogleSizes = useMemo<readonly string[]>(() => {
    if (imageProvider !== "google") return [];
    const googleModels = normalizedSelectedModelNames.filter(
      (m) => (imageModelByName[m]?.provider || inferProviderFromModelName(String(m))) === "google",
    );
    if (googleModels.length === 0) return [];
    return googleModels.reduce<string[]>((acc, modelName, index) => {
      const next = [...((imageModelByName[modelName]?.sizes || []) as string[])];
      return index === 0 ? next : acc.filter((value) => next.includes(value));
    }, []);
  }, [imageModelByName, imageProvider, normalizedSelectedModelNames]);

  const composed = useMemo(() => {
    if (isCustomMode) return effectiveCustomPromptForPreview;
    if (!detail) return "";
    return renderImagePrompt(detail.title, detail.templateText, {
      params: vars,
      extra: effectiveExtraForPrompt,
      negative,
    });
  }, [detail, vars, effectiveExtraForPrompt, negative, isCustomMode, effectiveCustomPromptForPreview]);

  // 모델 이미지 기능 제거(4차 개선) — 모델 정체성 지시는 서버 파이프라인이 modelImages 없이 기본 처리
  const confirmedComposed = useMemo(
    () => appendModelIdentityInstruction(composed, 0, appliedRefCount, DEFAULT_MODEL_REFERENCE_STRENGTH),
    [appliedRefCount, composed],
  );

  // Generation Fingerprint (계약 §3.3) — generation-affecting state만 canonical projection.
  // 제외: visibility·UI state·timestamp 등 ephemeral metadata. 참고 이미지는 안정적인 asset ID 기준.
  const generationFingerprint = useMemo(
    () =>
      JSON.stringify({
        p: confirmedComposed,
        m: normalizedSelectedModelNames,
        a: aspect,
        s: size,
        n,
        r: appliedRefs.map((item) => item.id),
        rs: referenceStrength,
      }),
    [appliedRefs, aspect, confirmedComposed, n, normalizedSelectedModelNames, referenceStrength, size],
  );
  // 완료 시점의 "현재" fingerprint 비교용 ref (onSuccess closure은 stale 값만 참조하므로)
  const generationFingerprintRef = useRef(generationFingerprint);
  useEffect(() => {
    generationFingerprintRef.current = generationFingerprint;
  }, [generationFingerprint]);
  const submittedFingerprintRef = useRef("");

  const displayComposed = useMemo(() => {
    if (isCustomMode) return customPrompt;
    if (!detail) return "";
    return renderImagePrompt(detail.title, detail.templateText, {
      params: vars,
      negative,
    });
  }, [customPrompt, detail, isCustomMode, negative, vars]);

  // 예상 차감 코인 = 모델별 장당 코인 × 과금 대상 이미지 수
  const estimatedCoins = useMemo(() => {
    let total = 0;

    for (const modelName of normalizedSelectedModelNames as string[]) {
      const provider = inferProviderFromModelName(modelName);
      const perImage = getPerImageCost(
        provider,
        modelName,
        "image",
        provider === "google" ? resolveGoogleImagePriceVariant(modelName, size) : undefined,
      );
      if (perImage == null) return null;

      const billableCount = provider === "xai" && hasAppliedRefs ? n + appliedRefCount : n;
      total += perImage * billableCount;
    }

    return total;
  }, [normalizedSelectedModelNames, n, hasAppliedRefs, appliedRefCount, size]);

  // 프리셋 모드에서 "이미지 설명" 필수
  const extraTrimmed = useMemo(() => String(extra || "").trim(), [extra]);

  // summary 모드(폼의 사본)는 Phase 3에서 제거 — 본문 폼이 source of truth (계약 §3.1)

  usePresetDetailBootstrap({
    entrySessionKey,
    initialMode,
    detail,
    defaultImageModelByProvider: effectiveDefaultImageModelByProvider as Partial<Record<ImageProviderType, string>>,
    initialTemplateVariables,
    initialAspectRatio,
    allowedTemplateVariableKeys,
    requiredTemplateVariableKeys,
    lockedTemplateVariableKeys,
    resetRecentState,
    scheduleRecentReload,
    resetReferenceState,
    setExtra,
    setShowExtraError,
    setImages,
    setViewerImages,
    setViewerSrc,
    setViewerIndex,
    setN,
    setIsCustomMode,
    setCustomPrompt,
    setNegative,
    setSelectedModelNames,
    setAspect,
    setSize,
    setVarSpecs,
    setVars,
  });

  // 초기 참고/모델 이미지 → 모델 이미지 기능은 첨부(참고) 이미지로 병합(4차 개선): 하나의 base 세트로 적용
  useEffect(() => {
    if (!open) return;
    const mergedInitialImages = [...(initialReferenceImages || []), ...(initialModelImages || [])];
    if (!mergedInitialImages.length) return;
    const referenceKey = `${entrySessionKey}:${mergedInitialImages.map((item) => item.data.slice(0, 32)).join("|")}`;
    if (appliedInitialReferenceKeyRef.current === referenceKey) return;
    appliedInitialReferenceKeyRef.current = referenceKey;
    applyInitialBaseImages(mergedInitialImages);
  }, [applyInitialBaseImages, entrySessionKey, initialModelImages, initialReferenceImages, open]);

  // provider 변경 시 aspect/model 조정
  useEffect(() => {
    let cancelled = false;
    runAfterCurrentRender(() => {
      if (cancelled) return;
      setAspect((prev) => {
        const fallback = clampAspectForProvider(imageProvider, prev || DEFAULT_IMAGE_ASPECT, primaryModelName);
        if (imageProvider === "google" && availableAspects.length > 0 && !availableAspects.includes(fallback)) {
          return availableAspects[0] || DEFAULT_IMAGE_ASPECT;
        }
        return fallback;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [imageProvider, primaryModelName, availableAspects]);

  useEffect(() => {
    let cancelled = false;

    runAfterCurrentRender(() => {
      if (cancelled) return;

      if (imageProvider === "openai" || imageProvider === "xai") {
        const canonical = clampAspectForProvider(imageProvider, aspect, primaryModelName);
        if (canonical !== aspect) {
          setAspect(canonical);
          return;
        }

        const mapped =
          ASPECT_TO_OPENAI_COMPAT_SIZE[canonical as keyof typeof ASPECT_TO_OPENAI_COMPAT_SIZE] || DEFAULT_IMAGE_SIZE;
        if (mapped !== size) setSize(mapped);
        return;
      }

      const nextSize =
        availableGoogleSizes.length > 0 && !availableGoogleSizes.includes(size)
          ? availableGoogleSizes[0]
          : normalizeGoogleImageSizeForModel(primaryModelName, size);
      if (nextSize !== size) setSize(nextSize);
    });

    return () => {
      cancelled = true;
    };
  }, [imageProvider, aspect, size, primaryModelName, availableGoogleSizes]);

  // 커스텀 모드 토글 — 무음 데이터 손실 금지: 이미 Custom draft가 있으면 템플릿 렌더링 결과로 덮어쓰지 않는다
  const handleToggleCustomMode = useCallback(() => {
    if (!allowTemplateMode) return;
    if (!isCustomMode && detail && !String(customPrompt || "").trim()) {
      // 프리셋 -> 커스텀(초기 진입): 현재 조합된 프롬프트를 초기값으로 1회 복사
      setCustomPrompt(displayComposed);
    }

    if (!isCustomMode && isPublicGenStudioSurface()) {
      trackGaEvent("gen_studio_custom_prompt_open", {
        cta_location: "preset_detail_custom_toggle",
        destination_url: typeof window !== "undefined" ? window.location.href : "",
        template_key: effectiveTemplateKey,
        template_title: String(detail?.title || "").trim() || "맞춤 프롬프트",
        studio_scope: mode,
      });
    }

    // UX 계측(계약 §6): 모드 전환 방향 추적
    if (isPublicGenStudioSurface()) {
      trackGaEvent("gen_prompt_mode_changed", {
        cta_location: "preset_detail_custom_toggle",
        from: isCustomMode ? "custom" : "template",
        to: isCustomMode ? "template" : "custom",
      });
    }

    setIsCustomMode((prev) => !prev);
  }, [allowTemplateMode, isCustomMode, customPrompt, displayComposed, detail, effectiveTemplateKey, mode]);

  const handleClearCustomPrompt = useCallback(async () => {
    const value = String(customPrompt || "").trim();
    if (!value) return;

    const ok = await dialog.confirm({
      variant: "danger",
      message: lang({
        ko: "현재 작성한 직접 편집 프롬프트를 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.",
        en: "Clear all direct-edit prompt text?\nThis cannot be undone.",
      }),
    });
    if (!ok) return;
    setCustomPrompt("");
  }, [customPrompt]);

  const handleApplyRecommendedDescription = useCallback(
    (prompt: string) => {
      const text = String(prompt || "").trim();
      if (!text) return;
      setExtra(text);
      if (showExtraError) setShowExtraError(false);
      window.requestAnimationFrame(() => extraRef.current?.focus());
    },
    [showExtraError],
  );

  // advanced_used 계측(계약 §6): 기본값과 다른 값으로 실제 변경했을 때만 기록
  const handleNegativeChange = useCallback(
    (v: string) => {
      if (v !== negative) advancedUsedRef.current = true;
      setNegative(v);
    },
    [negative],
  );

  const handleOpenResults = useCallback(
    ({
      focusHeading = false,
      source = "header",
    }: { focusHeading?: boolean; source?: "header" | "auto_after_success" } = {}) => {
      setResultOpen(true);
      // UX 계측(계약 §6): source로 "자동으로 본 결과"와 "스스로 연 결과"를 구분
      if (isPublicGenStudioSurface()) {
        trackGaEvent("gen_result_opened", {
          source,
          mode: isCustomMode ? "custom" : "template",
          result_count: sortedTemplateGalleryImages.length,
          stale: Boolean(resultFingerprint) && resultFingerprint !== generationFingerprint,
        });
      }
      // non-modal focus 규칙(§3.3): 사용자가 [결과] 클릭으로 연 경우에만 heading으로 focus 이동.
      // 생성 성공 자동 오픈은 focus를 빼앗지 않는다(aria-live는 stale 배너·토스트가 담당).
      if (focusHeading) {
        runAfterCurrentRender(() => resultHeadingRef.current?.focus());
      }
    },
    [generationFingerprint, isCustomMode, resultFingerprint, sortedTemplateGalleryImages.length],
  );

  const handleOpenLoginRequired = useCallback(() => {
    setShowLoginNotice(true);
    toast.error(lang(GEN_STUDIO_LOGIN_REQUIRED_TEXT));
    setIsLoginDrawerOpen(true);
  }, []);

  // 헤더 액션 (계약 §3.11): [결과 N] + ⋯ 더보기(북마크) — cycle action은 Phase 3에서 폐기됨
  const { resultAction, moreMenu, onMoreSelect } = usePresetHeaderActions({
    hasViewableResults: hasRecentImages,
    isGenerating: isCurrentGeneratePending,
    latestBatchCount,
    allowBookmark: Boolean(effectiveTemplateKey) && Boolean(onToggleBookmark),
    isBookmarked,
    bookmarkDisabled,
    onOpenResults: () => handleOpenResults({ focusHeading: true }),
    onToggleBookmark: effectiveTemplateKey ? () => onToggleBookmark?.(effectiveTemplateKey) : undefined,
    resultTriggerRef,
  });

  const imageMoreMenu = [
    ...moreMenu,
    {
      value: "coin-usage",
      label: lang({ ko: "코인 사용 내역", en: "Coin activity" }),
    },
  ];
  const handleImageMoreSelect = useCallback(
    (value: string) => {
      if (value === "coin-usage") {
        setCoinUsageOpen(true);
        return;
      }
      onMoreSelect(value);
    },
    [onMoreSelect],
  );

  // 이미지 생성
  const startGenerate = (request: PreparedGenerateRequest, confirmedPromptHash: string) => {
    const requestId = enqueueGenerate({
      isCustomMode: request.isCustomMode,
      templateKey: request.templateKey,
      templateScope: request.templateScope,
      customPrompt: request.customPrompt,
      effectiveExtra: request.effectiveExtra,
      vars: request.vars,
      aspect: request.aspect,
      size: request.size,
      negative: request.negative,
      n: request.n,
      modelNames: request.modelNames,
      confirmedPromptHash,
      baseImages: request.baseImages,
      modelImages: request.modelImages,
      referenceStrength: request.referenceStrength,
      modelReferenceStrength: request.modelReferenceStrength,
      visibility: request.visibility,
      onQueued: ({ requestId, jobIds }) => {
        onGenerationStarted?.({ requestId, jobCount: jobIds.length });
      },
      onSuccess: (res) => {
        logger.log("[onGenerate] res:", res);

        const currentContext = currentSheetContextRef.current;
        const isSameSheetContext =
          currentContext.entrySessionKey === request.requestEntrySessionKey &&
          currentContext.templateKey === request.requestTemplateKey;

        // Partial Success: 성공 asset 기준으로 배지·열람 판정 (§3.7)
        const successCount = Array.isArray(res.images) ? res.images.length : 0;
        const failedCount = Array.isArray(res.failedModelNames) ? res.failedModelNames.length : 0;

        // Generation Fingerprint lifecycle (§3.3):
        // 완료 batch의 fingerprint = 제출 시점 fingerprint.
        // 현재 fingerprint와 동일하면(사용자가 기다리던 결과) 자동 표시, 다르면 토스트만.
        const resultFp = submittedFingerprintRef.current;
        const isCurrentSettingsResult = resultFp === generationFingerprintRef.current;
        const shouldAutoOpenResult =
          isSameSheetContext && isSheetOpenRef.current && successCount > 0 && isCurrentSettingsResult;

        if (isSameSheetContext && successCount > 0) {
          applyGeneratedRecent(res.images, request.requestVisibility, {
            templateKey: request.requestTemplateKey,
            templateTitle: request.requestTemplateTitle || request.requestTemplateLabel,
            assets: res.assets,
          });
          setImages(res.images);
          setViewerImages(res.images || []);
          scheduleRecentReload(700);
          setLatestBatchCount(successCount);
          setResultFingerprint(resultFp);
          if (shouldAutoOpenResult) handleOpenResults({ source: "auto_after_success" });
        }

        onDone?.(res.images, res.coins, {
          requestId: res.requestId,
          entrySessionKey: request.requestEntrySessionKey,
          templateKey: request.requestTemplateKey,
          templateTitle: request.requestTemplateTitle || undefined,
          generationMode: request.requestGenerationMode,
          visibility: request.requestVisibility,
          assets: res.assets,
        });

        const linkedProfileImageUrl = String(res.images?.[0] || "").trim();
        if (linkedProfileImageUrl && pendingArtifactAssetIdsRef.current.size > 0) {
          const pendingAssetIds = Array.from(pendingArtifactAssetIdsRef.current);
          void Promise.allSettled(
            pendingAssetIds.map((assetId) =>
              linkPersonaImageLibraryAsset({
                assetId,
                personaId: personaArtifactContext?.personaId,
                linkedProfileImageUrl,
              }),
            ),
          ).then((results) => {
            results.forEach((result, index) => {
              if (result.status === "fulfilled") {
                pendingArtifactAssetIdsRef.current.delete(pendingAssetIds[index]);
              }
            });
          });
        }

        if (isPublicGenStudioSurface()) {
          trackGaEvent("gen_studio_generate_success", {
            cta_location: "preset_detail_generate",
            destination_url: request.requestDestinationUrl,
            template_key: request.requestTemplateKey,
            template_title: request.requestTemplateLabel,
            studio_scope: mode,
            generation_mode: request.requestGenerationMode,
            requested_count: request.n,
            succeeded_count: Array.isArray(res.images) ? res.images.length : 0,
            image_count: Array.isArray(res.images) ? res.images.length : 0,
            coins_used: res.coins,
            failed_model_count: Array.isArray(res.failedModelNames) ? res.failedModelNames.length : 0,
            output_visibility: request.requestVisibility,
          });
        }

        toast.success(
          lang({
            ko:
              failedCount > 0
                ? `${request.requestTemplateTitle || "이미지"}: ${successCount + failedCount}개 중 ${successCount}개의 이미지가 생성되었습니다.`
                : `${request.requestTemplateTitle || "이미지"} 결과 ${res.images.length}장이 준비되었습니다.`,
            en:
              failedCount > 0
                ? `${request.requestTemplateTitle || "Image"}: ${successCount + failedCount} requested, ${successCount} generated.`
                : `${request.requestTemplateTitle || "Image"} result ${res.images.length} ready.`,
          }),
          isSameSheetContext && res.images.length > 0
            ? {
                action: {
                  label: lang({ ko: "보기", en: "Open" }),
                  onClick: () => {
                    openViewerWithList({
                      src: res.images?.[0] || "",
                      index: 0,
                      list: res.images || [],
                    });
                  },
                },
              }
            : undefined,
        );

        if (Array.isArray(res.failedModelNames) && res.failedModelNames.length > 0) {
          toast.warning(
            lang({
              ko: `일부 모델 생성에 실패했습니다: ${res.failedModelNames.join(", ")}`,
              en: `Some models failed: ${res.failedModelNames.join(", ")}`,
            }),
          );
        }

        if (mode === "universe" && universeId) {
          persistCoinUpdated({
            scope: "universe",
            universeId,
            amount: -res.coins,
          });
        } else {
          persistCoinUpdated({ scope: "user", amount: -res.coins });
        }
      },
      onError: (e: unknown) => {
        const err = (e || {}) as GenerateActionError;
        const message = String(err?.message || "");
        const errorCode = String(err?.errorCode || "");
        const safeErrorCode = /^[A-Z0-9][A-Z0-9_.:-]{0,79}$/.test(errorCode) ? errorCode : "GENERATION_FAILED";
        onGenerationFailed?.({ requestId, errorCode: safeErrorCode });

        if (errorCode === "PROMPT_CONFIRMATION_STALE" || message === "prompt_confirmation_stale") {
          toast.error(
            lang({
              ko: "확인한 프롬프트와 실제 생성 프롬프트가 달라졌습니다. 다시 확인해 주세요.",
              en: "The confirmed prompt changed before generation. Please confirm it again.",
            }),
          );
          return;
        }

        if (errorCode === "MODEL_TEMP_UNAVAILABLE") {
          toast.error(
            lang({
              ko: "xAI 이미지 모델을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하거나 다른 모델을 선택해 주세요.",
              en: "The xAI image model is temporarily unavailable. Please try again later or choose another model.",
            }),
            {
              action: {
                label: lang({ ko: "다시 시도", en: "Retry" }),
                onClick: () => onGenerateRef.current(),
              },
            },
          );
          return;
        }

        // Insufficient Coins (계약 §3.7): 서버 판정으로만 상태 전이 — 클라이언트 임의 임계값 없음.
        // 충전은 CTA 인접 잔액(CoinBalance 버튼 → 사용 내역 → 충전) 경로로 유도.
        if (errorCode === "COIN_INSUFFICIENT") {
          setCoinShortage(true);
          toast.error(
            lang({
              ko: "코인 잔액이 부족합니다. 충전 후 다시 시도해 주세요.",
              en: "Not enough coins. Please top up and try again.",
            }),
            {
              action: {
                label: lang({ ko: "다시 시도", en: "Retry" }),
                onClick: () => onGenerateRef.current(),
              },
            },
          );
          return;
        }

        if (errorCode === "REFERENCE_IMAGE_REQUIRED" || message === "reference_image_required") {
          toast.error(
            lang({
              ko: "이 템플릿은 참고 이미지가 필요합니다. 참고 이미지를 먼저 추가해 주세요.",
              en: "This template requires a reference image. Please add one first.",
            }),
          );
          setActiveSettingDialog("reference");
          return;
        }

        if (errorCode === "REFERENCE_IMAGE_MAX_COUNT_EXCEEDED" || message === "reference_image_max_count_exceeded") {
          toast.error(
            lang({
              ko: "이 템플릿에서 허용된 참고 이미지 수를 초과했습니다.",
              en: "Too many reference images were attached for this template.",
            }),
          );
          setActiveSettingDialog("reference");
          return;
        }

        if (message.includes("인증이 필요") || message.includes("로그인이 필요")) {
          handleOpenLoginRequired();
          return;
        }

        toast.error(message || lang({ ko: "이미지 생성 실패", en: "Image generation failed" }), {
          action: {
            label: lang({ ko: "다시 시도", en: "Retry" }),
            onClick: () => onGenerateRef.current(),
          },
        });
      },
    });
    setActiveGenerateRequestId(requestId);
    // 제출 즉시 Result를 열지 않는다(§3.3) — 진행 상태는 헤더 spinner·footer 진행 문구로 전달,
    // 완료 시 lifecycle 조건(fingerprint 동일)에 따라 자동 표시.
    if (request.requestGenerationMode === "custom") {
      setCustomPrompt("");
    } else {
      setExtra("");
      setShowExtraError(false);
    }

    toast.message(
      lang({
        ko: "이미지 생성 요청을 접수했습니다. 완료되면 알림으로 알려드릴게요.",
        en: "Your image generation request was received. You will be notified when it completes.",
      }),
    );
  };

  const onGenerate = () => {
    if (!detail && !isCustomMode) return;
    if (isCurrentGeneratePending) return;

    const missingRequiredVariable = varSpecs.find((spec) => {
      if (!spec.required) return false;
      const value = String(vars[spec.key] || "").trim();
      if (!value || value === IMAGE_PROMPT_OPTION_NONE || value === IMAGE_PROMPT_OPTION_CUSTOM) return true;
      if (spec.kind !== "select") return false;
      return !(spec.options || []).some((option) => option.toLowerCase() === value.toLowerCase());
    });
    if (missingRequiredVariable) {
      toast.error(
        lang({
          ko: `${missingRequiredVariable.key} 필수 옵션을 선택해 주세요.`,
          en: `Select the required ${missingRequiredVariable.key} option.`,
        }),
      );
      return;
    }

    // 프리셋 모드: 참고/모델 이미지가 없을 때만 이미지 설명 필수
    if (isImageDescriptionRequired && !String(extra || "").trim()) {
      setShowExtraError(true);
      extraRef.current?.focus();
      return;
    }

    if (!isLoggedIn) {
      handleOpenLoginRequired();
      return;
    }

    if (showLoginNotice) setShowLoginNotice(false);

    const effectiveRefImages = appliedRefs.map((r) => ({
      mimeType: r.mimeType,
      data: r.data,
    }));
    const effectiveAttachedImages = [...effectiveRefImages];
    const effectiveRefCount = countImageReferenceInputs(effectiveAttachedImages);
    if (effectiveRefCount > 0 && normalizedSelectedModelNames.includes("grok-imagine-image-2.0" as ImageModelNameType)) {
      toast.error(
        lang({
          ko: "Grok Imagine 2.0은 참고 이미지를 처리할 수 없습니다. 다른 모델을 선택하거나 참고 이미지를 제거해 주세요.",
          en: "Grok Imagine 2.0 cannot process reference images. Select another model or remove the reference images.",
        }),
      );
      setActiveSettingDialog("model");
      return;
    }
    const shouldEnforceReference =
      Boolean(effectiveTemplateKey) && (!isCustomMode || referencePolicy.enforceInCustomMode);

    if (shouldEnforceReference && referencePolicy.required && effectiveRefCount < referencePolicy.minCount) {
      toast.error(
        lang({
          ko: `이 템플릿은 참고 이미지 ${referencePolicy.minCount}장 이상이 필요합니다.`,
          en: `This template requires at least ${referencePolicy.minCount} reference image(s).`,
        }),
      );
      setActiveSettingDialog("reference");
      return;
    }

    if (referencePolicy.maxCount > 0 && effectiveRefCount > referencePolicy.maxCount) {
      toast.error(
        lang({
          ko: `이 템플릿은 참고 이미지를 최대 ${referencePolicy.maxCount}장까지 사용할 수 있습니다.`,
          en: `This template allows up to ${referencePolicy.maxCount} reference image(s).`,
        }),
      );
      setActiveSettingDialog("reference");
      return;
    }

    const customPromptTrimmed = String(customPrompt || "").trim();
    const effectiveCustomPrompt = mergeExtraWithReferenceHint(customPromptTrimmed, appliedRefs, referenceStrength);
    const effectiveExtra = effectiveExtraForPrompt;
    const requestTemplateKey = effectiveTemplateKey;
    const requestTemplateTitle = String(detail?.title || "").trim();
    const requestEntrySessionKey = entrySessionKey;
    const requestGenerationMode = isCustomMode ? "custom" : "template";
    const requestVisibility = outputVisibility;
    const requestDestinationUrl = typeof window !== "undefined" ? window.location.href : "";
    const requestTemplateLabel = requestTemplateTitle || (requestGenerationMode === "custom" ? "맞춤 프롬프트" : "");

    if (isCustomMode && !customPromptTrimmed && effectiveAttachedImages.length === 0) {
      void dialog.alert(lang({ ko: "프롬프트를 입력해 주세요.", en: "Please enter a prompt." }));
      return;
    }

    if (isPublicGenStudioSurface()) {
      trackGaEvent("gen_studio_generate_click", {
        cta_location: "preset_detail_generate",
        destination_url: requestDestinationUrl,
        template_key: requestTemplateKey,
        template_title: requestTemplateLabel,
        studio_scope: mode,
        generation_mode: requestGenerationMode,
        model_names: normalizedSelectedModelNames.join("|"),
        model_count: normalizedSelectedModelNames.length,
        aspect_ratio: aspect,
        image_size: size,
        output_count: n,
        reference_image_count: effectiveRefImages.length,
        output_visibility: requestVisibility,
        // 계약 §6: Advanced 값을 기본값에서 실제 변경했는가 (열어본 것은 gen_advanced_opened가 담당)
        advanced_used: advancedUsedRef.current,
      });
    }

    const request: PreparedGenerateRequest = {
      isCustomMode,
      templateKey: effectiveTemplateKey,
      templateScope: detail?.templateScope,
      customPrompt: effectiveCustomPrompt,
      effectiveExtra,
      vars,
      aspect,
      size,
      negative,
      n,
      modelNames: normalizedSelectedModelNames.map((v) => String(v)),
      promptForConfirmation: confirmedComposed,
      baseImages: effectiveRefImages,
      modelImages: [],
      referenceStrength,
      modelReferenceStrength: DEFAULT_MODEL_REFERENCE_STRENGTH,
      visibility: outputVisibility,
      requestTemplateKey,
      requestTemplateTitle,
      requestEntrySessionKey,
      requestGenerationMode,
      requestVisibility,
      requestDestinationUrl,
      requestTemplateLabel,
    };

    // Generation Fingerprint: 제출 시점의 generation-affecting 상태를 기록(§3.3).
    // 완료 시 이 값과 현재 fingerprint를 비교해 자동 표시/stale을 판정한다.
    submittedFingerprintRef.current = generationFingerprint;

    // 모바일 키보드 dismiss (§3.3 실행 순서 계약): payload·fingerprint 확정 이후 blur는
    // keyboard dismiss만 수행한다 — controlled state라 blur가 generation state를 변경하지 않는다.
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Confirm 다이얼로그 없이 제출 시점 프롬프트 해시를 계산해 전달한다.
    // (서버는 hash가 있을 때만 prompt 불변성을 검증 — hash 계산 실패 시 빈 값으로 서버 검증 생략)
    void createSha256Hex(confirmedComposed)
      .then((confirmedPromptHash) => startGenerate(request, confirmedPromptHash))
      .catch((error) => {
        logger.warn("[PresetDetailSheet] failed to hash confirmed prompt", error);
        startGenerate(request, "");
      });
  };
  // latest-ref 패턴 — error handler에서 최신 onGenerate를 호출 (render 중 ref 접근 금지)
  useEffect(() => {
    onGenerateRef.current = onGenerate;
  });

  // UX 계측(계약 §6): 화면 진입 시점 — 시트/페이지 진입은 route page_view로 커버되지 않아
  // 최소 screen-view 계측을 추가한다 (진입→첫 생성 시간 산출의 분모)
  useEffect(() => {
    if (!open || !isPublicGenStudioSurface()) return;
    trackGaEvent("gen_studio_preset_detail_open", {
      cta_location: "preset_detail_sheet",
      destination_url: typeof window !== "undefined" ? window.location.href : "",
      template_key: effectiveTemplateKey,
      studio_scope: mode,
      generation_mode: isCustomOnlyEntry ? "custom" : "template",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entrySessionKey]);

  const handleViewerVisibilityChange = useCallback(
    async (src: string, visibility: PromptVisibilityType) => {
      try {
        await updateRecentVisibility(src, visibility);
      } catch {
        void dialog.alert(
          lang({ ko: "메타데이터 동기화 후 다시 시도해 주세요.", en: "Please retry after metadata sync." }),
        );
      }
    },
    [updateRecentVisibility],
  );

  const handleRecentCardVisibilityToggle = useCallback(
    async (src: string, next: PromptVisibilityType) => {
      if (!src || recentVisibilityChangingSrc) return;
      setRecentVisibilityChangingSrc(src);
      try {
        await updateRecentVisibility(src, next);
      } catch {
        void dialog.alert(
          lang({ ko: "메타데이터 동기화 후 다시 시도해 주세요.", en: "Please retry after metadata sync." }),
        );
      } finally {
        setRecentVisibilityChangingSrc(null);
      }
    },
    [recentVisibilityChangingSrc, updateRecentVisibility],
  );

  const handleViewerDelete = async (src: string) => {
    await removeRecentImage(src);

    setImages((prev) => prev.filter((v) => v !== src));
    setViewerImages((prev) => prev.filter((v) => v !== src));
    removeRecentReferenceByUrl(src);
    setViewerSrc((prev) => (prev === src ? null : prev));
  };

  const handleViewerTemplateKeyChange = useCallback(
    async (src: string, nextTemplateKey: string) => {
      await updateRecentTemplateKey(src, nextTemplateKey);
      scheduleRecentReload(0);
    },
    [updateRecentTemplateKey, scheduleRecentReload],
  );

  // 프롬프트 스트립 복사 — AI에 실제 전달되는 최종 프롬프트(추가 프롬프트·모델 지시 포함) 기준
  const handleCopyPrompt = useCallback(async (): Promise<boolean> => {
    const text = String(confirmedComposed || "").trim();
    if (!text) {
      void dialog.alert(lang({ ko: "복사할 프롬프트가 없습니다.", en: "No prompt to copy." }));
      return false;
    }
    try {
      await writeTextToClipboard(text);
      toast.success(lang({ ko: "프롬프트를 복사했습니다.", en: "Prompt copied." }));
      return true;
    } catch {
      void dialog.alert({ variant: "danger", message: lang({ ko: "복사에 실패했습니다.", en: "Failed to copy." }) });
      return false;
    }
  }, [confirmedComposed]);

  // stale 판정 (계약 §3.7): 완료 batch의 fingerprint ≠ 현재 generation-affecting 상태.
  // UI-only 상태(패널 펼침 등)는 fingerprint에 포함되지 않으므로 오진 없음.
  const isStaleResult = Boolean(resultFingerprint) && resultFingerprint !== generationFingerprint;

  const resultGalleryState: ResultViewerGalleryStateType = {
    sourceImageCount: sourceGalleryImages.length,
    images: sortedTemplateGalleryImages,
    metaBySrc: recentMetaBySrc,
    isGenerating: isCurrentGeneratePending,
    sortText: templateGallerySortText,
    togglingSrc: recentVisibilityChangingSrc,
  };
  const resultGalleryFilter: ResultViewerGalleryFilterType = {
    enabled: showFilterModule,
    owner: recentOwnerFilter,
    visibility: recentVisibilityFilter,
    showVisibilityButtons: showVisibilityFilterButtons,
    onChangeOwner: setRecentOwnerFilter,
    onChangeVisibility: setRecentVisibilityFilter,
  };
  const resultGalleryActions: ResultViewerGalleryActionsType = {
    onCycleSort: handleCycleTemplateGallerySort,
    onSelect: (src: string, index: number) => openViewerWithList({ src, index, list: sortedTemplateGalleryImages }),
    onToggleVisibility: handleRecentCardVisibilityToggle,
  };

  const appendPickedImageFiles = useCallback(async (files: File[], appendFile: (file: File) => Promise<unknown>) => {
    for (const file of files) {
      await appendFile(file);
    }
  }, []);

  const presetModeContentProps = {
    isCustomMode,
    allowTemplateMode,
    imageDescriptionRequired: isImageDescriptionRequired,
    customPrompt,
    setCustomPrompt,
    onToggleCustomMode: handleToggleCustomMode,
    onClearCustomPrompt: handleClearCustomPrompt,
    extra,
    usageTip: String(detail?.usageTip || ""),
    setExtra,
    sceneTemplate: String(detail?.sceneTemplate || ""),
    onApplyRecommendedDescription: handleApplyRecommendedDescription,
    extraRef,
    showExtraError: effectiveShowExtraError,
    setShowExtraError,
    extraTrimmed,
    imageProvider,
    availableAspects,
    size,
    availableGoogleSizes,
    imageModelOptions,
    fallbackModelName: fallbackImageModelName,
    modelLock: promptModelLock,
    aspect,
    setAspect,
    setSize,
    modelNames: normalizedSelectedModelNames,
    setModelNames: setSelectedModelNames,
    n,
    setN,
    activeSettingDialog: effectiveActiveSettingDialog,
    setActiveSettingDialog,
    baseImagePreviews,
    baseImageNames,
    onAddBaseImages: async (files: File[]) => {
      const remain = Math.max(0, maxRefImages - baseImages.length);
      if (remain <= 0) {
        logger.warn("[PresetDetailSheet] base attach no-op: remain<=0", {
          maxRefImages,
          baseCount: baseImages.length,
          picked: files.length,
        });
      }
      await appendPickedImageFiles(files.slice(0, remain), appendBaseImageFile);
    },
    onRemoveBaseImage: removeBaseImageAt,
    onMoveBaseImage: moveBaseImage,
    onEditBaseImage: handleEditBaseImage,
    selectedRecentUrls,
    onToggleRecentUrl: toggleSelectedRecentUrl,
    onEditRecentImage: handleEditRecentImage,
    onApplyReferenceSelection: applyReferenceSelection,
    appliedReferenceItems: appliedRefs.map((r) => ({
      id: r.id,
      preview: r.preview,
      name: r.name,
      origin: r.origin,
    })),
    onRemoveAppliedReference: removeAppliedRefAt,
    onOpenReferencePicker: () => setActiveSettingDialog("reference"),
    referencePickerDisabled:
      isCurrentGeneratePending ||
      effectiveActiveSettingDialog !== null ||
      !canAttachReference ||
      appliedRefCount >= maxRefImages,
    cameraEnabled: cameraCaptureAvailable,
    onCameraRequest: handleRequestNativeCameraCapture,
    addImageTooltip:
      referencePolicy.required && appliedRefCount < referencePolicy.minCount
        ? { ko: "이미지를 추가하세요", en: "Add an image" }
        : undefined,
    setNegative: handleNegativeChange,
    onAdvancedOpen: () => {
      if (isPublicGenStudioSurface()) {
        trackGaEvent("gen_advanced_opened", {
          cta_location: "preset_detail_advanced",
          destination_url: typeof window !== "undefined" ? window.location.href : "",
          template_key: effectiveTemplateKey,
        });
      }
    },
    referenceStrength,
    referenceStrengthLabel: getReferenceStrengthOption(referenceStrength).label,
    onChangeReferenceStrength: setReferenceStrength,
    varSpecs,
    vars,
    setVars,
    negative,
    recentImages: sourceGalleryImages,
    maxRefImages,
    canAttachReference,
    referenceRequired: referencePolicy.required,
    referenceMinCount: referencePolicy.minCount,
    visibility: outputVisibility,
    onChangeVisibility: setOutputVisibility,
    isAdministrator: Boolean(isAdministrator),
  } satisfies Parameters<typeof PresetModeContent>[0];

  if (!detail && !isCustomOnlyEntry) return null;

  const content = (
    <>
      <div
        className="flex h-full flex-col relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 드래그 오버레이 */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 border-2 border-dashed border-primary rounded-xl">
            <div className="flex flex-col items-center gap-2 text-primary">
              <ImagePlus className="h-10 w-10" />
              <span className="text-sm font-semibold">
                <Lang
                  text={{
                    ko: "참고 이미지로 사용",
                    en: "Use as reference image",
                  }}
                />
              </span>
            </div>
          </div>
        )}
        <StudioCreationWorkspace
          header={
            <PageSheetHeader
              title={sheetTitle}
              onClose={() => onOpenChange(false)}
              actions={[resultAction]}
              moreMenu={imageMoreMenu}
              moreMenuLabel={lang({ ko: "더보기", en: "More" })}
              onMoreSelect={handleImageMoreSelect}
              titleAs={titleAs}
            />
          }
          topSlot={
            !isCustomMode && templateArticleUrl && showTemplateBanner ? (
              <TemplateUsageBanner
                articleUrl={templateArticleUrl}
                imageUrl={sortedTemplateGalleryImages[0]}
                title={sheetTitle}
                onClose={() => setShowTemplateBanner(false)}
              />
            ) : null
          }
          resultOpen={resultOpen}
          onResultOpenChange={setResultOpen}
          resultHeadingRef={resultHeadingRef}
          resultReturnFocusRef={resultTriggerRef}
          resultHeader={({ onClose }) => (
            <ResultViewerHeader
              headingRef={resultHeadingRef}
              imageCount={sortedTemplateGalleryImages.length}
              sortText={templateGallerySortText}
              onCycleSort={handleCycleTemplateGallerySort}
              onClose={onClose}
            />
          )}
          resultTitle={{ ko: "생성 결과", en: "Results" }}
          result={
            <ResultViewerBody
              gallery={resultGalleryState}
              filter={resultGalleryFilter}
              actions={resultGalleryActions}
              stale={isStaleResult}
            />
          }
          footerHeightPx={footerHeightPx}
          mainClassName="flex flex-col space-y-2 p-4 touch-pan-y [-webkit-overflow-scrolling:touch]"
          footer={
            <FooterActions
              ref={footerWrapRef}
              variant="action-bar"
              isGenerating={isCurrentGeneratePending}
              pendingCount={pendingCount}
              disabled={
                isCurrentGeneratePending ||
                (!isCustomMode && !detail) ||
                effectiveActiveSettingDialog !== null ||
                normalizedSelectedModelNames.length === 0
              }
              onClose={() => onOpenChange(false)}
              onGenerate={onGenerate}
              estimatedCoins={estimatedCoins}
              coinShortage={coinShortage}
              promptPreview={!isCustomMode ? { text: confirmedComposed, onCopy: handleCopyPrompt } : undefined}
              onToggleCustomMode={handleToggleCustomMode}
              balanceSlot={
                mode === "universe" ? (
                  <UniverseCoinSummary universeId={universeId} variant="compact" />
                ) : isLoggedIn ? (
                  <CoinBalance className="p-0 text-xxs" showLabel={false} iconSize={12} />
                ) : null
              }
            />
          }
        >
          <PresetModeContent {...presetModeContentProps} />
          {showLoginNotice && !isLoggedIn ? (
            <div>
              <Error isShow toastOnShow={false} text={<Lang text={GEN_STUDIO_LOGIN_REQUIRED_TEXT} />} />
            </div>
          ) : null}
        </StudioCreationWorkspace>
      </div>

      <LoginDialog
        open={isLoginDrawerOpen}
        onOpenChange={setIsLoginDrawerOpen}
        onLoginSuccess={() => setShowLoginNotice(false)}
      />

      {mode === "universe" && universeId ? (
        <UniverseCoinUsageDialog
          open={coinUsageOpen}
          onClose={() => setCoinUsageOpen(false)}
          universeId={universeId}
        />
      ) : (
        <CoinUsageDialog open={coinUsageOpen} onClose={() => setCoinUsageOpen(false)} />
      )}

      <ImageAttachFailureDialog failure={imageAttachFailure} onClose={clearImageAttachFailure} />

      {editingImage ? (
        <ImageOverlayDrawingDialog
          open={Boolean(editingImage)}
          onOpenChange={(next) => {
            if (!next) handleCloseImageEditor();
          }}
          imageSrc={editingImage.src}
          imageName={editingImage.name}
          allowArtifactSave={Boolean(personaArtifactContext)}
          defaultArtifactName={lang({
            ko: `${personaArtifactContext?.personaName || "캐릭터"} 스케치`,
            en: `${personaArtifactContext?.personaName || "Character"} sketch`,
          })}
          onApply={handleApplyEditedImage}
        />
      ) : null}

      <FixedImageViewer
        open={Boolean(viewerSrc)}
        src={viewerSrc}
        images={viewerImages.length > 0 ? viewerImages : images}
        initialIndex={viewerIndex}
        metaBySrc={recentMetaBySrc}
        enableManageActions
        onVisibilityChange={handleViewerVisibilityChange}
        onTemplateKeyChange={handleViewerTemplateKeyChange}
        onDelete={handleViewerDelete}
        onOpenChange={(v) => !v && setViewerSrc(null)}
      />
    </>
  );

  return content;
}
