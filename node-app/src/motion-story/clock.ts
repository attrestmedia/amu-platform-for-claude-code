/**
 * Story 클럭 — 경과 시간 t 의 유일한 소유자.
 *
 * - 기본은 rAF + monotonic clock(`performance.now`).
 * - `getMasterTimeMs` 가 숫자를 돌려주면 그 값을 t 로 쓴다 (내레이션 오디오 `currentTime` = 마스터 클럭).
 *   null 이면 wall clock 으로 되돌아간다 (내레이션 없음·로드 실패 시 readingPace 재생).
 * - 장면 컴포넌트는 시간을 읽지 않는다. 이 클럭(웹) 또는 export driver 가 t 를 넘겨준다.
 */

export type StoryClockOptions = {
  onTick: (elapsedMs: number) => void;
  getMasterTimeMs?: () => number | null;
  rate?: number;
  now?: () => number;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
};

export type StoryClock = {
  play: () => void;
  pause: () => void;
  seek: (elapsedMs: number) => void;
  readonly elapsedMs: number;
  readonly playing: boolean;
  destroy: () => void;
};

export function createStoryClock(options: StoryClockOptions): StoryClock {
  const now = options.now ?? (() => performance.now());
  const requestFrame = options.requestFrame ?? ((callback: () => void) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle: number) => window.cancelAnimationFrame(handle));
  const rate = options.rate ?? 1;

  let base = 0;
  let startedAt = 0;
  let playing = false;
  let frame: number | null = null;
  let destroyed = false;

  const read = () => {
    const master = options.getMasterTimeMs?.();
    if (typeof master === "number" && Number.isFinite(master)) return master;
    return playing ? base + (now() - startedAt) * rate : base;
  };

  const loop = () => {
    frame = null;
    if (!playing || destroyed) return;
    options.onTick(read());
    frame = requestFrame(loop);
  };

  return {
    play() {
      if (playing || destroyed) return;
      playing = true;
      startedAt = now();
      frame = requestFrame(loop);
    },
    pause() {
      if (!playing) return;
      base = read();
      playing = false;
      if (frame !== null) cancelFrame(frame);
      frame = null;
    },
    seek(elapsedMs: number) {
      base = Math.max(0, elapsedMs);
      startedAt = now();
      options.onTick(base);
    },
    get elapsedMs() {
      return read();
    },
    get playing() {
      return playing;
    },
    destroy() {
      destroyed = true;
      playing = false;
      if (frame !== null) cancelFrame(frame);
      frame = null;
    },
  };
}
