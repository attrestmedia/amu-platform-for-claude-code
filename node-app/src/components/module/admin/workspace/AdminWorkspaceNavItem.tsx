"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";
import { isAdminWorkspaceNavItemActive, type AdminWorkspaceNavItem as AdminWorkspaceNavItemType } from "./adminWorkspaceNavModel";

export function AdminWorkspaceNavItem({ item, onNavigate }: { item: AdminWorkspaceNavItemType; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isAdminWorkspaceNavItemActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "group flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm transition-colors duration-[180ms]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        active ? "bg-primary text-primary-foreground" : "text-secondary-text hover:bg-surface-2 hover:text-primary-text",
      )}
    >
      {item.step ? (
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold",
            active ? "bg-white/20 text-primary-foreground" : "bg-surface-2 text-secondary-text",
          )}
        >
          {item.step}
        </span>
      ) : Icon ? (
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
      ) : null}

      <span className="min-w-0 truncate">
        <span className="block truncate font-medium">
          <Lang text={item.label} />
        </span>
        {item.description ? (
          <span className={cn("mt-0.5 block truncate text-xs", active ? "text-primary-foreground/75" : "text-muted-text")}>
            <Lang text={item.description} />
          </span>
        ) : null}
      </span>
    </Link>
  );
}
