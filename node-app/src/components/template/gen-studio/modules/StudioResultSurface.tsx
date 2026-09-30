"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { BottomSheetDialog, Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn, getCurrentBreakpoint, runAfterCurrentRender } from "utils/common";
import { X } from "lucide-react";

const STUDIO_GHOST_SCROLLBAR_CLASS = "scrollbar-ghost";
const DEFAULT_RESULT_TITLE = { ko: "생성 결과", en: "Generated Results" } as const;

type BilingualText = { ko: string; en: string };
type ResultHeaderRender = (args: { onClose: () => void }) => ReactNode;

type StudioResultSurfaceProps = {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: BilingualText;
  header?: ReactNode | ResultHeaderRender;
  headingRef?: RefObject<HTMLParagraphElement | null>;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  footerOffsetPx?: number;
  className?: string;
};

function useIsWideLayout() {
  const [isWide, setIsWide] = useState(() => getCurrentBreakpoint() !== "sm");

  useEffect(() => {
    const syncLayout = () => setIsWide(getCurrentBreakpoint() !== "sm");
    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => window.removeEventListener("resize", syncLayout);
  }, []);

  return isWide;
}

function DefaultResultHeader({
  title,
  headingRef,
  onClose,
}: {
  title: BilingualText;
  headingRef?: RefObject<HTMLParagraphElement | null>;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3">
      <p ref={headingRef} tabIndex={-1} className="truncate text-sm font-medium text-foreground outline-none">
        <Lang text={title} />
      </p>
      <Button
        variant="blank"
        size="icon-xs"
        rounded="full"
        onClick={onClose}
        aria-label={lang({ ko: "생성 결과 닫기", en: "Close generated results" })}
        className="min-h-11 min-w-11 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function resolveResultHeader(
  header: ReactNode | ResultHeaderRender | undefined,
  onClose: () => void,
  fallback: ReactNode,
) {
  return typeof header === "function" ? header({ onClose }) : header || fallback;
}

export function StudioResultSurface({
  children,
  open,
  onOpenChange,
  title = DEFAULT_RESULT_TITLE,
  header,
  headingRef,
  returnFocusRef,
  footerOffsetPx = 208,
  className,
}: StudioResultSurfaceProps) {
  const isWideLayout = useIsWideLayout();
  const previousOpenRef = useRef(open);
  useEffect(() => {
    if (previousOpenRef.current && !open) {
      runAfterCurrentRender(() => returnFocusRef?.current?.focus());
    }
    previousOpenRef.current = open;
  }, [open, returnFocusRef]);
  const closeResult = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const resolvedHeader = resolveResultHeader(
    header,
    closeResult,
    <DefaultResultHeader title={title} headingRef={headingRef} onClose={closeResult} />,
  );

  return (
    <>
      {isWideLayout && open ? (
        <aside
          data-amu-gen-studio-region="result"
          aria-label={lang({ ko: "생성 결과", en: "Generation results" })}
          className={cn(
            "mr-4 flex w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border",
            className,
          )}
          style={{ marginBottom: footerOffsetPx }}
        >
          {resolvedHeader}
          <div className={cn("min-h-0 flex-1 overflow-y-auto", STUDIO_GHOST_SCROLLBAR_CLASS)}>{children}</div>
        </aside>
      ) : null}

      <BottomSheetDialog
        portal={false}
        open={!isWideLayout && open}
        onClose={closeResult}
        title={lang(title)}
      >
        {children}
      </BottomSheetDialog>
    </>
  );
}

export type { BilingualText, ResultHeaderRender, StudioResultSurfaceProps };
