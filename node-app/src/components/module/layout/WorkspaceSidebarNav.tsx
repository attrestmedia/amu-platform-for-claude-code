"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";
import { isWorkspaceNavItemActive, type WorkspaceLocalizedText, type WorkspaceNavSection } from "./workspaceNavModel";

function renderLabel(label: WorkspaceLocalizedText | string) {
  return typeof label === "string" ? label : <Lang text={label} />;
}

export function WorkspaceSidebarNav({ sections, ariaLabel }: { sections: WorkspaceNavSection[]; ariaLabel: string }) {
  const pathname = usePathname() || "";

  return (
    <nav aria-label={ariaLabel} className="flex flex-col">
      {sections.filter((section) => section.items.length > 0).map((section) => (
        <div key={section.id}>
          {section.label ? (
            <p className="px-2.5 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-text">
              {renderLabel(section.label)}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = isWorkspaceNavItemActive(pathname, item);
              const Icon = item.icon;

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                      "focus-visible-ring motion-reduce:transition-none",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-secondary-text hover:bg-surface-2 hover:text-primary-text",
                    )}
                  >
                    {Icon ? <Icon className="icon-xs shrink-0" aria-hidden /> : null}
                    <span className="truncate">{renderLabel(item.label)}</span>
                    {item.badge && item.badge.value > 0 ? (
                      <>
                        <Badge
                          variant="outline"
                          size="xs"
                          className={cn("ml-auto shrink-0", active && "border-primary-foreground text-primary-foreground")}
                          aria-hidden
                        >
                          {item.badge.value}
                        </Badge>
                        <span className="sr-only">
                          <Lang text={item.badge.label} /> {item.badge.value}
                        </span>
                      </>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
