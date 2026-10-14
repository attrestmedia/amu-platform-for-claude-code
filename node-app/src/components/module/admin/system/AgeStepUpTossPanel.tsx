"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Loader2, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  completeAgeStepUpToss,
  deleteAgeStepUpTossState,
  getAgeStepUpTossState,
  startAgeStepUpToss,
} from "libs/api/admin/ageStepUpToss";
import {
  getAgeStepUpTossPendingAttemptId,
  isAgeStepUpTossFlowBusy,
  reduceAgeStepUpTossFlow,
  type AgeStepUpTossFlowState,
} from "components/module/admin/system/ageStepUpTossFlow";
import type { AgeAssuranceOutcome, AgeAssuranceStateView } from "types/identity/ageAssurance";

type LocalizedText = { ko: string; en: string };
type TossCertStartOptions = {
  authUrl: string;
  txId: string;
  onSuccess: () => void;
  onFail: (error: unknown) => void;
};
type TossCertClient = {
  preparePopup: () => void;
  start: (options: TossCertStartOptions) => void;
};
type TossCertGlobal = () => TossCertClient;

declare global {
  interface Window {
    TossCert?: TossCertGlobal;
  }
}

const TOSS_CERT_SDK_URL = "https://cdn.toss.im/cert/v1";
let tossCertSdkPromise: Promise<void> | null = null;

const INITIAL_FLOW_STATE: AgeStepUpTossFlowState = { step: "idle" };
const EMPTY_STATE: AgeAssuranceStateView = {
  outcome: null,
  eligible: false,
  environment: null,
  verifiedAt: null,
  expiresAt: null,
};

const OUTCOME_LABELS: Record<AgeAssuranceOutcome, LocalizedText> = {
  ADULT: { ko: "성인", en: "Adult" },
  MINOR: { ko: "미성년", en: "Minor" },
  FAILED: { ko: "실패", en: "Failed" },
  EXPIRED: { ko: "만료", en: "Expired" },
  CANCELLED: { ko: "취소", en: "Cancelled" },
  UNKNOWN: { ko: "확인 불가", en: "Unknown" },
};

function loadTossCertSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser is unavailable"));
  if (typeof window.TossCert === "function") return Promise.resolve();
  if (tossCertSdkPromise) return tossCertSdkPromise;

  tossCertSdkPromise = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[src="https://cdn.toss.im/cert/v1"]');
    const onLoad = () => {
      if (typeof window.TossCert === "function") {
        if (script) script.dataset.loaded = "true";
        resolve();
      } else {
        tossCertSdkPromise = null;
        reject(new Error("Toss Cert SDK did not initialize"));
      }
    };
    const onError = () => {
      tossCertSdkPromise = null;
      reject(new Error("Toss Cert SDK could not be loaded"));
    };

    if (!script) {
      script = document.createElement("script");
      script.src = TOSS_CERT_SDK_URL;
      script.async = true;
    }

    if (script.dataset.loaded === "true") {
      onLoad();
      return;
    }

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!script.isConnected) document.head.appendChild(script);
  });

  return tossCertSdkPromise;
}

function getApiErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("response" in error)) return null;
  const response = error.response;
  if (typeof response !== "object" || response === null || !("data" in response)) return null;
  const data = response.data;
  if (typeof data !== "object" || data === null || !("errorCode" in data)) return null;
  return typeof data.errorCode === "string" ? data.errorCode : null;
}

function getTossCallbackCode(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return null;
  if ("errorCode" in error && typeof error.errorCode === "string") return error.errorCode;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("message" in error && typeof error.message === "string") return error.message;
  return null;
}

