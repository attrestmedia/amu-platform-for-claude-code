"use client";

import { Button } from "@amu-labs/ui";
import { Menu } from "lucide-react";
import { lang } from "components/module/i18n";

type WorkspaceSidebarToggleProps = {
  expanded: boolean;
  controlsId?: string;
  onToggle: () => void;
};

export function WorkspaceSidebarToggle({ expanded, controlsId, onToggle }: WorkspaceSidebarToggleProps) {
  return (
    <Button
      variant="blank"
      size="icon-lg"
      className="rounded-md focus-visible-ring"
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label={expanded ? lang({ ko: "사이드바 숨기기", en: "Hide sidebar" }) : lang({ ko: "사이드바 보이기", en: "Show sidebar" })}
      onClick={onToggle}
    >
      <Menu className="icon-xs" aria-hidden />
    </Button>
  );
}
