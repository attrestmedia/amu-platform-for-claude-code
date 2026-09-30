"use client";

import type { ReactNode } from "react";
import { lang } from "components/module/i18n";
import { cn } from "utils/common";

/** 콘텐츠 고유 입력·참고 자료·설정 표현을 담는 영역. 값과 mutation은 상위 adapter가 소유한다. */
export function ContentStudioForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn(className)} data-amu-gen-studio-region="form" aria-label={lang({ ko: "콘텐츠 설정", en: "Content settings" })}>
      {children}
    </section>
  );
}
