"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import {
  MARKETING_OOPS_CONNECT_COPY,
  MARKETING_OOPS_CTA_COPY,
  MARKETING_OOPS_LOOP_SECTION_ID,
} from "./marketingOopsLandingContent";

/**
 * ⑤ 연결 + CTA — 전환.
 *
 * 기존 feature 4카드 중 "Gen Studio 연동"·"채널 연결"이 여기로 흡수된다.
 * 나열하는 이름은 모두 실제 연동 대상이며(consts/marketing/queue.ts, uploadPolicy.ts),
 * 계획 중인 채널은 넣지 않는다.
 *
 * 하단 CTA는 히어로와 같은 권한 분기를 쓴다. 1차 CTA는 화면당 항상 1개다.
 */
export function MarketingOopsConnectSection({ canOpenWorkspace }: { canOpenWorkspace: boolean }) {
  const router = useRouter();

  return (
    <section className="container mx-auto max-w-6xl px-5 py-16 md:px-8">
      <h2 className="max-w-2xl text-2xl font-black leading-snug tracking-tight [word-break:keep-all] sm:text-3xl">
        <Lang text={MARKETING_OOPS_CONNECT_COPY.headline} />
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-7 text-secondary-text [word-break:keep-all]">
        <Lang text={MARKETING_OOPS_CONNECT_COPY.lead} />
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {MARKETING_OOPS_CONNECT_COPY.groups.map((group) => (
          <article key={group.title.en} className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="text-sm font-bold text-secondary-text">
              <Lang text={group.title} />
            </h3>
            <ul className="mt-4 space-y-2">
              {group.items.map((item) => (
                <li key={item} className="text-base font-semibold">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-border pt-10">
        {canOpenWorkspace ? (
          <>
            <Button
              size="xl"
              rounded="full"
              className="focus-visible-ring"
              onClick={() => router.push("/marketing-oops/workspace")}
            >
              <Lang text={MARKETING_OOPS_CTA_COPY.openWorkspace} />
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              size="xl"
              variant="text"
              className="focus-visible-ring"
              onClick={() => router.push("/marketing-oops/connections")}
            >
              <Lang text={MARKETING_OOPS_CTA_COPY.connect} />
            </Button>
          </>
        ) : (
          <>
            <Button size="xl" rounded="full" className="focus-visible-ring" asChild>
              <Link href={`#${MARKETING_OOPS_LOOP_SECTION_ID}`}>
                <Lang text={MARKETING_OOPS_CTA_COPY.explore} />
                <ArrowRight className="ml-2 icon-xs" aria-hidden="true" />
              </Link>
            </Button>
            <p className="max-w-xs text-sm leading-6 text-secondary-text [word-break:keep-all]">
              <Lang text={MARKETING_OOPS_CTA_COPY.noAccessNote} />
            </p>
          </>
        )}
      </div>
    </section>
  );
}
