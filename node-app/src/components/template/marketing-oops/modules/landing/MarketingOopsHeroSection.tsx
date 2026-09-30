"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import {
  MARKETING_OOPS_CTA_COPY,
  MARKETING_OOPS_HERO_COPY,
  MARKETING_OOPS_LOOP_SECTION_ID,
  MARKETING_OOPS_SCOPE_FACTS,
  MARKETING_OOPS_WORKSPACE_PREVIEW,
} from "./marketingOopsLandingContent";

/**
 * ① 히어로 — 정체성.
 *
 * 브랜드 시그널(로고) + 헤드라인 1 + 보조문장 1 + 1차 CTA 1 + 실제 제품 미리보기.
 * 우측은 다이어그램이 아니라 운영 화면 캡처다 — 랜딩의 시각 증거는 제품이어야 한다.
 *
 * 2열 전환은 lg(1024px)에서 일어난다. md(768px)에서 나누면 태블릿 세로에서
 * 미리보기 프레임이 과하게 좁아진다.
 */
export function MarketingOopsHeroSection({ canOpenWorkspace }: { canOpenWorkspace: boolean }) {
  const router = useRouter();

  return (
    <section className="border-b border-border/60">
      <div className="container mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        <div>
          <span className="mo-hard-sm mt-7 inline-flex items-center rounded-full bg-[var(--marketing-oops-badge)] px-3.5 py-1 text-xs font-bold text-accent-text">
            <Lang text={MARKETING_OOPS_HERO_COPY.status} />
          </span>

          <h1 className="mt-5 max-w-xl whitespace-pre-line text-4xl font-black leading-[1.15] tracking-tight [word-break:keep-all] sm:text-5xl lg:text-[3.5rem]">
            <Lang text={MARKETING_OOPS_HERO_COPY.headline} />
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-secondary-text [word-break:keep-all] sm:text-lg">
            <Lang text={MARKETING_OOPS_HERO_COPY.lead} />
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">
            {canOpenWorkspace ? (
              <>
                <Button
                  size="lg"
                  rounded="full"
                  className="mo-hard mo-hard-press focus-visible-ring"
                  onClick={() => router.push("/marketing-oops/workspace")}
                >
                  <Lang text={MARKETING_OOPS_CTA_COPY.openWorkspace} />
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  size="lg"
                  variant="text"
                  className="focus-visible-ring"
                  onClick={() => router.push("/marketing-oops/connections")}
                >
                  <Lang text={MARKETING_OOPS_CTA_COPY.connect} />
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" rounded="full" className="mo-hard mo-hard-press focus-visible-ring" asChild>
                  <Link href={`#${MARKETING_OOPS_LOOP_SECTION_ID}`}>
                    <Lang text={MARKETING_OOPS_CTA_COPY.explore} />
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <p className="max-w-xs text-sm leading-6 text-secondary-text [word-break:keep-all]">
                  <Lang text={MARKETING_OOPS_CTA_COPY.noAccessNote} />
                </p>
              </>
            )}
          </div>

          {/* 사용자 수가 아니라 다루는 범위 — 모두 코드 상수에서 파생된 값이다 */}
          <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-border pt-6">
            {MARKETING_OOPS_SCOPE_FACTS.map((fact) => (
              <div key={fact.label.en}>
                <dt className="text-xs font-semibold text-secondary-text">
                  <Lang text={fact.label} />
                </dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-primary">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 제품 미리보기 — 로고 조형(검정 외곽선 + 오프셋 하드 섀도)을 쓰는 3곳 중 하나 */}
        <div className="mx-auto w-full max-w-sm lg:max-w-none">
          <div className="mo-hard overflow-hidden rounded-2xl bg-surface">
            <div className="flex items-center gap-1.5 border-b-2 border-[var(--marketing-oops-ink)] bg-surface-2 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-secondary-sub" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--marketing-oops-badge)]" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
              <span className="ml-2 truncate text-xs font-semibold text-secondary-text">
                app.allmyuniverse.com/marketing-oops/workspace
              </span>
            </div>
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              <Image
                src={MARKETING_OOPS_WORKSPACE_PREVIEW}
                alt={lang(MARKETING_OOPS_HERO_COPY.previewAlt)}
                fill
                priority
                sizes="(min-width: 1024px) 40rem, (min-width: 640px) 24rem, 90vw"
                className="object-cover object-top"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
