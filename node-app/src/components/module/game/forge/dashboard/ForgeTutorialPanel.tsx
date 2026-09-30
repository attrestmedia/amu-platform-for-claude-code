"use client";

import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { Lang } from "components/module/i18n";

const GUIDE_LINKS = [
  { label: { ko: "캐릭터 등록 가이드", en: "Registering a character" }, href: "/assets-studio/character" },
  { label: { ko: "월드 에셋 생성 가이드", en: "Generating world assets" }, href: "/assets-studio/world" },
  { label: { ko: "맵 만들기 가이드", en: "Building a map" }, href: "/assets-studio/map" },
];

/** 튜토리얼 & 팁 패널 — Q5 미해결로 영상 대신 문서 링크 폴백을 렌더한다. */
export function ForgeTutorialPanel() {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-[15px] font-bold text-primary-text">
        <Lang text={{ ko: "튜토리얼 & 팁", en: "Tutorials & tips" }} />
      </h2>

      <div className="mt-3 flex flex-col">
        {GUIDE_LINKS.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium text-secondary-text hover:bg-surface-2 hover:text-primary-text"
          >
            <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
            <Lang text={guide.label} />
          </Link>
        ))}
      </div>

      <Link
        href="/assets-studio/library/characters"
        className="mt-3 flex h-10 w-full items-center justify-center gap-1 rounded-[10px] border border-border text-[13px] font-medium text-primary-text hover:bg-surface-2"
      >
        <Lang text={{ ko: "더 많은 가이드 보기", en: "See more guides" }} />
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
