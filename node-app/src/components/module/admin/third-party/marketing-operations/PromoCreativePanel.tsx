"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toast } from "sonner";
import { toSafeString } from "utils/common/typeUtils";
import type { ImageStudioDoneMetaType } from "types/app";
import { MARKETING_TAB_HEADER_CLASS } from "./MarketingOpsConstants";
import {
  PROMO_SLOT_DEFINITIONS,
  PROMO_REVIEW_ISSUE_LABELS,
  createEmptyPromoForm,
  toIsoDateTime,
  toLocalDateTime,
  type PromoForm,
  type PromoItem,
  type PromoSlotId,
  type PromoStatus,
} from "./PromoCreativeDomain";
import { PromoCreativeEditor } from "./PromoCreativeEditor";
import { PromoCreativeStudioSheet } from "./PromoCreativeStudioSheet";

const API = "/marketing/promo-creatives";

function getError(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return toSafeString(response?.data?.error) || fallback;
  }
  return fallback;
}

function readImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    if (!url || typeof window === "undefined") return resolve({ width: 0, height: 0 });
    const image = new window.Image();
    let settled = false;
    const finish = (dimensions: { width: number; height: number }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(dimensions);
    };
    const timeoutId = window.setTimeout(() => finish({ width: 0, height: 0 }), 5_000);
    image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => finish({ width: 0, height: 0 });
    image.src = url;
  });
}

