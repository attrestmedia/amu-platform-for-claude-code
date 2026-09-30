"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createProtocolMessage, isValidProtocolMessage } from "libs/server-utils/magazine/magazineEmbedContract";
import { genUniqueId } from "utils/common";
import { ServiceThemeScope } from "components/module/theme/ServiceThemeScope";
import { TutorsMagazineComposer } from "./TutorsMagazineComposer";

const EmbeddedImageStudioEditor = dynamic(
  () => import("components/template/gen-studio/ImageStudioEditor").then((module) => module.ImageStudioEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[42rem] items-center justify-center rounded-2xl border border-border bg-surface p-6 text-sm text-secondary-text" aria-busy="true">
        이미지 편집기를 준비하고 있습니다.
      </div>
    ),
  },
);

const EmbeddedContentStudioEditor = dynamic(
  () => import("components/template/gen-studio/ContentStudioEditor").then((module) => module.ContentStudioEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[42rem] items-center justify-center rounded-2xl border border-border bg-surface p-6 text-sm text-secondary-text" aria-busy="true">
        콘텐츠 편집기를 준비하고 있습니다.
      </div>
    ),
  },
);

type BootstrapData = {
  integrationId: string;
  serviceKey: string;
  moduleType: "image_embed" | "content_embed" | "tutors_embed";
  capabilities: string[];
  contextRevision: string;
  templateKey?: string;
  contextKey?: string;
  allowedProps?: { allowlistedInputKeys: string[]; allowlistedInitialValueKeys: string[] };
  parentOrigin: string;
  nonce: string;
  requestId: string;
  returnUrl: string;
  embedSessionId: string;
  articleContext?: { title: string; question: string; intent: string };
  context: { contentRef: { kind: "wp_post"; postId: number; postSlug: string } | { kind: "app_content"; contentId: string; slug: string }; sectionId: string; experienceId: string; experienceLevel: string; returnSectionId: string };
};

const MAGAZINE_IMAGE_TEMPLATE_VARIABLE_MAP: Record<string, Record<string, string>> = {
  "old-master-painting-modern-reimagining": {
    lighting: "광원",
    composition: "구도",
    style: "화풍",
  },
};

const MAGAZINE_CONTENT_TEMPLATE_REQUIRED_VARIABLE_MAP: Record<string, string[]> = {};

function resolveImageTemplateVariablePolicy(data: BootstrapData) {
  if (data.serviceKey !== "gen-studio" || !data.templateKey || !data.allowedProps) {
    return { allowed: [], required: [], locked: [] };
  }
  const variableMap = MAGAZINE_IMAGE_TEMPLATE_VARIABLE_MAP[data.templateKey];
  if (!variableMap) return { allowed: [], required: [], locked: [] };
  const allowedKeys = new Set(data.allowedProps.allowlistedInputKeys);
  const allowed = Array.from(allowedKeys)
    .map((key) => variableMap[key])
    .filter((key): key is string => Boolean(key));
  // The article declaration identifies trusted initial-value keys, but does
  // not carry their values. Keep those controls editable until a trusted
  // initial value is supplied by the server bootstrap.
  const required = allowedKeys.has("style") ? [variableMap.style].filter(Boolean) : [];
  return { allowed, required, locked: [] };
}

function resolveContentTemplateVariablePolicy(data: BootstrapData) {
  if (data.serviceKey !== "gen-studio" || data.moduleType !== "content_embed" || !data.templateKey || !data.allowedProps) {
    return { allowed: [], required: [], locked: [] };
  }
  const allowed = Array.from(new Set(data.allowedProps.allowlistedInputKeys.map((key) => String(key || "").trim()).filter(Boolean)));
  const required = (MAGAZINE_CONTENT_TEMPLATE_REQUIRED_VARIABLE_MAP[data.templateKey] || []).filter((key) => allowed.includes(key));
  // Bootstrap currently carries trusted initial-value keys, not values. Do not lock an
  // input until a server-supplied value is available to the editor.
  return { allowed, required, locked: [] };
}

/**
 * @docHint
 * @purpose Magazine iframe child SDK와 최소한의 Article Experience surface
 * @process fragment token 제거  same-origin bootstrap  exact-origin postMessage/resize
 * @domain magazine-content-experience
 * @scope client-component
 */

function messageId() {
  return genUniqueId("msg");
}

