"use client";

import type { CoinUsageActivity, CoinUsagePurpose } from "types/payment";
import { cn } from "utils/common";

/**
 * @docHint
 * @purpose 사용자(CoinUsageDialog)·유니버스(UniverseCoinUsageDialog) 코인 사용 내역 팝업이
 *          공유하는 필터 옵션·날짜 유틸·요약 pill. 목록 행은 CoinUsageItemRow, 원장 조회는
 *          서버 route(/payments/usage, /universe/[universeId]/coin-usage)가 담당한다.
 * @domain payment
 * @scope client
 */

export type CoinActivityFilter = CoinUsageActivity | "all";
export type CoinPurposeFilter = CoinUsagePurpose | "all";

export const COIN_USAGE_ACTIVITY_FILTER_OPTIONS: { value: CoinActivityFilter; ko: string; en: string }[] = [
  { value: "all", ko: "전체 작업", en: "All activity" },
  { value: "conversation", ko: "AI 대화", en: "AI conversation" },
  { value: "image_generation", ko: "이미지 생성·편집", en: "Image generation & editing" },
  { value: "content_generation", ko: "콘텐츠 생성", en: "Content generation" },
  { value: "audio", ko: "음성 생성·변환", en: "Voice generation & processing" },
  { value: "ai_task", ko: "AI 작업", en: "AI task" },
  { value: "coin_charge", ko: "코인 충전", en: "Coin charge" },
  { value: "subscription_grant", ko: "구독 코인 지급", en: "Subscription grant" },
];

export const COIN_USAGE_PURPOSE_FILTER_OPTIONS: { value: CoinPurposeFilter; ko: string; en: string }[] = [
  { value: "all", ko: "전체 목적", en: "All purposes" },
  { value: "content.generate", ko: "콘텐츠 생성", en: "Content generation" },
  { value: "image.generate_or_edit", ko: "이미지 생성·편집", en: "Image generation & editing" },
  { value: "image.remove_background", ko: "이미지 배경 제거", en: "Image background removal" },
  { value: "conversation.chat", ko: "AI 대화", en: "AI conversation" },
  { value: "audio.synthesize", ko: "음성 생성", en: "Speech synthesis" },
  { value: "audio.transcribe", ko: "음성 받아쓰기", en: "Speech transcription" },
  { value: "audio.analyze", ko: "발음·음성 분석", en: "Speech analysis" },
  { value: "marketing.proofread", ko: "마케팅 오탈자 교정", en: "Marketing correction" },
  { value: "marketing.independent_proofread", ko: "마케팅 독립 오탈자 검수", en: "Independent marketing proofread" },
  { value: "marketing.strategy_fit", ko: "마케팅 전략 적합도 분석", en: "Marketing strategy fit" },
  { value: "tutors.persona_generate", ko: "튜터 페르소나 생성", en: "Tutor persona generation" },
  { value: "tutors.profile_image_generate", ko: "튜터 프로필 이미지 생성", en: "Tutor profile image" },
  { value: "mini_app.assist", ko: "미니앱 AI 작성 보조", en: "Mini-app AI assist" },
  { value: "ai.other", ko: "기타 AI 작업", en: "Other AI tasks" },
  { value: "coin.charge", ko: "코인 충전", en: "Coin charge" },
  { value: "coin.subscription_grant", ko: "구독 코인 지급", en: "Subscription grant" },
];

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date;
}

export function getTodayInputValue() {
  return formatDateInputValue(new Date());
}

export function CoinUsageSummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "usage" | "credit" | "net";
}) {
  return (
    <div className="min-w-0 rounded-md border bg-surface/60 px-3 py-1">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <p
        className={cn(
          "text-md font-bold tabular-nums",
          tone === "credit" ? "text-emerald-600 dark:text-emerald-400" : "",
          tone === "usage" ? "text-amber-700 dark:text-amber-400" : "",
        )}
      >
        {value > 0 && tone !== "usage" ? "+" : ""}
        {value.toLocaleString()}
      </p>
    </div>
  );
}
