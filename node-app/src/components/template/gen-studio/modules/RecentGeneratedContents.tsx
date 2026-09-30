"use client";

import { memo } from "react";
import { FileText, Globe, Lock } from "lucide-react";
import { Lang, lang, useLocalize } from "components/module/i18n";
import { ScrollArea } from "@amu-labs/ui";
import type { ContentAssetMetaType, ContentAssetPreviewType } from "types/app";
import { cn } from "utils/common";
import { getContentAssetPreviewBody, getContentAssetPreviewTitle } from "utils/lab/contentAssetPreview";

export type ContentAssetCardItem = ContentAssetMetaType | ContentAssetPreviewType;

type RecentGeneratedContentsProps = {
  items: ContentAssetCardItem[];
  onSelect: (item: ContentAssetCardItem) => void;
  templateTitleByKey?: Record<string, string>;
  layout?: "rail" | "grid";
  loading?: boolean;
  className?: string;
  innerClassName?: string;
};

function getPreviewText(item: ContentAssetCardItem) {
  return "text" in item ? String(item.text || "") : String(item.textPreview || "");
}

function formatPreviewDate(value: ContentAssetCardItem["createdAt"], language: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export const RecentGeneratedContents = memo(function RecentGeneratedContents({
  items,
  onSelect,
  templateTitleByKey = {},
  layout = "rail",
  loading = false,
  className,
  innerClassName,
}: RecentGeneratedContentsProps) {
  const { language } = useLocalize();

  const renderCard = (item: ContentAssetCardItem) => {
    const fallbackTitle =
      templateTitleByKey[item.templateKey] || lang({ ko: "생성 콘텐츠", en: "Generated content" });
    const previewText = getPreviewText(item);
    const title = getContentAssetPreviewTitle(previewText, fallbackTitle);
    const body = getContentAssetPreviewBody(previewText, title);
    const createdAt = formatPreviewDate(item.createdAt, language);
    const isPublic = item.visibility === "public";

    return (
      <button
        key={item.assetId}
        type="button"
        onClick={() => onSelect(item)}
        aria-label={lang({ ko: `${title} 전체 내용 보기`, en: `View full content: ${title}` })}
        className={cn(
          "group relative flex h-40 min-h-40 flex-col overflow-hidden rounded-xl border border-border bg-card p-3 text-left shadow-sm",
          "cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          layout === "rail" ? "w-44 min-w-44 shrink-0" : "w-full",
        )}
      >
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <h3 className="line-clamp-2 min-h-10 text-xs font-semibold leading-5 text-primary-text">{title}</h3>
        </div>
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-xxs leading-4 text-secondary-text">
          {body || previewText}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-xxs text-muted-foreground">
          <span className="truncate">{createdAt}</span>
          <span className="inline-flex shrink-0 items-center gap-1">
            {isPublic ? <Globe className="h-3 w-3" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
            <Lang text={isPublic ? { ko: "공개", en: "Public" } : { ko: "비공개", en: "Private" }} />
          </span>
        </div>
      </button>
    );
  };

  const placeholder = (
    <div
      className={cn(
        "flex h-40 min-h-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 text-center text-xs text-muted-foreground",
        layout === "rail" ? "w-44 min-w-44 shrink-0" : "w-full",
        loading && "animate-pulse motion-reduce:animate-none",
      )}
      role={loading ? "status" : undefined}
    >
      <Lang
        text={
          loading
            ? { ko: "최근 콘텐츠를 불러오는 중입니다.", en: "Loading recent content." }
            : { ko: "최근 생성 콘텐츠가 없습니다.", en: "No recent generated content." }
        }
      />
    </div>
  );

  if (!items.length && !loading) return null;

  if (layout === "grid") {
    return (
      <div className={cn("@container w-full", className)}>
        <div className={cn("grid grid-cols-1 gap-2 @[28rem]:grid-cols-2", innerClassName)}>
          {items.length ? items.map(renderCard) : placeholder}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("w-full", className)}>
      <div className={cn("flex gap-2 px-3", innerClassName)}>{items.length ? items.map(renderCard) : placeholder}</div>
    </ScrollArea>
  );
});
