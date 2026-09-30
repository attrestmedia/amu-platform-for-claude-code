"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lang, lang } from "components/module/i18n";
import type { MagazineNarrationPlayback } from "libs/server-utils/magazine/magazineNarrationContract";

type Props = {
  narration: MagazineNarrationPlayback;
};

function formatTime(valueMs: number) {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function segmentOffset(segments: MagazineNarrationPlayback["segments"], index: number) {
  return segments.slice(0, index).reduce((sum, segment) => sum + segment.durationMs + segment.silenceAfterMs, 0);
}

export default function AppMagazineNarrationPlayer({ narration }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackSessionRef = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [error, setError] = useState("");

  const segment = narration.segments[segmentIndex];
  const currentOffsetMs = segmentOffset(narration.segments, segmentIndex);
  const overallTimeMs = Math.min(narration.playlist.totalDurationMs, currentOffsetMs + currentTimeMs);
  const progress = narration.playlist.totalDurationMs > 0
    ? Math.min(100, Math.round((overallTimeMs / narration.playlist.totalDurationMs) * 100))
    : 0;
  const statusText = useMemo(() => {
    if (error) return error;
    if (isPlaying) return lang({ ko: `재생 중 · ${segmentIndex + 1}/${narration.segments.length}`, en: `Playing · ${segmentIndex + 1}/${narration.segments.length}` });
    return lang({ ko: "재생 대기", en: "Ready to play" });
  }, [error, isPlaying, narration.segments.length, segmentIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !segment) return;
    audio.playbackRate = playbackRate;
    if (audio.src !== segment.url) {
      audio.src = segment.url;
      audio.load();
    }
  }, [playbackRate, segment]);

  const clearTransitionTimer = () => {
    if (transitionTimerRef.current === null) return;
    window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
  };

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
  }, []);

  const playSegment = async (nextIndex: number) => {
    const audio = audioRef.current;
    const nextSegment = narration.segments[nextIndex];
    if (!audio || !nextSegment) return;
    clearTransitionTimer();
    setError("");
    playbackSessionRef.current = true;
    audio.playbackRate = playbackRate;
    setSegmentIndex(nextIndex);
    if (audio.src !== nextSegment.url) {
      audio.src = nextSegment.url;
      audio.load();
    }
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setError(lang({ ko: "오디오를 재생하지 못했습니다. 다시 시도해 주세요.", en: "Audio could not be played. Please try again." }));
    }
  };

  const scheduleSegment = (nextIndex: number, delayMs: number) => {
    clearTransitionTimer();
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      void playSegment(nextIndex);
    }, Math.max(0, delayMs));
  };

  const playCurrentSegment = () => playSegment(segmentIndex);

  const pause = () => {
    clearTransitionTimer();
    audioRef.current?.pause();
    setIsPlaying(false);
    playbackSessionRef.current = false;
  };

  const selectSegment = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= narration.segments.length) return;
    clearTransitionTimer();
    setSegmentIndex(nextIndex);
    setCurrentTimeMs(0);
    setError("");
    if (playbackSessionRef.current) {
      scheduleSegment(nextIndex, 0);
    }
  };

  const handleEnded = () => {
    const nextIndex = segmentIndex + 1;
    if (!playbackSessionRef.current || nextIndex >= narration.segments.length) {
      clearTransitionTimer();
      setIsPlaying(false);
      playbackSessionRef.current = false;
      return;
    }
    setSegmentIndex(nextIndex);
    setCurrentTimeMs(0);
    const silenceAfterMs = Math.max(0, Number(narration.segments[segmentIndex]?.silenceAfterMs || 0));
    scheduleSegment(nextIndex, silenceAfterMs);
  };

  if (!segment) return null;

  return (
    <section
      aria-labelledby="magazine-narration-heading"
      className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-5"
      data-magazine-narration="published"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary-text">
            <Lang text={{ ko: "기사 내레이션", en: "Article narration" }} />
          </p>
          <h2 id="magazine-narration-heading" className="mt-1 text-base font-semibold text-primary-text">
            <Lang text={{ ko: "읽으면서 들을 수 있어요", en: "Listen while you read" }} />
          </h2>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-secondary-text">
          <Lang text={{ ko: "자동 재생 없음", en: "No autoplay" }} />
        </span>
      </div>

      <audio
        ref={audioRef}
        controls
        preload="metadata"
        className="mt-4 w-full"
        aria-label={lang({ ko: "기사 내레이션 오디오", en: "Article narration audio" })}
        onTimeUpdate={(event) => setCurrentTimeMs(event.currentTarget.currentTime * 1000)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          const endedNaturally = Boolean(audioRef.current?.ended && playbackSessionRef.current);
          if (!endedNaturally) {
            clearTransitionTimer();
            playbackSessionRef.current = false;
          }
          setIsPlaying(endedNaturally);
        }}
        onEnded={handleEnded}
        onError={() => setError(lang({ ko: "오디오 파일을 불러오지 못했습니다.", en: "The audio file could not be loaded." }))}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (isPlaying ? pause() : void playCurrentSegment())}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
          aria-label={isPlaying ? lang({ ko: "내레이션 일시정지", en: "Pause narration" }) : lang({ ko: "내레이션 재생", en: "Play narration" })}
        >
          {isPlaying ? <Lang text={{ ko: "일시정지", en: "Pause" }} /> : <Lang text={{ ko: "재생", en: "Play" }} />}
        </button>
        <button
          type="button"
          onClick={() => selectSegment(Math.max(0, segmentIndex - 1))}
          disabled={segmentIndex === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm text-primary-text transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <Lang text={{ ko: "이전", en: "Previous" }} />
        </button>
        <button
          type="button"
          onClick={() => selectSegment(Math.min(narration.segments.length - 1, segmentIndex + 1))}
          disabled={segmentIndex === narration.segments.length - 1}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm text-primary-text transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <Lang text={{ ko: "다음", en: "Next" }} />
        </button>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-sm text-primary-text">
          <span><Lang text={{ ko: "속도", en: "Speed" }} /></span>
          <select
            value={playbackRate}
            onChange={(event) => setPlaybackRate(Number(event.target.value))}
            className="min-h-9 rounded-md bg-background px-1 text-sm text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={lang({ ko: "재생 속도", en: "Playback speed" })}
          >
            {[0.8, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-secondary-text" aria-live="polite">
        <span>{statusText}</span>
        <span>{formatTime(overallTimeMs)} / {formatTime(narration.playlist.totalDurationMs)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={lang({ ko: "내레이션 진행률", en: "Narration progress" })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-4 grid gap-2" aria-label={lang({ ko: "내레이션 구간", en: "Narration segments" })}>
        {narration.segments.map((item, index) => (
          <button
            key={item.assetId}
            type="button"
            onClick={() => selectSegment(index)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none ${index === segmentIndex ? "border-primary bg-muted text-primary-text" : "border-border text-secondary-text hover:bg-muted/60"}`}
            aria-current={index === segmentIndex ? "true" : undefined}
          >
            <span className="mr-2 font-semibold">{index + 1}</span>
            <span>{item.text}</span>
          </button>
        ))}
      </div>

      <details className="mt-4 rounded-xl border border-border px-3 py-2">
        <summary className="cursor-pointer py-2 text-sm font-semibold text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Lang text={{ ko: "원문 텍스트 보기", en: "Show original text" }} />
        </summary>
        <div className="space-y-3 pb-2 pt-2 text-sm leading-6 text-secondary-text">
          {narration.segments.map((item) => <p key={`${item.assetId}-transcript`}>{item.text}</p>)}
        </div>
      </details>
    </section>
  );
}
