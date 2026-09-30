"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { Bug, Check, Copy, X } from "lucide-react";
import { cn } from "utils/common";
import { PromptPreviewDebugDialog } from "./PromptPreviewDebugDialog";

/**
 * Gen Studio 프롬프트 미리보기 공통 카드 (디자인 기준: 이미지 템플릿 상세).
 * 이미지/콘텐츠 미리보기가 동일 디자인을 공유하기 위한 표현형 컴포넌트.
 * - description / footer 는 호출부별 부가 영역(이미지: AiImageGuide, 콘텐츠: 첨부 안내)
 * - bodyClassName 으로 본문 스크롤 높이만 화면별로 위임
 */
export function PromptPreviewCard({
  composed,
  title,
  description,
  debugComposed,
  canViewDebugPrompt = false,
  onCopy,
  onClose,
  footer,
  bodyClassName,
  className,
}: {
  composed: string;
  title?: ReactNode;
  description?: ReactNode;
  debugComposed?: string;
  canViewDebugPrompt?: boolean;
  onCopy?: () => boolean | Promise<boolean>;
  onClose?: () => void;
  footer?: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  const [debugOpen, setDebugOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!onCopy || copying) return;

    setCopying(true);
    try {
      const success = await onCopy();
      if (!success) return;

      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } finally {
      setCopying(false);
    }
  };
  // 프롬프트 길이(Bytes) — 이미지 기준과 동일한 TextEncoder 사용
  const composedBytes = useMemo(() => new TextEncoder().encode(String(composed || "")).length, [composed]);
  const fullPrompt = debugComposed ?? composed;

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 text-xs shadow-sm", className)}>
      <div className="space-y-2">
        <div className="form-label flex items-center justify-between w-full px-1 text-xs font-medium leading-none">
          <span>{title ?? lang({ ko: "프롬프트 미리보기", en: "Preview" })}</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xxs text-muted-foreground tabular-nums">{composedBytes} Bytes</span>
            {onCopy ? (
              <Button
                variant="blank"
                onClick={() => void handleCopy()}
                disabled={copying || copied}
                aria-label={lang({
                  ko: copied ? "복사 완료" : copying ? "복사 중" : "복사",
                  en: copied ? "Copied" : copying ? "Copying" : "Copy",
                })}
              >
                {copied ? <Check className="icon-xxs" /> : <Copy className="icon-xxs" />}
              </Button>
            ) : null}
            {canViewDebugPrompt && (
              <Button
                variant="blank"
                onClick={() => setDebugOpen(true)}
                aria-label={lang({ ko: "전체 전송 프롬프트 보기", en: "View full prompt" })}
              >
                <Bug className="icon-xxs" />
              </Button>
            )}
            {onClose ? (
              <Button
                variant="blank"
                onClick={onClose}
                aria-label={lang({ ko: "프롬프트 미리보기 닫기", en: "Close prompt preview" })}
              >
                <X className="icon-xxs" />
              </Button>
            ) : null}
          </div>
        </div>
        {description ? <p className="px-1 text-xxs text-muted-foreground leading-relaxed">{description}</p> : null}
        <div className="form-content w-full">
          <div
            className={cn(
              "whitespace-pre-wrap text-muted-foreground/80 font-mono text-xs leading-relaxed scrollbar-thin scrollbar-ghost mt-2",
              bodyClassName,
            )}
          >
            {composed || <span>...</span>}
          </div>
          {footer}
        </div>
      </div>
      {canViewDebugPrompt && (
        <PromptPreviewDebugDialog open={debugOpen} onOpenChange={setDebugOpen} prompt={fullPrompt} />
      )}
    </div>
  );
}
