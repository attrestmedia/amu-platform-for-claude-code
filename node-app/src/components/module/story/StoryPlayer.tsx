"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import type {
  InteractiveStoryRuntimeView,
  InteractiveStoryView,
} from "types/story/interactiveStory";

/**
 * @docHint
 * @purpose 표면에 독립적인 Interactive Story 실행 UI
 * @process 서버 Story 조회  시작·선택 요청  상태별 안내와 멱등 재시도
 * @domain interactive-story
 * @scope client-feature
 */

type Props = {
  storyId: string;
  /** Display-only surface context; the server never uses it for access or outcome decisions. */
  entryContext: string;
};

type ApiPayload = {
  ok?: boolean;
  data?: InteractiveStoryRuntimeView;
  errorCode?: string;
};

type BusyAction = "loading" | "start" | "choose" | null;

const ERROR_COPY: Record<string, { ko: string; en: string }> = {
  FEATURE_ACCESS_DENIED: {
    ko: "이 개발 검증 화면은 관리자 계정에서만 열 수 있습니다.",
    en: "This development preview is available to administrators only.",
  },
  NARRATIVE_CONSENT_REQUIRED: {
    ko: "개인 Narrative 저장 동의가 확인되지 않아 진행을 불러올 수 없습니다.",
    en: "Progress is unavailable because personal Narrative consent is not active.",
  },
  NARRATIVE_CROSS_SERVICE_CONSENT_REQUIRED: {
    ko: "서비스 간 Narrative 동의가 확인되지 않습니다.",
    en: "Cross-service Narrative consent is not active.",
  },
  STORY_BUSY: {
    ko: "이야기 상태를 처리하고 있습니다. 잠시 뒤 다시 시도해 주세요.",
    en: "This story is being updated. Try again in a moment.",
  },
  STORY_CHOICE_CONFLICT: {
    ko: "이 실행에서는 이미 다른 선택이 확정됐습니다. 현재 상태를 다시 불러왔습니다.",
    en: "A different choice already won this run. The latest state has been reloaded.",
  },
  STORY_RUN_NOT_ACTIVE: {
    ko: "이 이야기 실행은 더 이상 진행 중이 아닙니다. 현재 상태를 다시 불러와 주세요.",
    en: "This story run is no longer active. Reload the current state.",
  },
  STORY_STATE_CONFLICT: {
    ko: "진행 상태를 안전하게 이어갈 수 없습니다. 같은 선택을 다시 시도하거나 관리자에게 알려 주세요.",
    en: "Progress could not be safely resumed. Retry the same choice or contact an administrator.",
  },
  STORY_RUNTIME_UNAVAILABLE: {
    ko: "이야기 저장소를 사용할 수 없습니다. 잠시 뒤 다시 시도해 주세요.",
    en: "The story runtime is unavailable. Try again in a moment.",
  },
  STORY_NOT_FOUND: {
    ko: "이야기를 찾을 수 없습니다.",
    en: "This story could not be found.",
  },
};

function makeIdempotencyKey() {
  return `story-ui:${globalThis.crypto.randomUUID()}`;
}

async function readApiPayload(response: Response): Promise<ApiPayload> {
  return response.json().catch(() => ({} as ApiPayload));
}

function messageFor(errorCode: string) {
  return ERROR_COPY[errorCode] || {
    ko: "요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    en: "The request could not be completed. Try again in a moment.",
  };
}

function storyTitle(story: InteractiveStoryView) {
  return story.title;
}

