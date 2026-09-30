"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent } from "@amu-labs/ui";

type StudioDetailPresentationProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presentation: "page" | "sheet" | "embedded";
  fallback: ReactNode;
  pending?: ReactNode;
  hideOverlay?: boolean;
  children: ReactNode;
};

/**
 * Gen Studio detail의 page/sheet 경계를 단일 owner로 유지한다.
 * 도메인 adapter는 생성 hook과 renderer만 연결하고 presentation을 복제하지 않는다.
 */
export function StudioDetailPresentation({
  open,
  onOpenChange,
  presentation,
  fallback,
  pending,
  hideOverlay = false,
  children,
}: StudioDetailPresentationProps) {
  if (presentation === "page") {
    if (!open) return pending || fallback;

    return (
      <section className="flex h-[100vh] min-h-[42rem] w-full flex-col overflow-hidden bg-background text-primary-text supports-[height:100dvh]:h-[100dvh]">
        {children}
      </section>
    );
  }

  if (presentation === "embedded") {
    if (!open) return fallback;
    return (
      <section className="flex min-h-[32rem] w-full flex-col overflow-hidden bg-background text-primary-text">
        {children}
      </section>
    );
  }

  return (
    <>
      {fallback}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          data-service-theme="gen-studio"
          side="bottom"
          className="inset-0 flex h-[100dvh] max-h-[100dvh] w-full flex-col gap-0 overflow-hidden border-0 bg-background p-0"
          hideClose
          hideOverlay={hideOverlay}
          disableOutsideClick
          lockBodyScroll
        >
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}

export type { StudioDetailPresentationProps };
