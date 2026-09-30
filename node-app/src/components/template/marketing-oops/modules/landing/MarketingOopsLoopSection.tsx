import { Lang } from "components/module/i18n";
import { MARKETING_OOPS_LOOP_SECTION_ID, MARKETING_OOPS_LOOP_STEPS } from "./marketingOopsLandingContent";

/**
 * ③ 운영 루프 — 설명.
 *
 * 5단계를 워크스페이스의 실제 탭에 매핑해, 랜딩의 흐름도가 제품 구조와 같은 것임을 보인다.
 * 기존 히어로의 5단계 카드가 여기로 흡수되면서 카드 총량이 줄어든다.
 *
 * 로고 4색은 여기서 "단계 분류자"로만 쓴다 — 면색이며 텍스트에 쓰지 않는다.
 * 항목은 비인터랙티브이므로 카드·버튼처럼 보이지 않게 두고, 순서는 <ol>로 표현한다.
 */
export function MarketingOopsLoopSection() {
  return (
    <section id={MARKETING_OOPS_LOOP_SECTION_ID} className="scroll-mt-20 border-b border-border/60">
      <div className="container mx-auto max-w-6xl px-5 py-16 md:px-8">
        <h2 className="max-w-2xl text-2xl font-black leading-snug tracking-tight [word-break:keep-all] sm:text-3xl">
          <Lang
            text={{
              ko: "기획에서 측정까지, 같은 화면 안에서 이어집니다",
              en: "From planning to measurement, inside one workspace",
            }}
          />
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-secondary-text [word-break:keep-all]">
          <Lang
            text={{
              ko: "아래 다섯 단계는 설명용 도식이 아니라 워크스페이스의 실제 운영 탭입니다.",
              en: "These five stages are not an illustration — they are the workspace tabs.",
            }}
          />
        </p>

        <ol className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
          {MARKETING_OOPS_LOOP_STEPS.map((step, index) => (
            <li key={step.step.en} className="relative">
              <span
                className="block h-1.5 w-full rounded-full"
                style={{ backgroundColor: step.surface }}
                aria-hidden="true"
              />
              <p className="mt-4 text-xs font-bold tabular-nums text-secondary-text">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-lg font-black tracking-tight">
                <Lang text={step.step} />
              </h3>
              <p className="mt-1 text-xs font-semibold text-primary">
                <Lang text={step.tab} />
              </p>
              <p className="mt-3 text-sm leading-6 text-secondary-text [word-break:keep-all]">
                <Lang text={step.body} />
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
