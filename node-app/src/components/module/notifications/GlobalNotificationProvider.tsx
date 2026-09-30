"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { lang } from "components/module/i18n";
import {
  listStudioContentJobNotifications,
  listStudioImageJobNotifications,
  markStudioContentJobNotificationRead,
  markStudioImageJobNotificationRead,
  type StudioContentJobNotificationType,
  type StudioImageJobNotificationType,
} from "libs/api/lab";
import { useAuthStore } from "store/auth";
import { buildGenStudioListUrl, buildGenStudioTemplateUrl } from "utils/app/genStudioRouteContract";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Gen Studio 이미지·콘텐츠 생성 Job 알림 단일 폴링 제공자
 * @process 인증 확인  두 Job 알림 API 동시 조회  알림 아이템 매핑  대기 중인 Job watcher 해제
 * @domain lab
 * @scope client
 */

const IDLE_POLL_MS = 30_000;
const ACTIVE_POLL_MS = 5_000;
const MAX_VISIBLE_ITEMS = 12;
const FETCH_LIMIT = 20;
const JOB_WATCH_TIMEOUT_MS = 20 * 60 * 1000;
const TERMINAL_JOB_CACHE_LIMIT = 200;

type GlobalNotificationToneType = "info" | "success" | "warning" | "danger";
export type GlobalNotificationSourceType = "studio-image-job" | "studio-content-job";

export type GlobalNotificationItemType = {
  id: string;
  source: GlobalNotificationSourceType;
  sourceId: string;
  title: string;
  description: string;
  categoryLabel: string;
  status: "queued" | "running" | "success" | "partial" | "failed" | "info";
  tone: GlobalNotificationToneType;
  active: boolean;
  terminal: boolean;
  autoOpen?: boolean;
  href?: string;
  imageUrl?: string;
  imageAlt?: string;
  // 이미지가 없는 알림(콘텐츠 생성)은 썸네일 대신 결과 텍스트 일부를 보여준다.
  textPreview?: string;
  createdAt?: string | Date | null;
};

type JobStatusLikeType = { status: string };