export default function MagazineEmbedSurface({ integrationId }: { integrationId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<BootstrapData | null>(null);
  const sentIds = useRef(new Set<string>());
  // launch token은 1회용이므로 개발 StrictMode의 effect 재실행에서도 토큰과 요청을 공유한다.
  const bootstrapRef = useRef<{ integrationId: string; token: string; promise: Promise<BootstrapData> | null } | null>(null);
  const safeIntegrationId = useMemo(() => integrationId.trim(), [integrationId]);
  const imageTemplateVariablePolicy = useMemo(
    () => (data ? resolveImageTemplateVariablePolicy(data) : { allowed: [], required: [], locked: [] }),
    [data],
  );
  const contentTemplateVariablePolicy = useMemo(
    () => (data ? resolveContentTemplateVariablePolicy(data) : { allowed: [], required: [], locked: [] }),
    [data],
  );
  const allowedTemplateVariableKeys = imageTemplateVariablePolicy.allowed;

  const sendProtocolEvent = (
    event: "GENERATION_STARTED" | "GENERATION_SUCCEEDED" | "GENERATION_FAILED" | "TUTOR_QUESTION" | "TUTOR_ANSWERED" | "RETURN_REQUEST",
    payload: Record<string, unknown>,
  ) => {
    if (!data) return;
    window.parent.postMessage(
      createProtocolMessage({ event, messageId: messageId(), nonce: data.nonce, requestId: data.requestId, payload }),
      data.parentOrigin,
    );
  };

  const requestMagazineReturn = () => {
    if (!data) return;
    sendProtocolEvent("RETURN_REQUEST", { returnSectionId: data.context.returnSectionId });
  };

  useEffect(() => {
    let cancelled = false;
    let bootstrap = bootstrapRef.current;
    if (!bootstrap || bootstrap.integrationId !== safeIntegrationId) {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      bootstrap = {
        integrationId: safeIntegrationId,
        token: fragment.get("amu_launch_token") || "",
        promise: null,
      };
      bootstrapRef.current = bootstrap;
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    const token = bootstrap.token;
    if (!token) {
      Promise.resolve().then(() => {
        if (!cancelled) setState("error");
      });
      return () => {
        cancelled = true;
      };
    }

    if (!bootstrap.promise) {
      bootstrap.promise = fetch("/api/embed/magazine/v1/bootstrap", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token }),
      }).then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok || body.data?.integrationId !== safeIntegrationId) throw new Error("bootstrap_failed");
        return body.data as BootstrapData;
      });
    }

    bootstrap.promise
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setState("ready");
        const ready = createProtocolMessage({ event: "READY", messageId: messageId(), nonce: next.nonce, requestId: next.requestId, payload: { integrationId: next.integrationId, height: document.documentElement.scrollHeight } });
        window.parent.postMessage(ready, next.parentOrigin);
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [safeIntegrationId]);

  useEffect(() => {
    if (!data) return;
    const sendResize = () => {
      const height = Math.min(4000, Math.max(160, Math.ceil(document.documentElement.scrollHeight)));
      const message = createProtocolMessage({ event: "RESIZE", messageId: messageId(), nonce: data.nonce, requestId: data.requestId, payload: { height } });
      if (sentIds.current.has(message.messageId)) return;
      sentIds.current.add(message.messageId);
      window.parent.postMessage(message, data.parentOrigin);
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(sendResize) : null;
    observer?.observe(document.documentElement);
    window.addEventListener("resize", sendResize, { passive: true });
    sendResize();
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== data.parentOrigin || !isValidProtocolMessage(event.data, { nonce: data.nonce, requestId: data.requestId })) return;
      if (event.data.event === "RETURN_REQUEST") window.location.assign(data.returnUrl);
    };
    window.addEventListener("message", onMessage);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sendResize);
      window.removeEventListener("message", onMessage);
    };
  }, [data]);

  return (
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-8" aria-live="polite">
      <div className="mx-auto w-full max-w-6xl">
        <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-secondary">기사에서 이어서 확인하기</p>
        {state === "loading" ? <p className="text-base leading-7 text-secondary-text">전용 화면을 준비하고 있습니다.</p> : null}
        {state === "error" ? <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7"><p role="alert" className="text-base leading-7 text-danger">전용 화면을 시작할 수 없습니다. 기사로 돌아가 정적 안내를 확인해 주세요.</p></div> : null}
        {state === "ready" && data ? (
          data.serviceKey === "tutors" && data.contextKey && data.embedSessionId ? (
            <ServiceThemeScope service="tutors">
              <TutorsMagazineComposer
                embedSessionId={data.embedSessionId}
                personaId={data.contextKey}
                articleQuestion={data.articleContext?.question || "이 기준을 내 상황에 어떻게 적용하면 될까요?"}
                onQuestion={(question) => sendProtocolEvent("TUTOR_QUESTION", { sectionId: data.context.sectionId, questionLength: question.length })}
                onAnswer={() => sendProtocolEvent("TUTOR_ANSWERED", { sectionId: data.context.sectionId })}
                onReturn={requestMagazineReturn}
              />
            </ServiceThemeScope>
          ) : data.serviceKey === "gen-studio" && data.moduleType === "content_embed" && data.templateKey ? (
            <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6" data-amu-embedded-content-editor="true">
              <p className="mb-4 text-sm leading-6 text-secondary-text">기사의 질문과 기준을 바탕으로 콘텐츠 초안을 만들고, 결과를 검수한 뒤 복사할 수 있습니다.</p>
              <EmbeddedContentStudioEditor
                mode="user"
                surface="embedded"
                articleContext={data.articleContext}
                embedSessionId={data.embedSessionId}
                initialTemplateKey={data.templateKey}
                allowedTemplateKeys={[data.templateKey]}
                allowedTemplateVariableKeys={contentTemplateVariablePolicy.allowed}
                requiredTemplateVariableKeys={contentTemplateVariablePolicy.required}
                lockedTemplateVariableKeys={contentTemplateVariablePolicy.locked}
                initialOutputVisibility="private"
                detailPresentation="page"
                detailNavigationMode="state"
                allowCustomPrompt={false}
                onGenerationStarted={({ requestId, jobCount }) =>
                  sendProtocolEvent("GENERATION_STARTED", {
                    sectionId: data.context.sectionId,
                    generationRequestId: requestId,
                    jobCount,
                    generationMode: "content",
                  })
                }
                onDone={(contents, coins, meta) =>
                  sendProtocolEvent("GENERATION_SUCCEEDED", {
                    sectionId: data.context.sectionId,
                    generationRequestId: meta?.requestId || "",
                    contentCount: Array.isArray(contents) ? contents.length : 0,
                    coinsUsed: Number.isFinite(Number(coins)) ? Math.max(0, Number(coins)) : 0,
                    generationMode: "content",
                  })
                }
                onGenerationFailed={({ requestId, errorCode }) =>
                  sendProtocolEvent("GENERATION_FAILED", {
                    sectionId: data.context.sectionId,
                    generationRequestId: requestId,
                    errorCode,
                    generationMode: "content",
                  })
                }
              />
              <button
                type="button"
                className="mt-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-primary-text transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                data-amu-magazine-return
                onClick={requestMagazineReturn}
              >
                기사로 돌아가기
              </button>
            </section>
          ) : data.serviceKey === "gen-studio" && data.templateKey && allowedTemplateVariableKeys.length > 0 ? (
            <section data-amu-embedded-image-editor="true" data-template-key={data.templateKey} className="min-h-[42rem]">
              <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100" data-amu-coin-notice role="note" aria-label="코인 사용 안내">
                <p className="font-semibold">코인 사용 안내</p>
                <p className="mt-1 leading-6">이미지 생성 버튼을 누르면 AMU 코인이 차감됩니다. 생성 전에 예상 차감량과 현재 잔액을 확인하세요.</p>
              </div>
              <EmbeddedImageStudioEditor
                mode="user"
                surface="embedded"
                initialTemplateKey={data.templateKey}
                allowedTemplateKeys={[data.templateKey]}
                allowedTemplateVariableKeys={allowedTemplateVariableKeys}
                requiredTemplateVariableKeys={imageTemplateVariablePolicy.required}
                lockedTemplateVariableKeys={imageTemplateVariablePolicy.locked}
                initialOutputVisibility="private"
                detailPresentation="page"
                detailNavigationMode="state"
                allowCustomPrompt={false}
                onGenerationStarted={({ requestId, jobCount }) =>
                  sendProtocolEvent("GENERATION_STARTED", {
                    sectionId: data.context.sectionId,
                    generationRequestId: requestId,
                    jobCount,
                  })
                }
                onDone={(images, coins, meta) =>
                  sendProtocolEvent("GENERATION_SUCCEEDED", {
                    sectionId: data.context.sectionId,
                    generationRequestId: meta?.requestId || "",
                    imageCount: Array.isArray(images) ? images.length : 0,
                    coinsUsed: Number.isFinite(Number(coins)) ? Math.max(0, Number(coins)) : 0,
                  })
                }
                onGenerationFailed={({ requestId, errorCode }) =>
                  sendProtocolEvent("GENERATION_FAILED", {
                    sectionId: data.context.sectionId,
                    generationRequestId: requestId,
                    errorCode,
                  })
                }
              />
              <button
                type="button"
                className="mt-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-primary-text transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                data-amu-magazine-return
                onClick={requestMagazineReturn}
              >
                기사로 돌아가기
              </button>
            </section>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7">
              <p role="alert" className="text-base leading-7 text-danger">승인된 편집기 문맥을 확인할 수 없습니다. 기사로 돌아가 정적 안내를 확인해 주세요.</p>
            </div>
          )
        ) : null}
      </div>
    </main>
  );
}
