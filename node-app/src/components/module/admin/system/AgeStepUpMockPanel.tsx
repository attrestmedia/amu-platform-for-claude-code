"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, RadioGroup, RadioGroupItem } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  AGE_STEP_UP_MOCK_SCENARIOS,
  isAgeStepUpMockScenario,
  type AgeStepUpMockOutcome,
  type AgeStepUpMockScenario,
} from "consts/system/ageStepUpMock";
import { postAgeStepUpMock } from "libs/api/admin/ageStepUpMock";
import {
  getAgeStepUpMockStepNumber,
  reduceAgeStepUpMockFlow,
  type AgeStepUpMockFlowState,
} from "components/module/admin/system/ageStepUpMockFlow";
import { logger } from "utils/log";

type LocalizedText = { ko: string; en: string };

/**
 * @docHint
 * @purpose 관리자용 synthetic step-up 흐름 UI
 * @process 시나리오 선택  내부 확인  모의 요청  결과·오류 안내
 * @domain identity-mock
 * @scope admin
 */

const SCENARIO_LABELS: Record<AgeStepUpMockScenario, LocalizedText> = {
  success: { ko: "성공 (synthetic_pass)", en: "Success (synthetic_pass)" },
  failure: { ko: "실패 (synthetic_fail)", en: "Failure (synthetic_fail)" },
  cancelled: { ko: "사용자 취소", en: "Cancelled" },
  expired: { ko: "만료", en: "Expired" },
  provider_error: { ko: "제공자 오류", en: "Provider error" },
};

const OUTCOME_COPY: Record<AgeStepUpMockOutcome, { title: LocalizedText; description: LocalizedText }> = {
  synthetic_pass: {
    title: { ko: "모의 확인 성공", en: "Mock check succeeded" },
    description: { ko: "합성 결과를 반환했습니다. 실제 사용자 상태는 변경되지 않았습니다.", en: "A synthetic result was returned. No real user state changed." },
  },
  synthetic_fail: {
    title: { ko: "모의 확인 실패", en: "Mock check failed" },
    description: { ko: "실패 시나리오의 합성 결과입니다.", en: "This is the synthetic result for the failure scenario." },
  },
  cancelled: {
    title: { ko: "사용자가 취소함", en: "Cancelled" },
    description: { ko: "취소 시나리오의 합성 결과입니다.", en: "This is the synthetic result for the cancellation scenario." },
  },
  expired: {
    title: { ko: "요청 만료", en: "Request expired" },
    description: { ko: "만료 시나리오의 합성 결과입니다.", en: "This is the synthetic result for the expiry scenario." },
  },
  error: {
    title: { ko: "제공자 오류(모의)", en: "Provider error (mock)" },
    description: { ko: "오류 시나리오의 합성 결과입니다.", en: "This is the synthetic result for the error scenario." },
  },
};

const INITIAL_STATE: AgeStepUpMockFlowState = { step: "idle" };

function getRequestStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  if ("response" in error && typeof error.response === "object" && error.response !== null && "status" in error.response) {
    return typeof error.response.status === "number" ? error.response.status : null;
  }
  if ("status" in error && typeof error.status === "number") return error.status;
  return null;
}

function getAnnouncement(state: AgeStepUpMockFlowState): LocalizedText {
  switch (state.step) {
    case "idle":
      return { ko: "모의 시나리오를 선택해 주세요.", en: "Choose a mock scenario." };
    case "consent":
      return { ko: "내부 확인 단계입니다.", en: "Internal confirmation step." };
    case "pending":
      return { ko: "모의 흐름을 실행하고 있습니다.", en: "Running the mock flow." };
    case "result":
      return OUTCOME_COPY[state.result.outcome].title;
    case "request_error":
      return state.status === 403
        ? { ko: "관리자 전용 기능입니다.", en: "This feature is for administrators only." }
        : { ko: "요청에 실패했습니다.", en: "The request failed." };
  }
}

