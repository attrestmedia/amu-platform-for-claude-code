"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical } from "lucide-react";
import { Button, Dropdown } from "@amu-labs/ui";
import { cn } from "utils/common";

type BackActionType = {
  link?: string;
  onClick?: () => void;
  label: string;
  size?: "icon-sm" | "icon-md";
  iconSize?: "icon-xxs" | "icon-xs";
  className?: string;
};

type SubHeaderActionType = {
  icon: ReactNode;
  /** 접근성 라벨 (aria-label) */
  label: string;
  onClick?: () => void;
  /** 아이콘 우상단 포인트 뱃지 (알림 수 등) */
  badge?: number | string;
  disabled?: boolean;
  className?: string;
  ref?: React.Ref<HTMLButtonElement>;
};

type SubHeaderMoreMenuItemType = {
  value: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
};

type SubHeaderProps = {
  /** 뒤로가기 버튼. link 또는 onClick 중 하나 */
  backAction: BackActionType | null;
  /** 제목 콘텐츠 (string, <Lang>, ReactNode 모두 가능) */
  title: ReactNode;
  /** 제목 시맨틱 태그. 시트/다이얼로그처럼 자체 타이틀 노드를 넘길 때 "div" */
  titleAs?: "h1" | "div";
  /** 제목 옆 아이콘 */
  icon?: ReactNode;
  /** 제목 아래 설명문 (보조 텍스트) */
  description?: ReactNode;

  /** 아이콘 액션 버튼 영역 (가이드 3·4번: 액션 버튼 + 알림 뱃지) */
  actions?: SubHeaderActionType[];
  /** 더보기(⋮) 메뉴 아이템 (가이드 5번: 추가 기능 팝업) */
  moreMenu?: SubHeaderMoreMenuItemType[];
  moreMenuLabel?: string;
  onMoreSelect?: (value: string) => void;

  /** 우측 액션 영역 확장 슬롯 (버튼 그룹 등). actions보다 우측에 렌더링 */
  right?: ReactNode;

  /** 페이지 상단 스티키 모드 (배경 블러 + 하단 1px 구분선 + 좌우 1rem 패딩) */
  sticky?: boolean;
  /** @deprecated 이전 버전 호환용. 제목·설명문은 항상 세로 스택으로 정렬된다 */
  align?: "start" | "center";
  /** 컨테이너 추가 클래스 (여백 등) */
  className?: string;
};

/** 공통 서브 헤더 타이틀 스타일 — 시트 헤더 등 외부에서도 재사용 */
export const SUB_HEADER_TITLE_CLASS =
  "block min-w-0 flex-1 truncate text-base font-semibold leading-5 text-primary-text";

/** 공통 서브 헤더 보조 텍스트 스타일 */
export const SUB_HEADER_DESCRIPTION_CLASS = "mt-0.5 text-xs leading-4 text-secondary-text";

const HEADER_HEIGHT_CLASS = "h-14 sm:h-16";
/**
 * 보더리스 아이콘 액션 공통 패턴 — 뒤로가기·액션·overflow 모두 동일 적용.
 * 시각 2.5rem(icon-md) + after 히트 슬롭으로 2.75rem+ 터치 영역 확보,
 * neutral 전경 유지(ghost hover의 text-white 반전을 되돌려 라이트 테마 가독성 확보).
 */
const ICON_ACTION_BASE_CLASS =
  "relative shrink-0 text-primary-text active:text-primary-text md:hover:text-primary-text after:absolute after:-inset-1 after:content-['']";
const ACTION_ICON_CLASS = "icon-xs";

/**
 * @docHint
 * @purpose 페이지·시트 상단의 서브 헤더 공통 컴포넌트. 가이드 기본 구조(뒤로가기 → 제목·역할 →
 *          액션 버튼 → 알림 뱃지 → 더보기 메뉴)를 내장하며, 우측 확장이 필요하면 right 슬롯을 쓴다.
 *          높이 3.5rem(모바일)/4rem(데스크톱), 타이틀 1rem semibold, 보조 텍스트 0.75rem,
 *          액션 아이콘 1.25rem·터치 영역 2.75rem+, 스티키 모드에서 배경 블러와 1px 구분선을 적용한다.
 *          뒤로가기·액션·overflow 아이콘 버튼은 모두 보더리스 공통 패턴(ICON_ACTION_BASE_CLASS)으로
 *          투명 기본 상태 + muted 계열 hover를 사용한다 — 가이드 §11 아이콘 버튼 상태 규칙.
 */
