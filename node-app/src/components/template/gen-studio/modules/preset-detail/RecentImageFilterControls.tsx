"use client";

import { Button, Switch } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import type { RecentOwnerFilterType, RecentVisibilityFilterType } from "./types";

type RecentImageFilterControlsProps = {
  ownerFilter: RecentOwnerFilterType;
  onChangeOwnerFilter: (value: RecentOwnerFilterType) => void;
  visibilityFilter: RecentVisibilityFilterType;
  onChangeVisibilityFilter: (value: RecentVisibilityFilterType) => void;
  showVisibilityFilterButtons?: boolean;
  hideLabel?: boolean;
  className?: string;
};

export function RecentImageFilterControls({
  ownerFilter,
  onChangeOwnerFilter,
  visibilityFilter,
  onChangeVisibilityFilter,
  showVisibilityFilterButtons = true,
  hideLabel = false,
  className,
}: RecentImageFilterControlsProps) {
  const mineOnly = ownerFilter === "mine";

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-1", className)}>
      <div className={cn("flex items-center gap-2")}>
        {!hideLabel && (
          <span className="text-xxs text-muted-foreground">
            <Lang text={{ ko: "내 이미지만 보기", en: "Show mine only" }} />
          </span>
        )}
        <Switch
          size="xs"
          checked={mineOnly}
          onCheckedChange={(checked) => onChangeOwnerFilter(checked ? "mine" : "all")}
          aria-label={lang({ ko: "내 이미지만 보기", en: "Show mine only" })}
        />
      </div>

      {showVisibilityFilterButtons && (
        <div className="flex items-center gap-1">
          <Button
            variant={visibilityFilter === "public" ? "primary" : "outline"}
            size="xs"
            rounded="full"
            onClick={() => onChangeVisibilityFilter("public")}
          >
            <Lang text={{ ko: "공개", en: "Public" }} />
          </Button>
          <Button
            variant={visibilityFilter === "private" ? "primary" : "outline"}
            size="xs"
            rounded="full"
            onClick={() => onChangeVisibilityFilter("private")}
          >
            <Lang text={{ ko: "비공개", en: "Private" }} />
          </Button>
        </div>
      )}
    </div>
  );
}