export function AgeStepUpMockPanel() {
  const [state, dispatch] = useReducer(reduceAgeStepUpMockFlow, INITIAL_STATE);
  const [selectedScenario, setSelectedScenario] = useState<AgeStepUpMockScenario>("success");
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const currentStep = getAgeStepUpMockStepNumber(state);

  useEffect(function focusOutcomeHeading() {
    if (state.step === "result" || state.step === "request_error") {
      resultHeadingRef.current?.focus();
    }
  }, [state]);

  async function submitScenario(scenario: AgeStepUpMockScenario) {
    dispatch({ type: "CONFIRM" });
    try {
      const result = await postAgeStepUpMock(scenario);
      dispatch({ type: "RESOLVED", result });
    } catch (error) {
      const status = getRequestStatus(error);
      logger.warn("[AgeStepUpMockPanel] 모의 요청 실패", { status });
      dispatch({ type: "FAILED", status });
    }
  }

  const outcome = state.step === "result" ? OUTCOME_COPY[state.result.outcome] : null;
  const isForbidden = state.step === "request_error" && state.status === 403;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div role="note" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-primary-text">
        <Lang
          text={{
            ko: "모의(synthetic) 흐름입니다. 실제 본인확인, 외부 인증 화면 이동, 결과 저장이 일어나지 않습니다.",
            en: "Synthetic mock flow. No real identity verification, external redirect, or stored result.",
          }}
        />
      </div>

      <ol
        aria-label={lang({ ko: "모의 흐름 단계", en: "Mock flow steps" })}
        className="grid grid-cols-3 gap-2"
      >
        {([
          { number: 1, label: { ko: "준비", en: "Prepare" } },
          { number: 2, label: { ko: "확인", en: "Confirm" } },
          { number: 3, label: { ko: "결과", en: "Result" } },
        ] as const).map((step) => (
          <li
            key={step.number}
            aria-current={currentStep === step.number ? "step" : undefined}
            className={`rounded-lg border px-3 py-2 text-center text-sm ${currentStep === step.number ? "border-primary bg-primary/5 font-semibold text-primary-text" : "border-border text-secondary-text"}`}
          >
            <span className="mr-1">{step.number}/3</span>
            <Lang text={step.label} />
          </li>
        ))}
      </ol>

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <Lang text={getAnnouncement(state)} />
      </p>

      {state.step === "idle" ? (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-4" aria-labelledby="age-step-up-scenario-title">
          <fieldset className="space-y-3">
            <legend id="age-step-up-scenario-title" className="text-base font-semibold text-primary-text">
              <Lang text={{ ko: "모의 시나리오", en: "Mock scenario" }} />
            </legend>
            <RadioGroup
              value={selectedScenario}
              onValueChange={(value) => {
                if (isAgeStepUpMockScenario(value)) setSelectedScenario(value);
              }}
              aria-label={lang({ ko: "모의 시나리오 선택", en: "Select a mock scenario" })}
              className="mt-2 grid gap-2 sm:grid-cols-2"
            >
              {AGE_STEP_UP_MOCK_SCENARIOS.map((scenario) => (
                <label
                  key={scenario}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm text-primary-text motion-safe:transition-colors motion-safe:duration-200 hover:bg-muted/30 focus-within:ring-2 focus-within:ring-primary"
                >
                  <RadioGroupItem value={scenario} />
                  <Lang text={SCENARIO_LABELS[scenario]} />
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => dispatch({ type: "START", scenario: selectedScenario })}>
            <Lang text={{ ko: "모의 확인 시작", en: "Start mock check" }} />
          </Button>
        </section>
      ) : null}

      {state.step === "consent" ? (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-4" aria-labelledby="age-step-up-confirm-title">
          <h2 id="age-step-up-confirm-title" className="text-base font-semibold text-primary-text">
            <Lang text={{ ko: "내부 확인 단계", en: "Internal confirmation" }} />
          </h2>
          <p className="text-sm leading-6 text-secondary-text">
            <Lang
              text={{
                ko: "내부 테스트용 확인 단계입니다. 실제 안내·동의 문구는 정책 결정 후 별도로 제공됩니다.",
                en: "Internal test step. Real notices and consent text will be provided after policy decisions.",
              }}
            />
          </p>
          <p className="rounded-lg bg-muted/20 px-3 py-2 text-sm text-primary-text">
            <Lang text={{ ko: "선택한 시나리오", en: "Selected scenario" }} />: {lang(SCENARIO_LABELS[state.scenario])}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={() => void submitScenario(state.scenario)}>
              <Lang text={{ ko: "진행", en: "Continue" }} />
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => dispatch({ type: "BACK" })}>
              <Lang text={{ ko: "뒤로", en: "Back" }} />
            </Button>
          </div>
        </section>
      ) : null}

      {state.step === "pending" ? (
        <section
          aria-busy="true"
          className="flex min-h-28 items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-secondary-text"
        >
          <Loader2 className="h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden />
          <Lang text={{ ko: "모의 흐름 실행 중…", en: "Running the mock flow…" }} />
        </section>
      ) : null}

      {state.step === "result" && outcome ? (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-4" aria-labelledby="age-step-up-result-title">
          <div>
            <h2
              ref={resultHeadingRef}
              id="age-step-up-result-title"
              tabIndex={-1}
              className="text-lg font-semibold text-primary-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Lang text={outcome.title} />
            </h2>
            <p className="mt-1 text-sm leading-6 text-secondary-text"><Lang text={outcome.description} /></p>
          </div>
          <dl className="grid min-w-0 gap-3 rounded-lg bg-muted/20 p-3 text-xs sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-secondary-text"><Lang text={{ ko: "모의 요청 ID", en: "Mock request ID" }} /></dt>
              <dd className="mt-1 break-all font-mono text-primary-text">{state.result.attemptId}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-secondary-text"><Lang text={{ ko: "완료 시각", en: "Completed at" }} /></dt>
              <dd className="mt-1 break-all font-mono text-primary-text">{state.result.completedAt}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {state.result.retryable ? (
              <Button type="button" className="min-h-11" onClick={() => dispatch({ type: "RETRY" })}>
                <Lang text={{ ko: "다시 시도", en: "Try again" }} />
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => dispatch({ type: "RESET" })}>
              <Lang text={{ ko: "처음으로", en: "Start over" }} />
            </Button>
          </div>
        </section>
      ) : null}

      {state.step === "request_error" ? (
        <section className="space-y-4 rounded-xl border border-danger/30 bg-danger/5 p-4" aria-labelledby="age-step-up-error-title">
          <div>
            <h2
              ref={resultHeadingRef}
              id="age-step-up-error-title"
              tabIndex={-1}
              className="text-lg font-semibold text-primary-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Lang text={isForbidden
                ? { ko: "관리자 전용 기능입니다.", en: "This feature is for administrators only." }
                : { ko: "요청에 실패했습니다.", en: "The request failed." }}
              />
            </h2>
            {!isForbidden ? (
              <p className="mt-1 text-sm leading-6 text-secondary-text">
                <Lang text={{ ko: "상태를 확인한 뒤 다시 시도해 주세요.", en: "Check the status, then try again." }} />
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {!isForbidden ? (
              <Button type="button" className="min-h-11" onClick={() => dispatch({ type: "RETRY" })}>
                <Lang text={{ ko: "다시 시도", en: "Try again" }} />
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => dispatch({ type: "RESET" })}>
              <Lang text={{ ko: "처음으로", en: "Start over" }} />
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
