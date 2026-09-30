"use client";

import Image from "next/image";
import { Lang } from "components/module/i18n";
import {
  TUTORS_CONVERSATION_COPY,
  TUTORS_DEMO_TURNS,
  TUTORS_LANDING_IMAGES,
  TUTORS_PERSONA_COPY,
} from "./tutorsLandingContent";

/**
 * 설명 구간 두 섹션.
 *  1) 대화 경험 — 실제 대화 화면(풀블리드 인물 + 오버레이 대화)의 시각 언어를 지면에서 먼저 보여준다.
 *  2) 나만의 튜터 — Tutors만의 차별점인 페르소나 소유를 정체성 필드로 드러낸다.
 * 두 섹션 모두 카드 컨테이너를 쓰지 않는다(클릭 대상이 아니다).
 */
export default function TutorsLandingExperience() {
  return (
    <>
      {/* ── 대화 경험 ── */}
      <section className="mx-auto w-full max-w-[75rem] px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          {/* 실제 대화 화면과 같은 구성 — 인물 위에 대화가 얹힌다 */}
          <div className="relative mx-auto w-full max-w-[24rem] overflow-hidden rounded-[2rem]">
            <Image
              src={TUTORS_LANDING_IMAGES.conversation}
              alt=""
              width={1152}
              height={1536}
              sizes="(min-width: 768px) 24rem, 100vw"
              className="h-auto w-full object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/5"
              style={{ background: "linear-gradient(to bottom, transparent, var(--background))" }}
            />
            <div className="absolute inset-x-5 bottom-6 flex flex-col gap-2">
              {TUTORS_DEMO_TURNS.map((turn, i) => {
                if (turn.role === "learner") {
                  return (
                    <p
                      key={i}
                      className="self-end rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm"
                    >
                      {turn.text}
                    </p>
                  );
                }
                if (turn.role === "correction") {
                  return (
                    <div
                      key={i}
                      className="self-start rounded-2xl rounded-bl-md bg-surface px-4 py-2.5 text-sm shadow-sm ring-1 ring-primary/25"
                    >
                      <p className="font-semibold text-primary">{turn.text}</p>
                      <p className="mt-1 text-xs text-secondary-text [word-break:keep-all]">
                        <Lang text={turn.note} />
                      </p>
                    </div>
                  );
                }
                return (
                  <p key={i} className="self-start rounded-2xl rounded-bl-md bg-surface px-4 py-2.5 text-sm shadow-sm">
                    {turn.text}
                  </p>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xxs font-bold uppercase tracking-[0.16em] text-primary">
              <Lang text={TUTORS_CONVERSATION_COPY.eyebrow} />
            </p>
            <h2 className="mt-4 whitespace-pre-line text-3xl font-extrabold leading-[1.22] tracking-tight [word-break:keep-all] sm:text-4xl">
              <Lang text={TUTORS_CONVERSATION_COPY.headline} />
            </h2>
            <p className="mt-5 max-w-[26rem] text-base leading-relaxed text-secondary-text [word-break:keep-all]">
              <Lang text={TUTORS_CONVERSATION_COPY.lead} />
            </p>
          </div>
        </div>
      </section>

      {/* ── 나만의 튜터 (페르소나) ── */}
      <section className="mx-auto w-full max-w-[75rem] px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="border-t border-border pt-16 sm:pt-20">
          <div className="grid gap-10 md:grid-cols-2 md:gap-16">
            <div>
              <p className="text-xxs font-bold uppercase tracking-[0.16em] text-primary">
                <Lang text={TUTORS_PERSONA_COPY.eyebrow} />
              </p>
              <h2 className="mt-4 whitespace-pre-line text-3xl font-extrabold leading-[1.22] tracking-tight [word-break:keep-all] sm:text-4xl">
                <Lang text={TUTORS_PERSONA_COPY.headline} />
              </h2>
            </div>
            <div>
              <p className="max-w-[26rem] text-base leading-relaxed text-secondary-text [word-break:keep-all]">
                <Lang text={TUTORS_PERSONA_COPY.lead} />
              </p>
              {/* 정체성 필드 — 칩이 아니라 얇은 구분선으로 나열한다 */}
              <ul className="mt-8 grid grid-cols-2 gap-x-8 sm:grid-cols-4 md:grid-cols-2">
                {TUTORS_PERSONA_COPY.fields.map((field, i) => (
                  <li key={i} className="border-b border-border py-3 text-sm font-semibold">
                    <Lang text={field} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
