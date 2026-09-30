"use client";

import type { ReactNode } from "react";
import { Button } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { ChevronRight, LockKeyhole } from "lucide-react";
import { cn } from "utils/common";

type StudioSettingRowProps = {
  label: ReactNode;
  value: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  locked?: boolean;
  showChevron?: boolean;
  trailing?: ReactNode;
  noWrap?: boolean;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
};

export function StudioSettingRow({
  label,
  value,
  onClick,
  ariaLabel,
  disabled = false,
  locked = false,
  showChevron = true,
  trailing,
  noWrap = true,
  className,
  labelClassName,
  valueClassName,
}: StudioSettingRowProps) {
  const isUnavailable = disabled || locked;

  return (
    <Button
      variant="blank"
      onClick={onClick}
      disabled={isUnavailable}
      noWrap={noWrap}
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-left hover:text-primary",
        isUnavailable && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className={cn("shrink-0 text-xs font-medium text-muted-foreground", labelClassName)}>{label}</span>
      {trailing || (
        <span className={cn("flex min-w-0 items-center gap-1 text-sm font-semibold text-primary-text", valueClassName)}>
          <span className={cn("min-w-0", noWrap && "truncate")}>{value}</span>
          {locked ? (
            <LockKeyhole
              className="icon-xs shrink-0 text-muted-foreground"
              aria-label={lang({ ko: "고정됨", en: "Locked" })}
            />
          ) : showChevron ? (
            <ChevronRight className="icon-xs shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : null}
        </span>
      )}
    </Button>
  );
}

export type { StudioSettingRowProps };
