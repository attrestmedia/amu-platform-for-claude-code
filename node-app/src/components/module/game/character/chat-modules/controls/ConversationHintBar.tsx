"use client";

import { Lightbulb, RotateCcw } from "lucide-react";
import { Button, ScrollArea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";

type ConversationHintBarProps = {
  hints: string[];
  isLoading?: boolean;
  disabled?: boolean;
  onPick: (hint: string) => void;
  onRegenerate?: () => void;
};

export function ConversationHintBar({ hints, isLoading, disabled, onPick, onRegenerate }: ConversationHintBarProps) {
  if (!hints.length && !isLoading) return null;

  return (
    <div className="mb-2 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-white shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-white/80">
          <Lightbulb className="icon-xs text-yellow-300" />
          <Lang text={{ ko: "대화 힌트", en: "Conversation hints" }} />
        </div>
        {onRegenerate ? (
          <Button
            variant="blank"
            size="icon-sm"
            rounded="full"
            onClick={onRegenerate}
            disabled={disabled || isLoading}
            aria-label={lang({ ko: "대화 힌트 다시 생성", en: "Regenerate conversation hints" })}
            className="icon-sm text-white/70 hover:text-white"
          >
            <RotateCcw className={cn("icon-xs", isLoading && "animate-pulse")} />
          </Button>
        ) : null}
      </div>
      <div className="-mx-3">
        <ScrollArea dragOnScrollX dragIgnoreInteractive={false} scrollbars="none">
          <div className="flex min-w-max flex-nowrap gap-1.5 px-3 pb-1">
            {hints.map((hint) => (
              <Button
                key={hint}
                variant="blank"
                size="sm"
                rounded="xl"
                noWrap={false}
                disabled={disabled}
                onClick={() => onPick(hint)}
                className={cn(
                  "max-w-[15rem] h-auto shrink-0 border border-white/15 bg-white/10 px-3 py-1.5 text-left text-xs leading-relaxed text-white",
                  "transition-colors hover:border-white/30 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {hint}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