function getFlowMessage(state: AgeStepUpTossFlowState): LocalizedText | null {
  switch (state.step) {
    case "starting":
      return { ko: "테스트 인증 요청을 준비하고 있습니다.", en: "Preparing the test verification request." };
    case "authorizing":
      return { ko: "토스 인증 창에서 테스트 인증을 진행해 주세요.", en: "Complete the test verification in the Toss window." };
    case "completing":
      return { ko: "서버에서 최종 인증 결과를 확인하고 있습니다.", en: "The server is checking the final verification result." };
    case "result_not_ready":
      return { ko: "결과가 아직 준비되지 않았습니다. 잠시 후 결과 확인을 다시 눌러 주세요.", en: "The result is not ready yet. Try checking it again shortly." };
    case "cancelled":
      return { ko: "테스트 인증이 취소되었습니다.", en: "Test verification was cancelled." };
    case "complete":
      return { ko: "서버가 테스트 인증 결과를 확인했습니다.", en: "The server confirmed the test verification result." };
    case "error":
      if (state.stage === "authorization") {
        return { ko: "테스트 인증을 완료하지 못했습니다. 다시 시도해 주세요.", en: "Test verification did not complete. Please try again." };
      }
      if (state.stage === "complete") {
        return { ko: "최종 결과를 확인하지 못했습니다. 상태를 새로 불러와 확인해 주세요.", en: "The final result could not be checked. Refresh the state and try again." };
      }
      return { ko: "테스트 인증을 시작하지 못했습니다. 설정을 확인해 주세요.", en: "Test verification could not start. Check the configuration." };
    case "idle":
      return null;
  }
}

function getOutcomeLabel(outcome: AgeAssuranceOutcome | null): LocalizedText {
  return outcome ? OUTCOME_LABELS[outcome] : { ko: "기록 없음", en: "No result" };
}

function getEnvironmentLabel(environment: AgeAssuranceStateView["environment"]): LocalizedText {
  if (environment === "live") return { ko: "실환경", en: "Live environment" };
  return { ko: "기록 없음", en: "No record" };
}

function getDateLabel(value: string | null): string {
  return value ?? lang({ ko: "기록 없음", en: "No record" });
}

/**
 * @docHint
 * @purpose 관리자 전용 Toss Cert 테스트 인증 UI
 * @process 현재 상태 조회  테스트 인증창  서버 결과 확인  상태 삭제
 * @domain age-assurance
 * @scope admin
 */
