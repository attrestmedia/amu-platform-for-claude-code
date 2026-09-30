"use client";

import { useMemo, type ReactNode, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";

type HeaderAction = {
  label: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  className: string;
  disabled?: boolean;
  ref?: RefObject<HTMLButtonElement | null>;
};

type HeaderMoreMenuItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

type HeaderActionsArgs = {
  /** Result Viewer에서 열람 가능한 성공 asset이 1개 이상 존재하는지 (button enabled의 유일 조건) */
  hasViewableResults: boolean;
  /** active generation 존재 여부 — 진행 표시(spinner)에 사용 */
  isGenerating: boolean;
  /** 최신 성공 batch의 성공 asset 수. 0이면 배지 없음(세션 내 batch가 없을 때) */
  latestBatchCount: number;
  allowBookmark?: boolean;
  isBookmarked?: boolean;
  bookmarkDisabled?: boolean;
  onOpenResults: () => void;
  onToggleBookmark?: () => void;
  resultTriggerRef?: RefObject<HTMLButtonElement | null>;
};

/**
 * 헤더 액션 (계약 §3.11): [결과 N] + ⋯ 더보기 2요소.
 * - 결과 버튼 2축 상태(§3.3): 과거 결과 × active generation
 *   없음+유휴 → disabled / 없음+생성중 → disabled+spinner
 *   있음+유휴 → enabled+결과 N / 있음+생성중 → enabled+spinner
 * - 편집 전환은 Prompt 섹션 라벨 우측 버튼으로 통일(헤더에서 제거)
 */
export function usePresetHeaderActions(args: HeaderActionsArgs) {
  const {
    hasViewableResults,
    isGenerating,
    latestBatchCount,
    allowBookmark = false,
    isBookmarked = false,
    bookmarkDisabled = false,
    onOpenResults,
    onToggleBookmark,
    resultTriggerRef,
  } = args;

  const resultAction: HeaderAction = useMemo(() => {
    const resultLabel = (
      <span className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold">
        {isGenerating ? <Loader2 className="icon-xs animate-spin" aria-hidden /> : null}
        <Lang
          text={{
            ko: latestBatchCount > 0 ? `결과 ${latestBatchCount}` : "결과",
            en: latestBatchCount > 0 ? `Results ${latestBatchCount}` : "Results",
          }}
        />
      </span>
    );

    return {
      label: resultLabel,
      onClick: onOpenResults,
      ref: resultTriggerRef,
      ariaLabel: lang({
          ko: hasViewableResults
          ? `생성 결과 열기${latestBatchCount > 0 ? ` (최근 ${latestBatchCount}개)` : ""}`
          : "아직 열람 가능한 생성 결과가 없습니다",
        en: hasViewableResults
          ? `Open results${latestBatchCount > 0 ? ` (latest ${latestBatchCount})` : ""}`
          : "No viewable results yet",
      }),
      className: cn(
        "rounded-lg px-2",
        hasViewableResults ? "text-foreground hover:text-primary" : "text-muted-foreground",
        isGenerating && "text-primary",
      ),
      disabled: !hasViewableResults,
    };
  }, [hasViewableResults, isGenerating, latestBatchCount, onOpenResults, resultTriggerRef]);

  const moreMenu: HeaderMoreMenuItem[] = useMemo(() => {
    if (!allowBookmark || !onToggleBookmark) return [];
    return [
      {
        value: "bookmark",
        label: lang({
          ko: isBookmarked ? "북마크 해제" : "북마크 추가",
          en: isBookmarked ? "Remove bookmark" : "Add bookmark",
        }),
        disabled: bookmarkDisabled,
      },
    ];
  }, [allowBookmark, bookmarkDisabled, isBookmarked, onToggleBookmark]);

  const onMoreSelect = (value: string) => {
    if (value === "bookmark") onToggleBookmark?.();
  };

  return { resultAction, moreMenu, onMoreSelect };
}
