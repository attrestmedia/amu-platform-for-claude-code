import type { Dispatch, SetStateAction } from "react";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import { Lang, lang } from "components/module/i18n";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, Textarea } from "@amu-labs/ui";
import { X } from "lucide-react";
import type { ImageStudioDoneMetaType } from "types/app";
import type { MarketingImageStudioTarget, MarketingTemplateOption } from "./MarketingOpsTypes";
import { getChannelLabel, getTemplateLabel, getTemplatePreviewText, toSafeString } from "./MarketingOpsUtils";

export type MarketingTemplatePreviewState = {
  type: "content" | "image";
  item: MarketingTemplateOption;
} | null;

export function MarketingTemplatePreviewSheet({
  preview,
  onClose,
}: {
  preview: MarketingTemplatePreviewState;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!preview} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[min(85vh,42rem)] rounded-t-2xl border-t border-border bg-background p-0 text-primary-text"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border bg-background/95 px-4 py-4 text-left">
            <SheetTitle>
              {preview?.type === "image"
                ? lang({ ko: "이미지 템플릿 내용", en: "Image template detail" })
                : lang({ ko: "콘텐츠 템플릿 내용", en: "Content template detail" })}
            </SheetTitle>
            <p className="text-sm text-secondary-text">{getTemplateLabel(preview?.item || {})}</p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {preview?.item?.categories?.length ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {preview.item.categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-border bg-muted/30 px-2 py-1 text-xs text-secondary-text"
                  >
                    {category}
                  </span>
                ))}
              </div>
            ) : null}
            <Textarea rows={18} value={getTemplatePreviewText(preview?.item)} readOnly />
            {preview?.item?.tags?.length ? (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                tags: {preview.item.tags.map((tag) => toSafeString(tag)).filter(Boolean).join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MarketingImageStudioSheet({
  target,
  universeId,
  initialQuery,
  setTarget,
  presentation = "sheet",
  onDone,
}: {
  target: MarketingImageStudioTarget | null;
  universeId: string;
  initialQuery: string;
  setTarget: Dispatch<SetStateAction<MarketingImageStudioTarget | null>>;
  presentation?: "sheet" | "embedded";
  onDone: (images: string[], meta?: ImageStudioDoneMetaType) => void;
}) {
  const editor = universeId ? (
    <ImageStudioEditor
      mode="universe"
      universeId={universeId}
      surface="embedded"
      detailPresentation="embedded"
      initialQuery={initialQuery}
      onDone={(images, _coins, meta) => onDone(images, meta)}
    />
  ) : (
    <p className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
      <Lang
        text={{
          ko: "이미지를 생성할 유니버스 정보가 없습니다.",
          en: "No universe is available for image generation.",
        }}
      />
    </p>
  );

  const sheetBody = (
    <>
      <SheetHeader className="border-b border-border bg-background/95 px-4 py-4 text-left">
        <SheetTitle>{lang({ ko: "마케팅 이미지 생성", en: "Marketing image generation" })}</SheetTitle>
        <p className="text-sm text-secondary-text">
          {target?.channel
            ? lang({
                ko: `${getChannelLabel(target.channel)} draft에 생성 이미지를 연결합니다.`,
                en: "Generated images will be attached to this channel draft.",
              })
            : lang({
                ko: "생성 이미지를 현재 job의 전체 소셜 채널 draft에 연결합니다.",
                en: "Generated images will be attached to all channel drafts in this job.",
              })}
        </p>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{editor}</div>
    </>
  );

  if (presentation === "embedded") {
    return target ? (
      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-background/70">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-primary-text">
              {lang({ ko: "마케팅 이미지 생성", en: "Marketing image generation" })}
            </h3>
            <p className="mt-1 text-xs text-secondary-text">
              {target.channel
                ? lang({
                    ko: `${getChannelLabel(target.channel)} draft에 생성 이미지를 연결합니다.`,
                    en: "Generated images will be attached to this channel draft.",
                  })
                : lang({
                    ko: "생성 이미지를 현재 job의 전체 소셜 채널 draft에 연결합니다.",
                    en: "Generated images will be attached to all channel drafts in this job.",
                  })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTarget(null)}
            aria-label={lang({ ko: "이미지 생성 닫기", en: "Close image generation" })}
          >
            <X className="icon-sm" />
          </Button>
        </div>
        <div className="p-4">{editor}</div>
      </section>
    ) : null;
  }

  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
      <SheetContent
        side="bottom"
        className="h-[min(92vh,58rem)] rounded-t-2xl border-t border-border bg-background p-0 text-primary-text"
      >
        <div className="flex h-full flex-col">
          {sheetBody}
        </div>
      </SheetContent>
    </Sheet>
  );
}
