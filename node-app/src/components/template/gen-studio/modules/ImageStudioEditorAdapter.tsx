"use client";

import type { ReactNode } from "react";
import { PresetDetailSheet, type PresetDetailSheetProps } from "./PresetDetailSheet";
import { StudioDetailPresentation } from "./StudioDetailPresentation";

type ImageStudioEditorAdapterProps = Omit<PresetDetailSheetProps, "titleAs"> & {
  fallback: ReactNode;
  pending?: ReactNode;
  presentation: "page" | "sheet" | "embedded";
  hideSheetOverlay?: boolean;
};

/**
 * 이미지 도메인의 생성 hook·설정 renderer·결과 renderer를 공통 detail surface에 연결한다.
 * 목록 검색/추천 orchestration은 ImageStudioEditor가, presentation frame은 공통 surface가 소유한다.
 */
export function ImageStudioEditorAdapter({
  fallback,
  pending,
  presentation,
  hideSheetOverlay = true,
  ...detailProps
}: ImageStudioEditorAdapterProps) {
  return (
    <StudioDetailPresentation
      open={detailProps.open}
      onOpenChange={detailProps.onOpenChange}
      presentation={presentation}
      fallback={fallback}
      pending={pending}
      hideOverlay={hideSheetOverlay}
    >
      <PresetDetailSheet {...detailProps} titleAs={presentation === "sheet" ? "sheet" : "page"} />
    </StudioDetailPresentation>
  );
}

export type { ImageStudioEditorAdapterProps };
