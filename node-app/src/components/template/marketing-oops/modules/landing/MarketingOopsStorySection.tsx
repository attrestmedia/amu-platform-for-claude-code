import { Lang } from "components/module/i18n";
import { MarketingOopsSeal, MarketingOopsSymbol } from "../brand";
import { MARKETING_OOPS_STORY_COPY } from "./marketingOopsLandingContent";

/**
 * ② Oops 스트립 — 맥락.
 *
 * 브랜드명이 장난스러운 이유를 한 블록에서 끝낸다. 이유를 설명하지 않으면
 * 가벼워 보이기만 하고 신뢰로 전환되지 않는다.
 *
 * 랜딩에서 일러스트는 이 마스코트 하나만 쓴다. 카드마다 일러스트를 넣으면
 * 로고의 조형 문법(외곽선 + 하드 섀도)과 경쟁하는 두 번째 문법이 생긴다.
 */
export function MarketingOopsStorySection() {
  return (
    <section className="border-b border-border/60 bg-surface-2">
      <div className="container mx-auto flex max-w-6xl flex-col items-center gap-8 px-5 py-14 text-center md:px-8 lg:flex-row lg:gap-14 lg:py-16 lg:text-left">
        <div className="relative shrink-0">
          <MarketingOopsSymbol className="w-28 sm:w-32" decorative />
          <MarketingOopsSeal className="absolute -bottom-4 -right-6 w-16 -rotate-12 sm:w-20" />
        </div>

        <div>
          <h2 className="text-2xl font-black leading-snug tracking-tight [word-break:keep-all] sm:text-3xl lg:text-4xl">
            <Lang text={MARKETING_OOPS_STORY_COPY.headline} />
          </h2>
          <p className="mt-4 text-base leading-7 text-secondary-text [word-break:keep-all] sm:text-lg">
            <Lang text={MARKETING_OOPS_STORY_COPY.lead} />
          </p>
        </div>
      </div>
    </section>
  );
}
