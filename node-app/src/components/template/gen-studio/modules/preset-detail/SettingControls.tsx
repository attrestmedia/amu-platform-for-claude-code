"use client";

import React from "react";
import { Button } from "@amu-labs/ui";
import { cn } from "utils/common";

// SettingIconButton - 아이콘 + 라벨 + 현재값 표시 버튼
export type SettingIconButtonProps = {
  icon: React.ReactNode;
  label: string;
  valueText?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
};

export function SettingIconButton({ icon, label, valueText, onClick, disabled, active }: SettingIconButtonProps) {
  const renderedValueText = () => {
    if (typeof valueText !== "string") return valueText;
    return valueText.replaceAll(" / ", "\n").replaceAll(" · ", "\n");
  };

  return (
    <Button
      variant="blank"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex-center border bg-surface py-4 w-full h-auto transition-all !rounded-2xl",
        disabled && "opacity-40 pointer-events-none",
        active && "border-primary bg-primary/10 ring-2 ring-primary/20",
      )}
    >
      <span className="flex flex-col items-center gap-1.5 w-full">
        <span className={cn("text-muted-foreground", active && "text-primary")}>{icon}</span>
        <span className="text-xs text-muted-foreground leading-none">{label}</span>
        {valueText != null && (
          <span
            className={cn(
              "text-xxs font-bold leading-none w-full px-1 mt-2 leading-tight whitespace-pre-line px-2",
              active ? "text-primary" : "text-accent-text",
            )}
          >
            {renderedValueText()}
          </span>
        )}
      </span>
    </Button>
  );
}

// AspectPreviewBox - 비율 선택용 시각적 미리보기 박스
export function AspectPreviewBox({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const maxSize = 32;
  const scale = maxSize / Math.max(w, h);
  return <div className={cn("rounded-sm bg-foreground/10")} style={{ width: w * scale, height: h * scale }} />;
}
