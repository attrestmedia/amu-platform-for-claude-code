"use client";

import React, { forwardRef } from "react";
import { Button, Dropdown, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import {
  Check,
  ChevronDown,
  Copy,
  Bug,
  SquarePen,
  Paperclip,
  Plus,
  Sparkles,
  SquareUserRound,
  X,
} from "lucide-react";
import { cn } from "utils/common";
import { PromptPreviewDebugDialog } from "../PromptPreviewDebugDialog";

export type FooterAttachmentPreviewItem = {
  id: string;
  src: string;
  alt: string;
  label?: { ko: string; en: string };
  removeAriaLabel: string;
  onRemove: () => void;
};

export type FooterActionsVariant = "composer" | "action-bar";

export type FooterActionsProps = {
  /**
   * composer: 입력 composer+첨부+이미지 추가 메뉴 포함 (기본값 — ContentPromptPicker 등)
   * action-bar: Cost+Generate 순수 구조 (Phase 4 계약 §3.8 — PresetDetailSheet, 프롬프트는 본문화됨)
   */
  variant?: FooterActionsVariant;
  isGenerating?: boolean;
  pendingCount?: number;
  disabled: boolean;
  generateText?: { ko: string; en: string };
  generationTargetText?: { ko: string; en: string };
  addMenuTooltip?: { ko: string; en: string; id?: string };
  referencePickerText?: { ko: string; en: string };
  referencePickerDescription?: { ko: string; en: string };
  modelPickerText?: { ko: string; en: string };
  modelPickerDescription?: { ko: string; en: string };
  idleNotice?: React.ReactNode;
  composer?: React.ReactNode;
  /** dock 슬롯 — ContentPromptPicker 등 다른 화면에서 사용. PresetDetailSheet는 Phase 3에서 BottomSheet로 전환해 미사용 */
  topSlot?: React.ReactNode;
  attachmentPreviewItems?: FooterAttachmentPreviewItem[];
  /** 잔액 표시 슬롯 — CTA 인접 secondary 정보(계약 §3.8: 비용이 잔액보다 높은 시각 우선순위) */
  balanceSlot?: React.ReactNode;
  /** 헤더/쉘이 닫기를 소유하므로 action-bar에서는 사용하지 않는다. 기존 composer 호환용으로 유지한다. */
  onClose?: () => void;
  onGenerate: () => void;
  onOpenReferencePicker?: () => void;
  onOpenModelImagePicker?: () => void;
  referencePickerDisabled?: boolean;
  modelImagePickerDisabled?: boolean;
  estimatedCoins?: number | null;
  /** Insufficient Coins 상태(계약 §3.7) — 서버 COIN_INSUFFICIENT 판정 시 경고 표기 */
  coinShortage?: boolean;
  /**
   * 최종 프롬프트 스트립(3차 정리) — 플로팅 바 상단에 한 줄 미리보기 + 화살표 버튼으로 확장.
   * 확장 시 max-height 적용된 프롬프트 확인 UI(계약 §3.4). 템플릿 모드에서만 전달(커스텀은 중복 금지).
   */
  promptPreview?: {
    text: string;
    onCopy?: () => boolean | Promise<boolean>;
    debugText?: string;
    canViewDebugPrompt?: boolean;
  };
  /** 프롬프트 스트립에서 템플릿 → 직접 수정 모드로 전환 (4차 개선: 본문에서 이동) */
  onToggleCustomMode?: () => void;
};

/**
 * 이미지·콘텐츠가 공유하는 순수 하단 action-bar 계약.
 * composer 입력·첨부 슬롯은 이 계약에 포함하지 않아 FooterActions의 action-bar 변형에서 렌더링하지 않는다.
 */
export type FooterActionsActionBarProps = Pick<
  FooterActionsProps,
  | "isGenerating"
  | "pendingCount"
  | "generateText"
  | "generationTargetText"
  | "idleNotice"
  | "balanceSlot"
  | "estimatedCoins"
  | "coinShortage"
  | "onGenerate"
> & {
  variant: "action-bar";
  disabled: boolean;
};

export const FooterActions = forwardRef<HTMLDivElement, FooterActionsProps>(function FooterActions(
  {
    variant = "composer",
    isGenerating = false,
    pendingCount = 0,
    disabled,
    generateText = { ko: "생성하기", en: "Generate" },
    generationTargetText = { ko: "이미지", en: "image" },
    addMenuTooltip,
    referencePickerText = { ko: "참고 이미지 추가", en: "Add reference image" },
    referencePickerDescription = { ko: "구도와 스타일 참고", en: "Composition and style reference" },
    modelPickerText = { ko: "모델 이미지 추가", en: "Add model image" },
    modelPickerDescription = { ko: "인물 정체성 기준", en: "Identity reference" },
    idleNotice,
    composer,
    topSlot,
    attachmentPreviewItems = [],
    balanceSlot,
    onGenerate,
    onOpenReferencePicker,
    onOpenModelImagePicker,
    referencePickerDisabled,
    modelImagePickerDisabled,
    estimatedCoins,
    coinShortage,
    promptPreview,
    onToggleCustomMode,
  },
  ref,
) {
  const [addMenuOpen, setAddMenuOpen] = React.useState(false);
  const isActionBar = variant === "action-bar";
  // 최종 프롬프트 스트립(3차 정리): 기본 1줄, 화살표 버튼으로 max-height 적용된 확인 UI 확장
  const [promptOpen, setPromptOpen] = React.useState(false);
  const [debugPromptOpen, setDebugPromptOpen] = React.useState(false);
  const [promptCopied, setPromptCopied] = React.useState(false);
  const promptText = String(promptPreview?.text || "").trim();
  const promptBytes = React.useMemo(() => new TextEncoder().encode(promptText).length, [promptText]);
  const handlePromptCopy = async () => {
    if (!promptPreview?.onCopy || promptCopied) return;
    const ok = await promptPreview.onCopy();
    if (!ok) return;
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1200);
  };
  const [dismissedAddMenuTooltipId, setDismissedAddMenuTooltipId] = React.useState<string | null>(null);
  const addMenuTooltipId = addMenuTooltip
    ? `${addMenuTooltip.id || ""}:${addMenuTooltip.ko}:${addMenuTooltip.en}`
    : null;
  const isAddMenuTooltipOpen = Boolean(addMenuTooltipId && dismissedAddMenuTooltipId !== addMenuTooltipId);
  const hasAddActions = Boolean(onOpenReferencePicker || onOpenModelImagePicker);
  const isAddMenuDisabled =
    !hasAddActions ||
    (Boolean(referencePickerDisabled) && Boolean(modelImagePickerDisabled || !onOpenModelImagePicker));

  const handleOpenReferencePicker = () => {
    if (!onOpenReferencePicker || referencePickerDisabled) return;
    setAddMenuOpen(false);
    onOpenReferencePicker();
  };

  const handleOpenModelImagePicker = () => {
    if (!onOpenModelImagePicker || modelImagePickerDisabled) return;
    setAddMenuOpen(false);
    onOpenModelImagePicker();
  };

  const addMenuOptions = React.useMemo(
    () => [
      {
        label: "reference",
        value: "reference",
        disabled: !onOpenReferencePicker || Boolean(referencePickerDisabled),
      },
      {
        label: "model",
        value: "model",
        disabled: !onOpenModelImagePicker || Boolean(modelImagePickerDisabled),
        dividerBefore: true,
      },
    ],
    [modelImagePickerDisabled, onOpenModelImagePicker, onOpenReferencePicker, referencePickerDisabled],
  );

  const renderAddMenuOption = (option: { value: string }) => {
    if (option.value === "reference") {
      return (
        <span className="flex min-h-11 w-full items-center justify-start gap-3 rounded-xl px-3 py-2 text-left text-sm">
          <Paperclip className="icon-xs shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">
              <Lang text={referencePickerText} />
            </span>
            <span className="text-xxs leading-4 text-neutral-300">
              <Lang text={referencePickerDescription} />
            </span>
          </span>
        </span>
      );
    }

    return (
      <span className="flex min-h-11 w-full items-center justify-start gap-3 rounded-xl px-3 py-2 text-left text-sm">
        <SquareUserRound className="h-4 w-4 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">
            <Lang text={modelPickerText} />
          </span>
          <span className="text-xxs leading-4 text-neutral-300">
            <Lang text={modelPickerDescription} />
          </span>
        </span>
      </span>
    );
  };

  const addMenu = (
    <Dropdown
      options={addMenuOptions}
      selected={null}
      open={addMenuOpen}
      onOpenChange={setAddMenuOpen}
      onSelect={(value) => {
        if (value === "reference") {
          handleOpenReferencePicker();
          return;
        }
        if (value === "model") handleOpenModelImagePicker();
      }}
      renderTrigger={() => <Plus className="icon-sm" />}
      renderOption={renderAddMenuOption}
      hideArrow
      disabled={isAddMenuDisabled}
      placeholder={lang({ ko: "이미지 추가", en: "Add image" })}
      triggerAriaLabel={lang({ ko: "이미지 추가 메뉴 열기", en: "Open image add menu" })}
      variant="ghost"
      size="xs"
      openSide="top"
      contentAlign="start"
      contentSideOffset={10}
      className="h-8 w-8 justify-center rounded-lg border-0 bg-transparent p-0"
      dropdownClassName="w-64 rounded-2xl border-border/60 bg-neutral-900 px-4 py-2 text-neutral-50 shadow-2xl"
      itemClassName="p-0 text-neutral-50 hover:bg-white/10 focus:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
    />
  );

  return (
    <div
      ref={ref}
      className="fixed bottom-0 left-0 right-0 z-30 px-3 sm:px-4 pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none"
    >
      {/* blur 레이어 */}
      <div className="absolute inset-0 backdrop-blur mask-fade-t" />

      {/* dock 슬롯 — '이미지 설명' 카드 바로 위에 붙어 자동으로 높이 변화 추적 */}
      {topSlot ? <div className="relative z-2 mx-auto mb-2 max-w-[72rem] pointer-events-auto">{topSlot}</div> : null}

      {/* 콘텐츠 레이어 */}
      <div
        className={cn(
          "relative z-2 flex items-center flex-col gap-1 max-w-[72rem] mx-auto p-4 border border-border rounded-2xl shadow-lg pointer-events-auto",
          "bg-surface dark:bg-[rgba(0,0,0,0.8)]",
        )}
      >
        <div className={cn("flex gap-2 w-full", isActionBar && "hidden")}>
          {/* 이미지 설명 폼 — action-bar 변형에서는 프롬프트가 본문화되어 미렌더링 */}
          {composer ? <div className="mx-auto mb-2 w-full">{composer}</div> : null}
        </div>

        {/* 최종 프롬프트 스트립 (3차 정리) — 플로팅 바 상단: 1줄 미리보기 + 화살표 버튼으로 확장(max-height 확인 UI) */}
        {promptPreview && promptText ? (
          <div className="w-full border-b border-border/60 pb-2 mb-2">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-xs font-semibold text-primary-text">
                <Lang text={{ ko: "프롬프트 확인하기", en: "Check Prompt" }} />
              </p>
              <Button
                variant="blank"
                size="icon-xs"
                rounded="full"
                onClick={() => setPromptOpen((prev) => !prev)}
                aria-expanded={promptOpen}
                aria-label={lang({
                  ko: promptOpen ? "프롬프트 접기" : "프롬프트 펼쳐서 확인",
                  en: promptOpen ? "Collapse prompt" : "Expand prompt",
                })}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("icon-xs transition-transform", promptOpen && "rotate-180")} />
              </Button>
            </div>

            {promptOpen ? (
              <div className="mt-2 rounded-lg border border-border/60 bg-background p-2">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <span className="text-xxs text-muted-foreground">
                    <Lang text={{ ko: "최종 프롬프트", en: "Final Prompt" }} />
                    <span className="ml-1 tabular-nums">{promptBytes} Bytes</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {promptPreview.onCopy ? (
                      <Button
                        variant="blank"
                        size="icon-xs"
                        onClick={() => void handlePromptCopy()}
                        disabled={promptCopied}
                        aria-label={lang({
                          ko: promptCopied ? "복사 완료" : "프롬프트 복사",
                          en: promptCopied ? "Copied" : "Copy prompt",
                        })}
                      >
                        {promptCopied ? <Check className="icon-xxs" /> : <Copy className="icon-xxs" />}
                      </Button>
                    ) : null}

                    {promptPreview.canViewDebugPrompt && promptPreview.debugText ? (
                      <Button
                        variant="blank"
                        size="icon-xs"
                        onClick={() => setDebugPromptOpen(true)}
                        aria-label={lang({ ko: "전체 전송 프롬프트 보기", en: "View full prompt" })}
                      >
                        <Bug className="icon-xxs" />
                      </Button>
                    ) : null}

                    {onToggleCustomMode ? (
                      <Button
                        variant="blank"
                        size="icon-xs"
                        onClick={onToggleCustomMode}
                        aria-label={lang({ ko: "프롬프트 직접 편집으로 전환", en: "Switch to direct prompt edit" })}
                        className="flex items-center gap-1 rounded-lg px-1.5 text-xxs text-muted-foreground hover:text-primary"
                      >
                        <SquarePen className="icon-xxs" />
                        <Lang text={{ ko: "직접 수정", en: "Edit directly" }} className="sr-only" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto scrollbar-thin whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-muted-foreground/80">
                  {promptText}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex w-full items-end justify-between gap-2">
          {!isActionBar && (
            <div className="flex min-w-0 flex-1 items-end gap-2">
              {attachmentPreviewItems.length > 0 ? (
                <div className="min-w-0 max-w-[52vw] overflow-x-auto sm:max-w-sm">
                  <div className="flex w-max items-center gap-1.5">
                    {attachmentPreviewItems.map((item) => (
                      <div
                        key={item.id}
                        className="group relative h-[100px] shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2"
                      >
                        <ImageBox
                          src={item.src}
                          alt={item.alt}
                          height={100}
                          objectFit="object-cover"
                          className="rounded-lg"
                        />
                        {item.label ? (
                          <span className="pointer-events-none absolute bottom-0 left-0 max-w-full truncate rounded-tr bg-black/65 px-1 text-[0.6rem] leading-4 text-white">
                            <Lang text={item.label} />
                          </span>
                        ) : null}
                        <Button
                          variant="blank"
                          size="icon-xs"
                          rounded="full"
                          onClick={item.onRemove}
                          className="absolute right-0.5 top-0.5 h-4 w-4 bg-red-500/85 text-white"
                          aria-label={item.removeAriaLabel}
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {addMenuTooltip ? (
                <TooltipProvider>
                  <Tooltip open={isAddMenuTooltipOpen}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">{addMenu}</span>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8} className="text-xs">
                      <div className="flex items-center gap-1">
                        <Lang text={addMenuTooltip} />
                        <Button
                          variant="blank"
                          size="icon-xs"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDismissedAddMenuTooltipId(addMenuTooltipId);
                          }}
                          aria-label={lang({ ko: "이미지 추가 안내 닫기", en: "Close image add notice" })}
                          className="-mr-2 shrink-0"
                        >
                          <X className="icon-xs" />
                        </Button>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                addMenu
              )}
            </div>
          )}

          <div className="relative flex items-center justify-between gap-2 flex-1">
            {/* 비용·잔액 상시 표기(계약 §3.8) — 비용 tooltip은 상시 노출로 대체되어 제거(2차 정리) */}
            <div className="flex items-center gap-0.5 pr-1">
              {estimatedCoins != null ? (
                <span className="whitespace-nowrap text-xs font-semibold text-primary-text tabular-nums">
                  -{estimatedCoins.toLocaleString()}
                  <span className="ml-0.5 text-[0.65rem] font-medium text-muted-foreground">Coins</span>
                </span>
              ) : null}
              {coinShortage ? (
                <span className="flex flex-col whitespace-nowrap font-medium text-amber-600">
                  <Lang text={{ ko: "잔액 부족", en: "Low balance" }} />
                  <Lang
                    text={{ ko: "충전 후 이용하세요.", en: "top up to continue" }}
                    className="text-xxs text-secondary-text"
                  />
                </span>
              ) : balanceSlot ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xxs text-muted-foreground">
                  {estimatedCoins != null ? <>({balanceSlot})</> : balanceSlot}
                </span>
              ) : null}
            </div>
            <Button
              variant="primary"
              size="sm"
              rounded="xl"
              onClick={onGenerate}
              disabled={disabled}
              loading={isGenerating}
              className={cn(isGenerating && "cursor-progress")}
            >
              <>
                <Sparkles className="icon-xs" />
                <Lang text={generateText} className="" />
              </>
            </Button>

          </div>
        </div>
      </div>

      {promptPreview?.canViewDebugPrompt && promptPreview.debugText ? (
        <PromptPreviewDebugDialog
          open={debugPromptOpen}
          onOpenChange={setDebugPromptOpen}
          prompt={promptPreview.debugText}
        />
      ) : null}

      <div className="relative z-2 text-center mt-2 px-4">
        {isGenerating || pendingCount > 0 ? (
          <p
            className={cn(
              "px-1 text-xxs break-keep",
              isGenerating ? "font-medium text-primary" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            <Lang
              text={
                isGenerating
                  ? pendingCount > 1
                    ? {
                        ko: (
                          <>
                            {generationTargetText.ko} 생성이 진행 중입니다.
                            <br />
                            현재 <b className="text-primary">{pendingCount}건</b>이 순차 처리되고 있어요.
                          </>
                        ),
                        en: (
                          <>
                            <b className="text-primary">{pendingCount}</b> {generationTargetText.en} generation requests
                            are currently being processed.
                          </>
                        ),
                      }
                    : {
                        ko: (
                          <>
                            {generationTargetText.ko} 생성이 진행 중입니다.
                            <br />
                            완료되면 이 화면에 결과와 알림이 이어집니다.
                          </>
                        ),
                        en: (
                          <>
                            {generationTargetText.en} generation is in progress.
                            <br />
                            The result and notification will appear here when ready.
                          </>
                        ),
                      }
                  : {
                      ko: (
                        <>
                          백그라운드에서 <b className="text-primary">{pendingCount}건</b> 생성 중이에요. 완료되면
                          알림으로 알려드릴께요.
                        </>
                      ),
                      en: (
                        <>
                          <b className="text-primary">{pendingCount}</b> generation request(s) are running in the
                          background. You will be notified when complete.
                        </>
                      ),
                    }
              }
            />
          </p>
        ) : (
          <p className="text-secondary-text text-xxs break-keep">
            {idleNotice || (
              <Lang
                text={{
                  ko: <>AI는 실수를 할 수 있어요. 중요한 내용은 꼼꼼히 확인하세요.</>,
                  en: <>AI can make mistakes. please check important details carefully.</>,
                }}
              />
            )}
          </p>
        )}
      </div>
    </div>
  );
});
