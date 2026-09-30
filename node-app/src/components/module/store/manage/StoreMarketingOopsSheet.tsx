"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import { ArrowRight, Check, FileText, Image as ImageIcon, Sparkles } from "lucide-react";
import { Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ContentStudioEditor } from "components/template/gen-studio/ContentStudioEditor";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import type { BaseImageType, ContentStudioDoneMetaType, ImagePromptMetaType, ImageStudioDoneMetaType } from "types/app";
import fetchClient from "libs/api/fetchClient";
import type { ICommerceProductDraft } from "types/commerce";
import { extractApiErrorMessage, toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { fetchRemoteImageAsBasePayload } from "utils/app/imageFile";
import { getDraftThumbnailUrl, getImageReferenceName, SMARTSTORE_IMAGE_RECOMMENDED_TEMPLATE_KEYS } from "./smartstoreDraftUtils";
import { MARKETING_SOCIAL_CONTENT_TEMPLATE_KEY } from "components/module/admin/third-party/marketing-operations/MarketingOpsConstants";

type StoreMarketingOopsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  universeId: string;
  draft: ICommerceProductDraft;
};

type CampaignForm = {
  campaignId: string;
  goal: string;
  target: string;
  message: string;
  startsAt: string;
  endsAt: string;
  revenuePath: string;
  channels: Array<"threads" | "instagram">;
};

type PromotionStudioAsset = {
  assetId: string;
  assetType: "content" | "image";
  templateKey?: string;
  url?: string;
};

type PromotionStep = "studio" | "campaign";

const CHANNEL_LABELS = {
  threads: { ko: "Threads", en: "Threads" },
  instagram: { ko: "Instagram", en: "Instagram" },
} as const;

function toDefaultCampaignId(draftId: string) {
  const suffix = draftId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "product";
  return `smartstore-${suffix}`;
}

function createInitialForm(draft: ICommerceProductDraft): CampaignForm {
  const title = draft.display?.title || draft.smartstore?.channelProductName || draft.smartstore?.productName || "";
  return {
    campaignId: toDefaultCampaignId(draft.draftId),
    goal: "상품의 사용 장면과 제작 근거를 소셜에서 검수한다.",
    target: "스마트스토어 상품에 관심 있는 1인 셀러·소규모 브랜드",
    message: title,
    startsAt: "",
    endsAt: "",
    revenuePath: "스마트스토어 상품 상세 페이지 방문",
    channels: ["threads", "instagram"],
  };
}

