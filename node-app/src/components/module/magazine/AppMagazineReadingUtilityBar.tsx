"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Lang, lang } from "components/module/i18n";

type Props = {
  title: string;
};

/**
 * @docHint
 * @purpose App Magazine Reading Mode의 얇은 utility bar와 문서 진행 표시
 * @process 아래로 읽을 때 후퇴·위로 돌아올 때 복귀하되 reduced-motion에서는 위치를 고정하고, 본문은 spacer로 가리지 않는다.
 * @domain magazine-content-experience
 * @scope article-surface
 */

export default function AppMagazineReadingUtilityBar({ title }: Props) {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    let frame = 0;
    const update = () => {
      frame = 0;
      const current = Math.max(0, window.scrollY);
      const scrollable = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      setProgress(scrollable > 0 ? Math.max(0, Math.min(100, Math.round((current / scrollable) * 100))) : 0);
      if (!reduceMotion) {
        const movingUp = current < lastScrollYRef.current;
        setVisible(current < 48 || movingUp);
      }
      lastScrollYRef.current = current;
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <nav
        aria-label={lang({ ko: "읽기 도구", en: "Reading tools" })}
        className={`fixed inset-x-0 top-0 z-40 h-14 border-b border-border bg-background/95 backdrop-blur transition-transform duration-200 motion-reduce:transform-none motion-reduce:transition-none ${visible ? "translate-y-0" : "-translate-y-full"}`}
      >
        <div className="mx-auto flex h-full max-w-3xl items-center gap-2 px-4">
          <Link
            href="/magazine/"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-primary-text hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={lang({ ko: "매거진 아카이브로 돌아가기", en: "Back to Magazine archive" })}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "AMU · 매거진", en: "AMU · Magazine" }} />
            <span className="ml-2 font-normal text-secondary-text">{title}</span>
          </span>
          <Link
            href="/?s="
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-secondary-text hover:bg-muted/40 hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={lang({ ko: "매거진 검색", en: "Search Magazine" })}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="h-0.5 bg-muted" aria-hidden="true">
          <div
            role="progressbar"
            aria-label={lang({ ko: "본문 읽기 진행률", en: "Article reading progress" })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </nav>
      <div className="h-14" aria-hidden="true" />
    </>
  );
}
