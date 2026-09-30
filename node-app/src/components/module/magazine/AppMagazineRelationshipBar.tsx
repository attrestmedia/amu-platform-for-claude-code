"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, Check, Clock3, Loader2, LogIn, RotateCcw, Tag } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { useAuthStore } from "store/auth";
import { trackGaEvent } from "utils/analytics/ga4";

const API_PREFIX = "/api/account/magazine-personalization/v1";
const LOCAL_PROGRESS_KEY = "amu_app_magazine_reading_progress_v1";
const MAX_LOCAL_PROGRESS = 100;
const MIN_PROGRESS_BPS = 500;

type TopicRef = {
  topicId?: string;
  topicKey: string;
  label?: string | { ko?: string; en?: string };
};

type ProgressPosition = { blockId: string; progressBps: number };

type ProgressState = {
  contentRevision?: string;
  position?: ProgressPosition;
  completedAt?: string;
  rebased?: boolean;
};

type RelationshipState = {
  saved?: boolean;
  isSaved?: boolean;
  save?: { savedAt?: string } | null;
  progress?: ProgressState | null;
  readingProgress?: ProgressState | null;
  topicFollows?: Array<{ topicKey?: string; topicRef?: { topicKey?: string } }> | Record<string, boolean>;
};

type GuestProgress = {
  contentRevision: string;
  blockId: string;
  progressBps: number;
  updatedAt: number;
};

type Props = {
  slug: string;
  contentRevision: string;
  blockIds: string[];
  topics: TopicRef[];
  contextAction?: {
    href: string;
    label: { ko: string; en: string };
  };
};

type MutationKind = "save" | `follow:${string}` | "progress" | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readGuestProgress(): Record<string, GuestProgress> {
  try {
    const raw = window.localStorage.getItem(LOCAL_PROGRESS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => {
          if (!isRecord(value)) return false;
          return typeof value.contentRevision === "string"
            && typeof value.blockId === "string"
            && typeof value.progressBps === "number"
            && typeof value.updatedAt === "number";
        })
        .sort(([, left], [, right]) => Number((right as GuestProgress).updatedAt) - Number((left as GuestProgress).updatedAt))
        .slice(0, MAX_LOCAL_PROGRESS),
    ) as Record<string, GuestProgress>;
  } catch {
    return {};
  }
}

function writeGuestProgress(contentId: string, progress: GuestProgress) {
  try {
    const next = readGuestProgress();
    next[contentId] = progress;
    const entries = Object.entries(next)
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_LOCAL_PROGRESS);
    window.localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage가 막힌 브라우저에서도 본문 읽기는 계속 가능해야 한다.
  }
}

function removeGuestProgress(contentId: string) {
  try {
    const next = readGuestProgress();
    delete next[contentId];
    window.localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // localStorage를 사용할 수 없으면 서버 관계 상태만 유지한다.
  }
}

function getStoredGuestProgress(contentId: string, revision: string, blockIds: string[]): GuestProgress | null {
  if (typeof window === "undefined") return null;
  const stored = readGuestProgress()[contentId];
  return stored && stored.contentRevision === revision && blockIds.includes(stored.blockId) ? stored : null;
}

function normaliseProgress(value: unknown, blockIds: string[]): ProgressState | null {
  if (!isRecord(value) || !isRecord(value.position)) return null;
  const blockId = typeof value.position.blockId === "string" && blockIds.includes(value.position.blockId)
    ? value.position.blockId
    : blockIds[0];
  const progressBps = typeof value.position.progressBps === "number"
    ? Math.max(0, Math.min(10000, Math.round(value.position.progressBps)))
    : 0;
  if (!blockId || progressBps < MIN_PROGRESS_BPS) return null;
  return {
    contentRevision: typeof value.contentRevision === "string" ? value.contentRevision : undefined,
    position: { blockId, progressBps },
    completedAt: typeof value.completedAt === "string" ? value.completedAt : undefined,
    rebased: value.rebased === true,
  };
}

function getProgressLabel(progressBps: number) {
  return `${Math.round(progressBps / 100)}%`;
}

function getTopicKey(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.topicKey === "string") return value.topicKey;
  return "";
}

function getTopicLabel(topic: TopicRef, locale: "ko" | "en" = "ko") {
  if (typeof topic.label === "string") return topic.label;
  return topic.label?.[locale] || topic.label?.ko || topic.label?.en || topic.topicKey;
}

function getTopicFollowState(data: RelationshipState, topicKey: string) {
  const follows = data.topicFollows;
  if (Array.isArray(follows)) {
    return follows.some((item) => getTopicKey(item) === topicKey || (isRecord(item.topicRef) && item.topicRef.topicKey === topicKey));
  }
  return Boolean(follows && typeof follows === "object" && (follows as Record<string, boolean>)[topicKey]);
}

