"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import type { ImagePromptMetaType } from "types/app";
import { SPRITE_PIPELINE_STEP_KEYS } from "types/game/asset-pipeline";
import type {
  GameAssetPipelineStepStateType,
  IGameAssetPipelineDoc,
  SpriteDirectionPricingQuoteType,
  SpriteDirectionType,
} from "types/game";
import { resolveNextPipelineStep } from "utils/game/assetPipeline";
import { toUnknownRecord } from "utils/common/typeUtils";
import { cn } from "utils/common";
import { Coins, Loader2, Play, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useSpritePipeline } from "./useSpritePipeline";
import { DirectionWheelPreview } from "./DirectionWheelPreview";
import { DirectionGrid } from "components/module/game/DirectionGrid";
import {
  DEFAULT_SPRITE_ACTION,
  SPRITE_ACTION_PRESETS,
  normalizeSpriteActionKey,
  type SpriteActionPresetType,
} from "../spriteActionModel";
import { SpriteActionLibrary, type SpriteActionDraftType } from "./SpriteActionLibrary";
import { getSpriteDirectionPricingQuote, listSpriteActions, saveSpriteAction } from "libs/api/game";
import { SPRITE_FRAME_COUNTS, SPRITE_MODEL_OPTIONS } from "consts/game/gameAssetTemplates";
import { OPENAI_GPT_IMAGE_SUNBURST_MODEL } from "consts/ai";
import { useUserData } from "hooks/auth";

/**
 * @docHint
 * @purpose Forge 8방향 파이프라인 패널 — anchor 지정→멱등 생성→STEP1~5 진행/실행→방향 휠 미리보기/부분 재생성
 * @process 파이프라인 목록/선택  생성(멱등, created=false 안내)  다음 step 실행(202 dedupe 정상 처리)  composed 시 미리보기
 * @domain game.asset-pipeline
 * @scope admin-client
 */

const STEP_LABEL: Record<string, { ko: string; en: string }> = {
  "step1-bible": { ko: "STEP1 5방향 바이블", en: "STEP1 5-dir Bible" },
  "step2-base": { ko: "STEP2-A 기본 4방향", en: "STEP2-A Base 4-dir" },
  "step2-diagonal": { ko: "STEP2-B 대각 4방향", en: "STEP2-B Diagonal 4-dir" },
  "step2-dir": { ko: "STEP2-C 실패 방향 재생성", en: "STEP2-C Failed direction regen" },
  "step3-removebg": { ko: "STEP3 배경 제거", en: "STEP3 Remove BG" },
  "step4-verify": { ko: "STEP4 슬라이스 검증", en: "STEP4 Slice Verify" },
  "step5-compose": { ko: "STEP5 시트 합성", en: "STEP5 Compose" },
};

const STEP_STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  running: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  pending: "bg-muted text-muted-foreground",
};

