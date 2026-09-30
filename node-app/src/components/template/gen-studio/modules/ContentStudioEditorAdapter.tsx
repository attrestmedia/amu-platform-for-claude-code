"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { lang } from "components/module/i18n";
import { CoinUsageDialog } from "components/module/commerce";
import { UniverseCoinUsageDialog } from "components/module/commerce/UniverseCoinUsageDialog";
import type { UserScopeType } from "types/ai";
import type {
  ContentStudioApplyContentArgsType,
  ContentStudioDoneMetaType,
  PromptItemType,
  PromptVisibilityType,
} from "types/app";
import ContentPromptPicker from "../ContentPromptPicker";
import { ContentStudioHeader } from "./content-studio/ContentStudioHeader";
import { usePresetHeaderActions } from "./preset-detail/HeaderActions";
import { StudioDetailPresentation } from "./StudioDetailPresentation";

type ContentStudioEditorAdapterProps = {
  fallback: ReactNode;
  pending?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presentation: "page" | "sheet" | "embedded";
  selectedItem: PromptItemType | null;
  initialMode: "template" | "custom";
  mode: UserScopeType;
  universeId?: string;
  articleContext?: { title: string; question: string; intent: string };
  surface?: "default" | "embedded";
  embedSessionId?: string;
  allowedTemplateVariableKeys?: readonly string[];
  requiredTemplateVariableKeys?: readonly string[];
  lockedTemplateVariableKeys?: readonly string[];
  initialTemplateVariables?: Readonly<Record<string, string>>;
  initialOutputVisibility?: PromptVisibilityType;
  allowCustomPrompt?: boolean;
  isBookmarked?: boolean;
  bookmarkDisabled?: boolean;
  onToggleBookmark?: () => void;
  onRecentContentsChanged?: () => void;
  onDone?: (contents: string[], coins?: number, meta?: ContentStudioDoneMetaType) => void;
  onApplyContent?: (args: ContentStudioApplyContentArgsType) => Promise<void> | void;
  onGenerationStarted?: (payload: { requestId: string; jobCount: number }) => void;
  onGenerationFailed?: (payload: { requestId: string; errorCode: string }) => void;
};

/**
 * 콘텐츠 도메인의 생성 hook·form/result renderer를 공통 detail surface에 연결한다.
 * 템플릿 목록과 콘텐츠별 상태는 ContentStudioEditor/ContentPromptPicker 경계에 남긴다.
 */
export function ContentStudioEditorAdapter({
  fallback,
  pending,
  open,
  onOpenChange,
  presentation,
  selectedItem,
  initialMode,
  mode,
  universeId,
  articleContext,
  surface,
  embedSessionId,
  allowedTemplateVariableKeys,
  requiredTemplateVariableKeys,
  lockedTemplateVariableKeys,
  initialTemplateVariables,
  initialOutputVisibility,
  allowCustomPrompt,
  isBookmarked = false,
  bookmarkDisabled = false,
  onToggleBookmark,
  onRecentContentsChanged,
  onDone,
  onApplyContent,
  onGenerationStarted,
  onGenerationFailed,
}: ContentStudioEditorAdapterProps) {
  const [resultOpen, setResultOpen] = useState(false);
  const [coinUsageOpen, setCoinUsageOpen] = useState(false);
  const resultTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [hasResults, setHasResults] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [latestResultCount, setLatestResultCount] = useState(0);

  const handleGenerationStarted = useCallback(
    (payload: { requestId: string; jobCount: number }) => {
      setIsGenerating(true);
      onGenerationStarted?.(payload);
    },
    [onGenerationStarted],
  );
  const handleGenerationFailed = useCallback(
    (payload: { requestId: string; errorCode: string }) => {
      setIsGenerating(false);
      onGenerationFailed?.(payload);
    },
    [onGenerationFailed],
  );
  const handleDone = useCallback(
    (contents: string[], coins?: number, meta?: ContentStudioDoneMetaType) => {
      setIsGenerating(false);
      setLatestResultCount(contents.length);
      onDone?.(contents, coins, meta);
    },
    [onDone],
  );
  const handleOpenResults = useCallback(() => setResultOpen(true), []);
  const handleResultsAvailabilityChange = useCallback((available: boolean) => setHasResults(available), []);

  const { resultAction, moreMenu, onMoreSelect } = usePresetHeaderActions({
    hasViewableResults: hasResults,
    isGenerating,
    latestBatchCount: latestResultCount,
    allowBookmark: Boolean(selectedItem?.key),
    isBookmarked,
    bookmarkDisabled,
    onOpenResults: handleOpenResults,
    onToggleBookmark: onToggleBookmark || (() => undefined),
    resultTriggerRef,
  });
  const contentMoreMenu = [
    ...moreMenu,
    {
      value: "coin-usage",
      label: lang({ ko: "코인 사용 내역", en: "Coin activity" }),
    },
  ];
  const handleContentMoreSelect = useCallback(
    (value: string) => {
      if (value === "coin-usage") {
        setCoinUsageOpen(true);
        return;
      }
      onMoreSelect(value);
    },
    [onMoreSelect],
  );
  const detailTitle = selectedItem?.title || lang({ ko: "콘텐츠 생성", en: "Content Generation" });

  return (
    <>
      <StudioDetailPresentation
        open={open}
        onOpenChange={onOpenChange}
        presentation={presentation}
        fallback={fallback}
        pending={pending}
      >
        <ContentPromptPicker
          key={`${initialMode}:${selectedItem?.key || "custom"}`}
          onClose={() => onOpenChange(false)}
          header={
            <ContentStudioHeader
              title={detailTitle}
              onClose={() => onOpenChange(false)}
              actions={[resultAction]}
              moreMenu={contentMoreMenu}
              moreMenuLabel={lang({ ko: "더보기", en: "More" })}
              onMoreSelect={handleContentMoreSelect}
              titleAs={presentation === "sheet" ? "sheet" : "page"}
              articleContext={articleContext}
            />
          }
          mode={mode}
          universeId={mode === "universe" ? universeId : undefined}
          initialTemplateKey={selectedItem?.key}
          initialMode={initialMode}
          resultOpen={resultOpen}
          onResultOpenChange={setResultOpen}
          resultReturnFocusRef={resultTriggerRef}
          onViewableResultsChange={handleResultsAvailabilityChange}
          onRecentContentsChanged={onRecentContentsChanged}
          surface={surface}
          embedSessionId={embedSessionId}
          allowedTemplateVariableKeys={allowedTemplateVariableKeys}
          requiredTemplateVariableKeys={requiredTemplateVariableKeys}
          lockedTemplateVariableKeys={lockedTemplateVariableKeys}
          initialTemplateVariables={initialTemplateVariables}
          initialOutputVisibility={initialOutputVisibility}
          allowCustomPrompt={allowCustomPrompt}
          onGenerationStarted={handleGenerationStarted}
          onGenerationFailed={handleGenerationFailed}
          onDone={handleDone}
          onApplyContent={onApplyContent}
        />
      </StudioDetailPresentation>
      {mode === "universe" && universeId ? (
        <UniverseCoinUsageDialog
          open={coinUsageOpen}
          onClose={() => setCoinUsageOpen(false)}
          universeId={universeId}
        />
      ) : (
        <CoinUsageDialog open={coinUsageOpen} onClose={() => setCoinUsageOpen(false)} />
      )}
    </>
  );
}

export type { ContentStudioEditorAdapterProps };
