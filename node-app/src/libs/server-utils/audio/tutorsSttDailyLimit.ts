import { createSpeechError } from "./guards";

/**
 * EL-600 Tutors STT 사용자별 KST 일일 요청 한도.
 *
 * 0은 운영자가 명시적으로 닫은 값이고 null은 승인 전 미확정 값이다. 둘을 합치면
 * 설정 누락이 무료 통과로 바뀌므로 판정 결과를 분리한다. 카운터 증가 자체는 Redis의
 * 원자적 INCR+TTL 경로를 사용해 같은 uid의 동시 요청을 한 번만 허용할 수 있게 한다.
 */
export const TUTORS_STT_DAILY_LIMIT_POLICY = {
  timeZone: "Asia/Seoul",
  maxRequestsPerUserPerDay: 0,
} as const;

export const TUTORS_STT_DAILY_LIMIT_OUTCOMES = [
  "allowed",
  "uid_unavailable",
  "limit_unconfigured",
  "limit_disabled",
  "limit_exceeded",
  "counter_unavailable",
] as const;

export type TutorsSttDailyLimitOutcome = (typeof TUTORS_STT_DAILY_LIMIT_OUTCOMES)[number];

export type TutorsSttDailyLimitDecision = {
  allowed: boolean;
  outcome: TutorsSttDailyLimitOutcome;
  day: string;
  count?: number;
  limit?: number | null;
};

function normalizeUid(value: unknown) {
  const uid = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!uid || uid.length > 256 || /[\u0000-\u001f\u007f\s]/.test(uid)) return null;
  return uid;
}

function normalizeLimit(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0) return null;
  return limit;
}

export function resolveTutorsSttKstDay(now: Date = new Date()) {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function resolveTutorsSttKstTtlSeconds(now: Date = new Date()) {
  const shiftedMs = now.getTime() + 9 * 60 * 60 * 1000;
  const nextDayMs = (Math.floor(shiftedMs / 86_400_000) + 1) * 86_400_000;
  return Math.max(1, Math.ceil((nextDayMs - shiftedMs) / 1000));
}

export function resolveTutorsSttDailyCounterKey(uid: string, day: string) {
  return `speech:tutors:stt:daily:${uid}:${day}`;
}

export function evaluateTutorsSttDailyLimit(args: {
  uid: unknown;
  limit: unknown;
  count?: unknown;
  now?: Date;
}): TutorsSttDailyLimitDecision {
  const day = resolveTutorsSttKstDay(args.now);
  const uid = normalizeUid(args.uid);
  if (!uid) return { allowed: false, outcome: "uid_unavailable", day };

  const limit = normalizeLimit(args.limit);
  if (limit === null) return { allowed: false, outcome: "limit_unconfigured", day, limit: null };
  if (limit === 0) return { allowed: false, outcome: "limit_disabled", day, count: 0, limit };

  const count = Number(args.count);
  if (!Number.isInteger(count) || count <= 0) {
    return { allowed: false, outcome: "counter_unavailable", day, limit };
  }
  return {
    allowed: count <= limit,
    outcome: count <= limit ? "allowed" : "limit_exceeded",
    day,
    count,
    limit,
  };
}

export async function assertTutorsSttDailyLimitOrThrow(args: {
  uid: unknown;
  maxRequestsPerUserPerDay?: unknown;
  now?: Date;
  increment?: (key: string, ttlSeconds: number) => Promise<number>;
}): Promise<TutorsSttDailyLimitDecision> {
  const now = args.now || new Date();
  const uid = normalizeUid(args.uid);
  const day = resolveTutorsSttKstDay(now);
  const limit = normalizeLimit(
    args.maxRequestsPerUserPerDay === undefined
      ? TUTORS_STT_DAILY_LIMIT_POLICY.maxRequestsPerUserPerDay
      : args.maxRequestsPerUserPerDay,
  );
  const base = evaluateTutorsSttDailyLimit({ uid, limit, now });
  if (base.outcome === "uid_unavailable" || base.outcome === "limit_unconfigured" || base.outcome === "limit_disabled") {
    throw createSpeechError(
      base.outcome === "uid_unavailable"
        ? "인증된 사용자 식별자를 확인할 수 없습니다."
        : base.outcome === "limit_disabled"
          ? "Tutors 음성 입력 일일 한도가 현재 0으로 설정되어 있습니다."
          : "Tutors 음성 입력 일일 한도가 승인·구성되지 않았습니다.",
      "TUTORS_STT_DAILY_LIMIT_BLOCKED",
      base.outcome === "limit_unconfigured" ? 503 : 429,
      { outcome: base.outcome, day, limit },
    );
  }

  let increment = args.increment;
  if (!increment) {
    // 계약 테스트와 dry-run은 DB/Redis 환경 없이 순수 판정을 실행할 수 있어야 한다.
    // 실제 기본 경로에서만 Redis 클라이언트를 지연 import한다.
    const { redisCache } = await import("libs/cache/redisCacheService");
    increment = (key: string, ttlSeconds: number) => redisCache.incr(key, ttlSeconds);
  }
  let count: number;
  try {
    count = await increment(resolveTutorsSttDailyCounterKey(uid as string, day), resolveTutorsSttKstTtlSeconds(now));
  } catch {
    throw createSpeechError("Tutors 음성 입력 일일 한도를 확인할 수 없어 요청을 차단했습니다.", "TUTORS_STT_DAILY_LIMIT_BLOCKED", 503, {
      outcome: "counter_unavailable",
      day,
    });
  }

  const decision = evaluateTutorsSttDailyLimit({ uid, limit, count, now });
  if (!decision.allowed) {
    throw createSpeechError("Tutors 음성 입력 일일 한도를 초과했습니다.", "TUTORS_STT_DAILY_LIMIT_BLOCKED", 429, {
      outcome: decision.outcome,
      day,
      count,
      limit,
    });
  }
  return decision;
}
