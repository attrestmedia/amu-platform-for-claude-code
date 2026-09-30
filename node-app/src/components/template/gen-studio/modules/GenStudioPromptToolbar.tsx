"use client";

import type { ReactNode } from "react";
import { BookmarkCheck, Layers, Pencil, Settings2 } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { SEARCH_FIELD_OPTIONS } from "consts/app";
import { cn } from "utils/common";

export type LocalizedNode = {
  ko: ReactNode;
  en: ReactNode;
};

export type LocalizedText = {
  ko: string;
  en: string;
};

export type GenStudioPromptToolbarAction = {
  text: LocalizedNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
};

export type GenStudioSearchMode = "template" | "image";

type GenStudioPromptToolbarProps = {
  searchField: string;
  onSearchFieldChange: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder?: LocalizedText;
  bookmark?: GenStudioPromptToolbarAction;
  manage?: GenStudioPromptToolbarAction;
  groupManage?: GenStudioPromptToolbarAction;
  customPrompt?: GenStudioPromptToolbarAction;
  searchMode?: GenStudioSearchMode;
  onSearchModeChange?: (mode: GenStudioSearchMode) => void;
  searchFieldOptions?: Array<{ value: string; label: { ko: string; en: string } }>;
  className?: string;
};

export function GenStudioPromptToolbar({
  searchField,
  onSearchFieldChange,
  query,
  onQueryChange,
  searchPlaceholder = { ko: "템플릿을 검색하세요", en: "Search for a template" },
  bookmark,
  manage,
  groupManage,
  customPrompt,
  searchMode,
  onSearchModeChange,
  searchFieldOptions = SEARCH_FIELD_OPTIONS,
  className,
}: GenStudioPromptToolbarProps) {
  const actionCount = [bookmark, manage, groupManage].filter(Boolean).length;
  const actionGridClass =
    actionCount >= 2 ? "grid-cols-2" : manage || groupManage ? "grid-cols-[auto] justify-end" : "grid-cols-1";

  return (
    <div className={cn("mb-6 flex flex-col gap-2 sm:flex-row", className)}>
      {searchMode && onSearchModeChange ? (
        <Select value={searchMode} onValueChange={(value) => onSearchModeChange(value as GenStudioSearchMode)}>
          <SelectTrigger className="w-full shrink-0 sm:w-32">
            <SelectValue placeholder={lang({ ko: "검색 모드", en: "Search mode" })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="template">
              <Lang text={{ ko: "템플릿", en: "Templates" }} />
            </SelectItem>
            <SelectItem value="image">
              <Lang text={{ ko: "이미지", en: "Images" }} />
            </SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      <div className="flex w-full min-w-0 flex-1 gap-1">
        <Select value={searchField} onValueChange={(value) => onSearchFieldChange(String(value))}>
          <SelectTrigger className="max-w-24 shrink-0">
            <SelectValue placeholder={lang({ ko: "검색 필드", en: "Search Field" })} />
          </SelectTrigger>
          <SelectContent>
            {searchFieldOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <Lang text={opt.label} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder={lang(searchPlaceholder)}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="min-w-0 flex-1"
        />
      </div>

      {customPrompt ? (
        <Button
          rounded="lg"
          variant="outline"
          onClick={customPrompt.onClick}
          disabled={customPrompt.disabled}
          className="shrink-0"
        >
          <Pencil className="icon-xs shrink-0" />
          <Lang as="span" text={customPrompt.text} className="text-xs" />
        </Button>
      ) : null}

      {actionCount > 0 && (
        <div
          className={cn(
            "grid w-full min-w-0 gap-1",
            "sm:flex sm:w-auto sm:shrink-0",
            "sm:[&>button]:h-10 sm:[&>button]:w-10 sm:[&>button]:justify-center sm:[&>button]:px-0",
            "sm:[&>button>span]:sr-only",
            actionGridClass,
          )}
        >
          {bookmark && (
            <Button
              rounded="lg"
              variant={bookmark.active ? "secondary" : "outline"}
              onClick={bookmark.onClick}
              disabled={bookmark.disabled}
              className="min-w-0 gap-1"
            >
              <BookmarkCheck className="icon-xs shrink-0" />
              <Lang as="span" text={bookmark.text} />
            </Button>
          )}

          {manage && (
            <Button
              rounded="lg"
              variant={manage.active ? "secondary" : "outline"}
              onClick={manage.onClick}
              disabled={manage.disabled}
              className="min-w-0 gap-1"
            >
              <Settings2 className="icon-xs shrink-0" />
              <Lang as="span" text={manage.text} />
            </Button>
          )}

          {groupManage && (
            <Button
              rounded="lg"
              variant={groupManage.active ? "secondary" : "outline"}
              onClick={groupManage.onClick}
              disabled={groupManage.disabled}
              className="min-w-0 gap-1"
            >
              <Layers className="icon-xs shrink-0" />
              <Lang as="span" text={groupManage.text} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
