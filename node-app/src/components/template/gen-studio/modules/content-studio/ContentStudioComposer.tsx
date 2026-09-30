"use client";

import { Label, Textarea } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { SquareTerminal } from "lucide-react";
import { cn } from "utils/common";

type ContentStudioComposerProps = {
  isCustomMode: boolean;
  customPrompt: string;
  extra: string;
  onChangeCustomPrompt: (value: string) => void;
  onChangeExtra: (value: string) => void;
};

/** 콘텐츠 고유 입력 표현. 실제 queue payload는 useContentStudioGeneration이 소유한다. */
export function ContentStudioComposer({
  isCustomMode,
  customPrompt,
  extra,
  onChangeCustomPrompt,
  onChangeExtra,
}: ContentStudioComposerProps) {
  return (
    <div className="relative space-y-2">
      <Label
        htmlFor="gen_content_desc_input"
        required={isCustomMode}
        className="mb-0 w-full"
        labelClassName="text-sm font-medium text-muted-foreground"
        label={
          <span className="flex items-center gap-2">
            <SquareTerminal className="icon-xs" />
            {isCustomMode
              ? lang({ ko: "콘텐츠 프롬프트", en: "Content Prompt" })
              : lang({ ko: "추가 프롬프트", en: "Additional Prompt" })}
          </span>
        }
      />

      <Label htmlFor="gen_content_desc_input" variant="card" className="w-full">
        <Textarea
          id="gen_content_desc_input"
          rows={isCustomMode ? 4 : 2}
          autoResize
          variant="card"
          value={isCustomMode ? customPrompt : extra}
          size="sm"
          onChange={(event) => {
            const value = event.target.value;
            if (isCustomMode) {
              onChangeCustomPrompt(value);
              return;
            }
            onChangeExtra(value);
          }}
          placeholder={lang({
            ko: isCustomMode ? "만들고 싶은 콘텐츠를 직접 설명하세요." : "톤, 관점, 꼭 포함할 내용을 추가로 입력하세요.",
            en: isCustomMode
              ? "Describe the content you want to generate."
              : "Add tone, angle, or details that must be included.",
          })}
          className={cn(
            "max-h-32 overflow-y-auto border-none p-0 text-sm dark:bg-transparent",
            isCustomMode && "font-mono",
          )}
        />
      </Label>
    </div>
  );
}

export type { ContentStudioComposerProps };
