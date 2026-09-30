"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Images } from "lucide-react";
import { Button, Preloader } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { CostConfirmDialog } from "components/module/game/forge/shared/CostConfirmDialog";
import { UserCharacterPipelineView } from "components/module/game/character-studio/UserCharacterPipelineView";
import { AnimationPresetGrid, type AnimationPresetKey } from "./AnimationPresetGrid";
import {
  getMyGameCharacterPipeline,
  listMyGameCharacters,
  reportMyGameCharacter,
  runMyGameCharacterPipelineAction,
  type UserGameCharacterPipelineStateType,
} from "libs/api/game";
import { toErrorMessage } from "utils/common";
import { trackPlayEvent } from "utils/analytics/play";
import type { SpriteDirectionType } from "types/game";

type PipelineAction = "prepare" | "advance" | "confirm";
type PendingAction =
  | { kind: "pipeline"; action: PipelineAction }
  | { kind: "restart" }
  | { kind: "regenerate"; directions: SpriteDirectionType[]; quotedCoins: number }
  | { kind: "mirror"; direction: SpriteDirectionType }
  | { kind: "report" }
  | null;

const ACTIVE_ACTIONS = new Set(["generating", "post_processing", "verifying", "composing"]);

export function SpriteStudioView({
  universeId,
  characterId,
  initialAction = "walk",
  onChooseCharacter,
  onActionChange,
  onCharacterChanged,
}: {
  universeId: string;
  characterId?: string;
  initialAction?: AnimationPresetKey;
  onChooseCharacter?: (characterId?: string) => void;
  onActionChange?: (action: AnimationPresetKey) => void;
  onCharacterChanged?: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [localSelectedAction, setLocalSelectedAction] = useState<AnimationPresetKey>(initialAction);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    trackPlayEvent("forge_step_open", { universeId, stepId: "step3" });
  }, [universeId]);

  const charactersQuery = useQuery({
    queryKey: ["my-game-characters", universeId, "sprite-studio"],
    queryFn: () => listMyGameCharacters({ universeId, limit: 10 }),
    enabled: !characterId,
    staleTime: 10_000,
    retry: 1,
  });
  const pipelineQuery = useQuery({
    queryKey: ["my-game-character-pipeline", characterId, "sprite-studio"],
    queryFn: () => getMyGameCharacterPipeline(String(characterId)),
    enabled: Boolean(characterId),
    staleTime: 5_000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const status = query.state.data?.pipeline?.status;
      return status && ACTIVE_ACTIONS.has(status) ? 2_500 : false;
    },
  });
  const state = pipelineQuery.data || null;
  const availableCharacters = useMemo(
    () => (charactersQuery.data || []).filter((character) => character.status !== "disabled"),
    [charactersQuery.data],
  );
  const generationInProgress = Boolean(state?.pipeline?.status && ACTIVE_ACTIONS.has(state.pipeline.status)) || busy;
  const walkReady = Boolean(state?.sheetUrl || state?.canConfirm || state?.pipeline?.status === "composed");
  const selectedAction = localSelectedAction;

  const refreshAfterAction = async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-game-characters", universeId] });
    await onCharacterChanged?.();
  };

  const applyPipelineAction = async (
    action: "prepare" | "advance" | "confirm" | "restart" | "regenerate-direction" | "mirror-direction",
    options?: { direction?: string; mirrorConfirmed?: boolean },
  ) => {
    if (!characterId) return null;
    setBusy(true);
    setError("");
    try {
      const next = await runMyGameCharacterPipelineAction(characterId, action, options);
      queryClient.setQueryData(["my-game-character-pipeline", characterId, "sprite-studio"], next);
      trackPlayEvent("character_create_step", {
        universeId,
        sourceType: next.character.sourceType,
        funnelAction: action,
        funnelStatus: next.character.status,
      });
      if (action === "confirm" && next.character.status === "active") {
        trackPlayEvent("character_create_success", { universeId, sourceType: next.character.sourceType });
      }
      await refreshAfterAction();
      return next;
    } catch (caught) {
      setError(toErrorMessage(caught, "스프라이트 생성 단계를 처리하지 못했습니다."));
      await pipelineQuery.refetch().catch(() => null);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openPipelineAction = (action: PipelineAction) => {
    if (!state || (action === "advance" && selectedAction !== "walk")) return;
    if (action === "advance" && state.nextStepMayCharge) {
      setPendingAction({ kind: "pipeline", action });
      trackCostEvent("pipeline", state.nextStepMayCharge ? null : undefined);
      return;
    }
    void applyPipelineAction(action);
  };

  const openRestart = () => {
    setPendingAction({ kind: "restart" });
    trackCostEvent("restart", null);
  };

  const regenerateDirections = (directions: SpriteDirectionType[]) => {
    if (!state?.directionQuote || directions.length === 0) return;
    const unit = state.directionQuote.perDirectionCoins;
    const freeRetryCount = directions.filter((direction) => {
      const regen = state.pipeline?.directions?.[direction]?.regen;
      return Boolean(regen?.freeRetryEligible && !regen.freeRetryUsed);
    }).length;
    const quotedCoins = Math.max(0, directions.length * unit - freeRetryCount * unit);
    setPendingAction({ kind: "regenerate", directions, quotedCoins });
    trackCostEvent("regenerate-direction", quotedCoins);
  };

  const mirrorDirection = (direction: SpriteDirectionType) => {
    setPendingAction({ kind: "mirror", direction });
    trackCostEvent("mirror-direction", null);
  };

  const runPendingAction = async () => {
    const pending = pendingAction;
    if (!pending) return;
    setPendingAction(null);
    trackCostEvent(pending.kind, pending.kind === "regenerate" ? pending.quotedCoins : null, "confirm");

    if (pending.kind === "pipeline") await applyPipelineAction(pending.action);
    if (pending.kind === "restart") await applyPipelineAction("restart");
    if (pending.kind === "regenerate") {
      for (const direction of pending.directions) {
        const next = await applyPipelineAction("regenerate-direction", { direction });
        if (!next) break;
      }
    }
    if (pending.kind === "mirror") {
      await applyPipelineAction("mirror-direction", { direction: pending.direction, mirrorConfirmed: true });
    }
    if (pending.kind === "report") await reportCharacter();
  };

  const cancelPendingAction = () => {
    if (!pendingAction) return;
    trackCostEvent(pendingAction.kind, pendingAction.kind === "regenerate" ? pendingAction.quotedCoins : null, "cancel");
    setPendingAction(null);
  };

  const reportCharacter = async () => {
    if (!state?.character || state.character.status !== "active") return;
    setBusy(true);
    setError("");
    try {
      const result = await reportMyGameCharacter(state.character.characterId, { reason: "other" });
      queryClient.setQueryData(["my-game-character-pipeline", characterId, "sprite-studio"], {
        ...state,
        character: result.character,
        canConfirm: false,
      });
      await refreshAfterAction();
    } catch (caught) {
      setError(toErrorMessage(caught, "캐릭터를 신고하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!generationInProgress) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [generationInProgress]);

  if (!characterId) {
    if (charactersQuery.isLoading) {
      return <Preloader variant="spin" size="lg" container />;
    }
    return (
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex items-center gap-2 text-primary"><Images className="size-5" aria-hidden /><h1 className="text-xl font-semibold"><Lang text={{ ko: "캐릭터를 선택하세요", en: "Choose a character" }} /></h1></div>
        <p className="mt-2 text-sm text-muted-foreground"><Lang text={{ ko: "방향 시트를 확정한 캐릭터의 스프라이트를 생성할 수 있습니다.", en: "Generate sprites for a character with a confirmed direction sheet." }} /></p>
        {availableCharacters.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {availableCharacters.map((character) => (
              <Button key={character.characterId} variant="outline" className="min-h-11 justify-start" onClick={() => onChooseCharacter?.(character.characterId)}>
                <Images className="mr-2 size-4" aria-hidden />{character.name}
              </Button>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground"><Lang text={{ ko: "먼저 캐릭터 등록과 방향 시트 확정을 완료하세요.", en: "Register a character and confirm its direction sheet first." }} /></div>
        )}
      </section>
    );
  }

  if (pipelineQuery.isLoading && !state) {
    return <Preloader variant="spin" size="lg" container />;
  }
  if (pipelineQuery.error || !state) {
    return <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">{toErrorMessage(pipelineQuery.error, "스프라이트 작업을 불러오지 못했습니다.")}</div>;
  }

  const selectedActionIsSupported = selectedAction === "walk";
  const generationBlockReason = {
    ko: "현재 서버 생성 계약은 걷기 시트부터 지원합니다. 걷기를 선택하면 생성 버튼을 사용할 수 있습니다.",
    en: "The current server generation contract starts with the walk sheet. Select Walk to use the generation button.",
  };

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary"><Lang text={{ ko: "STEP 3", en: "STEP 3" }} /></p>
            <h1 className="mt-1 text-2xl font-bold"><Lang text={{ ko: "스프라이트 스튜디오", en: "Sprite studio" }} /></h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground"><Lang text={{ ko: "확정한 방향 시트에서 캐릭터의 걷기 스프라이트를 만들고 8방향 결과를 확인합니다.", en: "Turn the confirmed direction sheet into a walk sprite and review all eight directions." }} /></p>
          </div>
          <Button variant="outline" className="min-h-11" onClick={() => onChooseCharacter?.()} disabled={busy}>
            <ArrowLeft className="mr-2 size-4" aria-hidden /><Lang text={{ ko: "다른 캐릭터", en: "Another character" }} />
          </Button>
        </div>
        {generationInProgress ? (
          <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            <Lang text={{ ko: "생성 진행 중입니다. 화면을 떠나도 서버 작업은 계속되며, 다시 열면 이어서 확인할 수 있습니다.", en: "Generation is in progress. The server continues if you leave, and you can resume here when you return." }} />
          </p>
        ) : null}
      </header>

      <AnimationPresetGrid selectedAction={selectedAction} walkReady={walkReady} busy={busy} onSelect={(action) => { setLocalSelectedAction(action); onActionChange?.(action); }} />

      <UserCharacterPipelineView
        state={state}
        busy={busy}
        error={error}
        generationDisabled={!selectedActionIsSupported}
        generationDisabledReason={generationBlockReason}
        onRunAction={(action) => openPipelineAction(action)}
        onRestart={openRestart}
        onReselect={() => void applyPipelineAction("restart").then((next) => { if (next) onChooseCharacter?.(); })}
        onReport={() => { setPendingAction({ kind: "report" }); trackCostEvent("report", null); }}
        onChooseCharacter={() => onChooseCharacter?.()}
        onRegenerateDirections={regenerateDirections}
        onMirrorDirection={mirrorDirection}
      />

      <CostConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open) cancelPendingAction(); }}
        variant={pendingAction?.kind === "report" ? "safety" : "cost"}
        title={dialogCopy(pendingAction).title}
        description={dialogCopy(pendingAction, state).description}
        actionLabel={dialogCopy(pendingAction).actionLabel}
        quotedCoins={pendingAction?.kind === "regenerate" ? pendingAction.quotedCoins : null}
        count={pendingAction?.kind === "regenerate" ? pendingAction.directions.length : 1}
        loading={busy}
        onConfirm={runPendingAction}
        onCancel={cancelPendingAction}
      />
    </div>
  );
}

function trackCostEvent(action: string, quotedCoins: number | null | undefined, outcome: "open" | "confirm" | "cancel" = "open") {
  trackPlayEvent("forge_cost_confirm", { method: "sprite", action, quotedCoins: quotedCoins ?? undefined, outcome });
}

function dialogCopy(pending: PendingAction, state?: UserGameCharacterPipelineStateType) {
  if (pending?.kind === "restart") return {
    title: { ko: "다시 생성할까요?", en: "Retry generation?" },
    description: { ko: "같은 기준 이미지로 다시 시도합니다. 다음 생성 단계의 비용은 서버가 실행 직전에 확인합니다.", en: "Retry with the same source image. The server checks any next-step cost immediately before running." },
    actionLabel: { ko: "다시 생성", en: "Retry" },
  };
  if (pending?.kind === "regenerate") return {
    title: { ko: "실패 방향을 다시 만들까요?", en: "Regenerate failed directions?" },
    description: {
      ko: `${pending.directions.length}개 방향을 순서대로 다시 만듭니다.${pending.directions.length >= 3 ? " 3방향 이상 일괄 실행이며 중간 실패 시 중단됩니다." : ""}`,
      en: `Regenerate ${pending.directions.length} direction(s) in order.${pending.directions.length >= 3 ? " Batches of three or more stop if an intermediate run fails." : ""}`,
    },
    actionLabel: { ko: "다시 만들기", en: "Regenerate" },
  };
  if (pending?.kind === "mirror") return {
    title: { ko: "미러로 채울까요?", en: "Fill by mirror?" },
    description: { ko: `${pending.direction} 방향을 통과한 대응 방향에서 좌우 반전합니다. 글자·로고·비대칭 문양도 뒤집힐 수 있습니다.`, en: `Fill ${pending.direction} by mirroring its passed counterpart. Text, logos, and asymmetric markings may flip.` },
    actionLabel: { ko: "미러로 채우기", en: "Fill by mirror" },
  };
  if (pending?.kind === "report") return {
    title: { ko: "캐릭터를 신고할까요?", en: "Report this character?" },
    description: { ko: "안전 문제로 신고하면 캐릭터가 즉시 비활성화되어 선택과 월드 입장에서 제외됩니다.", en: "Reporting a safety issue immediately disables this character from selection and world entry." },
    actionLabel: { ko: "신고·비활성화", en: "Report and disable" },
  };
  return {
    title: { ko: "스프라이트를 생성할까요?", en: "Generate the sprite?" },
    description: { ko: `서버가 실행 직전에 가격과 잔액을 확인한 뒤 ${state?.nextStep ? "다음 생성 단계" : "스프라이트"}를 처리합니다.`, en: `The server checks pricing and balance immediately before running the next generation step.` },
    actionLabel: { ko: "생성하기", en: "Generate" },
  };
}
