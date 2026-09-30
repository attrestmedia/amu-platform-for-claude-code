"use client";

import type { ReactNode, RefObject } from "react";
import { cn } from "utils/common";
import { StudioResultSurface, type BilingualText, type ResultHeaderRender } from "./StudioResultSurface";

const STUDIO_GHOST_SCROLLBAR_CLASS = "scrollbar-ghost";
const DEFAULT_RESULT_TITLE = { ko: "생성 결과", en: "Generated Results" } as const;

type StudioCreationWorkspaceProps = {
  header: ReactNode;
  children: ReactNode;
  notice?: ReactNode;
  topSlot?: ReactNode;
  result?: ReactNode;
  resultHeader?: ReactNode | ResultHeaderRender;
  resultTitle?: BilingualText;
  resultOpen: boolean;
  onResultOpenChange: (open: boolean) => void;
  resultHeadingRef?: RefObject<HTMLParagraphElement | null>;
  resultReturnFocusRef?: RefObject<HTMLButtonElement | null>;
  footer?: ReactNode;
  footerHeightPx?: number;
  mainClassName?: string;
  className?: string;
};

/**
 * 이미지·콘텐츠 생성 상세가 공유하는 page/embedded workspace shell.
 * 생성 상태, form reducer, payload, 결과 renderer는 slot 소비자가 소유한다.
 */
export function StudioCreationWorkspace({
  header,
  children,
  notice,
  topSlot,
  result,
  resultHeader,
  resultTitle = DEFAULT_RESULT_TITLE,
  resultOpen,
  onResultOpenChange,
  resultHeadingRef,
  resultReturnFocusRef,
  footer,
  footerHeightPx = 224,
  mainClassName,
  className,
}: StudioCreationWorkspaceProps) {
  const footerOffsetPx = Math.max(0, footerHeightPx - 16);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-background text-primary-text", className)}>
      <div data-amu-gen-studio-region="header">{header}</div>
      {notice ? <div className="shrink-0">{notice}</div> : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[70rem] flex-1 flex-col overflow-hidden">
        {topSlot ? <div className="shrink-0">{topSlot}</div> : null}

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <main
            data-amu-gen-studio-region="main"
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain",
              STUDIO_GHOST_SCROLLBAR_CLASS,
              mainClassName,
            )}
            style={{ marginBottom: footerOffsetPx }}
          >
            {children}
          </main>

          {result ? (
            <StudioResultSurface
              open={resultOpen}
              onOpenChange={onResultOpenChange}
              title={resultTitle}
              header={resultHeader}
              headingRef={resultHeadingRef}
              returnFocusRef={resultReturnFocusRef}
              footerOffsetPx={footerOffsetPx}
            >
              {result}
            </StudioResultSurface>
          ) : null}
        </div>
      </div>

      {footer ? <div data-amu-gen-studio-region="footer">{footer}</div> : null}
    </div>
  );
}

export type { StudioCreationWorkspaceProps };
