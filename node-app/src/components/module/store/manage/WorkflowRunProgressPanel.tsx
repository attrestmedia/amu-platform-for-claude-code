"use client";

import { AlertTriangle, CheckCircle2, Circle, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Badge, Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { ICommerceWorkflowRun, CommerceWorkflowState } from "types/commerce";
import {
  SMARTSTORE_WORKFLOW_LIFECYCLE_LABELS,
  SMARTSTORE_WORKFLOW_STAGE_LABELS,
  SMARTSTORE_WORKFLOW_STAGE_STATUS_LABELS,
  SMARTSTORE_OPERATOR_TEXT,
  formatDate,
} from "./smartstoreDraftUtils";

type WorkflowStageStatus = keyof typeof SMARTSTORE_WORKFLOW_STAGE_STATUS_LABELS;

export type WorkflowRunProgressPanelProps = {
  run: ICommerceWorkflowRun | null;
  loading: boolean;
  pendingAction: "" | "start" | "retry" | "cancel" | "resume";
  onStart: () => void;
  onRetryStage: (stage: CommerceWorkflowState) => void;
  onCancel: () => void;
  onResume: () => void;
};

const STAGE_STATUS_ICON: Record<WorkflowStageStatus, typeof CheckCircle2> = {
  pending: Circle,
  running: Loader2,
  succeeded: CheckCircle2,
  failed: XCircle,
  cancelled: AlertTriangle,
};

const STAGE_STATUS_CLASS: Record<WorkflowStageStatus, string> = {
  pending: "text-secondary-text",
  running: "text-primary",
  succeeded: "text-green-600",
  failed: "text-red-600",
  cancelled: "text-amber-600",
};

function countEvidence(stage: ICommerceWorkflowRun["stages"][number]) {
  const evidence = stage.evidence;
  return (
    evidence.generationJobIds.length +
    evidence.outputAssetIds.length +
    evidence.selectedAssetIds.length +
    evidence.modelReferenceKitIds.length +
    evidence.marketingJobIds.length +
    (evidence.publishJobId ? 1 : 0)
  );
}

/**
 * workflow run의 단계별 상태·시도 회차·비용·증거 수를 하나의 진행 패널로 보여준다.
 * 실패한 단계에서만 재시도를 노출해 중단 지점 재개를 한 화면에서 끝낸다.
 */
export function WorkflowRunProgressPanel({
  run,
  loading,
  pendingAction,
  onStart,
  onRetryStage,
  onCancel,
  onResume,
}: WorkflowRunProgressPanelProps) {
  if (loading) {
    return (
      <section className="rounded-[1.5rem] border border-border bg-surface p-5">
        <div className="rounded-[1rem] border border-dashed border-border px-4 py-8 text-center text-sm text-secondary-text">
          <Lang text={{ ko: "진행 상태를 불러오는 중입니다...", en: "Loading progress..." }} />
        </div>
      </section>
    );
  }

  if (!run) {
    return (
      <section className="rounded-[1.5rem] border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-primary-text">
          <Lang text={SMARTSTORE_OPERATOR_TEXT.workflow} />
        </p>
        <p className="mt-3 text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "아직 이 상품의 제작 진행 기록이 없습니다. 진행을 시작하면 모델 시트부터 발행까지의 단계와 비용이 여기에 기록됩니다.",
              en: "No production run yet. Start one to track every stage from model sheet to publishing, along with its cost.",
            }}
          />
        </p>
        <Button className="mt-4" size="sm" loading={pendingAction === "start"} onClick={onStart}>
          <Lang text={{ ko: "제작 진행 시작", en: "Start production run" }} />
        </Button>
      </section>
    );
  }

  const stageByKey = new Map(run.stages.map((stage) => [stage.stage, stage]));
  const cancelled = run.lifecycle === "cancelled";
  const blockedStage = run.resume?.blockedStage || null;

  return (
    <section className="rounded-[1.5rem] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-primary-text">
          <Lang text={SMARTSTORE_OPERATOR_TEXT.workflow} />
        </p>
        <Badge variant={cancelled ? "muted" : run.lifecycle === "failed" ? "destructive" : "primary"}>
          <Lang text={SMARTSTORE_WORKFLOW_LIFECYCLE_LABELS[run.lifecycle]} />
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-secondary-text">
        <div>
          <dt><Lang text={{ ko: "예상 비용", en: "Estimated cost" }} /></dt>
          <dd className="mt-1 font-semibold text-primary-text">{run.estimatedCost.toLocaleString()}</dd>
        </div>
        <div>
          <dt><Lang text={{ ko: "적용된 비용", en: "Applied cost" }} /></dt>
          <dd className="mt-1 font-semibold text-primary-text">{run.appliedCost.toLocaleString()}</dd>
        </div>
      </dl>

      <ol className="mt-4 space-y-2">
        {SMARTSTORE_WORKFLOW_STAGE_LABELS.map((item) => {
          const stage = stageByKey.get(item.stage);
          const status = (stage?.status || "pending") as WorkflowStageStatus;
          const Icon = STAGE_STATUS_ICON[status];
          const evidenceCount = stage ? countEvidence(stage) : 0;
          return (
            <li
              key={item.stage}
              className="rounded-[1rem] border border-border bg-background/70 px-4 py-3"
              aria-current={run.currentStage === item.stage ? "step" : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${STAGE_STATUS_CLASS[status]} ${status === "running" ? "animate-spin motion-reduce:animate-none" : ""}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-primary-text">
                      <Lang text={item.label} />
                    </p>
                    <p className="mt-1 text-xxs text-secondary-text">
                      <Lang text={SMARTSTORE_WORKFLOW_STAGE_STATUS_LABELS[status]} />
                      {stage && stage.attempt > 1 ? (
                        <>
                          {" · "}
                          {lang({ ko: `시도 ${stage.attempt}회`, en: `attempt ${stage.attempt}` })}
                        </>
                      ) : null}
                      {stage && stage.appliedCost > 0 ? ` · ${stage.appliedCost.toLocaleString()}` : ""}
                      {evidenceCount > 0
                        ? ` · ${lang({ ko: `증거 ${evidenceCount}건`, en: `${evidenceCount} evidence` })}`
                        : ""}
                    </p>
                    {stage?.completedAt ? (
                      <p className="mt-1 text-xxs text-secondary-text">{formatDate(stage.completedAt)}</p>
                    ) : null}
                    {stage?.lastError?.message ? (
                      <p className="mt-2 text-xs leading-5 text-red-600">{stage.lastError.message}</p>
                    ) : null}
                  </div>
                </div>
                {!cancelled && (status === "failed" || status === "cancelled") ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={pendingAction === "retry" && blockedStage === item.stage}
                    onClick={() => onRetryStage(item.stage)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    <Lang text={{ ko: "재시도", en: "Retry" }} />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        {run.lifecycle === "failed" ? (
          <Button size="sm" loading={pendingAction === "resume"} onClick={onResume}>
            <Lang text={{ ko: "중단 지점부터 재개", en: "Resume from last stop" }} />
          </Button>
        ) : null}
        {cancelled ? (
          <Button size="sm" loading={pendingAction === "start"} onClick={onStart}>
            <Lang text={{ ko: "새 진행 시작", en: "Start a new run" }} />
          </Button>
        ) : (
          <Button variant="outline" size="sm" loading={pendingAction === "cancel"} onClick={onCancel}>
            <Lang text={{ ko: "진행 취소", en: "Cancel run" }} />
          </Button>
        )}
      </div>

      {cancelled && run.cancelReason ? (
        <p className="mt-3 text-xs leading-5 text-secondary-text">{run.cancelReason}</p>
      ) : null}
      <p className="mt-3 text-xxs text-secondary-text">{run.runId}</p>
    </section>
  );
}
