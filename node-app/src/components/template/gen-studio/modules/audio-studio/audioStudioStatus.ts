import type { StudioAudioStatusType } from "libs/api/lab";

/**
 * audio job 상태 → UI 표현 판정. 순수 함수라 상태 전이 계약 테스트에서 직접 검증한다.
 * queued/running/success/failed/cancelled/unknown_outcome를 서로 다른 의미로 유지한다.
 */
export type AudioStatusToneType = "idle" | "pending" | "success" | "danger" | "warning";

export type AudioStatusView = {
  tone: AudioStatusToneType;
  label: { ko: string; en: string };
  isTerminal: boolean;
  canCancel: boolean;
  canRetry: boolean;
  /** unknown_outcome을 성공이나 무료 재시도로 표시하지 않도록 UI가 이 값을 사용한다. */
  isIndeterminate: boolean;
};

export function isTerminalAudioStatus(status: unknown): status is Extract<StudioAudioStatusType, "success" | "failed" | "cancelled" | "unknown_outcome"> {
  return status === "success" || status === "failed" || status === "cancelled" || status === "unknown_outcome";
}

export function resolveAudioStatusView(status: unknown): AudioStatusView {
  switch (status) {
    case "queued":
      return {
        tone: "pending",
        label: { ko: "생성 대기 중", en: "Queued" },
        isTerminal: false,
        canCancel: true,
        canRetry: false,
        isIndeterminate: false,
      };
    case "running":
      return {
        tone: "pending",
        label: { ko: "음성 생성 중", en: "Generating" },
        isTerminal: false,
        canCancel: false,
        canRetry: false,
        isIndeterminate: false,
      };
    case "success":
      return {
        tone: "success",
        label: { ko: "생성 완료", en: "Completed" },
        isTerminal: true,
        canCancel: false,
        canRetry: false,
        isIndeterminate: false,
      };
    case "cancelled":
      return {
        tone: "warning",
        label: { ko: "취소됨", en: "Cancelled" },
        isTerminal: true,
        canCancel: false,
        canRetry: true,
        isIndeterminate: false,
      };
    case "unknown_outcome":
      return {
        tone: "warning",
        label: { ko: "결과 확인 필요", en: "Outcome needs review" },
        isTerminal: true,
        canCancel: false,
        canRetry: false,
        isIndeterminate: true,
      };
    case "failed":
      return {
        tone: "danger",
        label: { ko: "생성 실패", en: "Failed" },
        isTerminal: true,
        canCancel: false,
        canRetry: true,
        isIndeterminate: false,
      };
    default:
      return {
        tone: "idle",
        label: { ko: "대기", en: "Idle" },
        isTerminal: false,
        canCancel: false,
        canRetry: false,
        isIndeterminate: false,
      };
  }
}

export function formatAudioDuration(durationMs: unknown): string {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs) || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds * 10) % 10);
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `${seconds}.${tenths}s`;
}

/** 실제 metadata(durationMs)가 없는 segment는 결과로 취급하지 않는다 — 가짜 파형/길이 금지. */
export function hasPlayableAudioMetadata(asset: {
  audio?: { durationMs?: number | null } | null;
  url?: string | null;
}): boolean {
  return Number(asset.audio?.durationMs || 0) > 0 && Boolean(String(asset.url || "").trim());
}
