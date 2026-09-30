"use client";

/**
 * EL-702: WebView 재생 lifecycle 순수 계약(TS).
 *
 * native(amu_native_app)와 동일한 판정을 node-app에서 재사용한다. 실제 오디오/마이크 조작은
 * 훅이 담당하고, 이 모듈은 lifecycle 상태 → 재생 명령, 중복 provider 요청 억제용 identity,
 * signed URL 만료/오프라인 fallback만 결정한다.
 */

export const AMU_PLAYBACK_LIFECYCLE_STATES = ["resumed", "inactive", "paused", "hidden", "detached"] as const;
export type AmuPlaybackLifecycleState = (typeof AMU_PLAYBACK_LIFECYCLE_STATES)[number];

export type AmuPlaybackCommand = "none" | "suspend" | "resume" | "stop";

export const AMU_PLAYBACK_INTERRUPTIONS = [
  "audio_focus_loss",
  "phone_call",
  "route_change",
  "background",
  "dispose",
  "unsupported_platform",
] as const;
export type AmuPlaybackInterruption = (typeof AMU_PLAYBACK_INTERRUPTIONS)[number];

export type AmuPlaybackFallbackMode = "native" | "text_only";
export type AmuSignedUrlAction = "reuse" | "refresh" | "text_only_fallback";

const SUPPORTED_PLATFORMS = new Set(["android", "ios"]);

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/** 앱 lifecycle → 재생 명령. 알 수 없는 상태는 suspend(fail-safe)로 닫는다. */
export function commandForLifecycleState(raw: unknown): AmuPlaybackCommand {
  switch (normalize(raw)) {
    case "resumed":
      return "resume";
    case "detached":
      return "stop";
    case "paused":
    case "inactive":
    case "hidden":
      return "suspend";
    default:
      return "suspend";
  }
}

/** interruption(통화/오디오 포커스/라우팅/백그라운드/dispose) → 명령. */
export function commandForInterruption(raw: unknown): AmuPlaybackCommand {
  switch (normalize(raw)) {
    case "dispose":
      return "stop";
    case "audio_focus_loss":
    case "phone_call":
    case "route_change":
    case "background":
      return "suspend";
    default:
      return "suspend";
  }
}

/** 사용자 gesture + foreground + WebView ready일 때만 재생을 시작한다. */
export function canStartPlayback(args: {
  hasUserGesture: boolean;
  isForeground: boolean;
  isWebReady: boolean;
}): boolean {
  return Boolean(args.hasUserGesture) && Boolean(args.isForeground) && Boolean(args.isWebReady);
}

/** dispose/네비게이션 시 진행 중 재생·요청을 반드시 중단한다. */
export function mustStopOnDispose(): boolean {
  return true;
}

export function isSupportedPlatform(raw: unknown): boolean {
  return SUPPORTED_PLATFORMS.has(normalize(raw));
}

export function fallbackModeForPlatform(raw: unknown): AmuPlaybackFallbackMode {
  return isSupportedPlatform(raw) ? "native" : "text_only";
}

function speedKey(raw: unknown): string {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(value)) return "default";
  return value.toFixed(2);
}

/**
 * provider 중복 호출 방지용 요청 identity.
 * 필수 축(messageClientId·voiceId·contentHash)이 없으면 null을 반환한다.
 */
export function requestIdentity(args: {
  messageClientId: unknown;
  voiceId: unknown;
  speed: unknown;
  format: unknown;
  contentHash: unknown;
}): string | null {
  const clientId = normalize(args.messageClientId);
  const voice = normalize(args.voiceId);
  const content = normalize(args.contentHash);
  if (!clientId || !voice || !content) return null;
  const format = normalize(args.format) || "mp3";
  return `${clientId}|${voice}|${format}|${speedKey(args.speed)}|${content}`;
}

export function isDuplicateProviderRequest(args: {
  previousIdentity: unknown;
  nextIdentity: unknown;
}): boolean {
  const previous = String(args.previousIdentity ?? "").trim();
  const next = String(args.nextIdentity ?? "").trim();
  if (!previous || !next) return false;
  return previous === next;
}

/** signed URL 만료/오프라인 시 재사용·갱신·text-only fallback을 결정한다. */
export function resolveSignedUrlAction(args: {
  hasUrl: boolean;
  expired: boolean;
  canRefresh: boolean;
  online: boolean;
}): AmuSignedUrlAction {
  if (!args.hasUrl) {
    return args.canRefresh && args.online ? "refresh" : "text_only_fallback";
  }
  if (!args.expired) return "reuse";
  if (args.canRefresh && args.online) return "refresh";
  return "text_only_fallback";
}
