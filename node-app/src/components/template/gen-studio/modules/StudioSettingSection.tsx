"use client";

import type { ReactNode } from "react";
import { cn } from "utils/common";

type StudioSettingSectionProps = {
  title: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function StudioSettingSection({
  title,
  icon,
  description,
  actions,
  children,
  className,
  contentClassName,
}: StudioSettingSectionProps) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon ? <span aria-hidden="true">{icon}</span> : null}
          <h3 className="min-w-0">{title}</h3>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {description ? <p className="px-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      <div className={cn("space-y-2", contentClassName)}>{children}</div>
    </section>
  );
}

export type { StudioSettingSectionProps };
