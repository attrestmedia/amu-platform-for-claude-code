"use client";

import { Check, ChevronDown, Flag, Images, RefreshCw, Sparkles } from "lucide-react";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Progress } from "@amu-labs/ui";
import { useState } from "react";
import { Lang } from "components/module/i18n";
import { DirectionWheelPreview } from "components/module/game/DirectionWheelPreview";
import type { UserGameCharacterPipelineStateType } from "libs/api/game";
import type { SpriteDirectionType } from "types/game";
import { DirectionGrid } from "components/module/game/DirectionGrid";

const STEP_LABELS: Record<string, { ko: string; en: string }> = {
  "step1-bible": { ko: "5방향 바이블 생성", en: "Generate five-direction bible" },
  "step2-base": { ko: "기본 4방향 생성", en: "Generate 4 cardinal directions" },
  "step2-diagonal": { ko: "대각선 4방향 생성", en: "Generate 4 diagonal directions" },
  "step2-dir": { ko: "실패 방향만 재생성", en: "Regenerate failed directions" },
  "step3-removebg": { ko: "배경 제거", en: "Remove background" },
  "step4-verify": { ko: "8방향 자동 검증", en: "Verify 8 directions" },
  "step5-compose": { ko: "최종 시트 합성", en: "Compose final sheet" },
};

function PipelineProgress({ state }: { state: UserGameCharacterPipelineStateType }) {
  const steps = Object.values(state.pipeline?.steps || {});
  const completed = steps.filter((step) => step.status === "success").length;
  const total = Math.max(1, steps.length);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <Lang text={{ ko: "캐릭터 생성 진행률", en: "Character generation progress" }} />
        <span>{completed}/{total}</span>
      </div>
      <Progress value={(completed / total) * 100} />
    </div>
  );
}

