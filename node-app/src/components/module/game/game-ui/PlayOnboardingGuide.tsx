"use client";

import { Check, Circle, RotateCcw } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import type { PlayOnboardingProgress } from "utils/game/playOnboarding";

type PlayOnboardingGuideProps = {
  progress: PlayOnboardingProgress;
  onReset: () => void;
};

export default function PlayOnboardingGuide({ progress, onReset }: PlayOnboardingGuideProps) {
  const steps = [
    {
      done: progress.characterReady,
      label: { ko: "캐릭터 준비하기", en: "Prepare your character" },
    },
    {
      done: progress.moved,
      label: { ko: "조이패드로 걸어보기", en: "Walk with the joypad" },
    },
    {
      done: progress.talked,
      label: { ko: "NPC에게 말 걸기", en: "Talk to an NPC" },
    },
  ];
  const completedCount = steps.filter((step) => step.done).length;
  const complete = completedCount === steps.length;

  return (
    <aside
      data-testid="play-onboarding-guide"
      className="pointer-events-auto absolute left-3 top-3 z-[75] w-[min(17.5rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-background/94 p-4 text-primary-text shadow-lg backdrop-blur-md"
      aria-label="AMU Play onboarding"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">AMU Play</p>
          <h2 className="mt-1 text-base font-semibold">
            {complete ? (
              <Lang text={{ ko: "첫 모험 완료", en: "First adventure complete" }} />
            ) : (
              <Lang text={{ ko: `첫 모험 ${completedCount + 1}/3`, en: `First adventure ${completedCount + 1}/3` }} />
            )}
          </h2>
        </div>
        {complete ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="min-h-11 min-w-11"
            onClick={onReset}
            aria-label="Restart onboarding"
            title="Restart onboarding"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <li
            key={index}
            className={[
              "flex min-h-7 items-center gap-2 text-sm",
              step.done ? "text-primary-text" : "text-secondary-text",
            ].join(" ")}
            aria-current={!step.done && index === completedCount ? "step" : undefined}
          >
            {step.done ? (
              <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <Lang text={step.label} />
          </li>
        ))}
      </ol>
    </aside>
  );
}