const PIPELINE_STATUS_STYLE: Record<string, string> = {
  composed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  verify_failed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function getComposedSheetUrl(pipeline: IGameAssetPipelineDoc | null) {
  if (!pipeline || pipeline.status !== "composed") return "";
  const meta = toUnknownRecord(toUnknownRecord(pipeline.steps?.["step5-compose"]).meta);
  return String(meta.sheetUrl || "");
}

type PipelineConfirmationType =
  | {
      kind: "generation";
      stepKey: string;
      count: number;
      directions?: SpriteDirectionType[];
      quote: SpriteDirectionPricingQuoteType;
    }
  | {
      kind: "mirror";
      direction: SpriteDirectionType;
    };

export function SpritePipelinePanel({
  anchorImageAssetId,
  anchorSourceUrl,
  studioImages = [],
  studioSearched = false,
  studioLoading = false,
  onSelectStudioImage,
}: {
  anchorImageAssetId?: string;
  anchorSourceUrl?: string;
  studioImages?: ImagePromptMetaType[];
  studioSearched?: boolean;
  studioLoading?: boolean;
  onSelectStudioImage?: (image: ImagePromptMetaType) => void;
}) {
  const { pipelines, activePipeline, loading, runningStep, error, refreshList, selectPipeline, createPipeline, runStep } =
    useSpritePipeline();
  const { userData } = useUserData();
  const [anchorInput, setAnchorInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [selectedActionKey, setSelectedActionKey] = useState(DEFAULT_SPRITE_ACTION.key);
  const spriteModelOptions = SPRITE_MODEL_OPTIONS;
  const [selectedSpriteModelKey, setSelectedSpriteModelKey] = useState(() => {
    const first =
      SPRITE_MODEL_OPTIONS.find((item) => item.modelName === OPENAI_GPT_IMAGE_SUNBURST_MODEL) ||
      SPRITE_MODEL_OPTIONS[0];
    return first ? `${first.provider}:${first.modelName}` : "";
  });
  const [savingAction, setSavingAction] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [pipelineConfirmation, setPipelineConfirmation] = useState<PipelineConfirmationType | null>(null);
  const [actionDraft, setActionDraft] = useState<SpriteActionDraftType>({
    key: "",
    labelKo: "",
    labelEn: "",
    motionAction: "",
    motionSequence: "",
    fps: 8,
    frameCount: 4,
    loop: false,
    symmetryEligible: false,
  });
  const actionsQuery = useQuery({
    queryKey: ["game-sprite-actions"],
    queryFn: () => listSpriteActions(),
    staleTime: 30_000,
    retry: 1,
  });
  const directionQuoteQuery = useQuery({
    queryKey: ["game-sprite-direction-quote", activePipeline?.pipelineId, activePipeline?.status],
    queryFn: () => getSpriteDirectionPricingQuote(String(activePipeline?.pipelineId)),
    enabled: Boolean(activePipeline?.pipelineId),
    staleTime: 30_000,
    retry: 1,
  });
  const persistedActions = useMemo<SpriteActionPresetType[]>(
    () =>
      (actionsQuery.data || []).map((action) => ({
        key: action.actionKey,
        label: action.label,
        description: action.description,
        motionAction: action.motionAction,
        motionSequence: action.motionSequence,
        fps: action.fps,
        loop: action.loop,
        frameCount: action.frameCount,
        symmetryEligible: action.symmetryEligible,
        motionGuideVersion: action.motionGuideVersion,
        scope: action.scope,
      })),
    [actionsQuery.data],
  );

  const pipelineActions = useMemo<SpriteActionPresetType[]>(() => {
    const known = new Set([...SPRITE_ACTION_PRESETS, ...persistedActions].map((item) => item.key));
    return pipelines.flatMap((pipeline) => {
      const variables = toUnknownRecord(pipeline.variables);
      const key = normalizeSpriteActionKey(variables.sprite_action_key);
      if (known.has(key)) return [];
      known.add(key);
      return [{
        key,
        label: {
          ko: String(variables.sprite_action_label || key),
          en: String(variables.sprite_action_label || key),
        },
        description: {
          ko: String(variables.motion_action || "사용자 정의 동작"),
          en: String(variables.motion_action || "Custom action"),
        },
        motionAction: String(variables.motion_action || "custom readable game action"),
        motionSequence: String(variables.motion_sequence || "start, progression, peak, recovery"),
        fps: Math.max(1, Number(variables.motion_fps || 8)),
        loop: String(variables.motion_loop_value || "false") === "true",
        frameCount: (SPRITE_FRAME_COUNTS as readonly number[]).includes(Number(variables.sprite_frame_count))
          ? Number(variables.sprite_frame_count)
          : 4,
        symmetryEligible: false,
        motionGuideVersion: 0,
      }];
    });
  }, [persistedActions, pipelines]);
  const actionOptions = useMemo(() => {
    const merged = new Map<string, SpriteActionPresetType>();
    for (const action of SPRITE_ACTION_PRESETS) merged.set(action.key, action);
    for (const action of persistedActions) merged.set(action.key, action);
    for (const action of pipelineActions) {
      if (!merged.has(action.key)) merged.set(action.key, action);
    }
    return Array.from(merged.values());
  }, [persistedActions, pipelineActions]);
  const selectedAction =
    actionOptions.find((action) => action.key === selectedActionKey) || DEFAULT_SPRITE_ACTION;
  const selectedSpriteModel =
    spriteModelOptions.find((item) => `${item.provider}:${item.modelName}` === selectedSpriteModelKey) ||
    spriteModelOptions[0] ||
    null;

  const effectiveAnchorAssetId = anchorInput.trim() || String(anchorImageAssetId || "").trim();
  const effectiveAnchorSourceUrl = effectiveAnchorAssetId ? "" : String(anchorSourceUrl || "").trim();
  const selectedStudioImage = studioImages.find((image) => image.assetId === effectiveAnchorAssetId) || null;
  const nextStep = activePipeline ? resolveNextPipelineStep(activePipeline) : null;
  const composedSheetUrl = getComposedSheetUrl(activePipeline);
  const busy = Boolean(runningStep) || loading;
  const currentBalance =
    Number(userData?.wallet?.bonus?.coins || 0) + Number(userData?.wallet?.charged?.coins || 0);

  const handleCreatePipeline = async () => {
    if (!effectiveAnchorAssetId && !effectiveAnchorSourceUrl) {
      toast.error(lang({ ko: "anchor 이미지 assetId가 필요합니다. (STEP1 기준 컷)", en: "Anchor image assetId is required. (STEP1 anchor cut)" }));
      return;
    }
    const result = await createPipeline({
      anchorImageAssetId: effectiveAnchorAssetId,
      anchorSourceUrl: effectiveAnchorSourceUrl,
      name: nameInput.trim() || `${lang(selectedAction.label)} sprite`,
      variables: {
        sprite_action_key: selectedAction.key,
        sprite_action_label: lang(selectedAction.label),
        motion_action: selectedAction.motionAction,
        motion_sequence: selectedAction.motionSequence,
        motion_loop: selectedAction.loop
          ? "seamless loop; the last pose must flow naturally back to the first pose"
          : "one-shot action; show a clear start, peak, and recovery without forcing a loop",
        motion_loop_value: selectedAction.loop ? "true" : "false",
        motion_fps: String(selectedAction.fps),
        sprite_frame_count: String(selectedAction.frameCount),
        symmetry_eligible: selectedAction.symmetryEligible ? "true" : "false",
        motion_guide_version: String(selectedAction.motionGuideVersion),
        ...(selectedSpriteModel
          ? {
              sprite_model_provider: selectedSpriteModel.provider,
              sprite_model_name: selectedSpriteModel.modelName,
            }
          : {}),
      },
    });
    if (!result) return;
    toast.success(
      result.created
        ? lang({ ko: "파이프라인이 생성되었습니다.", en: "Pipeline created." })
        : lang({ ko: "동일 anchor의 기존 파이프라인을 불러왔습니다. (멱등)", en: "Loaded existing pipeline for the same anchor. (idempotent)" }),
    );
  };

  const handleAddCustomAction = async () => {
    const key = normalizeSpriteActionKey(actionDraft.key);
    if (
      !/^[a-z0-9][a-z0-9_-]{0,47}$/i.test(actionDraft.key.trim()) ||
      !actionDraft.labelKo.trim() ||
      !actionDraft.motionAction.trim()
    ) {
      toast.error(
        lang({
          ko: "동작 키는 영문·숫자·하이픈으로 입력하고, 이름과 동작 설명을 채워 주세요.",
          en: "Use letters, numbers, or hyphens for the action key, then enter a name and description.",
        }),
      );
      return;
    }
    const next: SpriteActionPresetType = {
      key,
      label: { ko: actionDraft.labelKo.trim(), en: actionDraft.labelEn.trim() || actionDraft.labelKo.trim() },
      description: {
        ko: actionDraft.motionAction.trim(),
        en: actionDraft.motionAction.trim(),
      },
      motionAction: actionDraft.motionAction.trim(),
      motionSequence: actionDraft.motionSequence.trim() || "start, progression, peak, recovery",
      fps: Math.max(1, Math.min(24, Math.round(actionDraft.fps || 8))),
      loop: actionDraft.loop,
      frameCount: (SPRITE_FRAME_COUNTS as readonly number[]).includes(Number(actionDraft.frameCount))
        ? Number(actionDraft.frameCount)
        : 4,
      symmetryEligible: actionDraft.loop && actionDraft.symmetryEligible,
      motionGuideVersion: 0,
      scope: "user",
    };
    try {
      setSavingAction(true);
      await saveSpriteAction({
        actionKey: next.key,
        label: next.label,
        description: next.description,
        motionAction: next.motionAction,
        motionSequence: next.motionSequence,
        fps: next.fps,
        loop: next.loop,
        frameCount: next.frameCount,
        symmetryEligible: next.symmetryEligible,
        motionGuideVersion: next.motionGuideVersion,
        scope: "user",
      });
      await actionsQuery.refetch();
      setSelectedActionKey(key);
      setActionDialogOpen(false);
      setActionDraft({ key: "", labelKo: "", labelEn: "", motionAction: "", motionSequence: "", fps: 8, frameCount: 4, loop: false, symmetryEligible: false });
      toast.success(lang({ ko: "동작을 내 라이브러리에 저장했습니다.", en: "Saved the action to your library." }));
    } catch {
      toast.error(
        lang({
          ko: "동작을 저장하지 못했습니다. 기존 프리셋과 파이프라인은 계속 사용할 수 있습니다.",
          en: "Could not save the action. Existing presets and pipelines remain available.",
        }),
      );
    } finally {
      setSavingAction(false);
    }
  };

  const executeStep = async (
    stepKey: string,
    options?: { direction?: SpriteDirectionType; mirrorConfirmed?: boolean },
    notify = true,
  ) => {
    const result = await runStep(stepKey, options);
    if (!result) return false;
    if (notify) {
      if (result.deduped) {
        toast.info(
          lang({
            ko: "이미 실행 중/완료된 step입니다. 재실행·중복 과금 없이 현재 상태를 표시합니다.",
            en: "Step already running/completed. Showing current state without re-run or double billing.",
          }),
        );
      } else {
        toast.success(lang({ ko: "step 실행이 완료되었습니다.", en: "Step finished." }));
      }
    }
    return true;
  };

  const handleRunStep = (stepKey: string) => {
    if (stepKey !== "step2-base" && stepKey !== "step2-diagonal") {
      void executeStep(stepKey);
      return;
    }
    if (!directionQuoteQuery.data) {
      toast.info(
        lang({ ko: "서버 견적을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.", en: "Loading the server quote. Please try again in a moment." }),
      );
      return;
    }
    setPipelineConfirmation({
      kind: "generation",
      stepKey,
      count: 1,
      quote: directionQuoteQuery.data,
    });
  };

  const handleRegenerateDirections = (directions: SpriteDirectionType[]) => {
    if (!directions.length || !directionQuoteQuery.data) return;
    setPipelineConfirmation({
      kind: "generation",
      stepKey: "step2-dir",
      count: directions.length,
      directions,
      quote: directionQuoteQuery.data,
    });
  };

  const handleMirrorDirection = (direction: SpriteDirectionType) => {
    setPipelineConfirmation({ kind: "mirror", direction });
  };

  const handlePipelineConfirmation = async () => {
    const confirmation = pipelineConfirmation;
    if (!confirmation) return;
    setPipelineConfirmation(null);
    if (confirmation.kind === "mirror") {
      const result = await executeStep("step2-dir", { direction: confirmation.direction, mirrorConfirmed: true }, false);
      if (result) toast.success(lang({ ko: "미러 방향을 저장했습니다.", en: "Saved the mirrored direction." }));
      return;
    }
    if (confirmation.directions?.length) {
      let completed = 0;
      for (const direction of confirmation.directions) {
        if (!(await executeStep("step2-dir", { direction }, false))) break;
        completed += 1;
      }
      if (completed === confirmation.directions.length) {
        toast.success(lang({ ko: "선택한 방향을 재생성했습니다.", en: "Selected directions regenerated." }));
      }
      return;
    }
    await executeStep(confirmation.stepKey);
  };

  const confirmationCoins =
    pipelineConfirmation?.kind === "generation"
      ? pipelineConfirmation.count * pipelineConfirmation.quote.perDirectionCoins
      : null;
  const confirmationModel =
    pipelineConfirmation?.kind === "generation"
      ? `${pipelineConfirmation.quote.provider}/${pipelineConfirmation.quote.modelName}`
      : "";
  const confirmationAfterBalance = confirmationCoins === null ? null : Math.max(0, currentBalance - confirmationCoins);

  return (
    <div className="space-y-4">
      <SpriteActionLibrary
        actions={actionOptions}
        pipelines={pipelines}
        selectedActionKey={selectedActionKey}
        effectiveAnchorAssetId={effectiveAnchorAssetId}
        effectiveAnchorSourceUrl={effectiveAnchorSourceUrl}
        dialogOpen={actionDialogOpen}
        actionDraft={actionDraft}
        onSelect={(action, pipeline) => {
          setSelectedActionKey(action.key);
          if (pipeline) void selectPipeline(pipeline.pipelineId);
        }}
        onDialogOpenChange={setActionDialogOpen}
        onDraftChange={setActionDraft}
        onAdd={handleAddCustomAction}
        saving={savingAction}
      />

      {actionsQuery.error ? (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
          <Lang
            text={{
              ko: "저장된 동작을 불러오지 못해 기본 동작과 기존 파이프라인 기록을 표시합니다.",
              en: "Saved actions could not be loaded, so default actions and existing pipeline records are shown.",
            }}
          />
        </p>
      ) : null}

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-semibold">
              {lang(selectedAction.label)} · {selectedAction.frameCount}
              <Lang text={{ ko: "프레임", en: " frames" }} /> · {selectedAction.fps} fps
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedAction.motionAction}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <Lang
                text={{
                  ko: "아래 기준 이미지가 모든 방향과 프레임의 스타일 원본입니다. 생성 단계는 코인 비용이 발생할 수 있으며 실행 전에 다시 안내됩니다.",
                  en: "The anchor below is the style source for every direction and frame. Generation steps may cost coins and are confirmed before execution.",
                }}
              />
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <Label label={lang({ ko: "이미지 생성 모델 (새 파이프라인)", en: "Image model (new pipeline)" })}>
          <Select
            value={selectedSpriteModelKey}
            onValueChange={(value) => {
              const modelKey = Array.isArray(value) ? String(value[0] || "") : String(value);
              setSelectedSpriteModelKey(modelKey);
            }}
            disabled={busy || !spriteModelOptions.length}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder={lang({ ko: "모델 선택", en: "Select a model" })} />
            </SelectTrigger>
            <SelectContent>
              {spriteModelOptions.map((model) => {
                const modelKey = `${model.provider}:${model.modelName}`;
                return (
                  <SelectItem key={modelKey} value={modelKey}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{model.alias}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{model.modelName}</span>
                      <Badge variant="outline" size="xs" className="shrink-0 whitespace-nowrap">
                        <Lang
                          text={
                            model.supportsTransparentBackground
                              ? { ko: "투명 배경 지원", en: "Transparent BG" }
                              : { ko: "STEP3 배경 제거", en: "STEP3 removal" }
                          }
                        />
                      </Badge>
                      {model.estimatedCoinsPerImage ? (
                        <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
                          {model.estimatedCoinsPerImage.toLocaleString()} <Lang text={{ ko: "코인/장", en: "coins/image" }} />
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Label>
        {selectedSpriteModel ? (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>
              <Lang
                text={{
                  ko: "투명 배경은 gpt-image-2.5 계열(flare · sunburst)만 생성할 수 있다.",
                  en: "Only the gpt-image-2.5 family (flare · sunburst) can generate transparent backgrounds.",
                }}
              />
            </p>
            <p>
              <Lang
                text={{
                  ko: "Nano Banana 2를 고르면 단일 배경으로 생성되며, 투명 배경이 필요하면 STEP3 배경 제거를 이어서 실행해야 한다.",
                  en: "Nano Banana 2 generates with a solid background; run STEP3 background removal when transparency is needed.",
                }}
              />
            </p>
            {!selectedSpriteModel.supportsTransparentBackground ? (
              <p className="font-medium text-amber-700 dark:text-amber-300" role="status">
                <Lang
                  text={{
                    ko: "현재 선택한 모델은 투명 배경을 지원하지 않습니다. 생성 후 STEP3 배경 제거가 필요합니다.",
                    en: "The selected model does not support transparent backgrounds. STEP3 background removal is required after generation.",
                  }}
                />
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Label label={lang({ ko: "스타일 기준 이미지 assetId", en: "Style anchor assetId" })}>
          <Input
            value={anchorInput}
            onChange={(event) => setAnchorInput(event.target.value)}
            placeholder={anchorImageAssetId || (anchorSourceUrl ? lang({ ko: "편집 이미지 연결됨", en: "Edited image attached" }) : "asset_...")}
          />
        </Label>
        <Label label={lang({ ko: "에셋 이름 (선택)", en: "Asset name (optional)" })}>
          <Input value={nameInput} onChange={(event) => setNameInput(event.target.value)} placeholder="sprite-v2-..." />
        </Label>
        <div className="flex items-end gap-2">
          <Button onClick={handleCreatePipeline} disabled={busy}>
            <Plus className="mr-1 size-4" />
            <Lang text={{ ko: "작업 시작", en: "Start" }} />
          </Button>
          <Button variant="outline" onClick={() => refreshList()} disabled={busy}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {studioSearched && onSelectStudioImage ? (
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              <Lang text={{ ko: "검색 결과에서 기준 이미지 선택", en: "Choose an anchor from search results" }} />
            </p>
            <span className="text-xs text-muted-foreground">
              <Lang text={{ ko: "Gen Studio 결과 재사용", en: "Reusing Gen Studio results" }} />
            </span>
          </div>
          {studioLoading ? (
            <p className="mt-3 rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground" role="status" aria-live="polite">
              <Lang text={{ ko: "검색 결과를 불러오는 중입니다.", en: "Loading search results." }} />
            </p>
          ) : studioImages.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {studioImages.map((image) => {
                const selected = image.assetId === effectiveAnchorAssetId;
                return (
                  <button
                    key={image.assetId}
                    type="button"
                    className={cn(
                      "min-w-0 rounded-lg border bg-surface p-2 text-left transition hover:border-primary focus-visible-ring",
                      selected ? "border-primary ring-1 ring-primary/30" : "border-border",
                    )}
                    onClick={() => onSelectStudioImage(image)}
                    aria-pressed={selected}
                  >
                    <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-muted">
                      <ImageBox src={image.url} alt={image.assetId} minWidth={72} maxWidth={160} minHeight={72} maxHeight={96} />
                    </div>
                    <p className="mt-2 truncate text-xs font-semibold">{image.templateKey || image.modelName || image.assetId}</p>
                    <p className="truncate text-xxs text-muted-foreground">{image.assetId}</p>
                    {selected ? (
                      <span className="mt-1 inline-flex rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xxs text-primary">
                        <Lang text={{ ko: "현재 선택됨", en: "Selected" }} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              <Lang text={{ ko: "선택할 수 있는 검색 결과가 없습니다.", en: "No searchable results are available to select." }} />
            </p>
          )}
        </div>
      ) : null}

      {selectedStudioImage || effectiveAnchorSourceUrl ? (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {selectedStudioImage?.url || effectiveAnchorSourceUrl ? (
              <ImageBox
                src={selectedStudioImage?.url || effectiveAnchorSourceUrl}
                alt={selectedStudioImage?.templateKey || effectiveAnchorAssetId || lang({ ko: "스타일 기준 이미지", en: "Style anchor" })}
                minWidth={64}
                maxWidth={80}
                minHeight={64}
                maxHeight={80}
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              <Lang text={{ ko: "스타일 기준 이미지 선택됨", en: "Style anchor selected" }} />
            </p>
            <p className="mt-1 truncate text-xs font-medium">{selectedStudioImage?.templateKey || selectedStudioImage?.modelName || effectiveAnchorAssetId || lang({ ko: "편집 이미지", en: "Edited image" })}</p>
            <p className="truncate text-xs text-muted-foreground">{effectiveAnchorAssetId || effectiveAnchorSourceUrl}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,20rem)_1fr]">
        <Label label={lang({ ko: "파이프라인 선택", en: "Select pipeline" })}>
          <Select
            value={activePipeline?.pipelineId || ""}
            onValueChange={(value) => {
              const pipelineId = Array.isArray(value) ? String(value[0] || "") : String(value);
              const pipeline = pipelines.find((item) => item.pipelineId === pipelineId);
              if (pipeline) {
                const variables = toUnknownRecord(pipeline.variables);
                setSelectedActionKey(
                  normalizeSpriteActionKey(variables.sprite_action_key),
                );
                const pipelineModelKey = `${String(variables.sprite_model_provider || "")}:${String(variables.sprite_model_name || "")}`;
                if (spriteModelOptions.some((item) => `${item.provider}:${item.modelName}` === pipelineModelKey)) {
                  setSelectedSpriteModelKey(pipelineModelKey);
                }
              }
              void selectPipeline(pipelineId);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={lang({ ko: "최근 파이프라인", en: "Recent pipelines" })} />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.pipelineId} value={pipeline.pipelineId}>
                  {`${String(toUnknownRecord(pipeline.variables).sprite_action_label || pipeline.name || pipeline.pipelineId.slice(-8))} · ${Number(toUnknownRecord(pipeline.variables).sprite_frame_count || 4)}f · ${pipeline.status}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>

        {activePipeline ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("text-[11px]", PIPELINE_STATUS_STYLE[activePipeline.status] || "bg-muted text-muted-foreground")}>
                {activePipeline.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                <Lang
                  text={{
                    ko: `누적 과금 ${activePipeline.billing?.totalCoins ?? 0}코인`,
                    en: `Total billed ${activePipeline.billing?.totalCoins ?? 0} coins`,
                  }}
                />
              </span>
              {activePipeline.result?.gameAssetId ? (
                <span className="font-mono text-xs text-muted-foreground">{activePipeline.result.gameAssetId}</span>
              ) : null}
              <Badge variant="outline">
                <Lang
                  text={{
                    ko: `${Number(toUnknownRecord(activePipeline.variables).sprite_frame_count || 4)}프레임`,
                    en: `${Number(toUnknownRecord(activePipeline.variables).sprite_frame_count || 4)} frames`,
                  }}
                />
              </Badge>
            </div>

            <ul className="flex flex-wrap gap-1.5">
              {SPRITE_PIPELINE_STEP_KEYS.filter((stepKey) =>
                Object.prototype.hasOwnProperty.call(activePipeline.steps || {}, stepKey),
              ).map((stepKey) => {
                const step = (activePipeline.steps?.[stepKey] || { status: "pending", attempt: 0 }) as GameAssetPipelineStepStateType;
                return (
                  <li key={stepKey} className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1">
                    <span className="text-[11px]">
                      <Lang text={STEP_LABEL[stepKey]} />
                    </span>
                    <Badge className={cn("text-[10px]", STEP_STATUS_STYLE[step.status] || STEP_STATUS_STYLE.pending)}>
                      {`${step.status}${step.attempt ? ` (${step.attempt})` : ""}`}
                    </Badge>
                  </li>
                );
              })}
            </ul>

            {nextStep && nextStep !== "step2-dir" ? (
              <Button onClick={() => handleRunStep(nextStep)} disabled={busy}>
                {runningStep ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Play className="mr-1 size-4" />}
                <Lang
                  text={{
                    ko: `다음 실행: ${lang(STEP_LABEL[nextStep])}`,
                    en: `Run next: ${lang(STEP_LABEL[nextStep])}`,
                  }}
                />
              </Button>
            ) : null}

            <DirectionGrid
              pipeline={activePipeline}
              quote={directionQuoteQuery.data || null}
              quoteLoading={directionQuoteQuery.isLoading}
              busy={busy}
              onRegenerate={handleRegenerateDirections}
              onMirror={handleMirrorDirection}
            />

            {composedSheetUrl ? (
              <DirectionWheelPreview sheetUrl={composedSheetUrl} frameCount={Number(toUnknownRecord(activePipeline?.variables).sprite_frame_count || 4)} />
            ) : null}
          </div>
        ) : (
          <p className="self-center text-sm text-muted-foreground">
            <Lang
              text={{
                ko: "파이프라인을 선택하거나, Gen Studio 이미지 assetId를 anchor로 지정해 새로 생성하세요.",
                en: "Select a pipeline, or create one with a Gen Studio image assetId as the anchor.",
              }}
            />
          </p>
        )}
      </div>

      <Dialog
        open={Boolean(pipelineConfirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setPipelineConfirmation(null);
        }}
      >
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-md"
          innerWrapClassName="p-5 sm:p-6"
          disableOutsideClick={busy}
        >
          <DialogHeader className="pr-8">
            <DialogTitle>
              <Lang
                text={
                  pipelineConfirmation?.kind === "mirror"
                    ? { ko: "미러 방향을 저장할까요?", en: "Save the mirrored direction?" }
                    : { ko: "이미지 생성을 시작할까요?", en: "Start image generation?" }
                }
              />
            </DialogTitle>
            <DialogDescription className="leading-6">
              <Lang
                text={
                  pipelineConfirmation?.kind === "mirror"
                    ? {
                        ko: `${pipelineConfirmation.direction} 방향으로 좌우 반전합니다. 손잡이, 글자·로고, 비대칭 문양, 머리 가르마가 뒤집힐 수 있으므로 해당 요소가 없는지 확인해 주세요.`,
                        en: `The passed counterpart will be mirrored into ${pipelineConfirmation.direction}. Confirm that hands, text, logos, asymmetric markings, and hair parts are not present before continuing.`,
                      }
                    : {
                        ko: "표시는 안내용이며 실제 실행과 차감은 서버 preflight 판정이 결정합니다.",
                        en: "These values are informational; the server preflight decides whether execution and billing can proceed.",
                      }
                }
              />
            </DialogDescription>
          </DialogHeader>

          {pipelineConfirmation?.kind === "generation" ? (
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-background p-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">
                  <Lang text={{ ko: "예상 금액", en: "Estimated cost" }} />
                </dt>
                <dd className="mt-1 flex items-center gap-1 font-semibold tabular-nums">
                  <Coins className="size-4 text-[color:var(--coin)]" aria-hidden />
                  {confirmationCoins?.toLocaleString()} <Lang text={{ ko: "코인", en: "coins" }} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  <Lang text={{ ko: "생성 장수", en: "Images" }} />
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {pipelineConfirmation.count.toLocaleString()} <Lang text={{ ko: "장", en: "image(s)" }} />
                </dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-xs text-muted-foreground">
                  <Lang text={{ ko: "대상 모델 (서버 견적)", en: "Target model (server quote)" }} />
                </dt>
                <dd className="mt-1 break-all font-mono text-xs font-semibold">{confirmationModel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  <Lang text={{ ko: "현재 잔액", en: "Current balance" }} />
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {userData ? `${currentBalance.toLocaleString()} ` : "-- "}
                  <Lang text={{ ko: "코인", en: "coins" }} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  <Lang text={{ ko: "실행 후 예상 잔액", en: "Estimated after run" }} />
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {userData && confirmationAfterBalance !== null ? `${confirmationAfterBalance.toLocaleString()} ` : "-- "}
                  <Lang text={{ ko: "코인", en: "coins" }} />
                </dd>
              </div>
            </dl>
          ) : null}

          {pipelineConfirmation?.kind === "generation" && pipelineConfirmation.count >= 3 ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
              <Lang
                text={{
                  ko: `${pipelineConfirmation.count}방향 일괄 재생성입니다. ${pipelineConfirmation.directions?.join(", ")} 순서로 실행하며 중간 실패 시 중단합니다.`,
                  en: `This batch regenerates ${pipelineConfirmation.count} directions in order (${pipelineConfirmation.directions?.join(", ")}) and stops if one fails.`,
                }}
              />
            </p>
          ) : null}

          {pipelineConfirmation?.kind === "generation" ? (
            <p className="text-xs leading-5 text-muted-foreground">
              <Lang
                text={{
                  ko: "견적과 실제 차감은 생성 결과·서버 가격에 따라 달라질 수 있습니다. 잔액 부족이나 가격 조회 실패 시 서버가 실행을 차단합니다.",
                  en: "The final charge can differ based on the generation result and server pricing. The server blocks execution when balance or pricing checks fail.",
                }}
              />
            </p>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="min-h-11" onClick={() => setPipelineConfirmation(null)} disabled={busy}>
              <Lang text={{ ko: "취소", en: "Cancel" }} />
            </Button>
            <Button className="min-h-11" onClick={() => void handlePipelineConfirmation()} loading={busy}>
              <Lang text={{ ko: "실행하기", en: "Continue" }} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}

    </div>
  );
}