function readErrorMessage(value: unknown, fallback: string) {
  if (!isRecord(value)) return fallback;
  if (value.errorCode === "POLICY_RECONSENT_REQUIRED") {
    return lang({
      ko: "최신 개인정보처리방침 동의가 필요합니다. 계정 설정에서 확인해 주세요.",
      en: "Please review the latest privacy policy in Account settings before saving.",
    });
  }
  if (value.errorCode === "MAGAZINE_PERSONALIZATION_LIMIT_REACHED") {
    return lang({
      ko: "저장 가능한 관계 기록의 한도에 도달했습니다.",
      en: "You have reached the limit for this relationship list.",
    });
  }
  return typeof value.error === "string" ? value.error : fallback;
}

function loginToContinue() {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export default function AppMagazineRelationshipBar({ slug, contentRevision, blockIds, topics, contextAction }: Props) {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const contentId = `amu:magazine:${slug}`;
  const [isSaved, setIsSaved] = useState(false);
  const [followedTopics, setFollowedTopics] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [guestProgress, setGuestProgress] = useState<GuestProgress | null>(() => getStoredGuestProgress(contentId, contentRevision, blockIds));
  const [isLoading, setIsLoading] = useState(false);
  const [mutation, setMutation] = useState<MutationKind>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stateLoaded, setStateLoaded] = useState(false);
  const activeBlockIdRef = useRef(blockIds[0] || "");
  const latestProgressRef = useRef<GuestProgress | null>(null);
  const lastSubmittedBpsRef = useRef(0);
  const progressWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSyncAttemptedRef = useRef(false);

  const effectiveProgress = useMemo(() => {
    const serverBps = progress?.position?.progressBps ?? 0;
    const localBps = guestProgress?.progressBps ?? 0;
    return serverBps >= localBps ? progress : guestProgress
      ? {
          contentRevision: guestProgress.contentRevision,
          position: { blockId: guestProgress.blockId, progressBps: guestProgress.progressBps },
        }
      : null;
  }, [guestProgress, progress]);

  const requestState = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_PREFIX}/state/${encodeURIComponent(slug)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) return;
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, lang({ ko: "관계 상태를 불러오지 못했습니다.", en: "We could not load your reading state." })));
      const data = isRecord(body) && isRecord(body.data) ? body.data as RelationshipState : {};
      setIsSaved(data.saved === true || data.isSaved === true || Boolean(data.save?.savedAt) || Boolean(data.saved && typeof data.saved === "object" && "savedAt" in data.saved));
      const serverProgress = normaliseProgress(data.progress ?? data.readingProgress, blockIds);
      setProgress(serverProgress);
      setFollowedTopics(Object.fromEntries(topics.map((topic) => [topic.topicKey, getTopicFollowState(data, topic.topicKey)])));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : lang({ ko: "잠시 후 다시 시도해 주세요.", en: "Please try again in a moment." }));
    } finally {
      setStateLoaded(true);
      setIsLoading(false);
    }
  }, [blockIds, slug, topics]);

  useEffect(() => {
    latestProgressRef.current = guestProgress;
  }, [guestProgress]);

  useEffect(() => {
    if (!hasHydrated) return;
    const timer = window.setTimeout(() => {
      if (isLoggedIn) void requestState();
      else setStateLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hasHydrated, isLoggedIn, requestState]);

  const sendProgress = useCallback(async (next: GuestProgress, options: { sync?: boolean } = {}) => {
    if (!isLoggedIn || next.progressBps < MIN_PROGRESS_BPS) return false;
    setMutation("progress");
    try {
      const response = await fetch(`${API_PREFIX}/reading-progress/${encodeURIComponent(slug)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentRevision: next.contentRevision,
          blockId: next.blockId,
          progressBps: next.progressBps,
          mode: "advance",
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 401) {
        setError(lang({ ko: "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.", en: "Your session expired. Please sign in again." }));
        return false;
      }
      if (!response.ok) throw new Error(readErrorMessage(body, lang({ ko: "읽기 위치를 저장하지 못했습니다.", en: "We could not save your reading position." })));
      const data = isRecord(body) && isRecord(body.data) ? body.data : body;
      const savedProgress = normaliseProgress(data, blockIds);
      if (savedProgress) setProgress(savedProgress);
      if (options.sync) {
        removeGuestProgress(contentId);
        setGuestProgress(null);
        latestProgressRef.current = null;
      }
      setMessage(lang({ ko: "읽던 위치를 저장했습니다.", en: "Reading position saved." }));
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : lang({ ko: "읽기 위치를 저장하지 못했습니다.", en: "We could not save your reading position." }));
      return false;
    } finally {
      setMutation(null);
    }
  }, [blockIds, contentId, isLoggedIn, slug]);

  useEffect(() => {
    if (!isLoggedIn || !stateLoaded || localSyncAttemptedRef.current || !guestProgress) return;
    localSyncAttemptedRef.current = true;
    void sendProgress(guestProgress, { sync: true });
  }, [guestProgress, isLoggedIn, sendProgress, stateLoaded]);

  useEffect(() => {
    if (!stateLoaded || blockIds.length === 0) return;
    const nodes = blockIds.map((blockId) => document.getElementById(blockId)).filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        if (visible?.target instanceof HTMLElement) activeBlockIdRef.current = visible.target.id;
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [blockIds, stateLoaded]);

  useEffect(() => {
    if (!stateLoaded) return;
    const flushProgress = () => {
      progressWriteTimerRef.current = null;
      const next = latestProgressRef.current;
      if (!next || next.progressBps < MIN_PROGRESS_BPS || next.progressBps <= lastSubmittedBpsRef.current) return;
      lastSubmittedBpsRef.current = next.progressBps;
      if (isLoggedIn) void sendProgress(next);
      else setGuestProgress(next);
    };
    const handleScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const progressBps = Math.max(0, Math.min(10000, Math.round((window.scrollY / scrollable) * 10000)));
      const blockId = activeBlockIdRef.current || blockIds[0];
      if (!blockId || progressBps < MIN_PROGRESS_BPS) return;
      const next = { contentRevision, blockId, progressBps, updatedAt: Date.now() };
      latestProgressRef.current = next;
      if (progressWriteTimerRef.current === null) progressWriteTimerRef.current = setTimeout(flushProgress, 900);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (progressWriteTimerRef.current !== null) clearTimeout(progressWriteTimerRef.current);
      progressWriteTimerRef.current = null;
    };
  }, [blockIds, contentRevision, isLoggedIn, sendProgress, stateLoaded]);

  useEffect(() => {
    if (!guestProgress) return;
    // 로그인 직후 서버 동기화가 실패하거나 인증 전환이 일어나도 다시 제출할 수 있도록 보존한다.
    writeGuestProgress(contentId, guestProgress);
  }, [contentId, guestProgress, isLoggedIn]);

  const mutateRelationship = async (kind: "save" | "follow", topicKey?: string) => {
    if (!isLoggedIn) {
      // AIR-403 — 비로그인 저장 시도. 식별자는 표면 컨텍스트의 content_id/content_slug로만 실린다(PII 미전송).
      if (kind === "save") trackGaEvent("content_save_intent", { is_member: false });
      loginToContinue();
      return;
    }
    const isFollow = kind === "follow" && Boolean(topicKey);
    const key = topicKey || "";
    const currentlyActive = isFollow ? Boolean(followedTopics[key]) : isSaved;
    const endpoint = isFollow
      ? `${API_PREFIX}/topic-follows/${encodeURIComponent(key)}`
      : `${API_PREFIX}/saves/${encodeURIComponent(slug)}`;
    setMutation(isFollow ? `follow:${key}` : "save");
    setError("");
    setMessage("");
    if (isFollow) setFollowedTopics((current) => ({ ...current, [key]: !currentlyActive }));
    else setIsSaved(!currentlyActive);
    try {
      const response = await fetch(endpoint, {
        method: currentlyActive ? "DELETE" : "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: currentlyActive ? undefined : "{}",
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 401) {
        loginToContinue();
        return;
      }
      if (!response.ok) throw new Error(readErrorMessage(body, lang({ ko: "변경하지 못했습니다. 잠시 후 다시 시도해 주세요.", en: "We could not update this. Please try again." })));
      // AIR-403 — 성공한 관계 행동만 발화한다. 저장 해제는 §4에 대응 이벤트가 없어 발화하지 않는다.
      if (isFollow) trackGaEvent(currentlyActive ? "topic_unfollow" : "topic_follow", { topic_key: key, topic_type: "app_topic", is_member: true });
      else if (!currentlyActive) trackGaEvent("content_save", { is_member: true });
      setMessage(lang({ ko: currentlyActive ? "기록에서 삭제했습니다." : "내 매거진에 기록했습니다.", en: currentlyActive ? "Removed from your records." : "Added to your Magazine." }));
    } catch (requestError) {
      if (isFollow) setFollowedTopics((current) => ({ ...current, [key]: currentlyActive }));
      else setIsSaved(currentlyActive);
      setError(requestError instanceof Error ? requestError.message : lang({ ko: "잠시 후 다시 시도해 주세요.", en: "Please try again in a moment." }));
    } finally {
      setMutation(null);
    }
  };

  const continueReading = () => {
    const blockId = effectiveProgress?.position?.blockId;
    const target = blockId ? document.getElementById(blockId) : null;
    if (!target) return;
    // AIR-403 — resume_position은 본문 blockId다. 회원 식별자는 싣지 않는다.
    trackGaEvent("continue_reading", {
      resume_position: blockId,
      resume_progress_bps: effectiveProgress?.position?.progressBps ?? 0,
      is_member: isLoggedIn,
    });
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
    setMessage(lang({ ko: "읽던 위치로 이동했습니다.", en: "Moved to your reading position." }));
  };

  const progressBps = effectiveProgress?.position?.progressBps ?? 0;
  const hasProgress = progressBps >= MIN_PROGRESS_BPS;

  const saveControl = (compact = false) => (
    <button
      type="button"
      className={`${compact ? "flex-1" : ""} inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-primary-text transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none`}
      aria-pressed={isSaved}
      aria-label={lang({ ko: isSaved ? "저장 취소" : "이 콘텐츠 저장", en: isSaved ? "Remove saved story" : "Save this story" })}
      disabled={isLoading || mutation !== null}
      onClick={() => void mutateRelationship("save")}
    >
      {mutation === "save" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : isSaved ? <Check className="h-4 w-4" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
      <Lang text={{ ko: isSaved ? "저장됨" : "저장", en: isSaved ? "Saved" : "Save" }} />
    </button>
  );

  if (!hasHydrated) {
    return <div className="mt-6 h-14 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" aria-hidden="true" />;
  }

  return (
    <section
      aria-label={lang({ ko: "내 매거진 관계 기능", en: "Your Magazine actions" })}
      className="mt-6 border-y border-border py-4"
      data-personalization-surface="app-magazine"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2" aria-busy={isLoading || mutation !== null}>
          {!contextAction ? saveControl() : null}

          {hasProgress ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-text transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
              disabled={isLoading || mutation !== null}
              onClick={continueReading}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span><Lang text={{ ko: "이어 읽기", en: "Continue reading" }} /> · {getProgressLabel(progressBps)}</span>
            </button>
          ) : (
            <span className="inline-flex min-h-11 items-center gap-2 px-2 text-sm text-secondary-text">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <Lang text={{ ko: "읽기 기록은 5%부터 저장됩니다.", en: "Reading progress saves after 5%." }} />
            </span>
          )}
        </div>

        {!isLoggedIn ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium text-secondary-text underline-offset-4 transition-colors hover:text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
            onClick={loginToContinue}
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            <Lang text={{ ko: "로그인하고 이어가기", en: "Sign in to keep your thread" }} />
          </button>
        ) : null}
      </div>

      {topics.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={lang({ ko: "관심 주제", en: "Topics" })}>
          <span className="inline-flex min-h-11 items-center gap-1 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-secondary-text">
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            <Lang text={{ ko: "관심 주제", en: "Topics" }} />
          </span>
          {topics.map((topic) => {
            const active = Boolean(followedTopics[topic.topicKey]);
            const topicMutation = mutation === `follow:${topic.topicKey}`;
            return (
              <button
                key={topic.topicKey}
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-3 text-sm text-secondary-text transition-colors hover:border-primary hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
                aria-pressed={active}
                aria-label={lang({ ko: `${getTopicLabel(topic)} 주제 ${active ? "팔로우 취소" : "팔로우"}`, en: `${getTopicLabel(topic, "en")} ${active ? "unfollow" : "follow"}` })}
                disabled={isLoading || mutation !== null}
                onClick={() => void mutateRelationship("follow", topic.topicKey)}
              >
                {topicMutation ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                <span>{getTopicLabel(topic)}</span>
                <span className="sr-only"><Lang text={{ ko: active ? "팔로우 중" : "팔로우하지 않음", en: active ? "Following" : "Not following" }} /></span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-2 min-h-5 text-sm" aria-live="polite" role={error ? "alert" : "status"}>
        {error ? <span className="text-danger">{error} <a href="/account" className="font-semibold underline underline-offset-2"><Lang text={{ ko: "계정 설정", en: "Account settings" }} /></a></span> : message ? <span className="text-secondary-text">{message}</span> : null}
      </div>

      {contextAction ? (
        <aside
          aria-label={lang({ ko: "이 글의 다음 행동", en: "Next action for this story" })}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-3 shadow-[0_-8px_24px_rgba(24,24,27,0.08)] backdrop-blur motion-reduce:shadow-none"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            {saveControl(true)}
            <a
              href={contextAction.href}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-center text-sm font-semibold text-primary-text transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <Lang text={contextAction.label} />
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </aside>
      ) : null}
    </section>
  );
}