export function AgeStepUpTossPanel() {
  const [flow, dispatch] = useReducer(reduceAgeStepUpTossFlow, INITIAL_FLOW_STATE);
  const [state, setState] = useState<AgeAssuranceStateView>(EMPTY_STATE);
  const [stateLoading, setStateLoading] = useState(true);
  const [stateLoadFailed, setStateLoadFailed] = useState(false);
  const [stateDeleteFailed, setStateDeleteFailed] = useState(false);
  const [sdkStatus, setSdkStatus] = useState<"loading" | "ready" | "failed">("loading");
  const flowLockRef = useRef(false);
  const isBusy = isAgeStepUpTossFlowBusy(flow) || stateLoading;
  const pendingAttemptId = getAgeStepUpTossPendingAttemptId(flow);

  useEffect(function loadTossSdkAndInitialState() {
    let active = true;

    void loadTossCertSdk().then(
      () => {
        if (active) setSdkStatus("ready");
      },
      () => {
        if (active) setSdkStatus("failed");
      },
    );

    void getAgeStepUpTossState().then(
      (nextState) => {
        if (!active) return;
        setState(nextState);
        setStateLoadFailed(false);
      },
      () => {
        if (active) setStateLoadFailed(true);
      },
    ).finally(() => {
      if (active) setStateLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  async function refreshState() {
    setStateLoading(true);
    setStateLoadFailed(false);
    setStateDeleteFailed(false);
    try {
      setState(await getAgeStepUpTossState());
    } catch {
      setStateLoadFailed(true);
    } finally {
      setStateLoading(false);
    }
  }

  async function completeAttempt(attemptId: string) {
    try {
      const nextState = await completeAgeStepUpToss(attemptId);
      setState(nextState);
      dispatch({ type: "COMPLETE_SUCCEEDED" });
    } catch (error) {
      dispatch(
        getApiErrorCode(error) === "AGE_ASSURANCE_RESULT_NOT_READY"
          ? { type: "RESULT_NOT_READY" }
          : { type: "COMPLETE_FAILED" },
      );
    } finally {
      flowLockRef.current = false;
    }
  }

  async function startVerification() {
    const createTossCert = window.TossCert;
    if (sdkStatus !== "ready" || isBusy || flowLockRef.current || typeof createTossCert !== "function") return;
    flowLockRef.current = true;
    dispatch({ type: "START" });

    let requestStarted = false;
    try {
      const tossCert = createTossCert();
      tossCert.preparePopup();
      const request = await startAgeStepUpToss();
      if (request.environment !== "test") throw new Error("Live environment is disabled in this UI");
      dispatch({ type: "STARTED", attemptId: request.attemptId });
      requestStarted = true;

      let callbackHandled = false;
      tossCert.start({
        authUrl: request.authUrl,
        txId: request.txId,
        onSuccess: () => {
          if (callbackHandled) return;
          callbackHandled = true;
          dispatch({ type: "AUTH_SUCCEEDED" });
          void completeAttempt(request.attemptId);
        },
        onFail: (error) => {
          if (callbackHandled) return;
          callbackHandled = true;
          flowLockRef.current = false;
          dispatch({
            type: getTossCallbackCode(error) === "TOSS_AUTH_CLICK_NAVBAR_CLOSE" ? "AUTH_CANCELLED" : "AUTH_FAILED",
          });
        },
      });
    } catch {
      flowLockRef.current = false;
      dispatch({ type: requestStarted ? "AUTH_FAILED" : "START_FAILED" });
    }
  }

  async function retryResultCheck() {
    if (!pendingAttemptId || isBusy || flowLockRef.current) return;
    flowLockRef.current = true;
    dispatch({ type: "RETRY_RESULT" });
    await completeAttempt(pendingAttemptId);
  }

  async function deleteTestState() {
    if (isBusy || flowLockRef.current) return;
    setStateLoading(true);
    setStateLoadFailed(false);
    setStateDeleteFailed(false);
    try {
      setState(await deleteAgeStepUpTossState());
      dispatch({ type: "RESET" });
    } catch {
      setStateDeleteFailed(true);
    } finally {
      setStateLoading(false);
    }
  }

  const flowMessage = getFlowMessage(flow);
  const environmentLabel = getEnvironmentLabel(state.environment);
  const isTestEnvironment = state.environment === "test";

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4" aria-labelledby="age-step-up-toss-title">
      <header className="space-y-2">
        <h2 id="age-step-up-toss-title" className="text-lg font-semibold text-primary-text">
          <Lang text={{ ko: "Toss Cert 테스트 인증", en: "Toss Cert test verification" }} />
        </h2>
        <p className="text-sm leading-6 text-secondary-text">
          <Lang
            text={{
              ko: "테스트 환경은 고정된 성인 가상 사용자를 반환합니다. 실제 회원 인증이나 실환경 호출은 이 패널에서 수행하지 않습니다.",
              en: "The test environment returns a fixed virtual adult user. This panel does not verify real members or call the live environment.",
            }}
          />
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="age-step-up-toss-state-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="age-step-up-toss-state-title" className="text-base font-semibold text-primary-text">
            <Lang text={{ ko: "현재 테스트 상태", en: "Current test state" }} />
          </h3>
          <Button type="button" variant="outline" className="min-h-11" disabled={stateLoading} onClick={() => void refreshState()}>
            {stateLoading ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
            <Lang text={{ ko: "상태 새로고침", en: "Refresh state" }} />
          </Button>
        </div>

        {stateLoading ? (
          <div className="flex min-h-20 items-center gap-3 text-sm text-secondary-text" role="status" aria-live="polite">
            <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden />
            <Lang text={{ ko: "상태를 불러오고 있습니다.", en: "Loading the state." }} />
          </div>
        ) : stateLoadFailed ? (
          <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-primary-text" role="alert">
            <Lang text={{ ko: "상태를 불러오지 못했습니다. 다시 새로고침해 주세요.", en: "Could not load the state. Refresh and try again." }} />
          </p>
        ) : (
          <dl className="grid min-w-0 gap-3 rounded-lg bg-muted/20 p-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-secondary-text"><Lang text={{ ko: "결과", en: "Outcome" }} /></dt>
              <dd className="mt-1 break-words font-medium text-primary-text"><Lang text={getOutcomeLabel(state.outcome)} /></dd>
            </div>
            <div className="min-w-0">
              <dt className="text-secondary-text"><Lang text={{ ko: "관리자 테스트 기능 허용", en: "Admin test feature eligible" }} /></dt>
              <dd className="mt-1 break-words font-medium text-primary-text">
                <Lang text={state.eligible ? { ko: "예", en: "Yes" } : { ko: "아니요", en: "No" }} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-secondary-text"><Lang text={{ ko: "환경", en: "Environment" }} /></dt>
              <dd className="mt-1 break-words font-medium text-primary-text">
                {isTestEnvironment ? (
                  <span className="ml-2 inline-flex rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary-text">
                    <Lang text={{ ko: "테스트 환경 — 가상 사용자", en: "Test environment — virtual user" }} />
                  </span>
                ) : <Lang text={environmentLabel} />}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-secondary-text"><Lang text={{ ko: "확인 시각", en: "Verified at" }} /></dt>
              <dd className="mt-1 break-all font-mono text-xs text-primary-text">
                <time dateTime={state.verifiedAt ?? undefined}>{getDateLabel(state.verifiedAt)}</time>
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-secondary-text"><Lang text={{ ko: "만료 시각", en: "Expires at" }} /></dt>
              <dd className="mt-1 break-all font-mono text-xs text-primary-text">
                <time dateTime={state.expiresAt ?? undefined}>{getDateLabel(state.expiresAt)}</time>
              </dd>
            </div>
          </dl>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11"
            disabled={sdkStatus !== "ready" || isBusy}
            onClick={() => void startVerification()}
          >
            {flow.step === "starting" ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : null}
            <Lang text={{ ko: "Toss 테스트 인증 시작", en: "Start Toss test verification" }} />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={isBusy}
            onClick={() => void deleteTestState()}
          >
            <Trash2 className="size-4" aria-hidden />
            <Lang text={{ ko: "내 테스트 결과 삭제", en: "Delete my test result" }} />
          </Button>
        </div>
        {stateDeleteFailed ? (
          <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-primary-text" role="alert">
            <Lang text={{ ko: "테스트 결과를 삭제하지 못했습니다. 상태와 권한을 확인해 주세요.", en: "Could not delete the test result. Check the state and permissions." }} />
          </p>
        ) : null}
      </section>

      {sdkStatus === "loading" ? (
        <p className="flex min-h-11 items-center gap-2 text-sm text-secondary-text" role="status" aria-live="polite">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          <Lang text={{ ko: "Toss 테스트 인증 화면을 준비하고 있습니다.", en: "Preparing the Toss test verification window." }} />
        </p>
      ) : sdkStatus === "failed" ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-primary-text" role="alert">
          <Lang text={{ ko: "Toss 테스트 인증 화면을 불러오지 못했습니다. 페이지를 새로고침해 주세요.", en: "Could not load the Toss test verification window. Refresh the page and try again." }} />
        </p>
      ) : null}

      {flowMessage ? (
        <div className={flow.step === "error"
          ? "space-y-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm leading-6 text-primary-text"
          : "space-y-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-6 text-primary-text"}
        >
          <p
            role={flow.step === "error" ? "alert" : "status"}
            aria-live={flow.step === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {isBusy ? <Loader2 className="mr-2 inline size-4 motion-safe:animate-spin" aria-hidden /> : null}
            <Lang text={flowMessage} />
          </p>
          {pendingAttemptId ? (
            <Button type="button" variant="outline" className="min-h-11" disabled={isBusy} onClick={() => void retryResultCheck()}>
              <RotateCw className="size-4" aria-hidden />
              <Lang text={{ ko: "결과 확인", en: "Check result" }} />
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
