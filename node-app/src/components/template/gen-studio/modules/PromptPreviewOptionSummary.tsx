"use client";

import type { ReactNode } from "react";
import { cn } from "utils/common";
import { Badge } from "@amu-labs/ui";

export type PromptPreviewSummaryItemType = {
  label: ReactNode;
  value: ReactNode;
  hidden?: boolean;
};

export function PromptPreviewOptionSummary({
  items,
  className,
}: {
  items: PromptPreviewSummaryItemType[];
  className?: string;
}) {
  const visibleItems = items.filter((item) => !item.hidden && item.value !== null && item.value !== undefined);
  if (visibleItems.length === 0) return null;

  return (
    <dl className={cn("grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-xs leading-4", className)}>
      {visibleItems.map((item, index) => (
        <div key={index} className="inline-flex gap-2 min-w-0">
          <dt className="truncate text-muted-foreground">
            <Badge size="xs" variant="outline" className="border-primary text-primary min-w-16">
              {item.label}
            </Badge>
          </dt>
          <dd className="flex-1 mt-0.5 truncate font-medium text-foreground" title={String(item.value || "")}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
