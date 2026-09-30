"use client";

import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { trackPlayEvent } from "utils/analytics/play";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import type { ForgeLocalizedText } from "../../model/forgeGlossary";

/**
 * 5단계 레일 카드의 공통 프레임 — 헤더(번호 배지 + 제목) + 설명 + 미리보기 슬롯 + 하단 CTA.
 * 카드 전체가 링크가 아니라 하단 CTA 버튼만 링크다(카드 내부에 조작 요소가 있으므로 중첩 링크 금지).
 */
export function StepCardFrame({
  step,
  title,
  description,
  cta,
  href,
  ctaGlyph,
  children,
}: {
  step: number;
  title: ForgeLocalizedText;
  description: ForgeLocalizedText;
  cta: ForgeLocalizedText;
  href: string;
  ctaGlyph?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();

  const openStep = () => {
    trackPlayEvent("forge_step_open", { universeId: DEFAULT_PLAY_UNIVERSE, stepId: `step${step}` });
    router.push(href);
  };

  return (
    <div className="flex h-full flex-col rounded-[14px] border border-border bg-surface p-[18px] transition-[border-color,transform] duration-[180ms] hover:-translate-y-0.5 hover:border-border-hover motion-reduce:transform-none">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">
          {step}
        </span>
        <h2 className="text-[15px] font-bold text-primary-text">
          <Lang text={title} />
        </h2>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-[1.6] text-secondary-text">
        <Lang text={description} />
      </p>

      <div className="mt-3.5 flex-1">{children}</div>

      <Button
        className="mt-3.5 h-[42px] w-full rounded-[10px] text-[13px] font-semibold"
        onClick={openStep}
      >
        <Lang text={cta} />
        {ctaGlyph}
      </Button>
    </div>
  );
}
