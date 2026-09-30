"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Images, RefreshCw, Shield, Sparkles } from "lucide-react";
import { Button, Preloader } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { CostConfirmDialog } from "components/module/game/forge/shared/CostConfirmDialog";
import { BibleSliceGrid } from "components/module/game/forge/steps/direction-sheet/BibleSliceGrid";
import {
  getMyGameCharacterPipeline,
  runMyGameCharacterPipelineAction,
  type UserGameCharacterPipelineStateType,
} from "libs/api/game";
import { toErrorMessage } from "utils/common";
import { trackPlayEvent } from "utils/analytics/play";

type PendingAction = "generate" | "restart" | null;

export function UserCharacterBibleStudio({
  universeId,
  characterId,
  onContinue,
  onReselect,
  onChanged,
}: {
  universeId: string;
  characterId: string;
  onContinue: (characterId: string) => void;
  onReselect: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [localState, setLocalState] = useState<UserGameCharacterPipelineStateType | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pipelineQuery = useQuery({
    queryKey: ["my-game-character-pipeline", characterId, "master-sheet"],
    queryFn: () => getMyGameCharacterPipeline(characterId),
    staleTime: 5_000,
    retry: 1,
  });
  const state = localState || pipelineQuery.data || null;

  const applyAction = async (
    action: "advance" | "confirm-bible" | "restart",
    options?: { recordFailedAnchor?: boolean; abandonCharacter?: boolean },
  ) => {
    setBusy(true);
    setError("");
    try {
      const next = await runMyGameCharacterPipelineAction(characterId, action, options);
      setLocalState(next);
      trackPlayEvent("character_create_step", {
        universeId,
        sourceType: next.character.sourceType,
        funnelAction: action,
        funnelStatus: next.character.status,
      });
      await onChanged?.();
      return next;
    } catch (caught) {
      setError(toErrorMessage(caught, "방향 시트 단계를 처리하지 못했습니다."));
      const refreshed = await pipelineQuery.refetch().catch(() => null);
      if (refreshed?.data) setLocalState(refreshed.data);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openGenerationConfirm = () => {
    if (!state) return;
    if (!state.nextStepMayCharge) {
      void applyAction("advance");
      return;
    }
    setPendingAction("generate");
    trackPlayEvent("forge_cost_confirm", { universeId, method: "master-sheet", outcome: "open" });
  };

  const openRestartConfirm = () => {
    setPendingAction("restart");
    trackPlayEvent("forge_cost_confirm", { universeId, method: "master-sheet", outcome: "open" });
  };

  const runPendingAction = async () => {
    const action = pendingAction;
    if (!action) return;
    setPendingAction(null);
    trackPlayEvent("forge_cost_confirm", { universeId, method: "master-sheet", outcome: "confirm" });
    await applyAction(action === "generate" ? "advance" : "restart");
  };

  const cancelPendingAction = () => {
    if (!pendingAction) return;
    setPendingAction(null);
    trackPlayEvent("forge_cost_confirm", { universeId, method: "master-sheet", outcome: "cancel" });
  };

  const confirmBible = async () => {
    await applyAction("confirm-bible");
  };

  const chooseAnotherImage = async () => {
    const next = await applyAction("restart", { recordFailedAnchor: true, abandonCharacter: true });
    if (next) onReselect();
  };

  if (pipelineQuery.isLoading && !state) {
    return (
      <div className="flex min-h-72 items-center justify-center">
        <Preloader
          variant="spin"
          size="lg"
          text={<Lang text={{ ko: "방향 시트를 불러오는 중...", en: "Loading the direction sheet..." }} />}
        />
      </div>
    );
  }

  if (pipelineQuery.error || !state) {
    return (
      <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        {toErrorMessage(pipelineQuery.error, "방향 시트 작업을 불러오지 못했습니다.")}
      </div>
    );
  }

  if (!state.bibleRequired) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <Shield className="size-8 text-primary" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold">
          <Lang text={{ ko: "기존 캐릭터는 현재 생성 계약을 유지합니다", en: "This existing character keeps its current generation contract" }} />
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <Lang text={{ ko: "기존 파이프라인은 단일 기준 이미지를 그대로 사용합니다.", en: "The existing pipeline continues to use its original source image." }} />
        </p>
        <Button className="mt-4 min-h-11" onClick={() => onContinue(characterId)}>
          <ArrowRight className="mr-2 size-4" aria-hidden />
          <Lang text={{ ko: "애니메이션 만들기로 이동", en: "Continue to animation" }} />
        </Button>
      </section>
    );
  }

  const candidate = state.bibleCandidate;
  const candidateDirections = candidate?.directions || [];

  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-primary">STEP 2</p>
            <h2 className="mt-1 text-xl font-semibold">
              <Lang text={{ ko: "캐릭터 방향 시트", en: "Character direction sheet" }} />
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              <Lang text={{ ko: "한 장에서 정면·후면과 주요 방향의 외형을 고정합니다. 이후 모든 동작은 확정한 시트를 기준으로 만듭니다.", en: "Lock the character's front, back, and key views in one sheet. Later actions use the confirmed sheet as their visual reference." }} />
            </p>
          </div>
          {state.bibleConfirmed ? (
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-500/10 px-4 text-sm font-medium text-emerald-600">
              <Check className="size-4" aria-hidden />
              <Lang text={{ ko: "방향 시트 확정 완료", en: "Direction sheet confirmed" }} />
            </span>
          ) : null}
        </div>

        {state.pipeline?.status === "failed" ? (
          <div role="alert" className="mt-5 space-y-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
            <p className="font-semibold text-danger">
                  <Lang text={{ ko: "방향 시트 생성이 반복해서 실패했습니다", en: "Direction sheet generation failed repeatedly" }} />
            </p>
            <p className="text-muted-foreground">
              <Lang text={{ ko: "전신이 선명하고 배경이 단순한 기준 이미지를 사용하거나 같은 이미지로 다시 시도하세요.", en: "Use a clear full-body source image with a simple background, or retry with the same image." }} />
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="outline" className="min-h-11" onClick={openRestartConfirm} loading={busy}>
                <RefreshCw className="mr-2 size-4" aria-hidden />
                <Lang text={{ ko: "같은 이미지로 다시 시도", en: "Retry with the same image" }} />
              </Button>
              <Button variant="outline" className="min-h-11" onClick={() => void chooseAnotherImage()} disabled={busy}>
                <Images className="mr-2 size-4" aria-hidden />
                <Lang text={{ ko: "다른 기준 이미지 선택", en: "Choose another source image" }} />
              </Button>
            </div>
          </div>
        ) : null}

        {!candidate && state.pipeline?.status !== "failed" ? (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-background/60 p-5 text-center">
            <Sparkles className="mx-auto size-9 text-primary" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">
              <Lang text={{ ko: "생성 후 서버가 5개 방향의 빈 셀·잘림·크기 편차를 자동 확인합니다.", en: "After generation, the server checks all five views for empty cells, cropping, and size drift." }} />
            </p>
            <Button
              className="mt-4 min-h-11"
              onClick={openGenerationConfirm}
              loading={busy}
              disabled={state.nextStep !== "step1-bible"}
            >
              <Sparkles className="mr-2 size-4" aria-hidden />
              <Lang text={{ ko: "5방향 시트 생성", en: "Generate five-direction sheet" }} />
            </Button>
          </div>
        ) : null}

        {candidate && state.bibleUrl ? (
          <div className="mt-5 space-y-5">
            <BibleSliceGrid
              url={state.bibleUrl}
              directions={candidateDirections}
              passedDirections={candidate.passedDirections}
            />

            {!candidate.allPassed ? (
              <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
                <p className="font-semibold text-danger">
                  <Lang text={{ ko: "일부 각도가 기준에 못 미쳤어요. 다시 만들어 볼까요?", en: "Some views did not meet the quality bar. Regenerate the sheet?" }} />
                </p>
                <p className="mt-1 text-muted-foreground">
                  <Lang text={{ ko: "확정하지 않고 시트 이미지만 다시 생성하세요. 통과한 각도도 함께 새로 만들어집니다.", en: "Do not confirm this sheet. Regenerate all five views together." }} />
                </p>
                {state.pipeline?.status !== "failed" ? (
                  <Button className="mt-3 min-h-11" variant="outline" onClick={openGenerationConfirm} loading={busy} disabled={state.nextStep !== "step1-bible"}>
                    <RefreshCw className="mr-2 size-4" aria-hidden />
                    <Lang text={{ ko: "시트 다시 생성", en: "Regenerate sheet" }} />
                  </Button>
                ) : null}
              </div>
            ) : !state.bibleConfirmed ? (
              <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
                <div>
                  <h3 className="font-semibold">
                    <Lang text={{ ko: "이 시트를 확정하세요", en: "Confirm this sheet" }} />
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Lang text={{ ko: "서버 기본값인 비대칭 기준으로 저장합니다. 이미지 자체는 변경하지 않습니다.", en: "The server saves the asymmetric default. The image itself is not changed." }} />
                  </p>
                </div>
                <Button className="min-h-11" onClick={() => void confirmBible()} loading={busy} disabled={!state.canConfirmBible}>
                  <Check className="mr-2 size-4" aria-hidden />
                  <Lang text={{ ko: "이 방향 시트로 확정", en: "Confirm this direction sheet" }} />
                </Button>
              </div>
            ) : (
              <Button className="min-h-11" onClick={() => onContinue(characterId)} disabled={busy}>
                <ArrowRight className="mr-2 size-4" aria-hidden />
                <Lang text={{ ko: "이 캐릭터를 움직이게 만들기", en: "Animate this character" }} />
              </Button>
            )}
          </div>
        ) : null}
      </section>

      <CostConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) cancelPendingAction();
        }}
        title={pendingAction === "restart" ? { ko: "다시 생성할까요?", en: "Retry generation?" } : { ko: "시트를 생성할까요?", en: "Generate the sheet?" }}
        description={pendingAction === "restart" ? { ko: "다시 시도하면 서버가 실행 직전에 비용과 잔액을 확인합니다.", en: "The server checks the cost and balance immediately before retrying." } : { ko: "서버가 실행 직전에 비용과 잔액을 확인한 뒤 방향 시트를 생성합니다.", en: "The server checks the cost and balance immediately before generating the direction sheet." }}
        actionLabel={pendingAction === "restart" ? { ko: "다시 생성", en: "Retry" } : { ko: "생성하기", en: "Generate" }}
        loading={busy}
        onConfirm={runPendingAction}
        onCancel={cancelPendingAction}
      />
    </div>
  );
}