export default function StoryPlayer({ storyId, entryContext }: Props) {
  const [runtime, setRuntime] = useState<InteractiveStoryRuntimeView | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>("loading");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const startKeyRef = useRef<string | null>(null);
  const chooseKeysRef = useRef(new Map<string, string>());

  const loadRuntime = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/story/${encodeURIComponent(storyId)}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });
      const payload = await readApiPayload(response);
      if (!response.ok || payload.ok !== true || !payload.data) {
        throw new Error(payload.errorCode || "STORY_RUNTIME_FAILED");
      }
      setRuntime(payload.data);
      setErrorCode(null);
    } catch (error) {
      if (signal?.aborted) return;
      setErrorCode(error instanceof Error ? error.message : "STORY_RUNTIME_FAILED");
    } finally {
      if (!signal?.aborted) setBusyAction(null);
    }
  }, [storyId]);

  const reloadRuntime = useCallback(() => {
    setBusyAction("loading");
    setErrorCode(null);
    void loadRuntime();
  }, [loadRuntime]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadRuntime(controller.signal));
    return () => controller.abort();
  }, [loadRuntime]);

  const postAction = useCallback(async (body: Record<string, string>) => {
    const response = await fetch(`/api/story/${encodeURIComponent(storyId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    const payload = await readApiPayload(response);
    if (!response.ok || payload.ok !== true || !payload.data) {
      throw new Error(payload.errorCode || "STORY_RUNTIME_FAILED");
    }
    setRuntime(payload.data);
    setErrorCode(null);
  }, [storyId]);

  const start = useCallback(async () => {
    const idempotencyKey = startKeyRef.current || makeIdempotencyKey();
    startKeyRef.current = idempotencyKey;
    setBusyAction("start");
    setErrorCode(null);
    try {
      await postAction({ action: "start", idempotencyKey });
      startKeyRef.current = null;
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "STORY_RUNTIME_FAILED");
    } finally {
      setBusyAction(null);
    }
  }, [postAction]);

  const choose = useCallback(async (choiceId: string, beatId: string, storyRunId: string) => {
    const requestKey = `${storyRunId}:${beatId}:${choiceId}`;
    const idempotencyKey = chooseKeysRef.current.get(requestKey) || makeIdempotencyKey();
    chooseKeysRef.current.set(requestKey, idempotencyKey);
    setBusyAction("choose");
    setErrorCode(null);
    try {
      await postAction({ action: "choose", storyRunId, beatId, choiceId, idempotencyKey });
    } catch (error) {
      const code = error instanceof Error ? error.message : "STORY_RUNTIME_FAILED";
      setErrorCode(code);
      if (code === "STORY_CHOICE_CONFLICT") await loadRuntime();
    } finally {
      setBusyAction(null);
    }
  }, [loadRuntime, postAction]);

  const story = runtime?.story;
  const beat = story?.beats[0];
  const selectedChoice = runtime?.selectedChoice || beat?.choices.find(
    (choice) => choice.choiceId === runtime?.progress.selectedChoiceId,
  );
  const errorCopy = errorCode ? messageFor(errorCode) : null;

  return (
    <main
      data-entry-context={entryContext}
      className="mx-auto w-full max-w-3xl px-4 py-8 text-primary-text sm:px-6 sm:py-10 lg:px-8"
    >
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
          <Lang text={{ ko: "AMU Play · 인터랙티브 스토리", en: "AMU Play · Interactive Story" }} />
        </p>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-secondary-text">
          <Lang text={{ ko: "관리자 개발 검증", en: "Admin development preview" }} />
        </span>
      </header>

      <section aria-labelledby="interactive-story-title" className="min-h-80 rounded-3xl border border-border bg-surface p-5 sm:p-8">
        {busyAction === "loading" && !story ? (
          <div className="flex min-h-64 items-center justify-center text-center text-sm text-secondary-text" role="status" aria-live="polite">
            <Lang text={{ ko: "이야기를 불러오고 있습니다.", en: "Loading the story." }} />
          </div>
        ) : null}

        {errorCopy ? (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger sm:flex-row sm:items-center sm:justify-between" role="alert" aria-live="assertive">
            <Lang text={errorCopy} />
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0 motion-reduce:transition-none"
              onClick={reloadRuntime}
              disabled={busyAction !== null}
            >
              <Lang text={{ ko: "다시 불러오기", en: "Reload" }} />
            </Button>
          </div>
        ) : null}

        {story && beat ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-text">
              <Lang text={{ ko: "개발용 Story · 버전", en: "Development story · version" }} /> {story.storyVersion}
            </p>
            <h1 id="interactive-story-title" className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
              <Lang text={storyTitle(story)} />
            </h1>
            <p className="mt-3 max-w-prose text-sm leading-6 text-secondary-text sm:text-base sm:leading-7">
              <Lang text={story.summary} />
            </p>

            <div className="mt-8 border-t border-border pt-6">
              {runtime?.progress.status === "not_started" ? (
                <div className="space-y-4">
                  <p className="leading-7"><Lang text={beat.prompt} /></p>
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-11 w-full sm:w-auto motion-reduce:transition-none"
                    onClick={() => void start()}
                    disabled={busyAction !== null}
                  >
                    {busyAction === "start"
                      ? <Lang text={{ ko: "시작하는 중…", en: "Starting…" }} />
                      : <Lang text={{ ko: "이야기 시작하기", en: "Start story" }} />}
                  </Button>
                </div>
              ) : null}

              {runtime?.progress.status === "in_progress" && !runtime.progress.ready ? (
                <div className="space-y-4">
                  <p role="status" aria-live="polite" className="text-sm leading-6 text-secondary-text">
                    <Lang text={{ ko: "이야기 진행을 준비하고 있습니다.", en: "Preparing your story run." }} />
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 motion-reduce:transition-none"
                    onClick={() => void start()}
                    disabled={busyAction !== null}
                  >
                    <Lang text={{ ko: "계속 준비하기", en: "Continue setup" }} />
                  </Button>
                </div>
              ) : null}

              {runtime?.progress.status === "in_progress" && runtime.progress.ready && runtime.progress.storyRunId ? (
                <div>
                  <p className="max-w-prose text-base leading-7 sm:text-lg sm:leading-8"><Lang text={beat.prompt} /></p>
                  {runtime.progress.selectedChoiceId ? (
                    <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-6 text-primary-text" role="status" aria-live="polite">
                      <Lang text={{ ko: "선택은 기록됐습니다. 같은 선택을 다시 눌러 남은 Narrative 반영을 이어갈 수 있습니다.", en: "Your choice is recorded. Select it again to resume the remaining Narrative updates." }} />
                    </p>
                  ) : null}
                  <fieldset className="mt-5 grid gap-3">
                    <legend className="sr-only">
                      <Lang text={{ ko: "이야기 선택지", en: "Story choices" }} />
                    </legend>
                    {beat.choices.map((choice) => {
                      const lockedToAnotherChoice = Boolean(
                        runtime.progress.selectedChoiceId && runtime.progress.selectedChoiceId !== choice.choiceId,
                      );
                      return (
                        <Button
                          key={choice.choiceId}
                          type="button"
                          variant="outline"
                          className="min-h-14 w-full justify-start whitespace-normal px-4 py-3 text-left leading-6 motion-reduce:transition-none"
                          onClick={() => void choose(choice.choiceId, beat.beatId, runtime.progress.storyRunId!)}
                          disabled={busyAction !== null || lockedToAnotherChoice}
                        >
                          <span className="block text-left">
                            <Lang text={choice.label} />
                          </span>
                        </Button>
                      );
                    })}
                  </fieldset>
                </div>
              ) : null}

              {runtime?.progress.status === "resolved" && selectedChoice ? (
                <div className="space-y-5" aria-live="polite">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-text">
                      <Lang text={{ ko: "선택한 결과", en: "Your choice" }} />
                    </p>
                    <p className="mt-2 font-semibold"><Lang text={selectedChoice.label} /></p>
                    <p className="mt-3 max-w-prose leading-7"><Lang text={selectedChoice.result} /></p>
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-11 w-full sm:w-auto motion-reduce:transition-none"
                    onClick={() => void start()}
                    disabled={busyAction !== null}
                  >
                    {busyAction === "start"
                      ? <Lang text={{ ko: "새 실행을 여는 중…", en: "Starting a new run…" }} />
                      : <Lang text={{ ko: "다시 보기", en: "Read again" }} />}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