type JobWatcherType<T> = {
  jobIds: string[];
  resolve: (jobs: T[]) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

type GlobalNotificationContextType = {
  enabled: boolean;
  items: GlobalNotificationItemType[];
  activeCount: number;
  terminalCount: number;
  badgeCount: number;
  loading: boolean;
  error: string;
  refresh: () => Promise<GlobalNotificationItemType[]>;
  markRead: (item: GlobalNotificationItemType) => Promise<void>;
  /** 지정한 이미지 Job이 모두 종료 상태가 될 때까지 대기한다(개별 폴링 금지). */
  watchImageJobs: (jobIds: string[]) => Promise<StudioImageJobNotificationType[]>;
  /** 지정한 콘텐츠 Job이 모두 종료 상태가 될 때까지 대기한다(개별 폴링 금지). */
  watchContentJobs: (jobIds: string[]) => Promise<StudioContentJobNotificationType[]>;
};

const GlobalNotificationContext = createContext<GlobalNotificationContextType | null>(null);

/** watcher 해제용 캐시가 무한히 자라지 않도록 오래된 항목부터 정리한다. */
function pruneTerminalJobCache(cache: Map<string, unknown>) {
  if (cache.size <= TERMINAL_JOB_CACHE_LIMIT) return;
  const overflow = cache.size - TERMINAL_JOB_CACHE_LIMIT;
  Array.from(cache.keys())
    .slice(0, overflow)
    .forEach((key) => cache.delete(key));
}

function isTerminalJob(job: JobStatusLikeType) {
  return job.status === "success" || job.status === "partial" || job.status === "failed";
}

function isActiveJob(job: JobStatusLikeType) {
  return job.status === "queued" || job.status === "running";
}

function toTone(job: JobStatusLikeType): GlobalNotificationToneType {
  if (job.status === "failed") return "danger";
  return isTerminalJob(job) ? "success" : "info";
}

function getStudioResultHref(job: StudioImageJobNotificationType) {
  const currentSearchParams = new URLSearchParams({ jobId: job.jobId }).toString();
  if (job.templateKey) {
    return (
      buildGenStudioTemplateUrl({ mode: "image", templateKey: job.templateKey, currentSearchParams }) ||
      buildGenStudioListUrl({ mode: "image", currentSearchParams })
    );
  }
  return buildGenStudioListUrl({ mode: "image", currentSearchParams });
}

function getContentResultHref(job: StudioContentJobNotificationType) {
  const currentSearchParams = new URLSearchParams({ jobId: job.jobId }).toString();
  if (job.templateKey) {
    return (
      buildGenStudioTemplateUrl({ mode: "content", templateKey: job.templateKey, currentSearchParams }) ||
      buildGenStudioListUrl({ mode: "content", currentSearchParams })
    );
  }
  return buildGenStudioListUrl({ mode: "content", currentSearchParams });
}

function mapStudioJobToGlobalItem(job: StudioImageJobNotificationType): GlobalNotificationItemType {
  const title =
    String(job.templateTitle || job.templateKey || "").trim() || lang({ ko: "이미지 생성", en: "Image generation" });
  const active = isActiveJob(job);
  const terminal = isTerminalJob(job);
  const failed = job.status === "failed";
  const outputCount = job.outputCount || job.assets.length;
  const firstImage = job.assets?.find((asset) => asset.url)?.url || "";

  return {
    id: `studio-image-job:${job.jobId}`,
    source: "studio-image-job",
    sourceId: job.jobId,
    title,
    categoryLabel: lang({ ko: "Gen Studio", en: "Gen Studio" }),
    status: job.status,
    tone: toTone(job),
    active,
    terminal,
    autoOpen: terminal,
    href: terminal && !failed ? getStudioResultHref(job) : undefined,
    imageUrl: firstImage,
    imageAlt: title,
    createdAt: job.createdAt,
    description: active
      ? lang({ ko: "이미지 생성 대기/처리 중입니다.", en: "Image generation is queued or running." })
      : failed
        ? job.errorMessage || lang({ ko: "이미지 생성에 실패했습니다.", en: "Image generation failed." })
        : lang({
            ko: `결과 ${outputCount}장이 준비되었습니다.`,
            en: `${outputCount} image(s) ready.`,
          }),
  };
}

function mapContentJobToGlobalItem(job: StudioContentJobNotificationType): GlobalNotificationItemType {
  const title =
    String(job.templateTitle || job.templateKey || "").trim() || lang({ ko: "콘텐츠 생성", en: "Content generation" });
  const active = isActiveJob(job);
  const terminal = isTerminalJob(job);
  const failed = job.status === "failed";
  const outputCount = job.outputCount || job.assets.length;
  const firstPreview = String(job.assets?.find((asset) => asset.textPreview)?.textPreview || "").trim();

  return {
    id: `studio-content-job:${job.jobId}`,
    source: "studio-content-job",
    sourceId: job.jobId,
    title,
    categoryLabel: lang({ ko: "Gen Studio", en: "Gen Studio" }),
    status: job.status,
    tone: toTone(job),
    active,
    terminal,
    autoOpen: terminal,
    href: terminal && !failed ? getContentResultHref(job) : undefined,
    // 콘텐츠 결과에는 이미지가 없으므로 imageUrl을 비우고 textPreview만 채운다.
    textPreview: terminal && !failed ? firstPreview : "",
    createdAt: job.createdAt,
    description: active
      ? lang({ ko: "콘텐츠 생성 대기/처리 중입니다.", en: "Content generation is queued or running." })
      : failed
        ? job.errorMessage || lang({ ko: "콘텐츠 생성에 실패했습니다.", en: "Content generation failed." })
        : lang({
            ko: `결과 ${outputCount}건이 준비되었습니다.`,
            en: `${outputCount} content result(s) ready.`,
          }),
  };
}

export function GlobalNotificationProvider({ children }: { children: ReactNode }) {
  const { hasHydrated, isLogged } = useAuthStore();
  const [imageJobs, setImageJobs] = useState<StudioImageJobNotificationType[]>([]);
  const [contentJobs, setContentJobs] = useState<StudioContentJobNotificationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<() => void>(() => {});
  // 알림 목록에서 사라진 뒤에도 watcher가 결과를 받을 수 있도록 종료 상태 Job을 캐시한다.
  const terminalImageJobsRef = useRef<Map<string, StudioImageJobNotificationType>>(new Map());
  const terminalContentJobsRef = useRef<Map<string, StudioContentJobNotificationType>>(new Map());
  const imageWatchersRef = useRef<Array<JobWatcherType<StudioImageJobNotificationType>>>([]);
  const contentWatchersRef = useRef<Array<JobWatcherType<StudioContentJobNotificationType>>>([]);
  const enabled = hasHydrated && isLogged();

  const clearTimer = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const items = useMemo(
    () =>
      [...imageJobs.map(mapStudioJobToGlobalItem), ...contentJobs.map(mapContentJobToGlobalItem)]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, MAX_VISIBLE_ITEMS),
    [contentJobs, imageJobs],
  );
  const activeCount = items.filter((item) => item.active).length;
  const terminalCount = items.filter((item) => item.terminal).length;
  const badgeCount = activeCount + terminalCount;

  const resolveWatchers = useCallback(
    function resolveReadyWatchers<T extends { jobId: string }>(
      watchersRef: MutableRefObject<Array<JobWatcherType<T>>>,
      cache: Map<string, T>,
    ) {
      const pending: Array<JobWatcherType<T>> = [];
      watchersRef.current.forEach((watcher) => {
        const resolved = watcher.jobIds.map((jobId) => cache.get(jobId)).filter(Boolean) as T[];
        if (resolved.length === watcher.jobIds.length) {
          clearTimeout(watcher.timer);
          watcher.resolve(resolved);
          return;
        }
        pending.push(watcher);
      });
      watchersRef.current = pending;
    },
    [],
  );

  const refresh = useCallback(async (): Promise<GlobalNotificationItemType[]> => {
    if (!enabled) {
      setImageJobs([]);
      setContentJobs([]);
      return [];
    }

    setLoading(true);
    try {
      // 이미지·콘텐츠 알림을 한 주기에서 함께 조회한다. 개별 화면은 폴링하지 않는다.
      const [nextImageJobs, nextContentJobs] = await Promise.all([
        listStudioImageJobNotifications({ limit: FETCH_LIMIT, unread: true, includeRunning: true }),
        listStudioContentJobNotifications({ limit: FETCH_LIMIT, unread: true, includeRunning: true }),
      ]);

      nextImageJobs.forEach((job) => {
        if (isTerminalJob(job)) terminalImageJobsRef.current.set(job.jobId, job);
      });
      nextContentJobs.forEach((job) => {
        if (isTerminalJob(job)) terminalContentJobsRef.current.set(job.jobId, job);
      });
      pruneTerminalJobCache(terminalImageJobsRef.current);
      pruneTerminalJobCache(terminalContentJobsRef.current);

      setImageJobs(nextImageJobs);
      setContentJobs(nextContentJobs);
      setError("");

      resolveWatchers(imageWatchersRef, terminalImageJobsRef.current);
      resolveWatchers(contentWatchersRef, terminalContentJobsRef.current);

      return [
        ...nextImageJobs.map(mapStudioJobToGlobalItem),
        ...nextContentJobs.map(mapContentJobToGlobalItem),
      ];
    } catch {
      setError(lang({ ko: "알림을 불러오지 못했습니다.", en: "Failed to load notifications." }));
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled, resolveWatchers]);

  useEffect(() => {
    clearTimer();
    if (!enabled) return;

    let cancelled = false;
    const tick = async () => {
      const nextItems = await refresh();
      if (cancelled) return;
      const hasPendingWatchers = imageWatchersRef.current.length > 0 || contentWatchersRef.current.length > 0;
      const hasRunning = nextItems.some((item) => item.active) || hasPendingWatchers;
      pollingTimerRef.current = setTimeout(tick, hasRunning ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };

    // enqueue 직후처럼 즉시 확인이 필요한 시점에 대기 중인 타이머를 앞당긴다.
    tickRef.current = () => {
      clearTimer();
      void tick();
    };

    void tick();
    return () => {
      cancelled = true;
      tickRef.current = () => {};
      clearTimer();
    };
  }, [clearTimer, enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") tickRef.current();
    };
    const onStudioJobQueued = () => tickRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("amu:studio-image-job-queued", onStudioJobQueued);
    window.addEventListener("amu:studio-content-job-queued", onStudioJobQueued);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("amu:studio-image-job-queued", onStudioJobQueued);
      window.removeEventListener("amu:studio-content-job-queued", onStudioJobQueued);
    };
  }, [enabled]);

  useEffect(
    function rejectPendingWatchersOnUnmount() {
      return () => {
        [...imageWatchersRef.current, ...contentWatchersRef.current].forEach((watcher) => {
          clearTimeout(watcher.timer);
          watcher.reject(new Error("studio_job_watch_cancelled"));
        });
        imageWatchersRef.current = [];
        contentWatchersRef.current = [];
      };
    },
    [],
  );

  const watchJobs = useCallback(
    function registerJobWatcher<T extends { jobId: string }>(
      watchersRef: MutableRefObject<Array<JobWatcherType<T>>>,
      cache: Map<string, T>,
      jobIds: string[],
      fetchByIds?: (ids: string[]) => Promise<T[]>,
    ): Promise<T[]> {
      const ids = Array.from(new Set((jobIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
      if (!ids.length) return Promise.resolve([]);

      const cached = ids.map((jobId) => cache.get(jobId)).filter(Boolean) as T[];
      if (cached.length === ids.length) return Promise.resolve(cached);

      return new Promise<T[]>((resolve, reject) => {
        const watcher: JobWatcherType<T> = {
          jobIds: ids,
          resolve,
          reject,
          timer: setTimeout(() => {
            watchersRef.current = watchersRef.current.filter((item) => item !== watcher);
            reject(new Error("studio_job_watch_timeout"));
          }, JOB_WATCH_TIMEOUT_MS),
        };
        watchersRef.current.push(watcher);

        // 폴링이 보는 알림 목록에는 기간·읽음·상한 경계가 있다. 이미 끝난 job(특히 서버가 재사용한 job)은
        // 그 목록에 잡히지 않을 수 있으므로, 감시 대상 id를 지정 조회해 캐시를 먼저 채운다.
        if (fetchByIds) {
          void (async () => {
            try {
              const fetched = await fetchByIds(ids);
              fetched.forEach((job) => {
                if (isTerminalJob(job as unknown as JobStatusLikeType)) cache.set(String(job.jobId), job);
              });
              resolveWatchers(watchersRef, cache);
            } catch (error) {
              // 지정 조회가 실패해도 폴링이 이어받는다. 다만 폴링 창 밖의 job이면 타임아웃으로만 드러나므로
              // 원인을 추적할 수 있게 남긴다.
              logger.warn("[GlobalNotification] 지정 job 조회 실패", error);
            }
          })();
        }

        tickRef.current();
      });
    },
    [resolveWatchers],
  );

  const fetchImageJobsByIds = useCallback(
    (ids: string[]) => listStudioImageJobNotifications({ jobIds: ids, includeRunning: true, limit: ids.length }),
    [],
  );

  const fetchContentJobsByIds = useCallback(
    (ids: string[]) => listStudioContentJobNotifications({ jobIds: ids, includeRunning: true, limit: ids.length }),
    [],
  );

  const watchImageJobs = useCallback(
    (jobIds: string[]) => watchJobs(imageWatchersRef, terminalImageJobsRef.current, jobIds, fetchImageJobsByIds),
    [fetchImageJobsByIds, watchJobs],
  );

  const watchContentJobs = useCallback(
    (jobIds: string[]) => watchJobs(contentWatchersRef, terminalContentJobsRef.current, jobIds, fetchContentJobsByIds),
    [fetchContentJobsByIds, watchJobs],
  );

  const markRead = useCallback(async (item: GlobalNotificationItemType) => {
    if (item.source === "studio-image-job") {
      setImageJobs((prev) => prev.filter((job) => job.jobId !== item.sourceId));
      await markStudioImageJobNotificationRead(item.sourceId).catch(() => {});
      return;
    }

    setContentJobs((prev) => prev.filter((job) => job.jobId !== item.sourceId));
    await markStudioContentJobNotificationRead(item.sourceId).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      items,
      activeCount,
      terminalCount,
      badgeCount,
      loading,
      error,
      refresh,
      markRead,
      watchImageJobs,
      watchContentJobs,
    }),
    [
      activeCount,
      badgeCount,
      enabled,
      error,
      items,
      loading,
      markRead,
      refresh,
      terminalCount,
      watchContentJobs,
      watchImageJobs,
    ],
  );

  return <GlobalNotificationContext.Provider value={value}>{children}</GlobalNotificationContext.Provider>;
}

export function useGlobalNotifications() {
  const context = useContext(GlobalNotificationContext);
  if (!context) {
    throw new Error("useGlobalNotifications must be used within GlobalNotificationProvider");
  }
  return context;
}
