"use client";

import { X } from "lucide-react";
import { ImageBox } from "components/module/image";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { Newspaper } from "lucide-react";
import { cn } from "utils/common";

/**
 * 템플릿 활용 팁 가이드 — compact row(2차 정리).
 * 핵심 작업(프롬프트·설정)보다 가이드가 먼저 보여 정보 위계를 흐리지 않도록
 * 단일 라인 row로 축소한다. 닫으면 세션 동안 다시 열리지 않는다(PresetDetailSheet 상태).
 */
export function TemplateUsageBanner({
  articleUrl,
  imageUrl,
  title,
  onClose,
}: {
  articleUrl: string;
  imageUrl?: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="relative px-4 pt-3">
      <div
        className={cn(
          "flex w-full items-center justify-between",
          "min-h-11 rounded-xl border border-border bg-surface py-1.5 px-2 pr-3",
          "text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        )}
      >
        <a
          href={articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-w-0 items-center gap-2"
        >
          {imageUrl ? (
            <ImageBox
              src={imageUrl}
              alt=""
              objectFit="object-cover"
              className="h-8 w-8 shrink-0 rounded-lg"
              height={32}
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-background rounded-lg">
              <Newspaper className="icon-xs text-muted" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm">
            <Lang
              text={{
                ko: "이 템플릿 활용 팁 보기",
                en: "Usage & tips for this template",
              }}
            />
            <span className="ml-1 hidden text-xxs font-normal text-muted-foreground/70 sm:inline">{title}</span>
          </span>
        </a>
        <Button
          variant="blank"
          onClick={onClose}
          aria-label={lang({ ko: "팁 가이드 닫기", en: "Close tips guide" })}
          className="text-muted-foreground/60 hover:text-foreground"
        >
          <X className="icon-xs" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
