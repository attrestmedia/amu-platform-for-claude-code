"use client";

import { Lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import { ArrowRight } from "lucide-react";
import { TUTORS_CLOSING_COPY, TUTORS_PRESET_COPY } from "./tutorsLandingContent";

type Props = { onStart: () => void };

/**
 * 전환 구간 두 섹션.
 *  1) 프리셋 — 클릭 대상이므로 카드 컨테이너를 쓴다(카드 허용 예외).
 *  2) 마감 CTA — 1축 1CTA를 유지하고 무료 범위와 코인 차감 시점을 함께 밝힌다(Charter §6.2).
 */
export default function TutorsLandingActions({ onStart }: Props) {
  return (
    <>
      {/* ── 프리셋 ── */}
      <section className="mx-auto w-full max-w-[75rem] px-5 pb-20 sm:px-8 sm:pb-28">
        <p className="text-xxs font-bold uppercase tracking-[0.16em] text-primary">
          <Lang text={TUTORS_PRESET_COPY.eyebrow} />
        </p>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight [word-break:keep-all] sm:text-4xl">
          <Lang text={TUTORS_PRESET_COPY.headline} />
        </h2>
        <p className="mt-4 max-w-[32rem] text-base leading-relaxed text-secondary-text [word-break:keep-all]">
          <Lang text={TUTORS_PRESET_COPY.lead} />
        </p>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TUTORS_PRESET_COPY.presets.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={onStart}
                className="group flex h-full w-full flex-col rounded-2xl bg-surface p-6 text-left ring-1 ring-border transition-all duration-200 hover:-translate-y-0.5 hover:ring-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:hover:translate-y-0"
              >
                <span className="text-base font-bold">
                  <Lang text={preset.label} />
                </span>
                <span className="mt-2 text-sm leading-relaxed text-secondary-text [word-break:keep-all]">
                  <Lang text={preset.description} />
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  <Lang text={TUTORS_CLOSING_COPY.cta} />
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 마감 CTA ── */}
      <section className="mx-auto w-full max-w-[75rem] px-5 pb-28 sm:px-8">
        <div className="border-t border-border pt-16 text-center sm:pt-20">
          <h2 className="text-3xl font-extrabold tracking-tight [word-break:keep-all] sm:text-4xl">
            <Lang text={TUTORS_CLOSING_COPY.headline} />
          </h2>
          <div className="mt-9 flex justify-center">
            <Button size="xl" rounded="full" onClick={onStart}>
              <Lang text={TUTORS_CLOSING_COPY.cta} />
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
          <p className="mx-auto mt-6 max-w-[32rem] text-sm leading-relaxed text-secondary-text [word-break:keep-all]">
            <Lang text={TUTORS_CLOSING_COPY.costNote} />
          </p>
        </div>
      </section>
    </>
  );
}
