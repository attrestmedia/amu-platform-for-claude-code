import { Maximize2, Navigation } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { useGameStore, useUiControlStore } from "store/game";
import { cn } from "utils/common";
import { isPointOutsideCameraViewport } from "utils/game";

interface StageNavigationControlsProps {
  isPanModeEnabled: boolean;
  onTogglePanMode: () => void;
}

export default function StageNavigationControls({
  isPanModeEnabled,
  onTogglePanMode,
}: StageNavigationControlsProps) {
  const camera = useGameStore((state) => state.camera);
  const protagonist = useGameStore((state) => state.protagonist);
  const focusCameraOn = useGameStore((state) => state.focusCameraOn);
  const attachCameraToProtagonist = useGameStore((state) => state.attachCameraToProtagonist);
  const isInputLocked = useUiControlStore((state) => state.isInputLocked);
  const stageTransitionActive = useGameStore((state) => state.stageTransition.active);

  const showReturnToProtagonist =
    camera.mode === "free" &&
    isPointOutsideCameraViewport(camera, { x: protagonist.x, y: protagonist.baseY });
  const controlsDisabled = isInputLocked || stageTransitionActive;

  const handleReturnToProtagonist = () => {
    focusCameraOn(protagonist.x, protagonist.baseY, {
      immediate: true,
      clampToConstraints: true,
    });
    attachCameraToProtagonist();
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-5 left-1/2 z-[55] flex -translate-x-1/2 flex-col items-center gap-2"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {showReturnToProtagonist && (
        <Button
          variant="blank"
          className="flex min-h-11 items-center gap-2 rounded-full border border-white/30 bg-black/75 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-sm hover:bg-black/90"
          onClick={handleReturnToProtagonist}
          disabled={controlsDisabled}
        >
          <Navigation className="size-4" aria-hidden="true" />
          {lang({ ko: "현재 위치로 돌아가기", en: "Return to current position" })}
        </Button>
      )}

      <Button
        variant="blank"
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur-sm transition-colors",
          isPanModeEnabled
            ? "border-primary bg-primary text-primary-foreground"
            : "border-white/30 bg-black/70 text-white hover:bg-black/90",
        )}
        aria-pressed={isPanModeEnabled}
        title={lang({
          ko: "버튼을 켜거나 스페이스바를 누른 채 드래그해 스테이지를 이동합니다.",
          en: "Turn this on or hold Space while dragging to move the stage.",
        })}
        onClick={onTogglePanMode}
        disabled={controlsDisabled}
      >
        <Maximize2 className="size-4" aria-hidden="true" />
        {lang({ ko: "스테이지 이동", en: "Move stage" })}
      </Button>
    </div>
  );
}