export function StoreMarketingOopsSheet({ open, onOpenChange, universeId, draft }: StoreMarketingOopsSheetProps) {
  const [form, setForm] = useState<CampaignForm>(() => createInitialForm(draft));
  const [step, setStep] = useState<PromotionStep>("studio");
  const [studioAssets, setStudioAssets] = useState<PromotionStudioAsset[]>([]);
  const [selectedStudioAssetIds, setSelectedStudioAssetIds] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<Array<BaseImageType & { preview?: string; name?: string }>>([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const productTitle = useMemo(
    () => draft.display?.title || draft.smartstore?.channelProductName || draft.smartstore?.productName || draft.draftId,
    [draft],
  );
  const isPublished = draft.status === "published";
  const productImageUrls = useMemo(() => {
    const urls = (Array.isArray(draft.smartstore?.images) ? draft.smartstore.images : [])
      .map((item) => toSafeString(toUnknownRecord(item).url).slice(0, 2000))
      .filter(Boolean);
    const thumbnail = getDraftThumbnailUrl(draft);
    return Array.from(new Set([thumbnail, ...urls].filter(Boolean))).slice(0, 4);
  }, [draft]);
  const selectedStudioAssets = useMemo(
    () => studioAssets.filter((asset) => selectedStudioAssetIds.includes(asset.assetId)),
    [selectedStudioAssetIds, studioAssets],
  );
  const setField = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrorMessage("");
  };
  const toggleChannel = (channel: "threads" | "instagram") => {
    setForm((previous) => {
      const channels = previous.channels.includes(channel)
        ? previous.channels.filter((item) => item !== channel)
        : [...previous.channels, channel];
      return { ...previous, channels };
    });
    setErrorMessage("");
  };

  useEffect(() => {
    if (!open || !productImageUrls.length) {
      return;
    }
    let cancelled = false;
    // 비동기 이미지 참조 로딩의 진행 상태를 외부 요청 lifecycle과 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReferenceLoading(true);
    void Promise.allSettled(
      productImageUrls.map(async (url) => {
        const requestUrl = /^https?:\/\//i.test(url) ? `/api/proxy/image?url=${encodeURIComponent(url)}` : url;
        const payload = await fetchRemoteImageAsBasePayload(requestUrl, getImageReferenceName(url));
        return { mimeType: payload.mimeType, data: payload.data, preview: payload.preview, name: getImageReferenceName(url) };
      }),
    ).then((results) => {
      if (cancelled) return;
      setReferenceImages(
        results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
      );
      setReferenceLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, productImageUrls]);

  const mergeStudioAssets = (nextAssets: PromotionStudioAsset[]) => {
    setStudioAssets((previous) => {
      const next = [...previous.filter((asset) => !nextAssets.some((item) => item.assetType === asset.assetType && item.assetId === asset.assetId)), ...nextAssets];
      return next.slice(-16);
    });
    setSelectedStudioAssetIds((previous) => Array.from(new Set([...previous, ...nextAssets.map((asset) => asset.assetId)])).slice(-16));
    setErrorMessage("");
  };

  const toggleStudioAsset = (assetId: string) => {
    setSelectedStudioAssetIds((previous) =>
      previous.includes(assetId) ? previous.filter((item) => item !== assetId) : [...previous, assetId],
    );
    setErrorMessage("");
  };

  const submit = async () => {
    if (!form.channels.length) {
      setErrorMessage(lang({ ko: "Threads 또는 Instagram을 하나 이상 선택해 주세요.", en: "Select Threads or Instagram." }));
      return;
    }
    if (!selectedStudioAssets.length) {
      setStep("studio");
      setErrorMessage(lang({ ko: "Gen Studio에서 생성한 소재를 하나 이상 선택해 주세요.", en: "Select at least one asset generated in Gen Studio." }));
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      const response = await fetchClient.post<{
        data?: { jobId?: string; status?: string };
      }>(`/universe/${encodeURIComponent(universeId)}/commerce/drafts/${encodeURIComponent(draft.draftId)}/marketing`, {
        campaignId: form.campaignId,
        goal: form.goal,
        target: form.target,
        message: form.message,
        period: {
          ...(form.startsAt ? { startsAt: new Date(`${form.startsAt}T00:00:00+09:00`).toISOString() } : {}),
          ...(form.endsAt ? { endsAt: new Date(`${form.endsAt}T23:59:59+09:00`).toISOString() } : {}),
        },
        channelPlan: { channels: form.channels },
        revenuePath: form.revenuePath,
        studioAssets: {
          contentAssetIds: selectedStudioAssets.filter((asset) => asset.assetType === "content").map((asset) => asset.assetId),
          imageAssetIds: selectedStudioAssets.filter((asset) => asset.assetType === "image").map((asset) => asset.assetId),
        },
      });
      const data = toUnknownRecord(response?.data?.data);
      const jobId = String(data.jobId || "").trim();
      if (!jobId) throw new Error("marketing_job_not_created");
      window.location.assign(
        `/marketing-oops/workspace?universeId=${encodeURIComponent(universeId)}&tab=review&jobId=${encodeURIComponent(jobId)}`,
      );
    } catch (error) {
      setErrorMessage(
        extractApiErrorMessage(
          error,
          lang({ ko: "Marketing Oops 연결에 실패했습니다. 정책과 상품 상태를 확인해 주세요.", en: "Marketing Oops could not be connected." }),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[calc(100%-1rem)] overflow-y-auto bg-surface p-0 sm:max-w-[38rem]">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="icon-sm" aria-hidden="true" />
            <Lang text={{ ko: "Marketing Oops 연결", en: "Connect Marketing Oops" }} />
          </SheetTitle>
          <SheetDescription>
            <Lang
              text={{
                ko: "상품 revision을 고정해 Threads·Instagram 콘텐츠 초안을 만들고, 운영자 검수 대기까지 연결합니다.",
                en: "Freeze the product revision, prepare Threads and Instagram drafts, and stop at operator review.",
              }}
            />
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-5">
          <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm">
            <p className="font-semibold text-primary-text">{productTitle}</p>
            <p className="mt-1 text-xs text-secondary-text">
              <Lang text={{ ko: `상품 revision ${draft.revision || 1} · ${draft.status}`, en: `Product revision ${draft.revision || 1} · ${draft.status}` }} />
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-background/70 p-2" role="tablist" aria-label={lang({ ko: "상품 홍보 단계", en: "Product promotion steps" })}>
            {(["studio", "campaign"] as const).map((item) => {
              const active = step === item;
              return (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStep(item)}
                  className={`min-h-11 rounded-xl px-3 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active ? "bg-primary text-primary-foreground" : "text-secondary-text hover:bg-surface"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    {item === "studio" ? <ImageIcon className="icon-xs" aria-hidden="true" /> : <Sparkles className="icon-xs" aria-hidden="true" />}
                    {item === "studio" ? lang({ ko: "1. Gen Studio 소재", en: "1. Gen Studio assets" }) : lang({ ko: "2. Marketing Oops", en: "2. Marketing Oops" })}
                  </span>
                  <span className="mt-1 block opacity-80">
                    {item === "studio" ? `${selectedStudioAssets.length}개 선택됨` : "캠페인·채널·검수 연결"}
                  </span>
                </button>
              );
            })}
          </div>

          {!isPublished ? (
            <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900" role="alert">
              <Lang
                text={{
                  ko: "스마트스토어에 등록된 상품만 연결할 수 있습니다. 먼저 상품을 반영하고 다시 시도하세요.",
                  en: "Only a published Smart Store product can be connected. Publish the product first.",
                }}
              />
            </div>
          ) : null}

          {step === "studio" ? (
            <div className="space-y-4" role="tabpanel">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-5 text-secondary-text">
                <p className="font-semibold text-primary-text">
                  <Lang text={{ ko: "상품 정보를 근거로 Gen Studio 소재를 준비합니다.", en: "Prepare Gen Studio assets grounded in this product." }} />
                </p>
                <p className="mt-1">
                  <Lang text={{ ko: "생성 결과를 선택한 뒤에만 Marketing Oops 작업이 만들어집니다. 상품 원문·가격·허용 claim은 서버 snapshot으로 고정됩니다.", en: "Marketing Oops is created only after you select generated results. Product facts, price, and allowed claims are locked by the server snapshot." }} />
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-primary-text">
                    <Lang text={{ ko: "상품 이미지 참조", en: "Product image references" }} />
                  </p>
                  <span className="text-xxs text-secondary-text">{referenceLoading ? "loading…" : `${referenceImages.length}개`}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-secondary-text">
                  <Lang text={{ ko: "Gen Studio 이미지 생성 시 기존 상품 이미지를 참조로 전달합니다.", en: "Existing product images are passed as references for Gen Studio image generation." }} />
                </p>
                {referenceImages.length ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {referenceImages.map((image) =>
                      image.preview ? (
                        <NextImage key={image.name} src={image.preview} alt={image.name || "product reference"} width={64} height={64} unoptimized className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                      ) : null,
                    )}
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-border bg-background/70 p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary-text">
                  <FileText className="icon-sm" aria-hidden="true" />
                  <Lang text={{ ko: "소셜 문구", en: "Social copy" }} />
                </div>
                <ContentStudioEditor
                  mode="universe"
                  universeId={universeId}
                  surface="embedded"
                  detailPresentation="embedded"
                  initialTemplateKey={MARKETING_SOCIAL_CONTENT_TEMPLATE_KEY}
                  preferredTemplateKeys={[MARKETING_SOCIAL_CONTENT_TEMPLATE_KEY]}
                  allowedTemplateKeys={[MARKETING_SOCIAL_CONTENT_TEMPLATE_KEY]}
                  recommendedTemplateKeys={[MARKETING_SOCIAL_CONTENT_TEMPLATE_KEY]}
                  onDone={(_contents, _coins, meta?: ContentStudioDoneMetaType) => {
                    const ids = (meta?.assetIds || []).map((assetId) => toSafeString(assetId).slice(0, 160)).filter(Boolean);
                    mergeStudioAssets(ids.map((assetId) => ({ assetId, assetType: "content", templateKey: meta?.templateKey })));
                  }}
                />
              </div>
              <div className="rounded-2xl border border-border bg-background/70 p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary-text">
                  <ImageIcon className="icon-sm" aria-hidden="true" />
                  <Lang text={{ ko: "소셜 이미지", en: "Social image" }} />
                </div>
                <ImageStudioEditor
                  mode="universe"
                  universeId={universeId}
                  surface="embedded"
                  detailPresentation="embedded"
                  initialReferenceImages={referenceImages}
                  recommendedTemplateKeys={SMARTSTORE_IMAGE_RECOMMENDED_TEMPLATE_KEYS}
                  recommendedTemplateDescription={{
                    ko: "상품 홍보용 모델컷·상세·라이프스타일 템플릿입니다.",
                    en: "Templates for product model, detail, and lifestyle promotion images.",
                  }}
                  generationIdempotencySeed={`${draft.draftId}:${draft.revision || 1}:promotion`}
                  onDone={(_images, _coins, meta?: ImageStudioDoneMetaType) => {
                    const assets = (meta?.assets || []).map((asset: ImagePromptMetaType) => ({
                      assetId: toSafeString(asset.assetId).slice(0, 160),
                      assetType: "image" as const,
                      templateKey: asset.templateKey || meta?.templateKey,
                      url: asset.url,
                    })).filter((asset) => asset.assetId);
                    mergeStudioAssets(assets);
                  }}
                />
              </div>
              {studioAssets.length ? (
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-primary-text"><Lang text={{ ko: "Marketing Oops로 넘길 소재 선택", en: "Select assets for Marketing Oops" }} /></p>
                    <span className="text-xxs text-secondary-text">{selectedStudioAssets.length}/{studioAssets.length}</span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {studioAssets.map((asset) => {
                      const selected = selectedStudioAssetIds.includes(asset.assetId);
                      return (
                        <button
                          key={`${asset.assetType}:${asset.assetId}`}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleStudioAsset(asset.assetId)}
                          className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary-text"}`}
                        >
                          {selected ? <Check className="icon-xs shrink-0" aria-hidden="true" /> : <span className="h-3 w-3 shrink-0 rounded-full border border-current" />}
                          <span className="min-w-0 truncate">{asset.assetType === "image" ? "image" : "copy"} · {asset.templateKey || asset.assetId}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <Button className="min-h-11 w-full" onClick={() => setStep("campaign")} disabled={!selectedStudioAssets.length}>
                <Lang text={{ ko: "선택한 소재로 캠페인 설정", en: "Configure campaign with selected assets" }} />
                <ArrowRight className="ml-2 icon-sm" aria-hidden="true" />
              </Button>
            </div>
          ) : null}

          {step === "campaign" ? <div className="space-y-4" role="tabpanel">
            <div>
              <Label htmlFor="store-marketing-campaign-id">campaignId</Label>
              <Input
                id="store-marketing-campaign-id"
                value={form.campaignId}
                onChange={(event) => setField("campaignId", event.target.value)}
                maxLength={120}
                className="mt-1.5 min-h-11"
                aria-describedby="store-marketing-campaign-id-help"
              />
              <p id="store-marketing-campaign-id-help" className="mt-1 text-xs text-secondary-text">
                <Lang text={{ ko: "같은 상품 revision·채널의 active job은 중복 생성하지 않습니다.", en: "Active jobs for the same product revision and channels are deduplicated." }} />
              </p>
            </div>
            <div>
              <Label htmlFor="store-marketing-goal">goal</Label>
              <Textarea id="store-marketing-goal" value={form.goal} onChange={(event) => setField("goal", event.target.value)} rows={2} maxLength={1000} className="mt-1.5 resize-y" />
            </div>
            <div>
              <Label htmlFor="store-marketing-target">target</Label>
              <Textarea id="store-marketing-target" value={form.target} onChange={(event) => setField("target", event.target.value)} rows={2} maxLength={1000} className="mt-1.5 resize-y" />
            </div>
            <div>
              <Label htmlFor="store-marketing-message">message</Label>
              <Textarea id="store-marketing-message" value={form.message} onChange={(event) => setField("message", event.target.value)} rows={3} maxLength={2000} className="mt-1.5 resize-y" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="store-marketing-start">period 시작일</Label>
                <Input id="store-marketing-start" type="date" value={form.startsAt} onChange={(event) => setField("startsAt", event.target.value)} className="mt-1.5 min-h-11" />
              </div>
              <div>
                <Label htmlFor="store-marketing-end">period 종료일</Label>
                <Input id="store-marketing-end" type="date" value={form.endsAt} onChange={(event) => setField("endsAt", event.target.value)} className="mt-1.5 min-h-11" />
              </div>
            </div>
            <div>
              <Label htmlFor="store-marketing-revenue-path">revenuePath</Label>
              <Textarea id="store-marketing-revenue-path" value={form.revenuePath} onChange={(event) => setField("revenuePath", event.target.value)} rows={2} maxLength={1000} className="mt-1.5 resize-y" />
            </div>
          </div> : null}

          {step === "campaign" ? <fieldset>
            <legend className="text-sm font-medium text-primary-text">
              <Lang text={{ ko: "Pre-Fit 채널 선택", en: "Pre-Fit channels" }} />
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(["threads", "instagram"] as const).map((channel) => {
                const selected = form.channels.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleChannel(channel)}
                    className={`flex min-h-11 items-center justify-between rounded-xl border px-4 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-secondary-text"
                    }`}
                  >
                    <Lang text={CHANNEL_LABELS[channel]} />
                    {selected ? <Check className="icon-sm" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-5 text-secondary-text">
              <Lang text={{ ko: "서버가 최신 uploadPolicy를 확인할 수 없는 경우 작업을 만들지 않습니다.", en: "The server fails closed when the latest upload policy is unavailable." }} />
            </p>
          </fieldset> : null}

          {errorMessage ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive" role="alert" aria-live="assertive">
              {errorMessage}
            </p>
          ) : null}

          {step === "campaign" ? <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-5 text-secondary-text">
            <Lang text={{ ko: "콘텐츠 생성은 local agent에서 수행되며, 사람 검수 전에는 예약·발행되지 않습니다.", en: "Generation runs through the local agent and is never scheduled or published before human review." }} />
          </div> : null}

          {step === "campaign" ? <Button className="min-h-11 w-full" onClick={() => void submit()} disabled={!isPublished || submitting} loading={submitting}>
            <Lang text={{ ko: "Marketing Oops 작업 만들기", en: "Create Marketing Oops job" }} />
            <ArrowRight className="ml-2 icon-sm" aria-hidden="true" />
          </Button> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
