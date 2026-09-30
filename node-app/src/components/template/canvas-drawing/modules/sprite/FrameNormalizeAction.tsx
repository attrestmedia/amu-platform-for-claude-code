"use client";

import { AlignCenter } from "lucide-react";
import { Lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";

export function FrameNormalizeAction({
  disabled,
  loading,
  onNormalize,
}: {
  disabled?: boolean;
  loading?: boolean;
  onNormalize: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11"
      disabled={disabled}
      loading={loading}
      loadingText={<Lang text={{ ko: "정규화 중...", en: "Normalizing..." }} />}
      onClick={onNormalize}
    >
      <AlignCenter className="size-4" aria-hidden />
      <Lang text={{ ko: "프레임 일괄 정규화", en: "Normalize all frames" }} />
    </Button>
  );
}
