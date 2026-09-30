"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { Badge, Button, OptionSelectSheet } from "@amu-labs/ui";
import type { OptionSelectFieldOption } from "@amu-labs/ui";
import { cn } from "utils/common/tailwind";

const MODEL_SELECT_PANEL_CLASS =
  "h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] supports-[height:100dvh]:h-[calc(100dvh-1rem)] supports-[height:100dvh]:max-h-[calc(100dvh-1rem)] md:h-[42rem] md:max-h-[calc(100vh-2rem)] md:supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]";
const MODEL_SELECT_BODY_CLASS = "flex overflow-hidden";
const MODEL_SELECT_TRIGGER_CLASS = [
  "flex w-full items-center justify-between gap-3 rounded-lg border-2 bg-background px-4 py-3 text-left shadow-sm transition-all",
  "hover:border-primary/35 disabled:cursor-not-allowed disabled:opacity-50",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
].join(" ");

/**
 * AI 모델 선택 도메인 옵션 — @amu-labs/ui 의 OptionSelectFieldOption 에
 * AI 모델 카탈로그·코인 경제 시맨틱을 얹는다(P3: 공통 패키지가 아닌 node-app module이 소유).
 */
export type ModelSelectOption = OptionSelectFieldOption & {
  providerLabel?: string;
  purpose?: string;
  note?: string;
  coins?: number | null;
  usageBilled?: boolean;
  defaultModel?: boolean;
  recommended?: boolean;
  adminOnly?: boolean;
  deprecated?: boolean;
};

export type ModelSelectBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  options: ModelSelectOption[];
  selectedValues: string[];
  onSelect: (value: string) => void;
  selectedLabel?: ReactNode;
  doneText?: ReactNode;
  emptyText?: ReactNode;
  portal?: boolean;
  closeOnSelect?: boolean;
};

export type ModelSelectFieldProps = {
  value: string;
  options: ModelSelectOption[];
  onChange: (value: string) => void;
  title: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  doneText?: ReactNode;
  emptyText?: ReactNode;
  portal?: boolean;
};

// 트리거 부제는 providerLabel/badgeText, 시트 부제는 note가 원본 규칙이었으나
// OptionSelectField는 부제(description)가 트리거·시트 공용이라 provider를 부제로 통일하고,
// note·상태 배지는 renderOptionBadges 로 주입한다.
function toFieldOption(option: ModelSelectOption): ModelSelectOption {
  return { ...option, description: option.providerLabel || option.badgeText };
}

function renderBillingBadge(option: ModelSelectOption | null): ReactNode {
  if (!option) return null;
  if (option.usageBilled) {
    return (
      <span
        className="shrink-0 rounded-full bg-muted px-2 py-1 text-xxs font-semibold text-muted-foreground"
        title={lang({
          ko: "입력/출력 사용량에 따라 완료 후 코인이 차감됩니다.",
          en: "Coins are charged after completion based on usage.",
        })}
      >
        Usage
      </span>
    );
  }
  if (option.coins != null) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-center text-accent-text shadow-sm">
        <span className="flex flex-col leading-none">
          <b className="text-xs">{option.coins}</b>
          <span className="text-xxs font-mono">Coins</span>
        </span>
      </span>
    );
  }
  return null;
}

function renderModelBadges(option: ModelSelectOption): ReactNode {
  return (
    <>
      {option.note ? <span className="text-xxs font-normal text-muted-foreground">{option.note}</span> : null}
      <span className="flex flex-wrap items-center gap-1.5 text-xxs font-normal text-muted-foreground">
        {option.defaultModel ? (
          <Badge variant="neutral" size="xs" className="w-fit uppercase">
            Default
          </Badge>
        ) : null}
        {option.recommended ? (
          <Badge variant="outline" size="xs" className="w-fit border-primary/20 bg-primary/10 text-primary">
            <Lang text={{ ko: "추천", en: "Recommended" }} />
          </Badge>
        ) : null}
        {option.adminOnly ? (
          <Badge variant="neutral" size="xs" className="w-fit">
            <Lang text={{ ko: "관리자 전용", en: "Admin only" }} />
          </Badge>
        ) : null}
      </span>
      {option.deprecated ? (
        <span className="mt-1 inline-flex w-fit rounded-full bg-amber-500/10 px-2 py-0.5 text-xxs font-semibold text-amber-700">
          <Lang text={{ ko: "폐기 예정", en: "Deprecated" }} />
        </span>
      ) : null}
    </>
  );
}

export function ModelSelectBottomSheet({
  open,
  onClose,
  title,
  options,
  selectedValues,
  onSelect,
  selectedLabel,
  doneText,
  emptyText,
  portal = true,
  closeOnSelect = false,
}: ModelSelectBottomSheetProps) {
  const fieldOptions = useMemo(() => options.map(toFieldOption), [options]);

  return (
    <OptionSelectSheet<ModelSelectOption>
      open={open}
      onClose={onClose}
      title={title}
      options={fieldOptions}
      selectedValues={selectedValues}
      onSelect={onSelect}
      description={lang({
        ko: "사용량에 따라 코인이 차감됩니다.",
        en: "Coins are charged based on usage.",
      })}
      selectedLabel={selectedLabel}
      doneText={doneText}
      emptyText={emptyText}
      portal={portal}
      closeOnSelect={closeOnSelect}
      panelClassName={MODEL_SELECT_PANEL_CLASS}
      bodyClassName={MODEL_SELECT_BODY_CLASS}
      renderOptionBadges={(option) => renderModelBadges(option)}
      renderOptionExtra={(option) => renderBillingBadge(option)}
    />
  );
}

export function ModelSelectField({
  value,
  options,
  onChange,
  title,
  placeholder,
  disabled = false,
  className,
  triggerClassName,
  doneText,
  emptyText,
  portal = true,
}: ModelSelectFieldProps) {
  const fieldOptions = useMemo(() => options.map(toFieldOption), [options]);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => fieldOptions.find((option) => option.value === value) ?? null, [fieldOptions, value]);

  return (
    <>
      <Button
        variant="blank"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(MODEL_SELECT_TRIGGER_CLASS, selected && "border-primary/30 bg-primary/10", triggerClassName, className)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-primary-text">
            {selected?.title || placeholder || lang({ ko: "항목을 선택하세요", en: "Select an item" })}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {selected?.description ? <span className="text-xxs text-secondary-text">{selected.description}</span> : null}
            {selected?.metaText ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold leading-none text-secondary-text">
                {selected.metaText}
              </span>
            ) : null}
            {selected?.badgeText ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold leading-none text-secondary-text">
                {selected.badgeText}
              </span>
            ) : null}
            {selected?.priceText ? (
              <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xxs font-semibold leading-none text-accent-text">
                {selected.priceText}
              </span>
            ) : null}
          </span>
        </span>
        {renderBillingBadge(selected)}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-secondary-text", open && "text-primary")} />
      </Button>
      <OptionSelectSheet<ModelSelectOption>
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        options={fieldOptions}
        selectedValues={value ? [value] : []}
        onSelect={onChange}
        doneText={doneText}
        emptyText={emptyText}
        portal={portal}
        closeOnSelect
        panelClassName={MODEL_SELECT_PANEL_CLASS}
        bodyClassName={MODEL_SELECT_BODY_CLASS}
        renderOptionBadges={(option) => renderModelBadges(option)}
        renderOptionExtra={(option) => renderBillingBadge(option)}
      />
    </>
  );
}
