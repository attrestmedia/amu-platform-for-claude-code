"use client";

import React from "react";
import { SheetHeader, SheetTitle } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { SubHeader, SUB_HEADER_TITLE_CLASS } from "components/module/common";

interface HeaderAction {
  label: string | React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

interface HeaderMoreMenuItem {
  value: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

interface PresetSheetHeaderProps {
  title: string;
  onClose: () => void;
  actions?: HeaderAction[];
  endSlot?: React.ReactNode;
  /** 더보기(⋮) 메뉴 아이템 — 공통 SubHeader moreMenu 정본 패턴 위임 */
  moreMenu?: HeaderMoreMenuItem[];
  moreMenuLabel?: string;
  onMoreSelect?: (value: string) => void;
  titleAs?: "sheet" | "page";
}

/**
 * @docHint
 * @purpose 시트/페이지 프리셋 헤더. 렌더링은 공통 SubHeader 모듈에 위임해 스타일을 통일하고,
 *          titleAs="sheet"일 때만 Radix 접근성을 위해 SheetTitle을 유지한다.
 */
export function PageSheetHeader({
  title,
  onClose,
  actions,
  endSlot,
  moreMenu,
  moreMenuLabel,
  onMoreSelect,
  titleAs = "sheet",
}: PresetSheetHeaderProps) {
  return (
    <SheetHeader className="relative z-10 shrink-0 border-b border-border bg-card p-0">
      <SubHeader
        backAction={{ onClick: onClose, label: lang({ ko: "이전 화면", en: "Back" }) }}
        titleAs={titleAs === "page" ? "h1" : "div"}
        title={titleAs === "page" ? title : <SheetTitle className={SUB_HEADER_TITLE_CLASS}>{title}</SheetTitle>}
        actions={actions?.map((action, index) => ({
          icon: action.label,
          label: action.ariaLabel ?? (typeof action.label === "string" ? action.label : `action-${index}`),
          onClick: action.onClick,
          disabled: action.disabled,
          className: action.className,
          ref: action.ref,
        }))}
        moreMenu={moreMenu}
        moreMenuLabel={moreMenuLabel}
        onMoreSelect={onMoreSelect}
        right={endSlot}
      />
    </SheetHeader>
  );
}