export function SubHeader({
  backAction,
  title,
  titleAs = "h1",
  icon,
  description,
  actions,
  moreMenu,
  moreMenuLabel,
  onMoreSelect,
  right,
  sticky = false,
  className,
}: SubHeaderProps) {
  const router = useRouter();
  const TitleTag = titleAs === "div" ? "div" : "h1";
  const dangerMenuValues = useMemo(
    () => new Set((moreMenu ?? []).filter((item) => item.danger).map((item) => item.value)),
    [moreMenu],
  );
  const hasRightContent = Boolean(right) || (actions && actions.length > 0) || Boolean(moreMenu?.length);

  return (
    <header
      className={cn(
        "flex w-full gap-2 border-b border-border bg-surface/95 backdrop-blur px-2 z-30",
        sticky ? "sticky top-0 " : "relative",
        description ? "items-start py-3" : cn("items-center", HEADER_HEIGHT_CLASS),
        className,
      )}
    >
      {backAction ? (
        <Button
          variant="ghost"
          size={backAction.size ? backAction.size : "icon-md"}
          className={cn(ICON_ACTION_BASE_CLASS, backAction.className)}
          onClick={() => {
            if (backAction.onClick) {
              backAction.onClick();
            } else if (backAction.link) {
              router.push(backAction.link);
            }
          }}
          aria-label={backAction.label}
        >
          <ChevronLeft className={backAction.iconSize ? backAction.iconSize : "icon-sm"} />
        </Button>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex items-center gap-2">
          {icon}
          <TitleTag className={SUB_HEADER_TITLE_CLASS}>{title}</TitleTag>
        </div>
        {description ? <p className={SUB_HEADER_DESCRIPTION_CLASS}>{description}</p> : null}
      </div>

      {hasRightContent ? (
        <div className="flex min-w-0 items-center sm:gap-2">
          {actions?.map((action, index) => (
            <Button
              key={`${action.label}-${index}`}
              ref={action.ref}
              variant="ghost"
              size="icon-md"
              className={cn(ICON_ACTION_BASE_CLASS, action.className)}
              onClick={action.onClick}
              aria-label={action.label}
              disabled={action.disabled}
            >
              <span className={cn(ACTION_ICON_CLASS, "flex items-center justify-center")} aria-hidden="true">
                {action.icon}
              </span>
              {action.badge !== undefined && action.badge !== 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-button-text">
                  {action.badge}
                </span>
              ) : null}
            </Button>
          ))}

          {moreMenu?.length ? (
            <Dropdown
              variant="ghost"
              options={moreMenu.map((item) => ({
                value: item.value,
                label: item.label,
                disabled: item.disabled,
                dividerBefore: item.dividerBefore,
              }))}
              selected={null}
              onSelect={(value) => onMoreSelect?.(value)}
              renderTrigger={() => <MoreVertical className={ACTION_ICON_CLASS} aria-hidden="true" />}
              hideArrow
              openPortal
              openSide="bottom"
              contentAlign="end"
              contentSideOffset={8}
              triggerAriaLabel={moreMenuLabel}
              className={cn("h-10 w-10 shrink-0 justify-center border-0 bg-transparent p-0", ICON_ACTION_BASE_CLASS)}
              dropdownClassName="min-w-44 rounded-xl border-border p-1 shadow-xl"
              itemClassName={(option) =>
                dangerMenuValues.has(option.value)
                  ? "rounded-lg text-danger focus:bg-danger/10 focus:text-danger"
                  : "rounded-lg"
              }
            />
          ) : null}

          {right}
        </div>
      ) : null}
    </header>
  );
}

export default SubHeader;
