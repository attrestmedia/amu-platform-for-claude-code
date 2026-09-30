import { ArrowRight } from "lucide-react";
import { Lang } from "components/module/i18n";
import { MARKETING_OOPS_DIFFERENCE_COPY } from "./marketingOopsLandingContent";

/**
 * ④ 무엇이 다른가 — 신뢰.
 *
 * 근거 없는 후기·고객 로고·사용자 수를 쓰지 않고 신뢰를 만드는 유일한 방법은 대조다.
 * 좌변은 일반적인 도구 범주, 우변은 현재 구현된 Marketing Oops의 범위다.
 * 우변에 로드맵 항목(다음 행동 추천 등)을 쓰지 않는다 — Charter §11.
 */
export function MarketingOopsDifferenceSection() {
  return (
    <section className="border-b border-border/60 bg-surface-2">
      <div className="container mx-auto max-w-6xl px-5 py-16 md:px-8">
        <h2 className="max-w-3xl whitespace-pre-line text-2xl font-black leading-snug tracking-tight [word-break:keep-all] sm:text-3xl lg:text-4xl">
          <Lang text={MARKETING_OOPS_DIFFERENCE_COPY.headline} />
        </h2>

        <dl className="mt-10 divide-y divide-border border-y border-border">
          {MARKETING_OOPS_DIFFERENCE_COPY.rows.map((row) => (
            <div key={row.oops.en} className="grid items-center text-center gap-2 py-2 sm:grid-cols-[1fr_auto_1.2fr]">
              <dt className="text-base text-secondary-text bg-surface/40 rounded-full px-4 py-3 [word-break:keep-all] rounded-full">
                <Lang text={row.other} />
              </dt>
              <ArrowRight className="hidden h-5 w-5 shrink-0 text-secondary sm:block" aria-hidden="true" />
              <dd className="text-base font-bold text-white bg-primary-sub rounded-full px-4 py-3 [word-break:keep-all] sm:text-lg">
                <Lang text={row.oops} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
