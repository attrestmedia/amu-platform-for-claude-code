import React from "react";
import Link from "next/link";
import { AmuSimbol, AmuLogo } from "@amu-labs/ui/icons/brand/amu";
import { cn } from "utils/common";

export type AuthSplitLayoutProps = {
  /** h1 내용. 페이지마다 다르다 */
  title: React.ReactNode;
  /** h1 의 id. 루트 <main> 의 aria-labelledby 가 이 값을 가리킨다 */
  titleId: string;
  /** h1 아래 보조 문장 */
  description?: React.ReactNode;
  /** 기능 카드 등 보조 블록. 모바일에서는 폼 아래로 내려간다 */
  aside?: React.ReactNode;
  /** 폼 영역 위 안내문 */
  formLabel?: React.ReactNode;
  /** 폼 영역 본문 */
  children: React.ReactNode;
  /** 약관 등 폼 하단 고지 */
  footer?: React.ReactNode;
};

/**
 * 인증 페이지군(/login · /signup)의 공통 좌우 분할 레이아웃.
 * 모바일(< 1024px)에서는 브랜드 헤더 → 폼 → aside 순서의 1컬럼,
 * 데스크톱(>= 1024px)에서는 좌(브랜드 + aside) · 우(폼) 2컬럼이다.
 * Template 계층이므로 데이터 조회·권한 판정·URL 파라미터 해석을 하지 않는다.
 */
export function AuthSplitLayout({
  title,
  titleId,
  description,
  aside,
  formLabel,
  children,
  footer,
}: AuthSplitLayoutProps) {
  return (
    <main aria-labelledby={titleId} className="flex flex-col min-h-[100dvh] bg-background text-primary-text">
      {/* 브랜드 헤더 — 모바일 order-1, 데스크톱 좌열. aside가 없으면 폼과 같은 높이로 행을 채워 상하 중앙 정렬한다 */}
      <section
        className={cn(
          "relative order-1 flex flex-col justify-center overflow-hidden bg-primary px-6 py-8 lg:col-start-1 lg:row-start-1 lg:px-16 lg:py-12",
          !aside && "lg:row-span-2",
        )}
      >
        <div className="absolute inset-0 bg-background" />
        <div className="relative z-10 mx-auto w-full max-w-md text-center">
          <Link href="/" className="flex flex-col min-h-11 items-center gap-3">
            <AmuSimbol width={40} height={40} />
            <AmuLogo width={100} className="relative top-[2px]" />
          </Link>
          <h1
            id={titleId}
            className="mt-4 whitespace-pre-line text-3xl font-bold leading-tight text-primary-text lg:mt-8 lg:text-4xl"
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-sm leading-snug text-secondary-text lg:mt-4 lg:text-base lg:leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
      </section>

      {/* 폼 영역 — 모바일 order-2, 데스크톱 우열 전체 */}
      <section className="order-2 flex items-center justify-center border border-border px-6 py-10 w-[20rem] mx-auto rounded-2xl">
        <div className="w-full max-w-sm">
          {formLabel ? <div className="mb-6">{formLabel}</div> : null}
          {children}
          {footer ? <div className="mt-8 text-center">{footer}</div> : null}
        </div>
      </section>

      {/* aside — 모바일 order-3(폼 아래), 데스크톱 좌열 하단 */}
      {aside ? (
        <section className="order-3 flex items-center px-6 py-8 lg:col-start-1 lg:row-start-2 lg:px-16 lg:pb-12">
          <div className="mx-auto w-full max-w-md">{aside}</div>
        </section>
      ) : null}
    </main>
  );
}
