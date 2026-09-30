import type { Dispatch, SetStateAction } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  MARKETING_PROOFREAD_DEFAULT_MODEL,
  MARKETING_PROOFREAD_DEFAULT_MODEL_BY_PROVIDER,
  MARKETING_PROOFREAD_DEFAULT_PROVIDER,
} from "consts/marketing/proofread";
import { TEXT_PROVIDER_TYPES } from "consts/ai";
import { cn } from "utils/common";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { REVIEW_PANEL_LABEL_CLASS, REVIEW_PANEL_SUBTLE_CLASS } from "./MarketingOpsConstants";
import { formatDate, getChannelLabel, toSafeString } from "./MarketingOpsUtils";

export type StrategyFitKind = "marketing" | "advertising";

export type StrategyFitSignal = {
  kind: StrategyFitKind;
  score: number;
  signal: "green" | "yellow" | "red";
  label: string;
  className: string;
  meterClassName: string;
  summary: string;
  reasons: string[];
  recommendations: Array<{ action: string; reason: string }>;
  strategyVersion: number;
  evaluatedAt: string;
  provider: string;
  modelName: string;
};

export type StrategyFitGuideState = {
  channel: string;
  result: StrategyFitSignal;
};

export type StrategyFitDialogState = {
  open: boolean;
  kind: StrategyFitKind;
  loading: boolean;
  agreed: boolean;
  modelProvider: string;
  modelName: string;
  ready: boolean;
  version: number;
  updatedAt: string;
};

export const INITIAL_STRATEGY_FIT_DIALOG: StrategyFitDialogState = {
  open: false,
  kind: "marketing",
  loading: false,
  agreed: false,
  modelProvider: MARKETING_PROOFREAD_DEFAULT_PROVIDER,
  modelName: MARKETING_PROOFREAD_DEFAULT_MODEL,
  ready: false,
  version: 0,
  updatedAt: "",
};

export function getStrategyFitSignal(
  content: UnknownRecord | undefined,
  kind: StrategyFitKind,
): StrategyFitSignal | null {
  const fit = content?.[kind === "marketing" ? "marketingFit" : "adFit"] as UnknownRecord | undefined;
  if (!fit) return null;
  const score = Math.max(0, Math.min(100, Math.round(Number(fit.score) || 0)));
  const normalizedSignal = score >= 85 ? "green" : score >= 70 ? "yellow" : "red";
  const isMarketing = kind === "marketing";
  const reasons = Array.isArray(fit.reasons) ? fit.reasons.map(toSafeString).filter(Boolean).slice(0, 10) : [];
  const recommendations = Array.isArray(fit.recommendations)
    ? fit.recommendations
        .map((item) => toUnknownRecord(item))
        .map((item) => ({ action: toSafeString(item.action), reason: toSafeString(item.reason) }))
        .filter((item) => item.action || item.reason)
        .slice(0, 5)
    : [];

  return {
    kind,
    score,
    signal: normalizedSignal,
    label:
      normalizedSignal === "green"
        ? lang({ ko: isMarketing ? "마케팅 적합" : "광고 적합", en: isMarketing ? "Marketing fit" : "Ad fit" })
        : normalizedSignal === "yellow"
          ? lang({
              ko: isMarketing ? "마케팅 보완" : "광고 보완",
              en: isMarketing ? "Marketing needs work" : "Ad needs work",
            })
          : lang({
              ko: isMarketing ? "마케팅 부적합" : "광고 부적합",
              en: isMarketing ? "Marketing not fit" : "Ad not fit",
            }),
    className:
      normalizedSignal === "green"
        ? "bg-emerald-600 text-white"
        : normalizedSignal === "yellow"
          ? "bg-amber-500 text-white"
          : "bg-destructive text-white",
    meterClassName:
      normalizedSignal === "green"
        ? "bg-emerald-600"
        : normalizedSignal === "yellow"
          ? "bg-amber-500"
          : "bg-destructive",
    summary: toSafeString(fit.summary),
    reasons,
    recommendations,
    strategyVersion: Number(fit.strategyVersion || 0),
    evaluatedAt: toSafeString(fit.evaluatedAt),
    provider: toSafeString(fit.provider),
    modelName: toSafeString(fit.modelName),
  };
}

