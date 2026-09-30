"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";
import type { ForgeNavItem } from "../model/forgeNavModel";
import type { ForgeStepStatus } from "../model/forgeStepStatus";

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/assets-studio") return pathname === "/assets-studio";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ForgeSidebarNavItem({ item, status = "todo" }: { item: ForgeNavItem; status?: ForgeStepStatus }) {
  const pathname = usePathname();
  const active = isItemActive(pathname, item.href);
  const locked = status === "locked";
  const done = status === "done";
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-disabled={locked || undefined}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm transition-colors duration-[180ms]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        active
          ? "bg-primary text-primary-foreground"
          : locked
            ? "text-secondary-text opacity-55"
            : "text-secondary-text hover:bg-surface-2 hover:text-primary-text",
      )}
    >
      {item.step ? (
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold",
            active ? "bg-white/20 text-primary-foreground" : done ? "bg-accent text-accent-foreground" : "bg-surface-2 text-secondary-text",
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : locked ? <Lock className="h-3 w-3" /> : item.step}
        </span>
      ) : Icon ? (
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
      ) : null}

      <span className="truncate">
        <Lang text={item.label} />
      </span>
    </Link>
  );
}