export function PromoCreativePanel({
  universeId,
  studioPresentation = "sheet",
}: {
  universeId?: string;
  studioPresentation?: "sheet" | "embedded";
}) {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [form, setForm] = useState<PromoForm>(() => createEmptyPromoForm());
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState("");
  const [studioOpen, setStudioOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const safeUniverseId = toSafeString(universeId);

  const load = useCallback(async () => {
    if (!safeUniverseId) return setItems([]);
    setBusy("load");
    try {
      const response = await fetchClient.get<{ data?: PromoItem[] }>(API, { params: { universeId: safeUniverseId } });
      setItems(response.data?.data || []);
    } catch (error) {
      toast.error(
        getError(error, lang({ ko: "프로모션 목록을 불러오지 못했습니다.", en: "Failed to load promotions." })),
      );
    } finally {
      setBusy("");
    }
  }, [safeUniverseId]);

  useEffect(() => {
    // 외부 API 결과를 현재 universe scope의 로컬 운영 목록과 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const syncImageDimensions = useCallback(async (imageUrl: string) => {
    const url = imageUrl.trim();
    const dimensions = await readImageDimensions(url);
    setForm((current) =>
      current.imageUrl.trim() === url
        ? { ...current, imageWidth: dimensions.width, imageHeight: dimensions.height }
        : current,
    );
    return dimensions;
  }, []);

  const save = async () => {
    if (!safeUniverseId) return;
    setBusy("save");
    try {
      const dimensions =
        form.imageUrl && (!form.imageWidth || !form.imageHeight)
          ? await readImageDimensions(form.imageUrl.trim())
          : { width: form.imageWidth, height: form.imageHeight };
      await fetchClient.post(API, {
        action: "save",
        universeId: safeUniverseId,
        creativeId: editingId || undefined,
        creative: {
          campaignId: form.campaignId,
          axis: form.axis,
          variant: form.variant,
          slotIds: form.slotIds,
          targeting: {
            includeCategories: form.includeCategories,
            excludeCategories: form.excludeCategories,
            tags: form.tags,
          },
          period: { startsAt: toIsoDateTime(form.startsAt), endsAt: toIsoDateTime(form.endsAt) },
          creative: {
            label: form.label,
            headline: form.headline,
            body: form.body,
            ctaLabel: form.ctaLabel,
            landingUrl: form.landingUrl,
            imageUrl: form.imageUrl,
            imageAssetId: form.imageAssetId,
            imageWidth: dimensions.width,
            imageHeight: dimensions.height,
            templateKey: form.templateKey,
          },
        },
      });
      toast.success(lang({ ko: "프로모션 초안을 저장했습니다.", en: "Promotion draft saved." }));
      setEditingId("");
      setForm(createEmptyPromoForm());
      await load();
    } catch (error) {
      toast.error(
        getError(error, lang({ ko: "프로모션 초안을 저장하지 못했습니다.", en: "Failed to save promotion." })),
      );
    } finally {
      setBusy("");
    }
  };

  const transition = async (item: PromoItem, nextStatus: PromoStatus) => {
    if (nextStatus === "active") {
      const confirmed = await dialog.confirm({
        title: lang({ ko: "프로모션 활성화", en: "Activate promotion" }),
        message: lang({
          ko: "이 소재를 즉시 AMU Magazine에 노출할까요? 활성화는 광고 소재의 최종 승인으로 기록됩니다.",
          en: "Feature this creative on AMU Magazine now? Activating serves as final approval.",
        }),
      });
      if (!confirmed) return;
    }
    setBusy(`${item.creativeId}:${nextStatus}`);
    try {
      const response = await fetchClient.post<{
        cachePurge?: { ok?: boolean; error?: string; skipped?: boolean };
      }>(API, {
        action: "transition",
        universeId: safeUniverseId,
        creativeId: item.creativeId,
        nextStatus,
      });
      if (response.data?.cachePurge?.ok === false) {
        toast.warning(
          lang({
            ko: "상태는 변경했지만 매거진 캐시 갱신에 실패했습니다. 운영 노출이 잠시 지연될 수 있습니다.",
            en: "The status changed, but the magazine cache refresh failed. The live update may be delayed.",
          }),
        );
      } else {
        toast.success(lang({ ko: "프로모션 상태를 변경했습니다.", en: "Promotion status updated." }));
      }
      await load();
    } catch (error) {
      toast.error(getError(error, lang({ ko: "상태를 변경하지 못했습니다.", en: "Failed to update status." })));
    } finally {
      setBusy("");
    }
  };

  // 노출 중(active)인 소재는 먼저 일시중지해 매거진 노출을 끊은 뒤에만 삭제할 수 있다.
  const remove = async (item: PromoItem) => {
    const confirmed = await dialog.confirm({
      title: lang({ ko: "프로모션 소재 삭제", en: "Delete promotion creative" }),
      message: lang({
        ko: `"${item.creative.label || item.creative.headline}" 소재를 원장에서 삭제할까요? 되돌릴 수 없습니다. 업로드한 이미지 파일은 다른 소재가 함께 쓸 수 있어 지우지 않습니다.`,
        en: `Delete "${item.creative.label || item.creative.headline}" from the ledger? This cannot be undone. The uploaded image file is kept because other creatives may reuse it.`,
      }),
      variant: "danger",
      confirmLabel: lang({ ko: "삭제", en: "Delete" }),
    });
    if (!confirmed) return;
    setBusy(`${item.creativeId}:delete`);
    try {
      await fetchClient.post(API, { action: "delete", universeId: safeUniverseId, creativeId: item.creativeId });
      if (editingId === item.creativeId) {
        setEditingId("");
        setForm(createEmptyPromoForm());
      }
      toast.success(lang({ ko: "프로모션 소재를 삭제했습니다.", en: "Promotion creative deleted." }));
      await load();
    } catch (error) {
      toast.error(getError(error, lang({ ko: "소재를 삭제하지 못했습니다.", en: "Failed to delete the creative." })));
    } finally {
      setBusy("");
    }
  };

  const edit = (item: PromoItem) => {
    setEditingId(item.creativeId);
    setForm({
      ...createEmptyPromoForm(),
      campaignId: item.campaignId,
      axis: item.axis,
      variant: item.variant,
      slotIds: item.slotIds,
      label: item.creative.label || "",
      headline: item.creative.headline,
      body: item.creative.body,
      ctaLabel: item.creative.ctaLabel,
      landingUrl: item.creative.landingUrl,
      imageUrl: item.creative.imageUrl || "",
      imageAssetId: item.creative.imageAssetId || "",
      imageWidth: item.creative.imageWidth || 0,
      imageHeight: item.creative.imageHeight || 0,
      templateKey: item.creative.templateKey || "",
      includeCategories: item.targeting?.includeCategories?.join(", ") || "",
      excludeCategories: item.targeting?.excludeCategories?.join(", ") || "",
      tags: item.targeting?.tags?.join(", ") || "",
      startsAt: toLocalDateTime(item.period?.startsAt),
      endsAt: toLocalDateTime(item.period?.endsAt),
    });
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const startForSlot = (slotId: PromoSlotId) => {
    setEditingId("");
    setForm(createEmptyPromoForm(slotId));
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const handleStudioDone = (images: string[], meta?: ImageStudioDoneMetaType) => {
    const imageUrl = toSafeString(images[0]);
    if (!imageUrl) return;
    setForm((current) => ({
      ...current,
      imageUrl,
      imageAssetId: "",
      imageWidth: 0,
      imageHeight: 0,
      templateKey: toSafeString(meta?.templateKey) || current.templateKey,
    }));
    setStudioOpen(false);
    void syncImageDimensions(imageUrl);
    toast.success(
      lang({
        ko: "생성 이미지를 현재 소재에 연결했습니다. 초안을 저장해 주세요.",
        en: "Generated image attached. Save the draft to keep it.",
      }),
    );
  };

  const uploadImage = async (file: File) => {
    if (!safeUniverseId) return;
    setBusy("upload");
    try {
      const payload = new FormData();
      payload.set("file", file);
      payload.set("universeId", safeUniverseId);
      const response = await fetch("/api/marketing/promo-assets", {
        method: "POST",
        body: payload,
        credentials: "include",
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: { url?: string; assetId?: string; width?: number; height?: number };
      };
      if (!response.ok || !result.success || !result.data?.url)
        throw new Error(result.error || "promo_image_upload_failed");
      setForm((current) => ({
        ...current,
        imageUrl: result.data?.url || "",
        imageAssetId: result.data?.assetId || "",
        imageWidth: Number(result.data?.width || 0),
        imageHeight: Number(result.data?.height || 0),
        templateKey: "",
      }));
      toast.success(lang({ ko: "이미지를 R2에 업로드했습니다.", en: "Image uploaded to R2." }));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang({ ko: "이미지 업로드에 실패했습니다.", en: "Image upload failed." }),
      );
    } finally {
      setBusy("");
    }
  };

  const coverage = useMemo(
    () =>
      PROMO_SLOT_DEFINITIONS.map((slot) => {
        const slotItems = items.filter((item) => item.status !== "closed" && item.slotIds.includes(slot.id));
        return {
          slot,
          active: slotItems.filter((item) => item.status === "active").length,
          pending: slotItems.filter((item) => item.status === "draft" || item.status === "review").length,
          paused: slotItems.filter((item) => item.status === "paused").length,
        };
      }),
    [items],
  );

  if (!safeUniverseId) {
    return (
      <div className="rounded-xl border border-border p-5 text-sm text-secondary-text">
        <Lang
          text={{ ko: "프로모션을 운영할 유니버스를 선택해 주세요.", en: "Select a universe to operate promotions." }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PromoCreativeStudioSheet
        open={studioOpen}
        setOpen={setStudioOpen}
        universeId={safeUniverseId}
        axis={form.axis}
        slotIds={form.slotIds}
        presentation={studioPresentation}
        onDone={handleStudioDone}
      />

      <header className={MARKETING_TAB_HEADER_CLASS}>
        <div>
          <h3 className="font-semibold">
            <Lang text={{ ko: "매거진 프로모션 슬롯", en: "Magazine promotion slots" }} />
          </h3>
          <p className="mt-1 text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "광고 소재·카피·타겟을 한 곳에서 만들고 검수한 뒤 활성화합니다. WordPress는 활성 소재만 표시합니다.",
                en: "Create, review, and activate media, copy, and targeting in one place. WordPress renders active creatives only.",
              }}
            />
          </p>
        </div>
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => void load()} disabled={!!busy}>
          <RefreshCw className={busy === "load" ? "icon-xxs animate-spin" : "icon-xxs"} />
          <Lang text={{ ko: "새로고침", en: "Refresh" }} />
        </Button>
      </header>

      <section aria-labelledby="promo-coverage-title">
        <div className="mb-3">
          <h4 id="promo-coverage-title" className="font-semibold">
            <Lang text={{ ko: "슬롯 운영 현황", en: "Slot coverage" }} />
          </h4>
          <p className="mt-1 text-xs text-secondary-text">
            <Lang
              text={{
                ko: "활성 소재가 0개인 슬롯은 매거진에 광고 영역을 만들지 않습니다.",
                en: "Slots with no active creative do not render an ad area in the magazine.",
              }}
            />
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {coverage.map(({ slot, active, pending, paused }) => (
            <article key={slot.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">
                      <Lang text={slot.label} />
                    </strong>
                    <Badge variant={active ? "outline" : "outlineMuted"} size="xs">
                      {slot.ratio}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-secondary-text">
                    <Lang text={slot.placement} />
                  </p>
                </div>
                <Badge variant={active ? "outline" : "outlineMuted"} size="xs">
                  {active ? `active ${active}` : "inactive"}
                </Badge>
              </div>
              <p className="mt-3 text-xs text-muted-text">
                review/draft {pending} · paused {paused}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 min-h-11 w-full"
                onClick={() => startForSlot(slot.id)}
                disabled={!!busy}
              >
                <ImagePlus className="icon-xxs" />
                <Lang text={{ ko: "이 슬롯 소재 만들기", en: "Create for this slot" }} />
              </Button>
            </article>
          ))}
        </div>
      </section>

      <div ref={editorRef}>
        <PromoCreativeEditor
          form={form}
          editingId={editingId}
          busy={!!busy}
          onChange={setForm}
          onSave={() => void save()}
          onCancel={() => {
            setEditingId("");
            setForm(createEmptyPromoForm());
          }}
          onOpenStudio={() => setStudioOpen(true)}
          onUploadImage={(file) => void uploadImage(file)}
          onImageUrlBlur={() => void syncImageDimensions(form.imageUrl)}
        />
      </div>

      <section className="space-y-3" aria-labelledby="promo-list-title">
        <h4 id="promo-list-title" className="font-semibold">
          <Lang text={{ ko: "저장된 소재", en: "Saved creatives" }} />
        </h4>
        {items.length ? (
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => (
              <article key={item.creativeId} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  {item.creative.imageUrl ? (
                    <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg bg-muted/40 md:w-40">
                      <Image
                        src={item.creative.imageUrl}
                        alt=""
                        fill
                        sizes="10rem"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2">
                        <strong>{item.creative.headline}</strong>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" size="xs">
                            {item.status}
                          </Badge>
                          <Badge variant="outlineMuted" size="xs">
                            {item.variant}
                          </Badge>
                          <Badge variant="outlineMuted" size="xs">
                            {item.review?.level || "L2"}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-secondary-text">
                        {item.creative.label || lang({ ko: "라벨 없음", en: "No label" })} · {item.campaignId}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-secondary-text">{item.creative.body}</p>
                      <p className="mt-2 break-words font-mono text-[11px] text-muted-text">
                        {item.slotIds.join(", ")}
                        {item.creative.templateKey ? ` · ${item.creative.templateKey}` : ""}
                      </p>
                      {item.review?.issues?.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-600">
                          {item.review.issues.map((issue) => (
                            <li key={issue}>
                              <Lang text={PROMO_REVIEW_ISSUE_LABELS[issue] || { ko: issue, en: issue }} />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button variant="outline" size="sm" rounded="full" onClick={() => edit(item)} disabled={!!busy}>
                        <Lang text={{ ko: "편집", en: "Edit" }} />
                      </Button>
                      {item.status === "draft" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          rounded="full"
                          onClick={() => void transition(item, "review")}
                          disabled={!!busy}
                        >
                          <Lang text={{ ko: "검수 요청", en: "Request review" }} />
                        </Button>
                      ) : null}
                      {(["review", "paused"] as PromoStatus[]).includes(item.status) ? (
                        <Button
                          size="sm"
                          rounded="full"
                          onClick={() => void transition(item, "active")}
                          disabled={!!busy}
                        >
                          <Lang text={{ ko: "활성화", en: "Activate" }} />
                        </Button>
                      ) : null}
                      {item.status === "active" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          rounded="full"
                          onClick={() => void transition(item, "paused")}
                          disabled={!!busy}
                        >
                          <Lang text={{ ko: "일시중지", en: "Pause" }} />
                        </Button>
                      ) : null}
                      {item.status === "active" ? null : (
                        <Button
                          variant="outlineDestructive"
                          size="sm"
                          rounded="full"
                          onClick={() => void remove(item)}
                          disabled={!!busy}
                        >
                          <Trash2 className="icon-xxs" />
                          <Lang text={{ ko: "삭제", en: "Delete" }} />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-secondary-text">
            <Lang text={{ ko: "저장된 프로모션 소재가 없습니다.", en: "No promotion creatives saved." }} />
          </div>
        )}
      </section>
    </div>
  );
}
