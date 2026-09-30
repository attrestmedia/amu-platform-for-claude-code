"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCcw, Wand } from "lucide-react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  dialog,
} from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import { SMARTSTORE_PRODUCT_IMAGE_TEMPLATE_GROUP_KEY } from "consts/app";
import fetchClient from "libs/api/fetchClient";
import type { ImagePromptMetaType, ImageStudioDoneMetaType } from "types/app";
import { SmartstoreVariantReferenceStatus } from "./SmartstoreVariantReferenceStatus";
import { SmartstoreVariantResultGrid } from "./SmartstoreVariantResultGrid";
import {
  SMARTSTORE_IMAGE_VARIANT_OPTIONS,
  SMARTSTORE_POSE_PROXY_TEMPLATE_KEYS,
  type SmartstoreImagePreflightType,
  type SmartstoreImageVariantValueType,
} from "./smartstoreImageVariants";
import { useSmartstoreVariantReferenceImages } from "./useSmartstoreVariantReferences";

type ApiEnvelope<T = unknown> = { data?: T };

type SmartstoreVariantStudioSheetProps = {
  universeId: string;
  draftId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 시트를 연 시각. 이 시각 이후 생성분만 결과 후보로 본다.
   * 패널이 시트를 항상 렌더하므로 마운트 시각을 쓸 수 없고, 여는 이벤트에서 받아야 정확하다.
   */
  openedAt: number;
  /** 상품 사진 URL. 참조 번들의 상품 사진 슬롯을 채운다. */
  productPhotoUrls: string[];
  /** 킷 스펙 문서. 템플릿 변수로 주입한다. */
  templateVariables?: Readonly<Record<string, string>>;
  requiredTemplateVariableKeys?: readonly string[];
  lockedTemplateVariableKeys?: readonly string[];
  recommendedTemplateKeys?: readonly string[];
  onApplied: () => void | Promise<void>;
};

const RESULT_LIMIT = 12;

