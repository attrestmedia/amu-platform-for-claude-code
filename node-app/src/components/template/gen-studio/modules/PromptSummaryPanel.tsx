"use client";

import { Button } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { X } from "lucide-react";
import { cn } from "utils/common";
import { PromptPreviewOptionSummary, type PromptPreviewSummaryItemType } from "./PromptPreviewOptionSummary";

/**
 * Gen Studio "현재 설정 정보" 패널 — 프롬프트 미리보기와 분리된 독립 프로세스.
 * 이미지/콘텐츠 프롬프트 템플릿 상세에서 상단 전환 버튼의 한 단계로 공통 사용한다.
 * - variant="card": 자체 카드 테두리/헤더 포함 (콘텐츠 인라인/사이드, 모바일 dock)
 * - variant="bare": 외곽 헤더가 별도로 있는 컨테이너(이미지 사이드바) 내부에서 본문만 표시
 */
export function PromptSummaryPanel({
  items,
  variant = "card",
  onClose,
  className,
}: {
  items: PromptPreviewSummaryItemType[];
  variant?: "card" | "bare";
  onClose?: () => void;
  className?: string;
}) {
  const isBare = variant === "bare";

  return (
    <div
      className={cn(isBare ? "p-4" : "rounded-2xl border border-border bg-card p-4 text-xs shadow-sm", className)}
    >
      {!isBare && (
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <span className="text-xs font-medium leading-none">{lang({ ko: "현재 설정 정보", en: "Current Settings" })}</span>
          {onClose ? (
            <Button
              variant="blank"
              onClick={onClose}
              aria-label={lang({ ko: "현재 설정 정보 닫기", en: "Close current settings" })}
            >
              <X className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      )}
      <PromptPreviewOptionSummary items={items} />
    </div>
  );
}
