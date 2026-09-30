import type { Dispatch, SetStateAction } from "react";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import { lang } from "components/module/i18n";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@amu-labs/ui";
import type { ImageStudioDoneMetaType } from "types/app";
import { X } from "lucide-react";
import { getPromoSlotDefinition, type PromoAxis, type PromoSlotId } from "./PromoCreativeDomain";

const PROMO_TEMPLATE_KEYS = ["amu-service-promo-keyvisual-v2", "promo-banner-genstudio-v1"] as const;

function getTemplateVariables(axis: PromoAxis, slotIds: readonly PromoSlotId[]) {
  const slot = getPromoSlotDefinition(slotIds[0]);
  const serviceAxis = axis === "genstudio" ? "Gen Studio" : axis === "tutors" ? "Tutors" : axis === "play" ? "Play" : "";
  const v2Layout =
    slot?.layout === "portrait"
      ? "세로 슬롯 4:5"
      : slot?.layout === "card"
        ? "카드 4:3"
        : slot?.layout === "hero"
          ? "홈 히어로 3:2"
          : "와이드 슬롯 3:1";
  const legacyLayout =
    slot?.layout === "portrait"
      ? "세로 스카이스크래퍼 300x600"
      : slot?.layout === "card"
        ? "정사각 카드 1080x1080"
        : "가로 와이드 1200x400";

  return {
    ...(serviceAxis ? { "서비스 축": serviceAxis } : {}),
    레이아웃: v2Layout,
    "카피 위치": "왼쪽",
    "슬롯 규격": legacyLayout,
    "카피 여백": "왼쪽",
  };
}

export function PromoCreativeStudioSheet({
  open,
  setOpen,
  universeId,
  axis,
  slotIds,
  presentation = "sheet",
  onDone,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  universeId: string;
  axis: PromoAxis;
  slotIds: PromoSlotId[];
  presentation?: "sheet" | "embedded";
  onDone: (images: string[], meta?: ImageStudioDoneMetaType) => void;
}) {
  const slot = getPromoSlotDefinition(slotIds[0]);
  const editorKey = `${axis}:${slotIds.join(",")}`;
  const editor = (
    <ImageStudioEditor
      key={editorKey}
      mode="universe"
      universeId={universeId}
      surface="embedded"
      detailPresentation="embedded"
      allowedTemplateKeys={PROMO_TEMPLATE_KEYS}
      preferredTemplateKeys={PROMO_TEMPLATE_KEYS}
      initialTemplateVariables={getTemplateVariables(axis, slotIds)}
      initialOutputVisibility="public"
      onDone={(images, _coins, meta) => onDone(images, meta)}
    />
  );

  if (presentation === "embedded") {
    return open ? (
      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-background/70">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-primary-text">
              {lang({ ko: "배너 이미지 제작", en: "Create banner image" })}
            </h3>
            <p className="mt-1 text-xs text-secondary-text">
              {lang({
                ko: `${slot?.label.ko || "선택한 슬롯"}의 ${slot?.ratio || "권장"} 규격을 시작값으로 전달합니다.`,
                en: `Starts from the ${slot?.ratio || "recommended"} layout for ${slot?.label.en || "the selected slot"}.`,
              })}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-lg text-secondary-text transition hover:bg-muted hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => setOpen(false)}
            aria-label={lang({ ko: "배너 이미지 제작 닫기", en: "Close banner image studio" })}
          >
            <X className="icon-sm" />
          </button>
        </div>
        <div className="p-4">{editor}</div>
      </section>
    ) : null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="h-[min(92vh,58rem)] rounded-t-2xl border-t border-border bg-background p-0 text-primary-text"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border bg-background px-4 py-4 text-left">
            <SheetTitle>{lang({ ko: "배너 이미지 제작", en: "Create banner image" })}</SheetTitle>
            <p className="text-sm text-secondary-text">
              {lang({
                ko: `${slot?.label.ko || "선택한 슬롯"}의 ${slot?.ratio || "권장"} 규격을 시작값으로 전달합니다. 생성 확정 시 Gen Studio 코인이 차감됩니다.`,
                en: `Starts from the ${slot?.ratio || "recommended"} layout for ${slot?.label.en || "the selected slot"}. Gen Studio coins are charged only after generation confirmation.`,
              })}
            </p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {editor}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