export function SmartstoreVariantStudioSheet({
  universeId,
  draftId,
  open,
  onOpenChange,
  openedAt,
  productPhotoUrls,
  templateVariables,
  requiredTemplateVariableKeys,
  lockedTemplateVariableKeys,
  recommendedTemplateKeys,
  onApplied,
}: SmartstoreVariantStudioSheetProps) {
  const [variant, setVariant] = useState<SmartstoreImageVariantValueType>("model_cut");
  // 같은 조건으로 새로 만들고 싶을 때 올리는 회차. 멱등 seed의 일부라 올려야 새 생성이 된다.
  const [attempt, setAttempt] = useState(1);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [appliedAssetIds, setAppliedAssetIds] = useState<string[]>([]);
  // 포즈 참조로 채택한 프록시 컷. 정체성은 kit이, 자세는 이 컷이 담당한다.
  const [poseProxyUrls, setPoseProxyUrls] = useState<string[]>([]);
  const [step, setStep] = useState<"variant" | "pose_proxy">("variant");
  /**
   * 이번 생성이 실제로 돌려준 자산.
   *
   * 서버가 예전 job을 재사용하면 그 자산은 생성 시각이 세션보다 앞서고, 유니버스 최신 목록
   * 페이지 밖으로 밀려 있을 수도 있다. 목록 조회에 의존하면 "받았는데 고를 수 없는" 상태가 되므로
   * 생성 결과가 준 메타를 그대로 후보에 합친다.
   */
  const [deliveredAssets, setDeliveredAssets] = useState<ImagePromptMetaType[]>([]);

  const variantOption = useMemo(
    () => SMARTSTORE_IMAGE_VARIANT_OPTIONS.find((option) => option.value === variant) || SMARTSTORE_IMAGE_VARIANT_OPTIONS[0],
    [variant],
  );

  /** 유료 생성 전에 참조 계약을 서버에서 판정받는다. 이 호출은 코인을 쓰지 않는다. */
  const preflightQuery = useQuery<SmartstoreImagePreflightType | null>({
    queryKey: [
      "commerce-image-preflight",
      universeId,
      draftId,
      variant,
      productPhotoUrls.join("|"),
      poseProxyUrls.join("|"),
    ],
    queryFn: async () => {
      const response = await fetchClient.post<ApiEnvelope<SmartstoreImagePreflightType>>(
        `/universe/${universeId}/commerce/drafts/${draftId}/image-preflight`,
        { variant, productPhotoUrls, poseProxyUrls },
      );
      return response?.data?.data || null;
    },
    enabled: open && !!universeId && !!draftId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const preflight = preflightQuery.data || null;
  const referenceReady = Boolean(preflight?.reference?.valid);

  // 판정된 참조 번들 그대로를 에디터 첨부 payload로 만든다. 판정과 첨부의 출처를 하나로 묶는 지점이다.
  const referenceItems = preflight?.reference?.items;
  const { productImages, modelImages, poseImages, loading: attachLoading, failedCount } =
    useSmartstoreVariantReferenceImages(referenceItems);
  // 에디터에는 함께 넘기지만, 최소 기준은 kit 참조만으로 판정한다.
  const editorModelImages = useMemo(() => [...modelImages, ...poseImages], [modelImages, poseImages]);

  // 첨부 결과에도 같은 최소 기준을 적용한다. 판정만 통과하고 첨부가 비면 생성을 열지 않는다.
  const attachmentReady =
    !attachLoading &&
    productImages.length >= (preflight?.spec?.productPhoto?.min ?? 1) &&
    modelImages.length >= (preflight?.spec?.modelKit?.min ?? 0) &&
    poseImages.length >= (preflight?.spec?.poseProxy?.min ?? 0);
  const generationReady = referenceReady && attachmentReady;

  const resultsQuery = useQuery<ImagePromptMetaType[]>({
    queryKey: ["commerce-variant-results", universeId, draftId, variant, step],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(
        `/lab/studio-images?scope=universe&universeId=${encodeURIComponent(universeId)}&includeMeta=true&limit=${RESULT_LIMIT}`,
        { cache: "no-store" },
      );
      return (response?.data?.data || []) as ImagePromptMetaType[];
    },
    enabled: open && !!universeId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const results = useMemo(() => {
    const deliveredIds = new Set(deliveredAssets.map((asset) => asset.assetId).filter(Boolean));
    // 목록 조회분 + 이번 생성이 돌려준 자산. 후자는 목록 페이지 밖일 수 있어 따로 합친다.
    const merged = [
      ...deliveredAssets,
      ...(resultsQuery.data || []).filter((asset) => !deliveredIds.has(asset.assetId)),
    ];
    return merged.filter((asset) => {
      // 결과 목록은 유니버스 전체 생성분이다. 단계에 맞지 않는 컷이 엉뚱한 슬롯 후보로 뜨지 않게 먼저 거른다.
      const isPoseProxyCut = SMARTSTORE_POSE_PROXY_TEMPLATE_KEYS.includes(String(asset.templateKey || ""));
      if (step === "pose_proxy" ? !isPoseProxyCut : isPoseProxyCut) return false;
      // 이번 생성이 실제로 돌려준 결과는 생성 시각과 무관하게 후보다(재사용된 job 포함).
      if (deliveredIds.has(asset.assetId)) return true;
      const createdAt = new Date(String(asset.createdAt || "")).getTime();
      return Number.isFinite(createdAt) && createdAt >= openedAt;
    });
  }, [resultsQuery.data, deliveredAssets, openedAt, step]);

  const handleGenerationDone = useCallback(
    async (_images: string[], _coins?: number, meta?: ImageStudioDoneMetaType) => {
      const delivered = (meta?.assets || []).filter((asset) => asset?.assetId && asset?.url);
      if (delivered.length > 0) {
        setDeliveredAssets((prev) => {
          const seen = new Set(prev.map((asset) => asset.assetId));
          return [...delivered.filter((asset) => !seen.has(asset.assetId)), ...prev];
        });
      }
      await resultsQuery.refetch();
    },
    [resultsQuery],
  );

  const applyMutation = useMutation({
    mutationFn: async (input: { assetId: string; checkedItemIds: string[] }) => {
      await fetchClient.post<ApiEnvelope>(`/universe/${universeId}/commerce/drafts/${draftId}/apply-asset`, {
        draftId,
        assetId: input.assetId,
        assetType: "image",
        // 대표·추가는 Smartstore payload role로, 모델컷·썸네일은 variant 그대로 보낸다.
        targetField: variantOption.targetField,
        variant,
        // 서버가 같은 계약으로 다시 판정한다. 화면 체크는 우회 수단이 아니라 같은 게이트의 앞단이다.
        consistencyChecklist: input.checkedItemIds,
      });
      return input.assetId;
    },
    onSuccess: async (assetId) => {
      setAppliedAssetIds((prev) => (prev.includes(assetId) ? prev : [...prev, assetId]));
      await onApplied();
    },
    onError: async (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        lang({ ko: "이미지를 적용하지 못했습니다.", en: "Could not apply the image." });
      await dialog.alert(message);
    },
  });

  const handleApply = useCallback(
    (assetId: string, checkedItemIds: string[]) => {
      applyMutation.mutate({ assetId, checkedItemIds });
    },
    [applyMutation],
  );

  const handleUsePoseProxy = useCallback((url: string) => {
    const trimmed = String(url || "").trim();
    if (!trimmed) return;
    // 포즈 프록시는 한 장이면 충분하다. 새로 고르면 이전 것을 대체한다.
    setPoseProxyUrls([trimmed]);
    setStep("variant");
  }, []);

  const toggleCompare = useCallback((assetId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(assetId)) return prev.filter((id) => id !== assetId);
      // 두 장까지만 나란히 본다. 그 이상은 비교가 아니라 목록이다.
      return prev.length >= 2 ? [prev[1], assetId] : [...prev, assetId];
    });
  }, []);

  const compareAssets = useMemo(
    () => compareIds.map((id) => results.find((asset) => asset.assetId === id)).filter(Boolean) as ImagePromptMetaType[],
    [compareIds, results],
  );

  const poseProxyAllowed = (preflight?.spec?.poseProxy?.max ?? 0) > 0;

  /**
   * 생성 멱등 seed (SSM-203).
   *
   * preflight의 `idempotencyKey`는 draft·revision·variant·참조 조합을 담는다. 여기에 회차를 붙이면
   * "같은 상품·같은 용도·같은 참조·같은 회차"가 하나의 생성이 된다. 실제 프롬프트·모델·비율은
   * Gen Studio가 이 seed에 더해 해시하므로, 설정을 바꾸면 다른 생성으로 갈라진다.
   */
  const generationIdempotencySeed = preflight?.idempotencyKey
    ? `${preflight.idempotencyKey}#${attempt === 1 ? "1" : `${openedAt}-${attempt}`}`
    : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        disableOutsideClick
        lockBodyScroll
        onFocusOutside={(event) => event.preventDefault()}
        className="flex h-[94vh] max-h-[94vh] w-full flex-col bg-surface p-0"
      >
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle>
            <Lang text={{ ko: "상품 이미지 생성", en: "Product image studio" }} />
          </SheetTitle>
          <SheetDescription>
            <Lang
              text={{
                ko: "용도를 먼저 고르면 필요한 참고 이미지를 확인한 뒤 생성할 수 있습니다. 결과는 직접 골라 적용합니다.",
                en: "Pick the purpose first, check the required references, then generate. You choose which result to apply.",
              }}
            />
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* 1. 용도 선택 */}
          <div className="rounded-2xl border border-border bg-background/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
              <Lang text={{ ko: "이미지 용도", en: "Image purpose" }} />
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {SMARTSTORE_IMAGE_VARIANT_OPTIONS.map((option) => {
                const active = option.value === variant;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    className={`rounded-[0.9rem] border p-3 text-left transition ${
                      active ? "border-primary bg-primary/10" : "border-border bg-surface hover:border-primary/60"
                    }`}
                    onClick={() => {
                      // 용도가 바뀌면 비교 선택도 의미가 없어진다. effect 대신 이벤트에서 함께 초기화한다.
                      setVariant(option.value);
                      setCompareIds([]);
                      setStep("variant");
                      // 포즈 프록시를 쓰지 않는 용도로 옮기면 선택을 비운다. 두면 "상한 초과로 제외" 안내가 뜬다.
                      if (option.value === "thumbnail") setPoseProxyUrls([]);
                    }}
                  >
                    <p className="text-sm font-semibold text-primary-text">
                      <Lang text={option.label} />
                    </p>
                    <p className="mt-1 line-clamp-2 text-xxs leading-4 text-secondary-text">
                      <Lang text={option.helper} />
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 참조 계약 판정 + 실제 첨부 현황 + 비용 고지 */}
          <SmartstoreVariantReferenceStatus
            loading={preflightQuery.isFetching}
            preflight={preflight}
            attachedProductCount={productImages.length}
            attachedModelCount={editorModelImages.length}
            attachLoading={attachLoading}
            attachFailedCount={failedCount}
            generationReady={generationReady}
            reuseGuaranteed={step === "variant" && Boolean(generationIdempotencySeed)}
          />

          {/* 3. 포즈 참조 — 정체성은 전용 모델이, 자세는 마네킹 프록시가 담당한다 */}
          {poseProxyAllowed ? (
            <div className="rounded-2xl border border-border bg-background/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary-text">
                    <Lang text={{ ko: "포즈 참조 (선택)", en: "Pose reference (optional)" }} />
                  </p>
                  <p className="mt-1 text-xxs leading-4 text-secondary-text">
                    <Lang
                      text={{
                        ko: "원하는 자세 사진을 무채색 마네킹으로 바꿔 참조로 넣으면, 얼굴은 전용 모델을 따르고 자세만 옮겨옵니다.",
                        en: "Turn a pose photo into a neutral mannequin and attach it: the face follows your store model, only the pose is transferred.",
                      }}
                    />
                  </p>
                </div>
                <Button
                  size="xs"
                  variant={step === "pose_proxy" ? "primary" : "outline"}
                  rounded="md"
                  onClick={() => setStep((prev) => (prev === "pose_proxy" ? "variant" : "pose_proxy"))}
                >
                  <Wand className="h-3.5 w-3.5" />
                  {step === "pose_proxy" ? (
                    <Lang text={{ ko: "포즈 참조 만들기 닫기", en: "Close pose reference" }} />
                  ) : (
                    <Lang text={{ ko: "포즈 참조 만들기", en: "Create pose reference" }} />
                  )}
                </Button>
              </div>
              {poseProxyUrls.length > 0 ? (
                <div className="mt-3 flex items-center gap-2">
                  <div className="relative h-16 w-12 overflow-hidden rounded-lg border border-primary/30 bg-background">
                    <Image src={poseProxyUrls[0]} alt="" fill unoptimized sizes="48px" className="object-cover" />
                  </div>
                  <Button size="xs" variant="outline" rounded="md" onClick={() => setPoseProxyUrls([])}>
                    <Lang text={{ ko: "포즈 참조 해제", en: "Remove pose reference" }} />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 4. 생성 — 참조 계약과 첨부가 모두 충족됐을 때만 연다 */}
          {step === "pose_proxy" ? (
            <ImageStudioEditor
              mode="universe"
              universeId={universeId}
              surface="embedded"
              detailPresentation="embedded"
              // 이 단계는 마네킹 프록시 중간자산 전용이라 그룹 스코프 대신 이 템플릿으로 좁힌다.
              allowedTemplateKeys={SMARTSTORE_POSE_PROXY_TEMPLATE_KEYS}
              recommendedTemplateKeys={SMARTSTORE_POSE_PROXY_TEMPLATE_KEYS}
              recommendedTemplateDescription={{
                ko: "자세를 옮겨올 원본 사진을 참고 이미지로 올리고 프레이밍을 고르세요.",
                en: "Attach the pose source photo as a reference and pick the framing.",
              }}
              onDone={handleGenerationDone}
            />
          ) : generationReady ? (
            <ImageStudioEditor
              mode="universe"
              universeId={universeId}
              surface="embedded"
              detailPresentation="embedded"
              templateGroupKey={SMARTSTORE_PRODUCT_IMAGE_TEMPLATE_GROUP_KEY}
              recommendedTemplateKeys={recommendedTemplateKeys}
              recommendedTemplateDescription={{
                ko: "선택한 용도에 맞는 템플릿을 고르세요. 참고 이미지는 이미 연결되어 있습니다.",
                en: "Pick a template for the selected purpose. References are already attached.",
              }}
              initialReferenceImages={productImages}
              initialModelImages={editorModelImages}
              initialTemplateVariables={templateVariables}
              initialAspectRatio={preflight?.spec?.aspectRatio}
              generationIdempotencySeed={generationIdempotencySeed}
              requiredTemplateVariableKeys={requiredTemplateVariableKeys}
              lockedTemplateVariableKeys={lockedTemplateVariableKeys}
              onDone={handleGenerationDone}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-secondary-text">
              <Lang
                text={{
                  ko: "참고 이미지 조건을 충족하면 생성 화면이 열립니다.",
                  en: "The generation panel opens once the reference requirements are met.",
                }}
              />
            </div>
          )}

          {/* 5. 결과 — 선택 적용 · 재생성 · 비교 */}
          <div className="rounded-2xl border border-border bg-background/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                {step === "pose_proxy" ? (
                  <Lang text={{ ko: "포즈 프록시 결과", en: "Pose proxy results" }} />
                ) : (
                  <Lang text={{ ko: "생성 결과", en: "Results" }} />
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  rounded="md"
                  onClick={() => void resultsQuery.refetch()}
                  loading={resultsQuery.isFetching}
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  <Lang text={{ ko: "새로고침", en: "Refresh" }} />
                </Button>
                {step === "variant" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    rounded="md"
                    onClick={() => setAttempt((prev) => prev + 1)}
                    title={lang({
                      ko: "같은 조건·같은 설정의 재요청은 이미 만든 결과를 다시 쓰고 코인을 다시 쓰지 않습니다. 같은 조건으로 새로 만들려면 회차를 올리세요.",
                      en: "Re-requesting the same setup reuses the existing result without spending coins again. Raise the round to generate anew with the same setup.",
                    })}
                  >
                    <Lang text={{ ko: `새로 만들기 (${attempt}회차)`, en: `New round (${attempt})` }} />
                  </Button>
                ) : null}
              </div>
            </div>

            {compareAssets.length === 2 ? (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2">
                {compareAssets.map((asset) => (
                  <div key={`compare-${asset.assetId}`} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-background">
                    {asset.url ? <Image src={asset.url} alt="" fill unoptimized sizes="320px" className="object-contain" /> : null}
                  </div>
                ))}
              </div>
            ) : null}

            <SmartstoreVariantResultGrid
              results={results}
              variantLabel={variantOption.label}
              requiredCheckItemIds={preflight?.consistency?.requiredItemIds || []}
              gateRequired={Boolean(preflight?.consistency?.gateRequired)}
              appliedAssetIds={appliedAssetIds}
              compareIds={compareIds}
              onToggleCompare={toggleCompare}
              onApply={handleApply}
              applyingAssetId={applyMutation.isPending ? applyMutation.variables?.assetId || null : null}
              poseProxyMode={step === "pose_proxy"}
              onUsePoseProxy={handleUsePoseProxy}
              poseProxyUrls={poseProxyUrls}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
