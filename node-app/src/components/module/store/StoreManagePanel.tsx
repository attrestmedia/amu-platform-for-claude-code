"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type Ref } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Eye,
  ExternalLink,
  MoreHorizontal,
  MoreVertical,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Settings,
  Sparkles,
  SquareUserRound,
} from "lucide-react";
import {
  CHARACTER_REFERENCE_KIT_TEMPLATE_KEY,
  CHARACTER_REFERENCE_REQUIRED_VARIABLE_KEYS,
  CHARACTER_REFERENCE_SPEC_VARIABLE_KEY,
  SMARTSTORE_PRODUCT_CONTENT_TEMPLATE_GROUP_KEY,
  SMARTSTORE_PRODUCT_IMAGE_TEMPLATE_GROUP_KEY,
} from "consts/app";
import {
  Badge,
  Button,
  Preloader,
  ScrollArea,
  Dropdown,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  dialog,
} from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { SubHeader } from "components/module/common";
import {
  SmartstoreDetailEditor,
  type SmartstoreDetailEditorHandle,
  type SmartstoreDetailImageCandidate,
} from "./SmartstoreDetailEditor";
import { ModelReferenceKitManager } from "./ModelReferenceKitManager";
import { SmartstoreVariantStudioSheet } from "./product-image/SmartstoreVariantStudioSheet";
import { NewProductFlowSheet, type NewProductFlowSubmitParams } from "./manage/NewProductFlowSheet";
import { StoreMarketingOopsSheet } from "./manage/StoreMarketingOopsSheet";
import { SMARTSTORE_PIPELINE_STEP_ENTER_LABELS } from "./manage/useSmartstorePipelineSync";
import { useCommerceDraftPublish } from "./manage/useCommerceDraftPublish";
import { useCommerceWorkflow } from "./manage/useCommerceWorkflow";
import { useSmartstorePanelRoute } from "./manage/useSmartstorePanelRoute";
import { useSmartstoreGenStudioBridge } from "./manage/useSmartstoreGenStudioBridge";
import { useCommerceDraftAssets } from "./manage/useCommerceDraftAssets";
import { useBasicInfoAiAssist } from "./manage/useBasicInfoAiAssist";
import { UploadedImagesPickerDialog } from "./manage/UploadedImagesPickerDialog";
import { UploadedImagesManageDialog } from "./manage/UploadedImagesManageDialog";
import { UniverseCoinUsageDialog } from "components/module/commerce/UniverseCoinUsageDialog";
import { StoreOpsSheet } from "./StoreOpsSheet";
import {
  deriveRegistrationSectionStatus,
  deriveRecommendedNextAction,
  type SmartstoreSectionKey,
} from "./manage/smartstoreSectionStatus";
import {
  SMARTSTORE_PIPELINE_STEP_DEFS,
  addSmartstorePipelineSkippedStep,
  buildSmartstorePipelineDisplayPatch,
  summarizeSmartstorePhotoUploads,
  type SmartstorePipelineStep,
} from "libs/server-utils/commerce/commercePipelineProgressContract";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import { ContentStudioEditor } from "components/template/gen-studio/ContentStudioEditor";
import { getStudioContentMeta } from "libs/api/lab";
import fetchClient from "libs/api/fetchClient";
import { useAuthStore } from "store/auth";
import type { IUniverse } from "types/game";
import type {
  ContentAssetMetaType,
  ContentStudioApplyContentArgsType,
  ContentStudioDoneMetaType,
  ContentStudioReferenceImageType,
  ImagePromptMetaType,
} from "types/app";
import type {
  CommerceDraftStatusType,
  ICommercePublishJob,
  ICommerceDraftPublishPreview,
  ICommerceProductDraft,
} from "types/commerce";
import type { ICharacterReferenceKit } from "types/character";
import { runAfterCurrentRender, toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { PAGE_LAYOUT_CLASS } from "utils/theme";
import {
  DRAFT_STATUS_LABEL,
  DRAFT_STATUS_VARIANT,
  SMARTSTORE_DETAIL_PANEL_CLASS,
  SMARTSTORE_CONTENT_PREFERRED_TEMPLATE_KEYS,
  SMARTSTORE_CONTENT_RECOMMENDED_TEMPLATE_KEYS,
  SMARTSTORE_IMAGE_RECOMMENDED_TEMPLATE_KEYS,
  SMARTSTORE_GENSTUDIO_TEMPLATE_CATEGORIES,
  SMARTSTORE_GENSTUDIO_TEMPLATE_TAGS,
  SMARTSTORE_OPERATOR_TEXT,
  buildDraftDiffRows,
  buildDraftPatch,
  buildSmartstoreDetailInfoTemplateContext,
  buildSmartstoreImageRailItems,
  formatDate,
  getDraftSearchHaystack,
  getDraftRegisteredAt,
  getCommerceDraftApiError,
  getCommerceDraftRevision,
  getModelReferenceKitSpecText,
  selectGenerationReadyModelReferenceKits,
  getSmartstoreDisplayStatus,
  matchesProductListFilter,
  parseNoticePayloadText,
  toFormState,
  toSafeString,
  appendDetailImageUrlText,
  updateNoticePayloadText,
  type DraftFormState,
  type ProductListFilter,
  type SmartstoreImageRow,
} from "./manage/smartstoreDraftUtils";
import { DraftReviewSheet } from "./manage/DraftReviewSheet";
import { WorkflowRunProgressPanel } from "./manage/WorkflowRunProgressPanel";
import { DraftListSection, type DraftListSortKey } from "./manage/DraftListSection";
import { DraftImagesSection } from "./manage/DraftImagesSection";
import { DraftBasicInfoSection } from "./manage/DraftBasicInfoSection";
import { DraftSalesInfoSection } from "./manage/DraftSalesInfoSection";

type StoreManagePanelProps = {
  universeId: string;
  universe: IUniverse;
};

type DraftListResponse = {
  drafts: ICommerceProductDraft[];
  totalCount: number;
};

type ApiEnvelope<T = UnknownRecord> = {
  data?: T;
};

type PreviewResponse = {
  mode: string;
  categoryPolicyGroup?: string;
  validation: ICommerceProductDraft["validation"];
  preview: ICommerceDraftPublishPreview;
};

type PublishJobsResponse = {
  jobs: ICommercePublishJob[];
  totalCount: number;
};

type DraftUploadResponse = {
  url?: string;
  filename?: string;
};

type StorefrontStatusResponse = {
  isOpen: boolean;
  credentialReady: boolean;
  storeId?: string;
  storefrontOpen: boolean;
  updatedAt?: string;
};

type ModelReferenceKitListResponse = {
  kits: ICharacterReferenceKit[];
  totalCount: number;
};

export function StoreManagePanel({ universeId, universe }: StoreManagePanelProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasAuthHydrated = useAuthStore((s) => s.hasHydrated);
  const isGenStudioLoggedIn = useAuthStore((s) => s.isLogged());
  // P6: URL ↔ 상태 동기화는 route 훅이 소유한다.
  const {
    viewParam,
    draftIdParam,
    studioIntentParam,
    selectedDraftId,
    setSelectedDraftId,
    navigateToList,
    navigateToEdit,
    navigateToCreate,
  } = useSmartstorePanelRoute();
  const [draftForm, setDraftForm] = useState<DraftFormState>(() => toFormState(null));
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [draftActionError, setDraftActionError] = useState<ReturnType<typeof getCommerceDraftApiError> | null>(null);

  type SectionKey = "product" | "required" | "images";

  // 카드 그리드 검색/필터/정렬 상태
  const [searchKeyword, setSearchKeyword] = useState("");
  const deferredKeyword = useDeferredValue(searchKeyword);
  const [listFilter, setListFilter] = useState<ProductListFilter>("displayed");
  const [sortKey, setSortKey] = useState<DraftListSortKey>("registered_desc");
  const [opsSheetOpen, setOpsSheetOpen] = useState(false);
  const [marketingOopsOpen, setMarketingOopsOpen] = useState(false);
  const [genStudioSheetOpen, setGenStudioSheetOpen] = useState(false);
  const [contentReferenceImagesByAssetId, setContentReferenceImagesByAssetId] = useState<
    Record<string, ContentStudioReferenceImageType[]>
  >({});
  const [modelKitSheetOpen, setModelKitSheetOpen] = useState(false);
  const [variantStudioOpen, setVariantStudioOpen] = useState(false);
  // 시트를 연 시각. 결과 후보를 이 시점 이후 생성분으로 한정한다(시트는 항상 렌더되므로 마운트 시각은 부정확하다).
  const [variantStudioOpenedAt, setVariantStudioOpenedAt] = useState(0);
  // SSM-205: guided flow에서 업로드가 실패한 사진. 편집 화면에서 개별 재시도·취소한다.
  const [flowUploadRetries, setFlowUploadRetries] = useState<Array<{ draftId: string; file: File; index: number }>>([]);
  const [pipelineSkipPending, setPipelineSkipPending] = useState(false);
  const [newProductFlowOpen, setNewProductFlowOpen] = useState(false);
  const [selectedModelKitIds, setSelectedModelKitIds] = useState<string[]>([]);
  const [activeJumpSection, setActiveJumpSection] = useState<SectionKey>("images");
  // "내 이미지" 선택 팝업 — 대표/추가 중 어느 필드에 적용할지 target으로 구분한다.
  const [myImagesPicker, setMyImagesPicker] = useState<{ open: boolean; target: "representative" | "detail" }>({
    open: false,
    target: "representative",
  });
  // P1 D1: create shell Stepper — 1 이미지 · 2 상품 정보 · 3 상세 설명 · 4 판매 정보 · 5 검토
  const [createStep, setCreateStep] = useState(1);

  // P4: 등록 점검 Review Sheet — preview는 검토 시점 revision에 결합된다.
  const [workflowHistoryOpen, setWorkflowHistoryOpen] = useState(false);
  const [jobsHistoryOpen, setJobsHistoryOpen] = useState(false);
  // create 뷰 ⋮ overflow — 스토어 이미지 관리 / 코인 사용 내역
  const [imageLibraryOpen, setImageLibraryOpen] = useState(false);
  const [coinUsageOpen, setCoinUsageOpen] = useState(false);

  const detailSectionRef = useRef<HTMLDetailsElement | null>(null);
  const smartstoreDetailEditorRef = useRef<SmartstoreDetailEditorHandle | null>(null);
  const requiredSectionRef = useRef<HTMLDetailsElement | null>(null);
  const imagesSectionRef = useRef<HTMLDetailsElement | null>(null);
  const productInfoSectionRef = useRef<HTMLDetailsElement | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);

  // P5: 활성 탭이 항상 탭 바 안에 보이도록 스크롤한다 — AI 제작처럼 뒤로 밀린 탭도 선택 즉시 노출된다.
  useEffect(
    function scrollActiveTabIntoView() {
      runAfterCurrentRender(() => {
        tabListRef.current
          ?.querySelector<HTMLButtonElement>('button[data-active="true"]')
          ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      });
    },
    [activeJumpSection],
  );

  // 탭 전환 방식: 활성 섹션만 표시하고 나머지는 hidden으로 숨긴다(마운트 유지 → 폼/에디터 상태 보존).
  // 탭 체계는 4탭(이미지·상품 정보·판매 정보·AI 제작) — 설계 제안 §13 D10. 상세 설명은 상품 정보 탭의 섹션.
  const jumpToSection = useCallback(function jumpToSection(key: SectionKey) {
    setActiveJumpSection(key);
    const target =
      key === "images"
        ? imagesSectionRef.current
        : key === "product"
          ? productInfoSectionRef.current
          : key === "required"
            ? requiredSectionRef.current
            : null;
    if (target && !target.open) target.open = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // P5: Review Sheet [수정하기] — 해당 탭으로 이동한 뒤 섹션 요약으로 포커스를 옮긴다.
  const handleNavigateSection = useCallback(
    (section: SmartstoreSectionKey) => {
      jumpToSection(section);
      runAfterCurrentRender(() => {
        const ref =
          section === "images" ? imagesSectionRef : section === "product" ? productInfoSectionRef : requiredSectionRef;
        ref.current?.querySelector("summary")?.focus();
      });
    },
    [jumpToSection],
  );

  const representativeUploadInputRef = useRef<HTMLInputElement | null>(null);
  const detailUploadInputRef = useRef<HTMLInputElement | null>(null);
  const triggerImageUpload = useCallback((target: "representative" | "detail") => {
    const ref = target === "representative" ? representativeUploadInputRef : detailUploadInputRef;
    ref.current?.click();
  }, []);

  const cameraCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const fileSelectInputRef = useRef<HTMLInputElement | null>(null);
  const editAfterUploadRef = useRef(false);
  const triggerImageSource = useCallback((source: "camera" | "file", editAfter: boolean) => {
    editAfterUploadRef.current = editAfter;
    const ref = source === "camera" ? cameraCaptureInputRef : fileSelectInputRef;
    ref.current?.click();
  }, []);

  useEffect(
    function syncSelectedDraftFromUrl() {
      if (viewParam === "edit" && draftIdParam && draftIdParam !== selectedDraftId) {
        runAfterCurrentRender(() => setSelectedDraftId(draftIdParam));
      }
    },
    [viewParam, draftIdParam, selectedDraftId, setSelectedDraftId],
  );

  const storefrontStatusQuery = useQuery<StorefrontStatusResponse>({
    queryKey: ["storefront-status", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(`/universe/${universeId}/commerce/storefront-status`, {
        cache: "no-store",
      });
      return (response?.data?.data || {
        isOpen: false,
        credentialReady: false,
        storeId: "",
        storefrontOpen: false,
      }) as StorefrontStatusResponse;
    },
    enabled: !!universeId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const draftsQuery = useQuery<DraftListResponse>({
    queryKey: ["commerce-drafts", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(`/universe/${universeId}/commerce/drafts`, {
        cache: "no-store",
      });
      return (response?.data?.data || { drafts: [], totalCount: 0 }) as DraftListResponse;
    },
    enabled: !!universeId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const selectedDraftQuery = useQuery<ICommerceProductDraft | null>({
    queryKey: ["commerce-draft-detail", universeId, selectedDraftId],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(
        `/universe/${universeId}/commerce/drafts/${selectedDraftId}`,
        {
          cache: "no-store",
        },
      );
      return (response?.data?.data?.draft || null) as ICommerceProductDraft | null;
    },
    enabled: !!universeId && !!selectedDraftId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const draftHydratedIdRef = useRef("");
  const draftIsDirty = useMemo(() => {
    const current = selectedDraftQuery.data;
    if (!current || toSafeString(current.draftId) !== selectedDraftId) return false;
    return (
      JSON.stringify(buildDraftPatch(draftForm, current)) !==
      JSON.stringify(buildDraftPatch(toFormState(current), current))
    );
  }, [draftForm, selectedDraftId, selectedDraftQuery.data]);

  useEffect(() => {
    if (draftIsDirty) runAfterCurrentRender(() => setPreviewData(null));
  }, [draftIsDirty]);

  const reloadDraftFromServer = useCallback(async () => {
    const result = await selectedDraftQuery.refetch();
    if (!result.data) return;
    draftHydratedIdRef.current = toSafeString(result.data.draftId);
    setDraftForm(toFormState(result.data));
    setPreviewData(null);
    setDraftActionError(null);
  }, [selectedDraftQuery]);

  const handledStudioIntentRef = useRef("");

  const contentAssetsQuery = useQuery<ContentAssetMetaType[]>({
    queryKey: ["commerce-draft-content-assets", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(
        `/lab/studio-contents?scope=universe&universeId=${encodeURIComponent(universeId)}&includeMeta=true&limit=8`,
        { cache: "no-store" },
      );
      return (response?.data?.data || []) as ContentAssetMetaType[];
    },
    enabled: !!universeId && !!selectedDraftId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const imageAssetsQuery = useQuery<ImagePromptMetaType[]>({
    queryKey: ["commerce-draft-image-assets", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(
        `/lab/studio-images?scope=universe&universeId=${encodeURIComponent(universeId)}&includeMeta=true&limit=8`,
        { cache: "no-store" },
      );
      return (response?.data?.data || []) as ImagePromptMetaType[];
    },
    enabled: !!universeId && !!selectedDraftId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const modelReferenceKitsQuery = useQuery<ModelReferenceKitListResponse>({
    queryKey: ["character-reference-kits", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(
        `/universe/${universeId}/character-reference-kits?limit=80`,
        { cache: "no-store" },
      );
      return (response?.data?.data || { kits: [], totalCount: 0 }) as ModelReferenceKitListResponse;
    },
    enabled: !!universeId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const publishJobsQuery = useQuery<PublishJobsResponse>({
    queryKey: ["commerce-draft-publish-jobs", universeId, selectedDraftId],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(
        `/universe/${universeId}/commerce/drafts/${selectedDraftId}/publish-jobs`,
        {
          cache: "no-store",
        },
      );
      return (response?.data?.data || { jobs: [], totalCount: 0 }) as PublishJobsResponse;
    },
    enabled: !!universeId && !!selectedDraftId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const updateStorefrontStatusMutation = useMutation({
    mutationFn: async (storefrontOpen: boolean) => {
      const response = await fetchClient.patch<ApiEnvelope>(`/universe/${universeId}/commerce/storefront-status`, {
        storefrontOpen,
      });
      return (response?.data?.data || null) as StorefrontStatusResponse | null;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["storefront-status", universeId] });
    },
  });

  useEffect(
    function autoSelectFirstDraftInEditView() {
      if (viewParam !== "edit") return;
      const drafts = draftsQuery.data?.drafts || [];
      if (!selectedDraftId && drafts.length > 0) {
        runAfterCurrentRender(() => setSelectedDraftId(String(drafts[0].draftId || "")));
      }
    },
    [viewParam, draftsQuery.data?.drafts, selectedDraftId, setSelectedDraftId],
  );

  useEffect(() => {
    draftHydratedIdRef.current = "";
    runAfterCurrentRender(() => {
      setPreviewData(null);
      setDraftActionError(null);
    });
  }, [selectedDraftId]);

  useEffect(() => {
    const draft = selectedDraftQuery.data;
    if (!draft || toSafeString(draft.draftId) !== selectedDraftId) return;
    if (draftHydratedIdRef.current === toSafeString(draft.draftId)) return;
    draftHydratedIdRef.current = toSafeString(draft.draftId);
    runAfterCurrentRender(() => setDraftForm(toFormState(draft)));
  }, [selectedDraftId, selectedDraftQuery.data]);

  useEffect(() => {
    const next = Array.isArray(selectedDraftQuery.data?.assets?.selectedModelReferenceKitIds)
      ? selectedDraftQuery.data?.assets?.selectedModelReferenceKitIds
          ?.map((kitId) => toSafeString(kitId))
          .filter(Boolean) || []
      : [];
    runAfterCurrentRender(() => setSelectedModelKitIds(next));
  }, [selectedDraftQuery.data?.assets?.selectedModelReferenceKitIds]);
  const handleDraftMutationError = useCallback((error: unknown) => {
    setDraftActionError(getCommerceDraftApiError(error));
  }, []);

  const saveDraftSnapshot = useCallback(async () => {
    const current = selectedDraftQuery.data;
    if (!selectedDraftId || !current) return null;
    if (!draftIsDirty) return current;

    const response = await fetchClient.patch<ApiEnvelope>(
      `/universe/${universeId}/commerce/drafts/${selectedDraftId}`,
      {
        patch: buildDraftPatch(draftForm, current),
        expectedRevision: getCommerceDraftRevision(current),
      },
    );
    const saved = (response?.data?.data?.draft || null) as ICommerceProductDraft | null;
    if (!saved) throw new Error("상품 초안 저장 응답이 없습니다.");
    queryClient.setQueryData(["commerce-draft-detail", universeId, selectedDraftId], saved);
    return saved;
  }, [draftForm, draftIsDirty, queryClient, selectedDraftId, selectedDraftQuery.data, universeId]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      return saveDraftSnapshot();
    },
    onSuccess: async (draft) => {
      setDraftActionError(null);
      if (draft) queryClient.setQueryData(["commerce-draft-detail", universeId, selectedDraftId], draft);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] }),
        queryClient.invalidateQueries({ queryKey: ["commerce-draft-detail", universeId, selectedDraftId] }),
      ]);
    },
    onError: handleDraftMutationError,
  });

  // P6: 책임 단위 훅 — 발행/Review Sheet(§6)와 workflow 원장·reconciliation을 각각 위임한다.
  const commerceWorkflow = useCommerceWorkflow({
    universeId,
    draftId: selectedDraftId,
    draft: selectedDraftQuery.data,
    saveDraftSnapshot,
    handleDraftMutationError,
  });
  const {
    workflowRunsQuery,
    activeWorkflowRun,
    workflowPendingAction,
    handleWorkflowStart,
    handleWorkflowRetryStage,
    handleWorkflowCancel,
    handleWorkflowResume,
    pipelineSync,
  } = commerceWorkflow;
  const commercePublish = useCommerceDraftPublish({
    universeId,
    draftId: selectedDraftId,
    selectedDraftQuery,
    saveDraftSnapshot,
    handleDraftMutationError,
    onActionSuccess: () => setDraftActionError(null),
    setPreviewData,
    checklistFlags: {
      factualConfirmed: draftForm.factualConfirmed,
      representativeImageConfirmed: draftForm.representativeImageConfirmed,
      aiDisclosureChecked: draftForm.aiDisclosureChecked,
    },
    onChecklistChange: (key, checked) => setDraftForm((prev) => ({ ...prev, [key]: checked })),
  });
  const {
    readinessMutation,
    publishMutation,
    reviewSheetOpen,
    setReviewSheetOpen,
    reviewPreparing,
    reviewRevision,
    reviewInvalid,
    openReviewSheet,
    handleReviewPublish,
    reviewChecklist,
    handleChecklistChange,
  } = commercePublish;

  const startGuidedProductMutation = useMutation({
    mutationFn: async (params: NewProductFlowSubmitParams) => {
      const title = params.title.trim();
      const createResponse = await fetchClient.post<ApiEnvelope>(
        `/universe/${universeId}/commerce/drafts/create-allowlist`,
        {
          // 빈 title 전송 시 서버 validator가 400(title_invalid)으로 거절하므로 값이 있을 때만 포함
          ...(title ? { title } : {}),
          categoryPolicyGroup: params.categoryPolicyGroup,
        },
      );
      const draft = (createResponse?.data?.data?.draft || null) as ICommerceProductDraft | null;
      const draftId = toSafeString(draft?.draftId);
      if (!draftId) {
        throw new Error(lang({ ko: "상품 초안 생성에 실패했습니다.", en: "Failed to create the product draft." }));
      }

      // SSM-205: 사진 업로드를 파일별로 추적한다. 실패한 사진은 편집 화면에서 개별 재시도·취소할 수 있다.
      const uploadOutcomes: Array<{ name: string; ok: boolean; url: string }> = [];
      for (const file of params.photos) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("kind", "commerce-draft");
          formData.append("pid", draftId);
          const uploadResponse = await fetchClient.post<ApiEnvelope>(`/universe/${universeId}/upload`, formData);
          const url = toSafeString((uploadResponse?.data?.data as DraftUploadResponse | null)?.url);
          uploadOutcomes.push({ name: file.name, ok: Boolean(url), url });
        } catch {
          // draft는 이미 생성된 상태 — 사진 업로드 실패는 흐름을 중단하지 않고 개별 추적한다.
          uploadOutcomes.push({ name: file.name, ok: false, url: "" });
        }
      }
      const uploadSummary = summarizeSmartstorePhotoUploads(params.photos, uploadOutcomes);
      const uploadedUrls = uploadSummary
        .filter((result) => result.status === "success" && result.url)
        .map((result) => result.url);

      if (uploadedUrls.length > 0) {
        const images: SmartstoreImageRow[] = uploadedUrls.map((url, index) => ({
          url,
          type: index === 0 ? "REPRESENTATIVE" : "OPTIONAL",
          imageType: index === 0 ? "REPRESENTATIVE" : "OPTIONAL",
          role: index === 0 ? "representative" : "detail",
          sortOrder: index + 1,
          origin: "manual_upload",
        }));
        await fetchClient.patch<ApiEnvelope>(`/universe/${universeId}/commerce/drafts/${draftId}`, {
          patch: {
            smartstore: {
              ...(draft?.smartstore || {}),
              images,
            },
          },
        });
      }

      // SSM-205: draft당 파이프라인 run을 만든다(멱등 키 미전송 — 서버가 재사용). 실패해도 흐름은
      // 계속된다. 편집 화면의 pipeline 패널이 다시 시도하고, 완료 단계를 run lineage로 적립한다.
      try {
        await fetchClient.post<ApiEnvelope>(`/universe/${universeId}/commerce/drafts/${draftId}/workflow-runs`, {});
      } catch {
        // run 생성 실패는 치명적이지 않다. 패널이 다시 시도한다.
      }

      const failedFiles = uploadSummary.flatMap((result, index) => {
        const file = params.photos[index];
        return result.status === "failed" && file ? [{ file, index }] : [];
      });

      return { draftId, uploadedUrls, failedFiles };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] }),
        queryClient.invalidateQueries({ queryKey: ["commerce-draft-detail", universeId] }),
      ]);
      setFlowUploadRetries((prev) => [
        ...prev.filter((retry) => retry.draftId !== result.draftId),
        ...result.failedFiles.map(({ file, index }) => ({ draftId: result.draftId, file, index })),
      ]);
      setNewProductFlowOpen(false);
      // P1 D2: create shell은 draft-backed — 생성 즉시 Stepper로 진입한다(별도 form state 없음).
      setCreateStep(1);
      navigateToCreate(result.draftId);
    },
    onError: (error) => {
      void dialog.alert(
        lang({
          ko: `상품 초안 생성에 실패했습니다.\n${toErrorMessage(error, "잠시 후 다시 시도해 주세요.")}`,
          en: `Failed to create the product draft.\n${toErrorMessage(error, "Please try again shortly.")}`,
        }),
      );
    },
  });

  const archiveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDraftId) return null;
      const response = await fetchClient.delete<ApiEnvelope>(
        `/universe/${universeId}/commerce/drafts/${selectedDraftId}`,
      );
      return (response?.data?.data?.draft || null) as ICommerceProductDraft | null;
    },
    onSuccess: async () => {
      setSelectedDraftId("");
      setPreviewData(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] }),
        queryClient.invalidateQueries({ queryKey: ["commerce-draft-detail", universeId] }),
      ]);
      navigateToList();
    },
  });

  // SSM-205: guided flow에서 실패한 사진의 개별 재시도.
  const retryFlowPhotoUploadMutation = useMutation({
    mutationFn: async (item: { draftId: string; file: File; index: number }) => {
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("kind", "commerce-draft");
      formData.append("pid", item.draftId);
      const response = await fetchClient.post<ApiEnvelope>(`/universe/${universeId}/upload`, formData);
      const url = toSafeString((response?.data?.data as DraftUploadResponse | null)?.url);
      if (!url) return { item, ok: false };

      const current = item.draftId === selectedDraftId ? selectedDraftQuery.data : null;
      if (!current) throw new Error("상품 초안 정보를 불러오지 못했습니다.");
      const currentImages = Array.isArray(current.smartstore?.images) ? current.smartstore.images : [];
      const nextImages = [
        ...currentImages,
        {
          url,
          type: currentImages.length > 0 ? "OPTIONAL" : "REPRESENTATIVE",
          imageType: currentImages.length > 0 ? "OPTIONAL" : "REPRESENTATIVE",
          role: currentImages.length > 0 ? "detail" : "representative",
          sortOrder: currentImages.length + 1,
          origin: "manual_upload",
        },
      ];
      await fetchClient.patch<ApiEnvelope>(`/universe/${universeId}/commerce/drafts/${item.draftId}`, {
        patch: {
          smartstore: {
            ...(current.smartstore || {}),
            images: nextImages,
          },
        },
        expectedRevision: getCommerceDraftRevision(current),
      });
      return { item, ok: true };
    },
    onSuccess: async ({ item, ok }) => {
      if (!ok) {
        void dialog.alert(
          lang({
            ko: "사진 업로드에 다시 실패했습니다. 잠시 후 다시 시도해 주세요.",
            en: "The photo upload failed again. Please try again shortly.",
          }),
        );
        return;
      }
      setFlowUploadRetries((prev) => prev.filter((retry) => retry !== item));
      if (item.draftId === selectedDraftId) {
        await selectedDraftQuery.refetch();
      }
      await queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] });
    },
    onError: handleDraftMutationError,
  });

  const updateDraftModelReferenceKitsMutation = useMutation({
    mutationFn: async (kitIds: string[]) => {
      if (!selectedDraftId) return null;
      const response = await fetchClient.post<ApiEnvelope>(
        `/universe/${universeId}/commerce/drafts/${selectedDraftId}/model-reference-kits`,
        { kitIds },
      );
      return (response?.data?.data?.draft || null) as ICommerceProductDraft | null;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] }),
        queryClient.invalidateQueries({ queryKey: ["commerce-draft-detail", universeId, selectedDraftId] }),
      ]);
    },
  });

  // P5: ⋯ 5종 메뉴 — 모바일·데스크톱이 같은 옵션을 공유한다.
  const reviewMoreMenuOptions = useMemo(
    () => [
      { value: "readiness", label: lang(SMARTSTORE_OPERATOR_TEXT.readiness) },
      { value: "modelKit", label: lang({ ko: "전용 모델 관리", en: "Manage Store Models" }) },
      { value: "workflowHistory", label: lang({ ko: "제작 진행 기록", en: "Production run history" }) },
      { value: "jobsHistory", label: lang({ ko: "등록 작업 기록", en: "Publish job history" }) },
      { value: "archive", label: lang(SMARTSTORE_OPERATOR_TEXT.archive), dividerBefore: true },
    ],
    [],
  );
  const handleMoreMenuSelect = useCallback(
    (value: string) => {
      if (value === "readiness") void openReviewSheet();
      else if (value === "modelKit") setModelKitSheetOpen(true);
      else if (value === "workflowHistory") setWorkflowHistoryOpen(true);
      else if (value === "jobsHistory") setJobsHistoryOpen(true);
      else if (value === "archive") archiveDraftMutation.mutate();
    },
    [archiveDraftMutation, openReviewSheet],
  );

  const drafts = useMemo<ICommerceProductDraft[]>(
    function buildDrafts() {
      return draftsQuery.data?.drafts || [];
    },
    [draftsQuery.data?.drafts],
  );

  const filteredDrafts = useMemo(
    function buildFilteredDrafts() {
      const keyword = deferredKeyword.trim().toLowerCase();
      const hasDisplayStatusSignal = drafts.some((item) => Boolean(getSmartstoreDisplayStatus(item)));
      let next = drafts;

      next = next.filter((item) => matchesProductListFilter(item, listFilter, hasDisplayStatusSignal));
      if (keyword) {
        next = next.filter((item) => getDraftSearchHaystack(item).includes(keyword));
      }

      const sorted = [...next];
      sorted.sort((a, b) => {
        if (sortKey === "title_asc") {
          return toSafeString(a.display?.title || a.smartstore?.productName).localeCompare(
            toSafeString(b.display?.title || b.smartstore?.productName),
          );
        }
        if (sortKey === "price_desc") {
          const ap = Number(a.smartstore?.salePrice ?? a.display?.price ?? 0);
          const bp = Number(b.smartstore?.salePrice ?? b.display?.price ?? 0);
          return bp - ap;
        }
        if (sortKey === "registered_desc") {
          const at = new Date(getDraftRegisteredAt(a) || 0).getTime();
          const bt = new Date(getDraftRegisteredAt(b) || 0).getTime();
          return bt - at;
        }
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });
      return sorted;
    },
    [drafts, deferredKeyword, listFilter, sortKey],
  );

  const listFilterCounts = useMemo(
    function countByListFilter() {
      const map: Record<ProductListFilter, number> = {
        displayed: 0,
        all: drafts.length,
        display_wait: 0,
        sale_wait: 0,
        hidden: 0,
        drafts: 0,
      };
      const hasDisplayStatusSignal = drafts.some((item) => Boolean(getSmartstoreDisplayStatus(item)));
      for (const item of drafts) {
        (Object.keys(map) as ProductListFilter[]).forEach((key) => {
          if (key !== "all" && matchesProductListFilter(item, key, hasDisplayStatusSignal)) map[key] += 1;
        });
      }
      return map;
    },
    [drafts],
  );

  const selectedDraft = selectedDraftQuery.data;
  const marketingReady = Boolean(
    selectedDraft && selectedDraft.status === "published" && Number(selectedDraft.smartstore?.channelProductNo) > 0,
  );
  const validation = selectedDraft?.validation;
  // P3: 탭 상태·헤더 요약의 단일 출처 — 섹션 상태 권위는 draft completeness + 서버 validation.
  const registrationStatus = useMemo(
    () => (selectedDraft ? deriveRegistrationSectionStatus({ draft: selectedDraft, validation }) : null),
    [selectedDraft, validation],
  );
  const recommendedNextAction = useMemo(
    () => (selectedDraft ? deriveRecommendedNextAction({ draft: selectedDraft, run: pipelineSync.activeRun }) : null),
    [selectedDraft, pipelineSync.activeRun],
  );
  const publishChecklistDone = useMemo(
    () =>
      [
        draftForm.factualConfirmed,
        draftForm.representativeImageConfirmed,
        draftForm.aiDisclosureChecked,
        Boolean(validation?.ready),
      ].filter(Boolean).length,
    [
      draftForm.factualConfirmed,
      draftForm.representativeImageConfirmed,
      draftForm.aiDisclosureChecked,
      validation?.ready,
    ],
  );
  const contentAssets = useMemo(() => contentAssetsQuery.data || [], [contentAssetsQuery.data]);
  const imageAssets = useMemo(() => imageAssetsQuery.data || [], [imageAssetsQuery.data]);
  const modelReferenceKits = useMemo(
    () => modelReferenceKitsQuery.data?.kits || [],
    [modelReferenceKitsQuery.data?.kits],
  );
  const selectedModelReferenceKits = useMemo(
    () => modelReferenceKits.filter((kit) => selectedModelKitIds.includes(kit.kitId)),
    [modelReferenceKits, selectedModelKitIds],
  );
  // 생성에 붙는 kit은 readiness를 통과한 것만이다. 선택 목록 자체는 그대로 두어
  // 사용자가 왜 빠졌는지 확인하고 보완할 수 있게 한다 (SSM-202).
  const generationReadyModelReferenceKits = useMemo(
    () => selectGenerationReadyModelReferenceKits(selectedModelReferenceKits),
    [selectedModelReferenceKits],
  );
  const blockedModelReferenceKits = useMemo(
    () => selectedModelReferenceKits.filter((kit) => !kit.quality?.ready),
    [selectedModelReferenceKits],
  );
  const selectedModelSpecText = useMemo(
    () => getModelReferenceKitSpecText(generationReadyModelReferenceKits),
    [generationReadyModelReferenceKits],
  );
  // 인라인 객체로 넘기면 매 리렌더마다 새 identity가 되고, 그 값이 PresetDetail 부트스트랩 effect의
  // 의존성이라 참조 이미지와 생성 결과가 초기화된다(SSM-202 P0-1과 같은 유형). identity를 고정한다.
  const modelSpecTemplateVariables = useMemo(
    () =>
      selectedModelSpecText
        ? ({ [CHARACTER_REFERENCE_SPEC_VARIABLE_KEY]: selectedModelSpecText } as Record<string, string>)
        : undefined,
    [selectedModelSpecText],
  );
  const selectedContentAssetId = toSafeString(selectedDraft?.assets?.selectedDescriptionContentAssetId);
  const draftPublishMode =
    selectedDraft?.smartstore?.channelProductNo || selectedDraft?.smartstore?.originProductNo ? "update" : "create";
  const currentRepresentativeImage = Array.isArray(selectedDraft?.smartstore?.images)
    ? selectedDraft?.smartstore?.images?.find(
        (rawImage: unknown) => toSafeString(toUnknownRecord(rawImage).role).toLowerCase() === "representative",
      ) || selectedDraft?.smartstore?.images?.[0]
    : null;
  const representativePreviewUrl =
    draftForm.representativeImageUrl.trim() || toSafeString(currentRepresentativeImage?.url);
  const noticePayload = useMemo(
    () => parseNoticePayloadText(draftForm.noticePayloadText),
    [draftForm.noticePayloadText],
  );
  const updateNoticeField = useCallback((key: string, value: string) => {
    setDraftForm((prev) => ({
      ...prev,
      noticePayloadText: updateNoticePayloadText(prev.noticePayloadText, key, value),
    }));
  }, []);

  // P6: Store ↔ Gen Studio 브릿지 — 접근 게이트·참조 이미지 준비를 위임한다.
  const {
    ensureGenStudioAccess,
    imageStudioSheetOpen,
    setImageStudioSheetOpen,
    imageStudioSourceUrl,
    imageStudioReferenceImages,
    imageStudioModelImages,
    imageStudioReferenceLoading,
    imageStudioModelReferenceLoading,
    openImageStudioForDetailImage,
    openImageStudioForNewImage,
  } = useSmartstoreGenStudioBridge({
    generationReadyModelReferenceKits,
    hasAuthHydrated,
    isGenStudioLoggedIn,
  });

  // P6: 자산(이미지) 변경 책임 — 업로드·apply-asset·rail 액션.
  const {
    uploadDraftImageMutation,
    applyAssetMutation,
    applyContentAssetToDetail,
    setRepresentativeFromImageItem,
    addDetailFromImageItem,
    removeDetailFromImageItem,
    uploadDetailBodyImage,
    insertImageItemToDetailBody,
  } = useCommerceDraftAssets({
    universeId,
    draftId: selectedDraftId,
    setDraftForm,
    handleDraftMutationError,
    openImageStudioForDetailImage,
    jumpToSection,
    smartstoreDetailEditorRef,
  });

  const handleApplyGenStudioContent = useCallback(
    async (args: ContentStudioApplyContentArgsType) => {
      let text = String(args.text || "").trim();
      if (!text) {
        const loaded = await getStudioContentMeta(args.assetId, "private", true).catch(() => null);
        text = String(loaded?.text || "").trim();
      }
      if (!text) {
        setDraftActionError(getCommerceDraftApiError(new Error("적용할 콘텐츠 본문이 없습니다.")));
        return;
      }

      try {
        // 다른 필드의 로컬 편집을 잃지 않도록 현재 dirty draft를 먼저 같은 revision에 저장한다.
        await saveDraftSnapshot();
      } catch (error) {
        handleDraftMutationError(error);
        return;
      }

      const applied = await applyContentAssetToDetail({ ...args, text });
      if (applied) setGenStudioSheetOpen(false);
    },
    [applyContentAssetToDetail, handleDraftMutationError, saveDraftSnapshot],
  );
  const handleGenStudioContentDone = useCallback(
    async (_contents: string[], _coins?: number, meta?: ContentStudioDoneMetaType) => {
      if (meta?.assetIds?.length && meta.referenceImages?.length) {
        setContentReferenceImagesByAssetId((previous) => {
          const next = { ...previous };
          meta.assetIds?.forEach((assetId) => {
            if (assetId) next[assetId] = meta.referenceImages ? [...meta.referenceImages] : [];
          });
          return next;
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["commerce-draft-content-assets", universeId] });
    },
    [queryClient, universeId],
  );

  // 기본 정보 AI 자동완성 — 상품 이미지를 멀티모달 모델로 분석해 필드를 채운다.
  // (Gen Studio 템플릿 시스템은 상세 설명 작성용으로 남긴다)
  const { suggestBasicInfoMutation, handleAiAssist } = useBasicInfoAiAssist({
    universeId,
    draftId: selectedDraftId,
    setDraftForm,
    handleDraftMutationError,
  });
  const handleCreateWithAi = useCallback(async () => {
    const confirmed = await dialog.confirm({
      title: lang({ ko: "AI로 만들기", en: "Create with AI" }),
      message: lang({
        ko: "AI로 만들기 사용 시 코인이 차감되며, 상품명과 상품 소개만 자동 생성됩니다.\n해당 정보를 자동으로 생성할까요?",
        en: "This uses coins and only fills the display name and summary automatically.\nGenerate this information now?",
      }),
      confirmLabel: lang({ ko: "생성", en: "Generate" }),
    });
    if (!confirmed) return;
    handleAiAssist(draftForm);
  }, [handleAiAssist, draftForm]);

  const handlePickMyImage = useCallback((target: "representative" | "detail") => {
    setMyImagesPicker({ open: true, target });
  }, []);

  const handleMyImageSelect = useCallback(
    (url: string) => {
      const target = myImagesPicker.target;
      setDraftForm((prev) =>
        target === "representative"
          ? { ...prev, representativeImageUrl: url }
          : { ...prev, detailImageUrlsText: appendDetailImageUrlText(prev.detailImageUrlsText, url) },
      );
    },
    [myImagesPicker.target],
  );

  const handlePipelineEnterStep = useCallback(
    function handlePipelineEnterStep(step: SmartstorePipelineStep) {
      if (step === "photos") {
        jumpToSection("images");
        return;
      }
      if (step === "basics") {
        jumpToSection("product");
        return;
      }
      if (step === "model") {
        setModelKitSheetOpen(true);
        return;
      }
      if (step === "images") {
        if (!ensureGenStudioAccess()) return;
        setVariantStudioOpenedAt(Date.now());
        setVariantStudioOpen(true);
        return;
      }
      if (step === "content") {
        jumpToSection("product");
        setGenStudioSheetOpen(true);
        return;
      }
      readinessMutation.mutate();
    },
    [ensureGenStudioAccess, jumpToSection, readinessMutation],
  );

  // SSM-205: 단계 건너뛰기. draft.display.pipelineProgress.skippedSteps에 저장되어 reload 후에도 유지된다.
  const handlePipelineSkipStep = useCallback(
    async function handlePipelineSkipStep(step: SmartstorePipelineStep) {
      const draft = selectedDraftQuery.data;
      if (!draft || !SMARTSTORE_PIPELINE_STEP_DEFS[step].skippable) return;
      setPipelineSkipPending(true);
      try {
        await fetchClient.patch<ApiEnvelope>(`/universe/${universeId}/commerce/drafts/${draft.draftId}`, {
          patch: {
            display: buildSmartstorePipelineDisplayPatch(draft, addSmartstorePipelineSkippedStep(draft, step)),
          },
          expectedRevision: getCommerceDraftRevision(draft),
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] }),
          queryClient.invalidateQueries({ queryKey: ["commerce-draft-detail", universeId, draft.draftId] }),
        ]);
      } catch (error) {
        void dialog.alert(
          lang({
            ko: `단계 건너뛰기에 실패했습니다.\n${toErrorMessage(error, "잠시 후 다시 시도해 주세요.")}`,
            en: `Failed to skip the step.\n${toErrorMessage(error, "Please try again shortly.")}`,
          }),
        );
      } finally {
        setPipelineSkipPending(false);
      }
    },
    [queryClient, selectedDraftQuery, universeId],
  );

  useEffect(
    function openGuidedGenStudioAfterDraftLoad() {
      if (!studioIntentParam || viewParam !== "edit" || !draftIdParam) return;
      if (toSafeString(selectedDraftQuery.data?.draftId) !== draftIdParam) return;
      const intentKey = `${draftIdParam}:${studioIntentParam}`;
      if (handledStudioIntentRef.current === intentKey) return;
      handledStudioIntentRef.current = intentKey;

      // studio 파라미터는 시트를 실제로 연 뒤에 지운다 — 오픈 전에 패널이 재마운트되어도 intent가 복구되도록.
      const clearStudioIntentParam = () => {
        const next = new URLSearchParams(searchParams.toString());
        next.delete("studio");
        router.replace(`?${next.toString()}`, { scroll: false });
      };

      if (!ensureGenStudioAccess()) {
        clearStudioIntentParam();
        return;
      }
      runAfterCurrentRender(() => {
        if (studioIntentParam === "content") {
          // D9: studio intent 값·의미 유지, destination만 새 IA(상품 정보 탭의 상세 설명)로 재매핑
          jumpToSection("product");
          setGenStudioSheetOpen(true);
          clearStudioIntentParam();
          return;
        }

        // D9: images intent → Gen Studio 이미지 시트(의미·값 유지, destination만 재매핑)
        const sourceUrl = toSafeString(toFormState(selectedDraftQuery.data).representativeImageUrl);
        if (sourceUrl) openImageStudioForDetailImage(sourceUrl);
        else openImageStudioForNewImage();
        clearStudioIntentParam();
      });
    },
    [
      draftIdParam,
      ensureGenStudioAccess,
      jumpToSection,
      openImageStudioForDetailImage,
      openImageStudioForNewImage,
      router,
      searchParams,
      selectedDraftQuery.data,
      studioIntentParam,
      viewParam,
    ],
  );
  const detailImageUrls = useMemo(
    () =>
      draftForm.detailImageUrlsText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    [draftForm.detailImageUrlsText],
  );
  const detailInfoTemplateContext = useMemo(() => buildSmartstoreDetailInfoTemplateContext(draftForm), [draftForm]);
  const smartstoreImageRailItems = useMemo(
    () => buildSmartstoreImageRailItems(draftForm, imageAssets),
    [draftForm, imageAssets],
  );
  // variant 참조 번들의 상품 사진 슬롯. AI 생성물이 아니라 실제 상품 사진이 기준이므로
  // 업로드·외부 URL로 들어온 대표·상세 이미지만 사용한다.
  const smartstoreProductPhotoUrls = useMemo(
    () =>
      smartstoreImageRailItems
        .filter((item) => item.role !== "generated")
        .map((item) => item.url)
        .filter(Boolean),
    [smartstoreImageRailItems],
  );
  const smartstoreEditorImageCandidates = useMemo<SmartstoreDetailImageCandidate[]>(
    () =>
      smartstoreImageRailItems.map((item) => ({
        id: item.id,
        url: item.url,
        label: item.label,
        description: item.description,
        source: item.role,
      })),
    [smartstoreImageRailItems],
  );
  const handleSelectedModelKitIdsChange = useCallback(
    (kitIds: string[]) => {
      setSelectedModelKitIds(kitIds);
      if (selectedDraftId) updateDraftModelReferenceKitsMutation.mutate(kitIds);
    },
    [selectedDraftId, updateDraftModelReferenceKitsMutation],
  );
  const importedSnapshot = toUnknownRecord(selectedDraft?.smartstore?.importedSnapshot);
  const diffRows = buildDraftDiffRows(selectedDraft);
  const publishJobs = publishJobsQuery.data?.jobs || [];
  const storefrontStatus = storefrontStatusQuery.data;
  const naverStoreId = toSafeString(storefrontStatus?.storeId);
  const naverStoreUrl = naverStoreId ? `https://smartstore.naver.com/${encodeURIComponent(naverStoreId)}` : "";
  const storefrontSwitchChecked = Boolean(storefrontStatus?.credentialReady && storefrontStatus?.storefrontOpen);
  const storefrontSwitchDisabled = !storefrontStatus?.credentialReady || updateStorefrontStatusMutation.isPending;
  const storefrontHelperText = !storefrontStatus?.credentialReady
    ? lang({
        ko: "네이버 스마트스토어 자격증명과 storeId를 먼저 저장해야 공개할 수 있습니다.",
        en: "Save the Naver Smart Store credentials and storeId before opening the storefront.",
      })
    : storefrontStatus?.isOpen
      ? lang({ ko: `/store/${universeId} 접속을 허용 중입니다.`, en: `/store/${universeId} is open to visitors.` })
      : lang({ ko: `/store/${universeId} 접속을 제한 중입니다.`, en: `/store/${universeId} is currently restricted.` });

  if (draftsQuery.isLoading) {
    return (
      <Preloader
        variant="spin"
        size="lg"
        container
        fullScreen
        text={lang({ ko: "상품 관리 화면을 준비하는 중입니다...", en: "Preparing the product workspace..." })}
      />
    );
  }

  return (
    <main className={PAGE_LAYOUT_CLASS}>
      <div
        className={`mx-auto flex w-full max-w-[88rem] flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 ${
          viewParam === "edit" ? "pb-[7rem] sm:pb-6" : ""
        }`}
      >
        {viewParam === "edit" ? (
          <>
            {/* 서브 헤더 — 공통 컴포넌트: 뒤로가기 + 문맥 타이틀 + 데스크톱 액션 + 모바일 더보기 */}
            <SubHeader
              sticky
              className="w-auto -mx-4 -mt-6 sm:mx-0 sm:mt-0 sm:h-auto sm:min-h-16 sm:flex-wrap sm:py-2 sm:px-6 lg:px-8"
              backAction={{ onClick: navigateToList, label: lang({ ko: "목록", en: "List" }) }}
              title={lang({ ko: "상품 편집", en: "Edit Product" })}
              right={
                selectedDraftId ? (
                  <>
                    {/* 모바일: ⋮ overflow — P5에서 액션 시트를 제거하고 5종 메뉴를 그대로 제공한다 */}
                    <Dropdown
                      variant="ghost"
                      options={reviewMoreMenuOptions}
                      selected={null}
                      onSelect={handleMoreMenuSelect}
                      renderTrigger={() => <MoreVertical className="h-5 w-5" aria-hidden="true" />}
                      hideArrow
                      openPortal
                      openSide="bottom"
                      contentAlign="end"
                      contentSideOffset={8}
                      triggerAriaLabel={lang({ ko: "더보기", en: "More actions" })}
                      className="h-10 w-10 shrink-0 justify-center border-0 bg-transparent p-0 sm:hidden"
                      dropdownClassName="min-w-44 rounded-xl border-border p-1 shadow-xl"
                      itemClassName={(option) =>
                        option.value === "archive"
                          ? "rounded-lg text-danger focus:bg-danger/10 focus:text-danger"
                          : "rounded-lg"
                      }
                    />
                    {/* 데스크톱: Primary 1개(반영) + Secondary(저장) + ⋯ overflow — 가이드 §3·§11 */}
                    <div className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex">
                      <Button
                        size="sm"
                        rounded="full"
                        variant="outline"
                        onClick={() => setMarketingOopsOpen(true)}
                        disabled={!marketingReady}
                        title={
                          marketingReady
                            ? undefined
                            : lang({ ko: "스마트스토어에 등록된 상품에서 사용할 수 있습니다.", en: "Available for published Smart Store products." })
                        }
                      >
                        <Sparkles className="mr-2 icon-xs" />
                        <Lang text={{ ko: "이 상품 홍보하기", en: "Promote this product" }} />
                      </Button>
                      <Button
                        size="sm"
                        rounded="full"
                        variant="outline"
                        onClick={() => saveDraftMutation.mutate()}
                        loading={saveDraftMutation.isPending}
                      >
                        <Save className="mr-2 icon-xs" />
                        <Lang text={SMARTSTORE_OPERATOR_TEXT.save} />
                      </Button>
                      <Button
                        size="sm"
                        rounded="full"
                        onClick={() => void openReviewSheet()}
                        loading={reviewPreparing || publishMutation.isPending}
                      >
                        <Send className="mr-2 icon-xs" />
                        <Lang
                          text={
                            draftPublishMode === "create"
                              ? SMARTSTORE_OPERATOR_TEXT.publishCreate
                              : SMARTSTORE_OPERATOR_TEXT.publishUpdate
                          }
                        />
                      </Button>
                      <Dropdown
                        variant="ghost"
                        options={reviewMoreMenuOptions}
                        selected={null}
                        onSelect={handleMoreMenuSelect}
                        renderTrigger={() => <MoreVertical className="h-5 w-5" aria-hidden="true" />}
                        hideArrow
                        openPortal
                        openSide="bottom"
                        contentAlign="end"
                        contentSideOffset={8}
                        triggerAriaLabel={lang({ ko: "더보기", en: "More actions" })}
                        className="h-10 w-10 shrink-0 justify-center border-0 bg-transparent p-0"
                        dropdownClassName="min-w-44 rounded-xl border-border p-1 shadow-xl"
                        itemClassName={(option) =>
                          option.value === "archive"
                            ? "rounded-lg text-danger focus:bg-danger/10 focus:text-danger"
                            : "rounded-lg"
                        }
                      />
                    </div>
                  </>
                ) : null
              }
            />
            {/* 페이지 상단 헤더 — 썸네일·상품 타이틀·뱃지 (서브 헤더에서 분리) */}
            <section className="mt-4 rounded-2xl border border-border bg-surface px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-background/70 sm:h-16 sm:w-16">
                  {representativePreviewUrl ? (
                    <Image
                      src={representativePreviewUrl}
                      alt={draftForm.title || selectedDraftId}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-primary-text sm:line-clamp-1 sm:text-base">
                    {draftForm.title || selectedDraft?.display?.title || selectedDraftId || ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {selectedDraft?.status ? (
                      <Badge size="xs" variant={DRAFT_STATUS_VARIANT[selectedDraft.status as CommerceDraftStatusType]}>
                        {lang(DRAFT_STATUS_LABEL[selectedDraft.status as CommerceDraftStatusType])}
                      </Badge>
                    ) : null}
                    {selectedDraft ? (
                      <Badge size="xs" variant={publishChecklistDone === 4 ? "primary" : "outline"}>
                        <Lang text={{ ko: "점검", en: "Check" }} /> {publishChecklistDone}/4
                      </Badge>
                    ) : null}
                    {draftIsDirty ? (
                      <Badge size="xs" variant="accent">
                        <Lang text={{ ko: "저장되지 않음", en: "Unsaved" }} />
                      </Badge>
                    ) : null}
                    <span className="hidden text-xxs text-secondary-text sm:inline">
                      {formatDate(selectedDraft?.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </section>
            {selectedDraftId ? (
              <div className="mt-4 hidden rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 sm:block">
                <Lang
                  text={{
                    ko: "‘새 상품 등록’ 또는 ‘스마트스토어에 반영’을 누르기 전까지 스마트스토어에는 아무것도 변경되지 않아요.",
                    en: "Nothing changes on Smart Store until you press publish.",
                  }}
                />
              </div>
            ) : null}
            {draftActionError ? (
              <div
                className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive"
                role="alert"
                aria-live="assertive"
              >
                <div>
                  <p className="font-semibold">{draftActionError.message}</p>
                  {draftActionError.code === "draft_revision_conflict" ? (
                    <p>
                      <Lang
                        text={{
                          ko: "다른 화면에서 변경된 최신 초안이 있습니다.",
                          en: "Another screen has a newer draft.",
                        }}
                      />
                      {draftActionError.details.currentRevision
                        ? ` (${lang({ ko: "현재 revision", en: "current revision" })}: ${draftActionError.details.currentRevision})`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <Button size="xs" variant="outline" onClick={() => void reloadDraftFromServer()}>
                  <RefreshCcw className="mr-1.5 icon-xs" />
                  <Lang text={{ ko: "최신 초안 불러오기", en: "Reload latest draft" }} />
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {viewParam === "list" ? (
          <>
            <section className="rounded-3xl border border-border bg-surface px-5 py-6 sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xxs font-semibold uppercase tracking-[0.22em] text-secondary-text">
                    <Lang text={SMARTSTORE_OPERATOR_TEXT.storeManager} />
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold sm:text-3xl">{universe.name}</h1>
                    {naverStoreUrl ? (
                      <Button asChild variant="outline" size="xs" rounded="full" className="text-xs">
                        <a
                          href={naverStoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={lang({
                            ko: `${universe.name} 네이버 스마트스토어 새 창에서 열기`,
                            en: `Open ${universe.name} on Naver Smart Store in a new tab`,
                          })}
                        >
                          <ExternalLink className="mr-1.5 icon-xs" aria-hidden="true" />
                          <Lang text={{ ko: "네이버 스마트스토어", en: "Naver Smart Store" }} />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  <p className="max-w-[46rem] text-sm leading-6 text-secondary-text">
                    <Lang
                      text={{
                        ko: "연동된 스마트스토어의 상품을 쉽고 빠르게 편집하고 등록하세요.",
                        en: "Easily and quickly edit and register products from your linked Smart Store.",
                      }}
                    />
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:items-end">
                  <div className="flex w-full items-center gap-2 sm:hidden">
                    <Button rounded="full" className="flex-1" onClick={() => setNewProductFlowOpen(true)}>
                      <Plus className="icon-xs" />
                      <Lang text={SMARTSTORE_OPERATOR_TEXT.blankDraft} />
                    </Button>
                    <Button
                      variant="outline"
                      rounded="full"
                      size="icon-md"
                      onClick={() => setOpsSheetOpen(true)}
                      aria-label={lang({ ko: "운영 메뉴 더보기", en: "More operations" })}
                    >
                      <MoreHorizontal className="icon-xs" />
                    </Button>
                  </div>
                  <div className="hidden flex-wrap justify-end gap-2 sm:flex">
                    <Button
                      rounded="full"
                      variant="outline"
                      className="text-xs"
                      onClick={() => window.location.assign(`/store/${universeId}?mode=preview`)}
                    >
                      <Eye className="icon-xs" />
                      <Lang text={SMARTSTORE_OPERATOR_TEXT.storePreview} />
                    </Button>
                    <Button
                      rounded="full"
                      variant="outline"
                      className="text-xs"
                      onClick={() => window.location.assign(`/store/${universeId}`)}
                      disabled={!storefrontStatus?.isOpen}
                    >
                      <Lang text={SMARTSTORE_OPERATOR_TEXT.openStorefront} />
                    </Button>
                    <Button rounded="full" variant="outline" className="text-xs" onClick={() => setOpsSheetOpen(true)}>
                      <Settings className="icon-xs" />
                      <Lang text={SMARTSTORE_OPERATOR_TEXT.operations} />
                    </Button>
                    <Button
                      rounded="full"
                      variant="outline"
                      className="text-xs"
                      onClick={() => setModelKitSheetOpen(true)}
                    >
                      <SquareUserRound className="icon-xs" />
                      <Lang text={{ ko: "전용 모델", en: "Store Models" }} />
                    </Button>
                    <Button rounded="full" className="text-xs" onClick={() => setNewProductFlowOpen(true)}>
                      <Plus className="icon-xs" />
                      <Lang text={SMARTSTORE_OPERATOR_TEXT.blankDraft} />
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* 스토어 공개 설정 */}
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-primary-text">
                    <Lang text={SMARTSTORE_OPERATOR_TEXT.storefrontOpen} />
                  </p>
                  <p className="mt-1 max-w-[21rem] text-xs leading-5 text-secondary-text">{storefrontHelperText}</p>
                </div>
                <div>
                  <Switch
                    size="sm"
                    aria-label={lang({ ko: "스토어 공개 설정", en: "Storefront open setting" })}
                    checked={storefrontSwitchChecked}
                    disabled={storefrontSwitchDisabled}
                    onCheckedChange={(checked) => updateStorefrontStatusMutation.mutate(Boolean(checked))}
                  />
                </div>
              </div>
            </div>

            <DraftListSection
              drafts={drafts}
              filteredDrafts={filteredDrafts}
              listFilterCounts={listFilterCounts}
              searchKeyword={searchKeyword}
              listFilter={listFilter}
              sortKey={sortKey}
              onSearchKeywordChange={setSearchKeyword}
              onListFilterChange={setListFilter}
              onSortKeyChange={setSortKey}
              onSelectDraft={navigateToEdit}
              onPromoteDraft={(draftId) => {
                navigateToEdit(draftId);
                setMarketingOopsOpen(true);
              }}
            />
          </>
        ) : viewParam === "create" ? (
          /* P1 D1: create shell — full-page Stepper(1 이미지 · 2 상품 정보 · 3 상세 설명 · 4 판매 정보 · 5 검토).
             draft-backed(D2): 같은 draftForm·섹션 컴포넌트·mutation을 편집 셸과 공유한다. */
          <div className="space-y-4">
            <SubHeader
              sticky
              className="w-auto -mx-4 -mt-6 sm:mx-0 sm:mt-0 sm:h-auto sm:min-h-16 sm:flex-wrap sm:py-2 sm:px-6 lg:px-8"
              backAction={{ onClick: navigateToList, label: lang({ ko: "목록", en: "List" }) }}
              title={lang({ ko: "새 상품 등록", en: "New Product" })}
              right={
                <>
                  <Button
                    size="sm"
                    rounded="full"
                    variant="outline"
                    onClick={() => saveDraftMutation.mutate()}
                    loading={saveDraftMutation.isPending}
                  >
                    <Save className="icon-xs" />
                    <Lang text={SMARTSTORE_OPERATOR_TEXT.save} />
                  </Button>
                  <Dropdown
                    variant="ghost"
                    options={[
                      { value: "image-library", label: lang({ ko: "스토어 이미지 관리", en: "Store Image Library" }) },
                      { value: "coin-usage", label: lang({ ko: "코인 사용 내역", en: "Coin Activity" }) },
                    ]}
                    selected={null}
                    onSelect={(value) => {
                      if (value === "image-library") setImageLibraryOpen(true);
                      else if (value === "coin-usage") setCoinUsageOpen(true);
                    }}
                    renderTrigger={() => <MoreVertical className="h-5 w-5" aria-hidden="true" />}
                    hideArrow
                    openPortal
                    openSide="bottom"
                    contentAlign="end"
                    contentSideOffset={8}
                    triggerAriaLabel={lang({ ko: "더보기", en: "More actions" })}
                    className="h-10 w-10 shrink-0 justify-center border-0 bg-transparent p-0"
                    dropdownClassName="min-w-44 rounded-xl border-border p-1 shadow-xl"
                  />
                </>
              }
            />
            <UploadedImagesManageDialog
              open={imageLibraryOpen}
              onClose={() => setImageLibraryOpen(false)}
              universeId={universeId}
            />
            <UniverseCoinUsageDialog
              open={coinUsageOpen}
              onClose={() => setCoinUsageOpen(false)}
              universeId={universeId}
              universeName={universe.name}
            />

            {draftActionError ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive"
                role="alert"
                aria-live="assertive"
              >
                <p className="font-semibold">{draftActionError.message}</p>
              </div>
            ) : null}

            <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
              {selectedDraftQuery.isLoading ? (
                <Preloader
                  variant="spin"
                  size="md"
                  container
                  text={lang({ ko: "상품 초안을 준비하는 중입니다...", en: "Preparing the draft..." })}
                />
              ) : selectedDraft ? (
                <>
                  <nav
                    className="sticky top-0 z-10 -mx-4 flex flex-col items-start gap-1 overflow-x-auto border-b border-border bg-surface/95 p-4 backdrop-blur"
                    aria-label={lang({ ko: "등록 단계", en: "Registration steps" })}
                  >
                    <ol className="flex gap-1.5">
                      {[
                        { ko: "이미지", en: "Images" },
                        { ko: "상품 정보", en: "Product Info" },
                        { ko: "상세 설명", en: "Detail" },
                        { ko: "판매 정보", en: "Sales Info" },
                        { ko: "검토", en: "Review" },
                      ].map((label, index) => {
                        const stepNo = index + 1;
                        const active = createStep === stepNo;
                        return (
                          <li key={label.ko} className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setCreateStep(stepNo)}
                              aria-current={active ? "step" : undefined}
                              className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${
                                active
                                  ? "border-primary bg-primary/10 font-semibold text-primary"
                                  : "border-border text-secondary-text"
                              }`}
                            >
                              {stepNo}. <Lang text={label} />
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </nav>

                  <div className="mt-6 space-y-3">
                    {createStep === 1 ? (
                      <DraftImagesSection
                        sectionRef={imagesSectionRef as unknown as Ref<HTMLDetailsElement>}
                        draftForm={draftForm}
                        railItems={smartstoreImageRailItems}
                        railLoading={imageAssetsQuery.isLoading}
                        railActionPending={applyAssetMutation.isPending}
                        onFormChange={(patch) => setDraftForm((prev) => ({ ...prev, ...patch }))}
                        onUpload={triggerImageUpload}
                        onCapture={() => triggerImageSource("camera", false)}
                        onPickMyImage={handlePickMyImage}
                        onEditImage={(item) => openImageStudioForDetailImage(item.url)}
                        onSetRepresentative={setRepresentativeFromImageItem}
                        onAddDetail={addDetailFromImageItem}
                        onRemoveDetail={removeDetailFromImageItem}
                        onInsertBody={insertImageItemToDetailBody}
                      />
                    ) : null}

                    {createStep === 2 ? (
                      <DraftBasicInfoSection
                        sectionRef={productInfoSectionRef as unknown as Ref<HTMLDetailsElement>}
                        universeId={universeId}
                        draftForm={draftForm}
                        draftStatus={selectedDraft.status || "draft"}
                        draftUpdatedAt={selectedDraft.updatedAt}
                        onFormChange={(patch) => setDraftForm((prev) => ({ ...prev, ...patch }))}
                        onCreateWithAi={handleCreateWithAi}
                        aiAssistPending={suggestBasicInfoMutation.isPending}
                      />
                    ) : null}

                    {createStep === 3 ? (
                      <details
                        ref={detailSectionRef as unknown as Ref<HTMLDetailsElement>}
                        open
                        className={SMARTSTORE_DETAIL_PANEL_CLASS}
                      >
                        <summary className="flex cursor-pointer items-center justify-between gap-3 py-4">
                          <div className="flex items-center gap-2">
                            <ChevronDown className="icon-xs transition-transform group-[&:not([open])]:-rotate-90" />
                            <span className="text-sm font-semibold text-primary-text">
                              <Lang text={{ ko: "상세 설명", en: "Detail Content" }} />
                            </span>
                          </div>
                          <Button
                            size="xs"
                            variant="secondary"
                            rounded="full"
                            className="shrink-0"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (!ensureGenStudioAccess()) return;
                              setGenStudioSheetOpen(true);
                            }}
                          >
                            <Sparkles className="icon-xs" />
                            <Lang text={{ ko: "AI로 만들기", en: "Create with AI" }} />
                          </Button>
                        </summary>
                        <div className="border-t border-border">
                          <div className="max-h-[60vh] min-h-[20rem] min-w-0 overflow-auto">
                            <SmartstoreDetailEditor
                              ref={smartstoreDetailEditorRef}
                              value={draftForm.detailHtml}
                              onChange={(detailHtml) => setDraftForm((prev) => ({ ...prev, detailHtml }))}
                              detailImageUrls={detailImageUrls}
                              imageCandidates={smartstoreEditorImageCandidates}
                              infoTemplateContext={detailInfoTemplateContext}
                              onImageAiEdit={openImageStudioForDetailImage}
                              onImageUpload={uploadDetailBodyImage}
                              onOpenImageStudio={openImageStudioForNewImage}
                            />
                          </div>
                        </div>
                      </details>
                    ) : null}

                    {createStep === 4 ? (
                      <DraftSalesInfoSection
                        sectionRef={requiredSectionRef as unknown as Ref<HTMLDetailsElement>}
                        draftForm={draftForm}
                        noticePayload={noticePayload}
                        onFormChange={(patch) => setDraftForm((prev) => ({ ...prev, ...patch }))}
                        onNoticeFieldChange={updateNoticeField}
                      />
                    ) : null}

                    {createStep === 5 ? (
                      <section className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {validation?.ready ? (
                            <Badge size="xs" variant="primary">
                              <Lang text={{ ko: "등록 준비 완료", en: "Ready to publish" }} />
                            </Badge>
                          ) : (
                            <Badge size="xs" variant="outline">
                              <Lang text={{ ko: "등록 점검 미완료", en: "Review pending" }} />
                            </Badge>
                          )}
                          <Badge size="xs" variant="outline">
                            <Lang text={{ ko: "점검", en: "Check" }} /> {publishChecklistDone}/4
                          </Badge>
                        </div>
                        {(validation?.errors || []).length > 0 ? (
                          <ul className="mt-3 space-y-1.5 text-xs leading-5 text-amber-800">
                            {validation?.errors?.map((item, index) => (
                              <li key={`${item.code}-${index}`}>{item.message || item.code || item.field}</li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="mt-3 text-xs leading-5 text-secondary-text">
                          <Lang
                            text={{
                              ko: "검토와 스마트스토어 반영은 편집 화면에서 진행하세요. 저장된 초안이 그대로 이어집니다.",
                              en: "Review and publishing continue in the editor. The saved draft carries over.",
                            }}
                          />
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            rounded="full"
                            onClick={() => readinessMutation.mutate()}
                            loading={readinessMutation.isPending}
                          >
                            <Lang text={SMARTSTORE_OPERATOR_TEXT.readiness} />
                          </Button>
                          <Button size="sm" rounded="full" onClick={() => navigateToEdit(selectedDraft.draftId)}>
                            <Lang text={{ ko: "편집 화면에서 반영", en: "Continue to editor" }} />
                          </Button>
                        </div>
                      </section>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-secondary-text">
                  <Lang
                    text={{
                      ko: "상품 초안을 찾을 수 없습니다. 목록에서 다시 시작해 주세요.",
                      en: "Draft not found. Start again from the product list.",
                    }}
                  />
                </div>
              )}
            </section>

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={createStep <= 1}
                onClick={() => setCreateStep((prev) => Math.max(1, prev - 1))}
              >
                <Lang text={{ ko: "이전", en: "Back" }} />
              </Button>
              {createStep < 5 ? (
                <Button onClick={() => setCreateStep((prev) => Math.min(5, prev + 1))}>
                  <Lang text={{ ko: "다음", en: "Next" }} />
                </Button>
              ) : (
                <Button onClick={() => selectedDraftId && navigateToEdit(selectedDraftId)}>
                  <Lang text={{ ko: "편집 화면에서 반영", en: "Continue to editor" }} />
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-4 rounded-2xl overflow-hidden">
              <section className="min-w-0 border border-border bg-surface p-4 sm:p-5">
                {selectedDraft ? (
                  <nav
                    className="sticky top-0 z-10 -mx-4 pt-0 flex flex-col items-start gap-1 overflow-x-auto border-b border-border bg-surface/95 p-4 backdrop-blur"
                    aria-label={lang({ ko: "본문 섹션 이동", en: "Jump to section" })}
                  >
                    {/* P3: 파이프라인 패널을 대체하는 헤더 요약 1줄 — 등록 준비도 + 다음 할 일 */}
                    {registrationStatus && recommendedNextAction ? (
                      <div className="flex w-full flex-wrap items-center gap-2 pb-1">
                        <span className="text-xs font-semibold text-primary-text">
                          <Lang
                            text={{
                              ko: `등록 준비 ${registrationStatus.readyCount}/${registrationStatus.readyTotal}`,
                              en: `Registration readiness ${registrationStatus.readyCount}/${registrationStatus.readyTotal}`,
                            }}
                          />
                        </span>
                        {recommendedNextAction.allDone ? (
                          <span className="text-xs text-secondary-text">
                            <Lang
                              text={{
                                ko: "모든 단계를 완료했습니다. 등록 점검을 진행하세요.",
                                en: "All steps are done. Run the pre-publish check.",
                              }}
                            />
                          </span>
                        ) : recommendedNextAction.step ? (
                          <>
                            <span className="text-xs text-secondary-text">
                              <Lang
                                text={{
                                  ko: `다음: ${SMARTSTORE_PIPELINE_STEP_ENTER_LABELS[recommendedNextAction.step].ko}`,
                                  en: `Next: ${SMARTSTORE_PIPELINE_STEP_ENTER_LABELS[recommendedNextAction.step].en}`,
                                }}
                              />
                            </span>
                            <Button
                              size="xs"
                              rounded="md"
                              className="min-h-9"
                              onClick={() =>
                                handlePipelineEnterStep(recommendedNextAction.step as SmartstorePipelineStep)
                              }
                              loading={readinessMutation.isPending && recommendedNextAction.step === "review"}
                            >
                              <Lang text={{ ko: "이어하기", en: "Continue" }} />
                            </Button>
                            {recommendedNextAction.skippable ? (
                              <Button
                                size="xs"
                                variant="outline"
                                rounded="md"
                                className="min-h-9"
                                loading={pipelineSkipPending}
                                disabled={pipelineSkipPending}
                                onClick={() =>
                                  handlePipelineSkipStep(recommendedNextAction.step as SmartstorePipelineStep)
                                }
                              >
                                <Lang text={{ ko: "건너뛰기", en: "Skip" }} />
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="-mx-4">
                      <ScrollArea scrollbars="horizontal" dragOnScrollX={true} dragIgnoreInteractive={true}>
                        <div
                          ref={tabListRef}
                          className="flex gap-1 px-4"
                          role="tablist"
                          aria-label={lang({ ko: "상품 편집 섹션", en: "Product edit sections" })}
                          onKeyDown={(event) => {
                            // 키보드 탭 내비게이션 — 좌우 화살표로 섹션 버튼 간 포커스 이동(P5)
                            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                            const buttons = Array.from(
                              event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tab]"),
                            );
                            if (buttons.length === 0) return;
                            const currentIndex = buttons.findIndex((button) => button === document.activeElement);
                            const delta = event.key === "ArrowRight" ? 1 : -1;
                            const next = buttons[(currentIndex + delta + buttons.length) % buttons.length];
                            next?.focus();
                            event.preventDefault();
                          }}
                        >
                          {[
                            {
                              key: "images" as const,
                              label: { ko: "상품 이미지", en: "Images" },
                              section: "images" as const,
                            },
                            {
                              key: "product" as const,
                              label: { ko: "상품 정보", en: "Product Info" },
                              section: "product" as const,
                            },
                            {
                              key: "required" as const,
                              label: { ko: "판매 정보", en: "Sales Info" },
                              section: "required" as const,
                            },
                          ].map((item) => {
                            const status = item.section ? registrationStatus?.sections[item.section] : undefined;
                            const statusLabel = status
                              ? status === "complete"
                                ? lang({ ko: "완료", en: "Complete" })
                                : status === "required"
                                  ? lang({ ko: "확인 필요", en: "Needs attention" })
                                  : lang({ ko: "미입력", en: "Not started" })
                              : null;
                            return (
                              <Button
                                key={item.key}
                                rounded="full"
                                variant={activeJumpSection === item.key ? "primary" : "neutral"}
                                className="shrink-0"
                                role="tab"
                                data-tab
                                data-active={activeJumpSection === item.key ? "true" : undefined}
                                aria-selected={activeJumpSection === item.key}
                                aria-label={
                                  statusLabel
                                    ? lang({
                                        ko: `${item.label.ko}, ${statusLabel}`,
                                        en: `${item.label.en}, ${statusLabel}`,
                                      })
                                    : undefined
                                }
                                onClick={() => jumpToSection(item.key)}
                              >
                                {status ? (
                                  <span
                                    aria-hidden="true"
                                    className={
                                      status === "complete"
                                        ? "text-emerald-600"
                                        : status === "required"
                                          ? "text-amber-600"
                                          : "text-secondary-text"
                                    }
                                  >
                                    {status === "complete" ? "✓" : status === "required" ? "!" : "○"}
                                  </span>
                                ) : null}
                                <Lang text={item.label} />
                              </Button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                  </nav>
                ) : null}

                {selectedDraftQuery.isLoading ? (
                  <div className="mt-6">
                    <Preloader
                      variant="spin"
                      size="md"
                      container
                      text={lang({ ko: "상품 정보를 불러오는 중입니다...", en: "Loading product details..." })}
                    />
                  </div>
                ) : selectedDraft ? (
                  <div className="mt-6 space-y-3">
                    {flowUploadRetries.filter((retry) => retry.draftId === selectedDraftId).length > 0 ? (
                      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive">
                        <p className="font-semibold">
                          <Lang
                            text={{ ko: "업로드에 실패한 제품 사진", en: "Product photos that failed to upload" }}
                          />
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {flowUploadRetries
                            .filter((retry) => retry.draftId === selectedDraftId)
                            .map((retry) => (
                              <li
                                key={`${retry.file.name}-${retry.file.lastModified}-${retry.index}`}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="min-w-0 truncate">{retry.file.name}</span>
                                <span className="flex shrink-0 gap-1.5">
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    rounded="md"
                                    className="min-h-11"
                                    loading={
                                      retryFlowPhotoUploadMutation.isPending &&
                                      retryFlowPhotoUploadMutation.variables?.file === retry.file
                                    }
                                    onClick={() => retryFlowPhotoUploadMutation.mutate(retry)}
                                  >
                                    <Lang text={{ ko: "다시 올리기", en: "Retry upload" }} />
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    rounded="md"
                                    onClick={() =>
                                      setFlowUploadRetries((prev) => prev.filter((item) => item !== retry))
                                    }
                                  >
                                    <Lang text={{ ko: "취소", en: "Dismiss" }} />
                                  </Button>
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className={activeJumpSection === "images" ? "" : "hidden"}>
                      {/* 상품 이미지 탭 = 확정 결과 전용(설계 제안 §8). 생성 도구는 AI 제작 탭으로 이동했다. */}
                      <DraftImagesSection
                        sectionRef={imagesSectionRef as unknown as Ref<HTMLDetailsElement>}
                        draftForm={draftForm}
                        railItems={smartstoreImageRailItems}
                        railLoading={imageAssetsQuery.isLoading}
                        railActionPending={applyAssetMutation.isPending}
                        onFormChange={(patch) => setDraftForm((prev) => ({ ...prev, ...patch }))}
                        onUpload={triggerImageUpload}
                        onCapture={() => triggerImageSource("camera", false)}
                        onPickMyImage={handlePickMyImage}
                        onEditImage={(item) => openImageStudioForDetailImage(item.url)}
                        onSetRepresentative={setRepresentativeFromImageItem}
                        onAddDetail={addDetailFromImageItem}
                        onRemoveDetail={removeDetailFromImageItem}
                        onInsertBody={insertImageItemToDetailBody}
                      />
                    </div>

                    <div className={activeJumpSection === "product" ? "" : "hidden"}>
                      <DraftBasicInfoSection
                        sectionRef={productInfoSectionRef as unknown as Ref<HTMLDetailsElement>}
                        universeId={universeId}
                        draftForm={draftForm}
                        draftStatus={selectedDraft.status || "draft"}
                        draftUpdatedAt={selectedDraft.updatedAt}
                        onFormChange={(patch) => setDraftForm((prev) => ({ ...prev, ...patch }))}
                        onCreateWithAi={handleCreateWithAi}
                        aiAssistPending={suggestBasicInfoMutation.isPending}
                      />
                      {/* 상세 설명 — 상품 정보 탭의 섹션(D10: 기본 정보와 통합) */}
                      <details
                        ref={detailSectionRef as unknown as Ref<HTMLDetailsElement>}
                        open
                        className={`${SMARTSTORE_DETAIL_PANEL_CLASS} mt-3`}
                      >
                        <summary className="flex cursor-pointer items-center justify-between gap-3 py-4">
                          <div className="flex items-center gap-2">
                            <ChevronDown className="icon-xs transition-transform group-[&:not([open])]:-rotate-90" />
                            <span className="text-sm font-semibold text-primary-text">
                              <Lang text={{ ko: "상세 설명", en: "Detail Content" }} />
                            </span>
                          </div>
                          <Button
                            size="xs"
                            variant="secondary"
                            rounded="full"
                            className="shrink-0"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (!ensureGenStudioAccess()) return;
                              setGenStudioSheetOpen(true);
                            }}
                          >
                            <Sparkles className="icon-xs" />
                            <Lang text={{ ko: "AI로 만들기", en: "Create with AI" }} />
                          </Button>
                        </summary>
                        <div className="border-t border-border">
                          <div className="max-h-[60vh] min-h-[20rem] min-w-0 overflow-auto">
                            <SmartstoreDetailEditor
                              ref={smartstoreDetailEditorRef}
                              value={draftForm.detailHtml}
                              onChange={(detailHtml) => setDraftForm((prev) => ({ ...prev, detailHtml }))}
                              detailImageUrls={detailImageUrls}
                              imageCandidates={smartstoreEditorImageCandidates}
                              infoTemplateContext={detailInfoTemplateContext}
                              onImageAiEdit={openImageStudioForDetailImage}
                              onImageUpload={uploadDetailBodyImage}
                              onOpenImageStudio={openImageStudioForNewImage}
                            />
                          </div>
                        </div>
                      </details>
                    </div>

                    <div className={activeJumpSection === "required" ? "" : "hidden"}>
                      <DraftSalesInfoSection
                        sectionRef={requiredSectionRef as unknown as Ref<HTMLDetailsElement>}
                        draftForm={draftForm}
                        noticePayload={noticePayload}
                        onFormChange={(patch) => setDraftForm((prev) => ({ ...prev, ...patch }))}
                        onNoticeFieldChange={updateNoticeField}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-secondary-text">
                    <Lang
                      text={{
                        ko: "왼쪽에서 상품을 선택하거나 새 상품을 만들어 편집을 시작하세요.",
                        en: "Choose a product from the left or create a new one to start editing.",
                      }}
                    />
                  </div>
                )}
              </section>
            </div>

            {selectedDraftId ? (
              <div
                className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden"
                role="toolbar"
                aria-label={lang({ ko: "상품 편집 액션", en: "Product actions" })}
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1"
                    onClick={() => setMarketingOopsOpen(true)}
                    disabled={!marketingReady}
                    aria-label={lang({ ko: "Marketing Oops 연결", en: "Connect Marketing Oops" })}
                  >
                    <Sparkles className="mr-1.5 icon-xs" />
                    <span className="truncate">이 상품 홍보하기</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => saveDraftMutation.mutate()}
                    loading={saveDraftMutation.isPending}
                  >
                    <Save className="mr-1.5 icon-xs" />
                    <Lang text={SMARTSTORE_OPERATOR_TEXT.save} />
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => void openReviewSheet()}
                    loading={reviewPreparing || publishMutation.isPending}
                  >
                    <Send className="mr-1.5 icon-xs" />
                    <Lang
                      text={
                        draftPublishMode === "create"
                          ? SMARTSTORE_OPERATOR_TEXT.publishCreate
                          : SMARTSTORE_OPERATOR_TEXT.publishUpdate
                      }
                    />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* 숨김 파일 인풋 — 편집·create shell 양쪽 뷰에서 공유한다 */}
        <input
          ref={representativeUploadInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadDraftImageMutation.mutate({ file, target: "representative" });
            event.target.value = "";
          }}
        />
        <input
          ref={detailUploadInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadDraftImageMutation.mutate({ file, target: "detail" });
            event.target.value = "";
          }}
        />
        <input
          ref={cameraCaptureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              uploadDraftImageMutation.mutate({
                file,
                target: "detail",
                editAfter: editAfterUploadRef.current,
              });
            }
            event.target.value = "";
            editAfterUploadRef.current = false;
          }}
        />
        <input
          ref={fileSelectInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              uploadDraftImageMutation.mutate({
                file,
                target: "detail",
                editAfter: editAfterUploadRef.current,
              });
            }
            event.target.value = "";
            editAfterUploadRef.current = false;
          }}
        />
        {/* P4: 등록 점검 Review Sheet — 반영의 단일 관문 */}
        <DraftReviewSheet
          open={reviewSheetOpen}
          onOpenChange={setReviewSheetOpen}
          preparing={reviewPreparing}
          previewRevision={reviewRevision}
          invalid={reviewInvalid}
          onRefresh={() => void openReviewSheet()}
          validation={validation}
          previewData={previewData}
          publishMode={draftPublishMode}
          hasImportedSnapshot={Boolean(importedSnapshot?.channelProductNo)}
          diffRows={diffRows}
          checklist={reviewChecklist}
          onChecklistChange={handleChecklistChange}
          onNavigateSection={handleNavigateSection}
          publishPending={publishMutation.isPending}
          onPublish={handleReviewPublish}
        />

        {/* P4: 제작 진행 기록 — workflow run 원장(⋯ 메뉴) */}
        <Sheet open={workflowHistoryOpen} onOpenChange={setWorkflowHistoryOpen}>
          <SheetContent side="right" className="w-[calc(100%-1rem)] overflow-y-auto bg-surface p-0 sm:max-w-[32rem]">
            <div className="border-b border-border px-5 py-4">
              <SheetTitle className="text-base font-semibold text-primary-text">
                <Lang text={{ ko: "제작 진행 기록", en: "Production Run History" }} />
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs leading-5 text-secondary-text">
                <Lang
                  text={{
                    ko: "AI 제작 파이프라인의 실행 원장입니다. 단계별 상태와 비용을 확인할 수 있어요.",
                    en: "The production run ledger. Inspect stage status and applied costs.",
                  }}
                />
              </SheetDescription>
            </div>
            <div className="px-5 py-4">
              <WorkflowRunProgressPanel
                run={activeWorkflowRun}
                loading={workflowRunsQuery.isLoading}
                pendingAction={workflowPendingAction}
                onStart={handleWorkflowStart}
                onRetryStage={handleWorkflowRetryStage}
                onCancel={() => void handleWorkflowCancel()}
                onResume={handleWorkflowResume}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* P4: 등록 작업 기록 — publish job 이력(⋯ 메뉴) */}
        <Sheet open={jobsHistoryOpen} onOpenChange={setJobsHistoryOpen}>
          <SheetContent side="right" className="w-[calc(100%-1rem)] overflow-y-auto bg-surface p-0 sm:max-w-[32rem]">
            <div className="border-b border-border px-5 py-4">
              <SheetTitle className="text-base font-semibold text-primary-text">
                <Lang text={{ ko: "등록 작업 기록", en: "Publish Job History" }} />
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs leading-5 text-secondary-text">
                <Lang
                  text={{
                    ko: "스마트스토어 반영 작업의 처리 결과입니다.",
                    en: "Results of publish jobs sent to Smart Store.",
                  }}
                />
              </SheetDescription>
            </div>
            <div className="px-5 py-4">
              {publishJobsQuery.isLoading ? (
                <div className="rounded-[1rem] border border-dashed border-border px-4 py-8 text-center text-sm text-secondary-text">
                  <Lang text={{ ko: "반영 이력을 불러오는 중입니다...", en: "Loading publish history..." }} />
                </div>
              ) : publishJobs.length > 0 ? (
                <div className="space-y-3">
                  {publishJobs.map((job) => (
                    <div key={job.jobId} className="rounded-[1rem] border border-border bg-background/70 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-primary-text">{job.status}</p>
                        <p className="text-xxs uppercase tracking-[0.18em] text-secondary-text">{job.operation}</p>
                      </div>
                      <p className="mt-2 text-xs text-secondary-text">{formatDate(job.createdAt)}</p>
                      {job.error?.message ? (
                        <p className="mt-2 text-xs leading-5 text-red-600">{job.error.message}</p>
                      ) : null}
                      <p className="mt-2 text-xxs text-secondary-text">{job.jobId}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1rem] border border-dashed border-border px-4 py-10 text-center text-sm leading-5 text-secondary-text">
                  <Lang
                    text={{
                      ko: "아직 등록/수정 기록이 없습니다. 수정한 내용을 스마트스토어에 반영하면 여기서 결과를 볼 수 있습니다.",
                      en: "There are no publish jobs yet. Run an update publish to see the job history here.",
                    }}
                  />
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* 부모 스마트스토어 Sheet가 Gen Studio 콘텐츠 흐름의 단일 overlay owner다. */}
        <Sheet open={genStudioSheetOpen} onOpenChange={setGenStudioSheetOpen}>
          <SheetContent
            side="bottom"
            disableOutsideClick
            lockBodyScroll
            onFocusOutside={(event) => event.preventDefault()}
            className="flex h-[90vh] max-h-[90vh] w-full flex-col bg-surface p-0"
          >
            {" "}
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <SheetTitle>
                <Lang text={{ ko: "Gen Studio 콘텐츠", en: "Gen Studio Content" }} />
              </SheetTitle>
              <SheetDescription>
                <Lang
                  text={{
                    ko: "스마트스토어 전용 콘텐츠 템플릿으로 생성한 결과물을 본문 필드에 반영합니다.",
                    en: "Apply Smart Store-only generated content to product fields.",
                  }}
                />
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              <div className="rounded-2xl border border-border bg-background/70 p-3">
                <ContentStudioEditor
                  mode="universe"
                  universeId={universeId}
                  detailPresentation="embedded"
                  templateGroupKey={SMARTSTORE_PRODUCT_CONTENT_TEMPLATE_GROUP_KEY}
                  recommendedTemplateKeys={SMARTSTORE_CONTENT_RECOMMENDED_TEMPLATE_KEYS}
                  recommendedTemplateDescription={{
                    ko: "상품 판매글 작성에 최적화된 템플릿입니다. 템플릿을 선택해 생성을 시작하세요.",
                    en: "Templates optimized for product sales copy. Pick one to start generating.",
                  }}
                  preferredTemplateKeys={SMARTSTORE_CONTENT_PREFERRED_TEMPLATE_KEYS}
                  preferredTemplateTags={SMARTSTORE_GENSTUDIO_TEMPLATE_TAGS}
                  preferredTemplateCategories={SMARTSTORE_GENSTUDIO_TEMPLATE_CATEGORIES}
                  onDone={handleGenStudioContentDone}
                  onApplyContent={handleApplyGenStudioContent}
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                  <Lang text={{ ko: "생성 콘텐츠", en: "Generated Contents" }} />
                </p>
                {contentAssetsQuery.isLoading ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-secondary-text">
                    <Lang text={{ ko: "콘텐츠 asset을 불러오는 중입니다...", en: "Loading content assets..." }} />
                  </div>
                ) : contentAssets.length > 0 ? (
                  contentAssets.map((asset) => {
                    const active = selectedContentAssetId === toSafeString(asset.assetId);
                    return (
                      <div
                        key={asset.assetId}
                        className={
                          active
                            ? "rounded-2xl border border-primary bg-primary/10 px-4 py-4"
                            : "rounded-2xl border border-border bg-background/70 px-4 py-4"
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-primary-text">
                              {asset.templateKey || asset.modelName || asset.assetId}
                            </p>
                            <p className="mt-1 text-xxs text-secondary-text">
                              {formatDate(String(asset.createdAt || ""))}
                            </p>
                          </div>
                          {active ? (
                            <span className="text-xxs font-semibold uppercase tracking-[0.18em] text-primary">
                              <Lang text={{ ko: "선택됨", en: "Selected" }} />
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 line-clamp-5 text-sm leading-6 text-secondary-text">
                          {asset.textPreview || asset.text}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() =>
                              void handleApplyGenStudioContent({
                                assetId: asset.assetId,
                                text: asset.text || "",
                                referenceImages: contentReferenceImagesByAssetId[asset.assetId],
                              })
                            }
                            loading={applyAssetMutation.isPending || uploadDraftImageMutation.isPending}
                          >
                            <Lang text={{ ko: "적용하기", en: "Apply" }} />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              applyAssetMutation.mutate({
                                assetType: "content",
                                assetId: asset.assetId,
                                targetField: "title",
                              })
                            }
                            loading={applyAssetMutation.isPending || uploadDraftImageMutation.isPending}
                          >
                            <Lang text={{ ko: "제목", en: "Title" }} />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              applyAssetMutation.mutate({
                                assetType: "content",
                                assetId: asset.assetId,
                                targetField: "summary",
                              })
                            }
                            loading={applyAssetMutation.isPending || uploadDraftImageMutation.isPending}
                          >
                            <Lang text={{ ko: "요약", en: "Summary" }} />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              applyAssetMutation.mutate({
                                assetType: "content",
                                assetId: asset.assetId,
                                targetField: "detailHtml",
                              })
                            }
                            loading={applyAssetMutation.isPending || uploadDraftImageMutation.isPending}
                          >
                            <Lang text={{ ko: "상세", en: "Detail" }} />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs leading-5 text-secondary-text">
                    <Lang
                      text={{
                        ko: "아직 생성된 콘텐츠가 없습니다. 위 Gen Studio에서 스마트스토어 템플릿으로 콘텐츠를 생성하세요.",
                        en: "No generated content yet. Create content with Smart Store templates in Gen Studio above.",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* 부모 스마트스토어 Sheet가 Gen Studio 이미지 흐름의 단일 overlay owner다. */}
        <Sheet open={imageStudioSheetOpen} onOpenChange={setImageStudioSheetOpen}>
          <SheetContent
            side="bottom"
            disableOutsideClick
            lockBodyScroll
            onFocusOutside={(event) => event.preventDefault()}
            className="flex h-[92vh] max-h-[92vh] w-full flex-col bg-surface p-0"
          >
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <SheetTitle>
                <Lang text={{ ko: "Gen Studio 이미지 편집", en: "Gen Studio Image Edit" }} />
              </SheetTitle>
              <SheetDescription>
                <Lang
                  text={{
                    ko: "선택한 상세 이미지를 참고 이미지로 연결해 스마트스토어용 이미지 템플릿을 생성합니다.",
                    en: "Use the selected detail image as a reference for Smart Store image templates.",
                  }}
                />
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {imageStudioSourceUrl ? (
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                    <Lang text={{ ko: "선택한 이미지", en: "Selected Image" }} />
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                    <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface">
                      <Image
                        src={imageStudioSourceUrl}
                        alt=""
                        fill
                        unoptimized
                        sizes="112px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 text-xs leading-5 text-secondary-text">
                      <p className="break-all">{imageStudioSourceUrl}</p>
                      <p className="mt-2">
                        {imageStudioReferenceLoading ? (
                          <Lang
                            text={{ ko: "참고 이미지를 준비하는 중입니다.", en: "Preparing the reference image." }}
                          />
                        ) : imageStudioReferenceImages.length > 0 ? (
                          <Lang
                            text={{
                              ko: "Gen Studio 참고 이미지로 준비되었습니다.",
                              en: "Ready as a Gen Studio reference image.",
                            }}
                          />
                        ) : (
                          <Lang
                            text={{
                              ko: "참고 이미지를 자동 준비하지 못했습니다. Gen Studio에서 직접 업로드해 진행할 수 있습니다.",
                              en: "The reference image could not be prepared automatically. You can upload it manually in Gen Studio.",
                            }}
                          />
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedModelReferenceKits.length > 0 ? (
                <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-secondary-text">
                  <p className="font-semibold text-primary-text">
                    <Lang text={{ ko: "적용 전용 모델", en: "Applied store models" }} />:{" "}
                    {selectedModelReferenceKits.map((kit) => kit.name).join(", ")}
                  </p>
                  <p className="mt-1">
                    {imageStudioModelReferenceLoading ? (
                      <Lang
                        text={{
                          ko: "모델 레퍼런스 이미지를 준비하는 중입니다.",
                          en: "Preparing model reference images.",
                        }}
                      />
                    ) : imageStudioModelImages.length > 0 ? (
                      <Lang
                        text={{
                          ko: `${imageStudioModelImages.length}장의 모델 이미지가 Gen Studio에 연결됩니다.`,
                          en: `${imageStudioModelImages.length} model images will be attached to Gen Studio.`,
                        }}
                      />
                    ) : (
                      <Lang
                        text={{
                          ko: "연결 가능한 모델 이미지가 없습니다. 전용 모델에 이미지를 먼저 추가하세요.",
                          en: "No attachable model images. Add images to the model kit first.",
                        }}
                      />
                    )}
                  </p>
                  {blockedModelReferenceKits.length > 0 ? (
                    <p className="mt-1 text-secondary-text">
                      <Lang
                        text={{
                          ko: `품질 검사를 통과하지 못한 ${blockedModelReferenceKits.length}개 모델(${blockedModelReferenceKits
                            .map((kit) => kit.name)
                            .join(", ")})은 생성에 첨부되지 않습니다.`,
                          en: `${blockedModelReferenceKits.length} model(s) that failed the readiness check are not attached: ${blockedModelReferenceKits
                            .map((kit) => kit.name)
                            .join(", ")}.`,
                        }}
                      />
                    </p>
                  ) : null}
                </div>
              ) : null}

              <ImageStudioEditor
                mode="universe"
                universeId={universeId}
                surface="embedded"
                detailPresentation="embedded"
                templateGroupKey={SMARTSTORE_PRODUCT_IMAGE_TEMPLATE_GROUP_KEY}
                preferredTemplateKeys={[CHARACTER_REFERENCE_KIT_TEMPLATE_KEY]}
                recommendedTemplateKeys={SMARTSTORE_IMAGE_RECOMMENDED_TEMPLATE_KEYS}
                recommendedTemplateDescription={{
                  ko: "스마트스토어 상품 이미지 생성에 최적화된 템플릿입니다. 템플릿을 선택해 생성을 시작하세요.",
                  en: "Templates optimized for Smart Store product images. Pick one to start generating.",
                }}
                initialReferenceImages={imageStudioReferenceImages}
                initialModelImages={imageStudioModelImages}
                initialTemplateVariables={modelSpecTemplateVariables}
                requiredTemplateVariableKeys={
                  selectedModelSpecText ? CHARACTER_REFERENCE_REQUIRED_VARIABLE_KEYS : undefined
                }
                lockedTemplateVariableKeys={
                  selectedModelSpecText ? CHARACTER_REFERENCE_REQUIRED_VARIABLE_KEYS : undefined
                }
                onDone={async () => {
                  await queryClient.invalidateQueries({ queryKey: ["commerce-draft-image-assets", universeId] });
                }}
              />
            </div>
          </SheetContent>
        </Sheet>

        <SmartstoreVariantStudioSheet
          universeId={universeId}
          draftId={selectedDraftId}
          open={variantStudioOpen && Boolean(selectedDraftId)}
          onOpenChange={setVariantStudioOpen}
          openedAt={variantStudioOpenedAt}
          productPhotoUrls={smartstoreProductPhotoUrls}
          templateVariables={modelSpecTemplateVariables}
          requiredTemplateVariableKeys={
            selectedModelSpecText ? CHARACTER_REFERENCE_REQUIRED_VARIABLE_KEYS : undefined
          }
          lockedTemplateVariableKeys={
            selectedModelSpecText ? CHARACTER_REFERENCE_REQUIRED_VARIABLE_KEYS : undefined
          }
          recommendedTemplateKeys={SMARTSTORE_IMAGE_RECOMMENDED_TEMPLATE_KEYS}
          onApplied={async () => {
            await selectedDraftQuery.refetch();
            await queryClient.invalidateQueries({ queryKey: ["commerce-draft-image-assets", universeId] });
          }}
        />

        <Sheet open={modelKitSheetOpen} onOpenChange={setModelKitSheetOpen}>
          <SheetContent side="right" className="w-[calc(100%-1rem)] overflow-y-auto bg-surface p-0 sm:max-w-[54rem]">
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <SheetTitle>
                <Lang text={{ ko: "전용 모델 관리", en: "Store Model Studio" }} />
              </SheetTitle>
              <SheetDescription>
                <Lang
                  text={{
                    ko: "스토어 전용 모델을 만들고, 이 상품에 사용할 모델을 선택하세요.",
                    en: "Manage store-owned model references and select the models used for the current product draft.",
                  }}
                />
              </SheetDescription>
            </SheetHeader>
            <div className="p-5">
              <ModelReferenceKitManager
                universeId={universeId}
                kits={modelReferenceKits}
                selectedKitIds={selectedModelKitIds}
                onSelectedKitIdsChange={handleSelectedModelKitIdsChange}
                ensureGenStudioAccess={ensureGenStudioAccess}
                onInsertBodyImage={(url) =>
                  insertImageItemToDetailBody({
                    id: `model:${url}`,
                    url,
                    role: "generated",
                    label: { ko: "모델", en: "Model" },
                  })
                }
                onChanged={async () => {
                  await modelReferenceKitsQuery.refetch();
                }}
              />
            </div>
          </SheetContent>
        </Sheet>

        <NewProductFlowSheet
          key={newProductFlowOpen ? "open" : "closed"}
          open={newProductFlowOpen}
          submitting={startGuidedProductMutation.isPending}
          onOpenChange={setNewProductFlowOpen}
          onSubmit={(params) => startGuidedProductMutation.mutate(params)}
          onOpenImport={() => {
            setNewProductFlowOpen(false);
            setOpsSheetOpen(true);
          }}
        />

        {selectedDraft ? (
          <StoreMarketingOopsSheet
            key={`${selectedDraft.draftId}:${selectedDraft.revision || 1}`}
            open={marketingOopsOpen}
            onOpenChange={setMarketingOopsOpen}
            universeId={universeId}
            draft={selectedDraft}
          />
        ) : null}

        <UploadedImagesPickerDialog
          open={myImagesPicker.open}
          onClose={() => setMyImagesPicker((prev) => ({ ...prev, open: false }))}
          universeId={universeId}
          onSelect={handleMyImageSelect}
        />

        {/* P6: 운영 시트 — list 뷰 전용 컴포넌트로 분리 */}
        <StoreOpsSheet
          open={opsSheetOpen}
          onOpenChange={setOpsSheetOpen}
          universeId={universeId}
          universeName={universe.name}
          naverStoreUrl={naverStoreUrl}
          storefrontOpen={Boolean(storefrontStatus?.isOpen)}
          onDraftReady={(draftId) => navigateToEdit(draftId)}
        />
      </div>
    </main>
  );
}

export default StoreManagePanel;
