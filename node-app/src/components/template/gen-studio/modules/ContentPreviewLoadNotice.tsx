"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import { cn } from "utils/common";
import type { ContentPreviewLoadErrors } from "../hooks/contentPreviewLoadState";
import { hasContentPreviewLoadError } from "../hooks/contentPreviewLoadState";

type ContentPreviewLoadNoticeProps = {
  errors: ContentPreviewLoadErrors;
  isLoggedIn: boolean;
  loading?: boolean;
  onRetry: () => void;
  className?: string;
};

export function ContentPreviewLoadNotice({
  errors,
  isLoggedIn,
  loading = false,
  onRetry,
  className,
}: ContentPreviewLoadNoticeProps) {
  if (!hasContentPreviewLoadError(errors)) return null;

  const message =
    errors.public && errors.owned
      ? {
          ko: "공개 생성물과 내 생성물을 불러오지 못했습니다.",
          en: "Could not load public or personal generations.",
        }
      : errors.owned
        ? {
            ko: "내 생성물을 불러오지 못해 공개 생성물만 표시합니다.",
            en: "Personal generations could not be loaded. Only public generations are shown.",
          }
        : isLoggedIn
          ? {
              ko: "공개 생성물을 불러오지 못해 내 생성물만 표시합니다.",
              en: "Public generations could not be loaded. Only your generations are shown.",
            }
          : {
              ko: "공개 생성물을 불러오지 못했습니다.",
              en: "Could not load public generations.",
            };

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger",
        "sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="flex min-w-0 items-start gap-2 leading-5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <Lang text={message} />
      </p>
      <Button
        variant="outlineDestructive"
        size="sm"
        className="min-h-11 shrink-0"
        disabled={loading}
        onClick={onRetry}
      >
        <RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin motion-reduce:animate-none")} aria-hidden />
        <Lang text={{ ko: "다시 시도", en: "Try again" }} />
      </Button>
    </div>
  );
}
