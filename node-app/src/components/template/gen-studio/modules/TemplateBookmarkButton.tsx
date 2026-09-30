"use client";

import type { MouseEvent } from "react";
import { Button } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "utils/common";

type TemplateBookmarkButtonProps = {
  active: boolean;
  loading?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
};

export function TemplateBookmarkButton({ active, loading = false, onClick, className }: TemplateBookmarkButtonProps) {
  return (
    <Button
      variant="blank"
      size="icon-xs"
      aria-label={lang({
        ko: active ? "북마크 해제" : "북마크 추가",
        en: active ? "Remove bookmark" : "Add bookmark",
      })}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick(event);
      }}
      disabled={loading}
      className={cn(
        "rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition-colors",
        active && "border-primary/40 bg-primary/10 bg-primary/40 text-white",
        !loading && "hover:border-primary/40 hover:text-primary",
        className,
      )}
    >
      {active ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
    </Button>
  );
}