export function MarketingStrategyFitGuideDialog({
  guide,
  onClose,
}: {
  guide: StrategyFitGuideState | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!guide} onOpenChange={(open) => !open && onClose()}>
      <DialogContent innerWrapClassName="max-h-[85vh] max-w-2xl overflow-y-auto">
        {guide ? (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle>
                {getChannelLabel(guide.channel)} · {guide.result.label} {guide.result.score}
              </DialogTitle>
              <DialogDescription>
                {lang({
                  ko: "등록된 전략과 현재 채널 초안을 비교한 AI 평가 결과입니다. 아래 근거와 권고를 확인한 뒤 초안을 수정하세요.",
                  en: "This AI evaluation compares the saved strategy with the current channel draft. Review the reasons and recommendations before editing the draft.",
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <section aria-labelledby="strategy-fit-score-heading">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h4 id="strategy-fit-score-heading" className="text-sm font-semibold text-primary-text">
                      <Lang text={{ ko: "적합도 점수", en: "Fit score" }} />
                    </h4>
                    <p className="mt-1 text-xs text-secondary-text">
                      <Lang
                        text={{
                          ko: "AI가 제시한 점수를 0~100점으로 보정하고 정수로 반올림한 값입니다.",
                          en: "The AI score is clamped to 0–100 and rounded to the nearest integer.",
                        }}
                      />
                    </p>
                  </div>
                  <strong className="text-3xl leading-none text-primary-text">
                    {guide.result.score}
                    <span className="ml-1 text-sm font-medium text-secondary-text">/ 100</span>
                  </strong>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={guide.result.score}
                  aria-label={lang({ ko: "적합도 점수", en: "Fit score" })}
                >
                  <div
                    className={cn("h-full rounded-full", guide.result.meterClassName)}
                    style={{ width: `${guide.result.score}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-text">
                  <Lang
                    text={{
                      ko: "판정 구간: 85~100 적합 · 70~84 보완 · 0~69 부적합",
                      en: "Score bands: 85–100 fit · 70–84 needs work · 0–69 not fit",
                    }}
                  />
                </p>
              </section>

              <section className="border-t border-border pt-4" aria-labelledby="strategy-fit-summary-heading">
                <h4 id="strategy-fit-summary-heading" className="text-sm font-semibold text-primary-text">
                  <Lang text={{ ko: "평가 요약", en: "Evaluation summary" }} />
                </h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-secondary-text">
                  {guide.result.summary ||
                    lang({
                      ko: "저장된 평가 요약이 없습니다. 아래 점수 근거와 보완 권고를 확인하세요.",
                      en: "No saved evaluation summary is available. Review the reasons and recommendations below.",
                    })}
                </p>
              </section>

              <section className="border-t border-border pt-4" aria-labelledby="strategy-fit-reasons-heading">
                <h4 id="strategy-fit-reasons-heading" className="text-sm font-semibold text-primary-text">
                  <Lang text={{ ko: "왜 이 점수인가", en: "Why this score" }} />
                </h4>
                {guide.result.reasons.length ? (
                  <ol className="mt-2 space-y-2 pl-5 text-sm leading-6 text-secondary-text">
                    {guide.result.reasons.map((reason, index) => (
                      <li key={`${reason}-${index}`} className="list-decimal pl-1">
                        {reason}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-secondary-text">
                    <Lang
                      text={{
                        ko: "이 검사에는 개별 점수 근거가 저장되지 않았습니다. 필요하면 적합도 검사를 다시 실행하세요.",
                        en: "This evaluation has no saved score reasons. Run the fit check again if detailed reasons are required.",
                      }}
                    />
                  </p>
                )}
              </section>

              <section className="border-t border-border pt-4" aria-labelledby="strategy-fit-actions-heading">
                <h4 id="strategy-fit-actions-heading" className="text-sm font-semibold text-primary-text">
                  <Lang text={{ ko: "어떻게 보완할까", en: "How to improve it" }} />
                </h4>
                {guide.result.recommendations.length ? (
                  <ol className="mt-2 space-y-3">
                    {guide.result.recommendations.map((recommendation, index) => (
                      <li key={`${recommendation.action}-${index}`} className="flex gap-3 text-sm">
                        <span
                          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-primary-text"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          {recommendation.action ? (
                            <p className="font-medium leading-6 text-primary-text">{recommendation.action}</p>
                          ) : null}
                          {recommendation.reason ? (
                            <p className="leading-6 text-secondary-text">{recommendation.reason}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-secondary-text">
                    <Lang
                      text={{
                        ko: "별도 보완 권고가 저장되지 않았습니다. 평가 요약과 점수 근거를 기준으로 초안을 검토하세요.",
                        en: "No separate recommendations were saved. Review the draft using the summary and score reasons.",
                      }}
                    />
                  </p>
                )}
              </section>

              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-xs text-muted-text">
                {guide.result.strategyVersion > 0 ? (
                  <span>
                    {lang({ ko: "전략 버전", en: "Strategy version" })}: v{guide.result.strategyVersion}
                  </span>
                ) : null}
                {guide.result.evaluatedAt ? (
                  <span>
                    {lang({ ko: "검사 시각", en: "Evaluated" })}: {formatDate(guide.result.evaluatedAt)}
                  </span>
                ) : null}
                {guide.result.provider || guide.result.modelName ? (
                  <span>
                    {lang({ ko: "검사 모델", en: "Evaluation model" })}: {guide.result.provider || "-"} /{" "}
                    {guide.result.modelName || "-"}
                  </span>
                ) : null}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                <Lang text={{ ko: "닫고 초안 수정하기", en: "Close and edit draft" }} />
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function MarketingStrategyFitDialog({
  state,
  modelOptions,
  contentCount,
  setState,
  onClose,
  onOpenStrategy,
  onRun,
}: {
  state: StrategyFitDialogState;
  modelOptions: readonly string[];
  contentCount: number;
  setState: Dispatch<SetStateAction<StrategyFitDialogState>>;
  onClose: () => void;
  onOpenStrategy: () => void;
  onRun: () => void;
}) {
  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && !state.loading && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Lang
              text={
                state.kind === "marketing"
                  ? { ko: "마케팅 적합도 AI 검사", en: "AI marketing fit check" }
                  : { ko: "광고 적합도 AI 검사", en: "AI advertising fit check" }
              }
            />
          </DialogTitle>
          <DialogDescription>
            <Lang
              text={{
                ko: "현재 JOB의 채널 콘텐츠를 등록된 전략 기준으로 검사합니다. AI 모델을 사용하며 실제 사용량에 따라 코인이 차감됩니다. 콘텐츠 본문은 변경하지 않습니다.",
                en: "Checks the current job's channel content against the saved strategy. AI usage is charged by actual consumption and draft content is not modified.",
              }}
            />
          </DialogDescription>
        </DialogHeader>

        {state.loading ? (
          <p className="text-sm text-secondary-text">
            <Lang
              text={{
                ko: "전략 정보 또는 AI 평가를 처리하고 있습니다.",
                en: "Loading strategy or running the AI evaluation.",
              }}
            />
          </p>
        ) : (
          <div className="space-y-4">
            <div className={cn(REVIEW_PANEL_SUBTLE_CLASS, "space-y-1")}>
              <p className="text-sm font-medium text-primary-text">
                <Lang text={{ ko: "검사 전 확인", en: "Before you continue" }} />
              </p>
              <p className="text-xs text-secondary-text">
                {state.ready
                  ? lang({ ko: `전략 v${state.version} 등록됨`, en: `Strategy v${state.version} is ready` })
                  : lang({ ko: "필수 전략 정보가 등록되지 않았습니다.", en: "Required strategy information is missing." })}
              </p>
              {state.updatedAt ? <p className="text-xs text-secondary-text">{formatDate(state.updatedAt)}</p> : null}
              <p className="text-xs text-secondary-text">
                {lang({ ko: `대상 콘텐츠 ${contentCount}개`, en: `${contentCount} content item(s)` })}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  <Lang text={{ ko: "AI 제공자", en: "AI provider" }} />
                </label>
                <Select
                  value={state.modelProvider}
                  onValueChange={(value) => {
                    const provider = Array.isArray(value) ? value[0] || "" : value;
                    setState((prev) => ({
                      ...prev,
                      modelProvider: provider,
                      modelName:
                        (MARKETING_PROOFREAD_DEFAULT_MODEL_BY_PROVIDER as Record<string, string>)[provider] || "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEXT_PROVIDER_TYPES.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  <Lang text={{ ko: "AI 모델", en: "AI model" }} />
                </label>
                <Select
                  value={state.modelName}
                  onValueChange={(value) =>
                    setState((prev) => ({ ...prev, modelName: Array.isArray(value) ? value[0] || "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((modelName) => (
                      <SelectItem key={modelName} value={modelName}>
                        {modelName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-primary-text">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={state.agreed}
                onChange={(event) => setState((prev) => ({ ...prev, agreed: event.target.checked }))}
              />
              <Lang
                text={{
                  ko: "AI 사용과 실제 사용량 기준 코인 차감에 동의합니다. 결과는 추천 정보이며 광고 심사 승인이나 성과를 보장하지 않습니다.",
                  en: "I agree to AI usage and usage-based coin charges. Results are recommendations and do not guarantee ad approval or performance.",
                }}
              />
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={state.loading}>
            <Lang text={{ ko: "취소", en: "Cancel" }} />
          </Button>
          <Button variant="outline" onClick={onOpenStrategy} disabled={state.loading}>
            <Lang text={{ ko: "전략 정보 확인/등록", en: "Review or add strategy" }} />
          </Button>
          <Button
            onClick={onRun}
            disabled={state.loading || !state.ready || !state.agreed || !state.modelName}
          >
            <Lang text={{ ko: "비용 발생에 동의하고 검사", en: "Agree to charges and check" }} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
