"use client";

import type { ComponentProps } from "react";
import { PageSheetHeader } from "components/module/layout";
import { lang } from "components/module/i18n";

type ContentStudioHeaderProps = {
  title: string;
  onClose: () => void;
  actions?: ComponentProps<typeof PageSheetHeader>["actions"];
  moreMenu?: ComponentProps<typeof PageSheetHeader>["moreMenu"];
  moreMenuLabel?: string;
  onMoreSelect?: ComponentProps<typeof PageSheetHeader>["onMoreSelect"];
  titleAs?: "page" | "sheet";
  articleContext?: { title: string; question: string };
};

/** 콘텐츠 생성의 위치·복귀·보조 문맥만 표현하는 헤더. 상태와 생성 orchestration은 소유하지 않는다. */
export function ContentStudioHeader({
  title,
  onClose,
  actions,
  moreMenu,
  moreMenuLabel,
  onMoreSelect,
  titleAs = "sheet",
  articleContext,
}: ContentStudioHeaderProps) {
  return (
    <>
      <PageSheetHeader
        title={title}
        onClose={onClose}
        actions={actions}
        moreMenu={moreMenu}
        moreMenuLabel={moreMenuLabel}
        onMoreSelect={onMoreSelect}
        titleAs={titleAs}
      />
      {articleContext ? (
        <aside
          className="mx-4 mt-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm sm:mx-6"
          data-amu-article-context
          aria-label={lang({ ko: "기사 문맥", en: "Article context" })}
        >
          <p className="font-semibold text-primary-text">{articleContext.title}</p>
          <p className="mt-1 leading-6 text-secondary-text">{articleContext.question}</p>
        </aside>
      ) : null}
    </>
  );
}

export type { ContentStudioHeaderProps };