export function UserCharacterPipelineView({
  state,
  busy,
  error,
  onRunAction,
  onRestart,
  onReselect,
  onReport,
  onChooseCharacter,
  onRegenerateDirections,
  onMirrorDirection,
  generationDisabled = false,
  generationDisabledReason,
}: {
  state: UserGameCharacterPipelineStateType;
  busy: boolean;
  error: string;
  onRunAction: (action: "prepare" | "advance" | "confirm") => void;
  onRestart: () => void;
  onReselect: () => void;
  onReport: () => void;
  onChooseCharacter: () => void;
  onRegenerateDirections: (directions: SpriteDirectionType[]) => void;
  onMirrorDirection: (direction: SpriteDirectionType) => void;
  generationDisabled?: boolean;
  generationDisabledReason?: { ko: string; en: string };
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {state.pipeline?.status === "failed" ? (
        <div role="alert" className="space-y-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
          <p className="font-semibold text-danger">
            <Lang
              text={{
                ko: "이 기준 이미지로는 생성이 계속 실패했습니다",
                en: "Generation kept failing with this anchor image",
              }}
            />
          </p>
          <p className="text-muted-foreground">
            <Lang
              text={{
                ko: "전신·정면·단순 배경 이미지일수록 성공률이 높습니다. 다시 시도하면 다음 이미지 생성 단계에서 비용이 새로 발생합니다.",
                en: "Full-body, front-facing images with a simple background work best. Retrying starts a new paid image generation at the next generation step.",
              }}
            />
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="outline" className="min-h-11" onClick={onRestart} loading={busy}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              <Lang text={{ ko: "같은 이미지로 다시 시도", en: "Retry with the same image" }} />
            </Button>
            <Button variant="outline" className="min-h-11" onClick={onReselect} disabled={busy}>
              <Images className="mr-2 h-4 w-4" aria-hidden />
              <Lang text={{ ko: "다른 기준 이미지 선택", en: "Choose another anchor" }} />
            </Button>
          </div>
        </div>
      ) : null}

      <section className="grid gap-6 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Lang text={{ ko: "기준 캐릭터", en: "Anchor character" }} />
            </p>
            <h2 className="mt-1 text-xl font-semibold">{state.character.name}</h2>
          </div>
          <span
            role="img"
            aria-label={state.character.name}
            className="block aspect-square w-full max-w-sm rounded-xl border border-border bg-muted bg-cover bg-center"
            style={{ backgroundImage: `url("${String(state.anchorUrl || "").replace(/"/g, "%22")}")` }}
          />
          <PipelineProgress state={state} />
          <p className="text-xs text-muted-foreground">
            <Lang
              text={{
                ko: "생성 순서와 재시도 가능 여부는 서버가 판정합니다. 같은 요청은 중복 생성·중복 과금되지 않습니다.",
                en: "The server determines generation order and retry eligibility. Duplicate requests are deduplicated without duplicate billing.",
              }}
            />
          </p>
        </div>

        <div className="flex min-h-72 flex-col justify-center rounded-xl border border-border bg-background/60 p-4 sm:p-6">
          {state.sheetUrl ? (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-primary"><Lang text={{ ko: "8방향 시트 준비 완료", en: "8-direction sheet ready" }} /></p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <Lang text={{ ko: "화살표를 눌러 모든 방향의 걷기 동작을 확인하세요.", en: "Use the arrows to inspect the walk animation in every direction." }} />
                </p>
              </div>
              <DirectionWheelPreview sheetUrl={state.sheetUrl} />
              <Button
                onClick={() => onRunAction("confirm")}
                loading={busy}
                disabled={!state.canConfirm || state.character.status === "active"}
                className="min-h-11 w-full sm:w-auto"
              >
                <Check className="mr-2 h-4 w-4" aria-hidden />
                {state.character.status === "active" ? (
                  <Lang text={{ ko: "캐릭터 확정 완료", en: "Character confirmed" }} />
                ) : (
                  <Lang text={{ ko: "이 캐릭터로 확정", en: "Confirm this character" }} />
                )}
              </Button>
              {state.character.status === "active" ? (
                <Button
                  variant="outline"
                  onClick={onReport}
                  loading={busy}
                  className="min-h-11 w-full border-danger/50 text-danger hover:bg-danger/10 sm:w-auto"
                >
                  <Flag className="mr-2 h-4 w-4" aria-hidden />
                  <Lang text={{ ko: "안전 문제 신고·비활성화", en: "Report safety issue and disable" }} />
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-primary" aria-hidden />
              <div>
                <h2 className="font-semibold">
                  {state.nextStep ? (
                    <Lang text={STEP_LABELS[state.nextStep] || { ko: "다음 단계", en: "Next step" }} />
                  ) : (
                    <Lang text={{ ko: "다음 단계를 준비 중입니다", en: "Preparing the next step" }} />
                  )}
                </h2>
                {generationDisabled && generationDisabledReason ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <Lang text={generationDisabledReason} />
                  </p>
                ) : state.nextStepMayCharge ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <Lang
                      text={{
                        ko: "이 단계는 비용이 발생할 수 있습니다. 실행 직전 가격표와 코인 잔액을 서버에서 확인합니다.",
                        en: "This step may incur a charge. Pricing and coin balance are checked immediately before execution.",
                      }}
                    />
                  </p>
                ) : null}
              </div>
              <Button
                onClick={() => onRunAction(state.pipeline ? "advance" : "prepare")}
                loading={busy}
                disabled={generationDisabled || Boolean(state.pipeline && (!state.nextStep || state.nextStep === "step2-dir"))}
                aria-describedby={state.nextStep === "step2-dir" ? "direction-grid-guidance" : undefined}
                className="mx-auto min-h-11"
              >
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                {state.pipeline ? <Lang text={{ ko: "다음 단계 실행", en: "Run next step" }} /> : <Lang text={{ ko: "생성 준비", en: "Prepare generation" }} />}
              </Button>
              {state.nextStep === "step2-dir" ? (
                <p id="direction-grid-guidance" className="text-xs text-muted-foreground">
                  <Lang text={{ ko: "아래 방향 그리드에서 실패 방향을 선택해 실행하세요.", en: "Select failed directions in the grid below." }} />
                </p>
              ) : null}
            </div>
          )}
        </div>

        {state.pipeline ? (
          <div className="lg:col-span-2">
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border px-3 text-left">
                  <span>
                    <Lang text={{ ko: "방향별 상세·고급 동작", en: "Direction details and advanced actions" }} />
                  </span>
                  <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${advancedOpen ? "rotate-180" : ""}`} aria-hidden />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <DirectionGrid
                  pipeline={state.pipeline}
                  quote={state.directionQuote}
                  busy={busy}
                  onRegenerate={onRegenerateDirections}
                  onMirror={onMirrorDirection}
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : null}

        <div className="lg:col-span-2">
          <Button variant="ghost" className="min-h-11" onClick={onChooseCharacter} disabled={busy}>
            <Images className="mr-2 h-4 w-4" aria-hidden />
            <Lang text={{ ko: "다른 캐릭터 선택", en: "Choose another character" }} />
          </Button>
        </div>
      </section>
    </div>
  );
}
