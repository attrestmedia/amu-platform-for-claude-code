"use client";
import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Button } from "@amu-labs/ui";
import { LoginDialog } from "components/module/auth";
import { CoinBalance } from "../commerce";
import UserInfoEdit from "./UserInfoEdit";
import TopBarProfileControl from "./TopBarProfileControl";
import { GlobalNotificationCenter } from "components/module/notifications";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { Lang, lang } from "components/module/i18n";
import { OPEN_USER_PROFILE_EDIT_EVENT } from "consts/app/profile";
import { cn } from "utils/common";
import { useAdminUniverseLinks } from "hooks/admin";

type TopBarProps = {
  isLoggedIn: boolean; // 로그인 여부
  userName?: string; // 사용자 표시 이름
  canShowAdminButton?: boolean; // 어드민 버튼 표시 여부
  onAdminClick?: () => void; // 어드민 클릭 핸들러
  onLoginClick?: () => void; // 외부에서 로그인 처리하는 경우
  onLoginSuccess?: () => void; // 내부 로그인 성공 후 콜백
  logoutRedirectPage?: string;
  children?: ReactNode; // 브랜딩/로고 등
  className?: string;
  serviceAddon?: ReactNode;
  serviceName?: string; // 헤더가 적용된 서비스의 이름
  leading?: ReactNode;
  variant?: "default" | "workspace";
};

const PROFILE_EDIT_QUERY_PARAM = "profileEdit";

export function TopBar({
  isLoggedIn,
  userName,
  canShowAdminButton,
  onAdminClick,
  onLoginClick,
  onLoginSuccess,
  logoutRedirectPage,
  children,
  className = "",
  serviceAddon,
  serviceName,
  leading,
  variant = "default",
}: TopBarProps) {
  const { user, hasHydrated, isLogged } = useAuthStore();
  const { isOnboarded, userData, isLoading: isUserDataLoading, refetchUserData } = useUserData();
  const resolvedLoggedIn = isLoggedIn || isLogged();
  const { adminUniverses, isAdminUniverseLoading } = useAdminUniverseLinks(resolvedLoggedIn ? user?.id : null);

  const [isUserInfoEditOpen, setIsUserInfoEditOpen] = useState(false);
  const [openOnboarding, setOpenOnboarding] = useState(false);
  const [isUserPopoverOpen, setIsUserPopoverOpen] = useState(false);
  const [forceEditMode, setForceEditMode] = useState(false);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const onBoardingClosedRef = useRef(false);
  const profileEditRequestHandledRef = useRef(false);

  const resolvedUserName = userData?.userInfo?.name || userName || user?.name || lang({ ko: "사용자", en: "User" });

  // 로그인 완료시 자동 닫기는 LoginDialog 내부에서 처리

  // 로그인 다이얼로그 열기
  const openLoginDialog = () => {
    // 이미 로그인 상태면 열지 않음
    if (isLoggedIn || isLogged()) return;

    // 외부에서 로그인 처리를 강제하는 경우
    if (onLoginClick) {
      onLoginClick();
      return;
    }

    setIsLoginDialogOpen(true);
  };

  // Popover에서 편집 버튼 클릭 시
  const handleEditClick = useCallback(() => {
    setIsUserPopoverOpen(false); // Popover 닫기
    setForceEditMode(true); // 편집 모드로 강제
    void refetchUserData()
      .catch((error) => {
        console.error("사용자 데이터 새로고침 실패:", error);
      })
      .finally(() => setIsUserInfoEditOpen(true));
  }, [refetchUserData]);

  // 로그인 + 유저데이터 로드 후 온보딩 필요 여부 자동 판정
  useEffect(() => {
    if (!hasHydrated) return;
    if (!isLogged() || !user?.id) return;
    if (isUserDataLoading || !userData) return;
    if (isOnboarded) return;
    if (onBoardingClosedRef.current) return;

    // 온보딩이 필요한 경우 다이얼로그 오픈
    setOpenOnboarding(true);
  }, [hasHydrated, isLogged, user?.id, isUserDataLoading, isOnboarded, userData]);

  useEffect(() => {
    const handleExternalProfileOpen = () => {
      handleEditClick();
    };

    window.addEventListener(OPEN_USER_PROFILE_EDIT_EVENT, handleExternalProfileOpen);
    return () => {
      window.removeEventListener(OPEN_USER_PROFILE_EDIT_EVENT, handleExternalProfileOpen);
    };
  }, [handleEditClick]);

  // 매거진 서비스 카드처럼 외부에서 앱으로 진입한 프로필 편집 요청을 한 번만 소비한다.
  // URL을 먼저 정리해 새로고침·뒤로가기 이후 같은 모달이 다시 열리지 않도록 한다.
  useEffect(() => {
    if (profileEditRequestHandledRef.current || !hasHydrated || !isLogged() || !user?.id) return;
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get(PROFILE_EDIT_QUERY_PARAM) !== "1") return;

    profileEditRequestHandledRef.current = true;
    url.searchParams.delete(PROFILE_EDIT_QUERY_PARAM);
    const nextQuery = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextQuery ? `?${nextQuery}` : ""}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
    window.dispatchEvent(new Event(OPEN_USER_PROFILE_EDIT_EVENT));
  }, [handleEditClick, hasHydrated, isLogged, user?.id]);

  const renderHeaderSectionRight = () => {
    return (
      <div className="flex items-center gap-1.5">
        {resolvedLoggedIn ? (
          <>
            {/* 코인 잔액 - 항상 표시 */}
            <CoinBalance iconSize={16} showLabel={false} />

            {/* 서비스별 관리 메뉴는 variant별 반응형 CSS로 노출과 라벨을 조정한다 */}
            <div className="flex items-center gap-1.5">{serviceAddon ? serviceAddon : null}</div>

            {/* 글로벌 알림 - PC/모바일 공통 */}
            <GlobalNotificationCenter />

            {/* PC/모바일 공통 프로필 메뉴 */}
            <TopBarProfileControl
              userName={resolvedUserName}
              userEmail={user?.email}
              profileImageUrl={userData?.userInfo?.profileImageUrl}
              birthdate={userData?.userInfo?.birthdate}
              age={userData?.userInfo?.age}
              gender={userData?.userInfo?.gender}
              language={userData?.userInfo?.language}
              adminUniverses={adminUniverses}
              isAdminUniverseLoading={isAdminUniverseLoading}
              open={isUserPopoverOpen}
              triggerType="profile"
              canShowAdminButton={canShowAdminButton}
              logoutRedirectPage={logoutRedirectPage}
              onOpenChange={setIsUserPopoverOpen}
              onEditClick={handleEditClick}
              onAdminClick={onAdminClick}
              triggerClassName="mr-0.5"
            />
          </>
        ) : (
          <Button variant="text" size="sm" className="min-h-11 px-3" onClick={openLoginDialog}>
            <Lang text={{ ko: "로그인", en: "Log in" }} />
          </Button>
        )}
      </div>
    );
  };
  const isGenStudio = serviceName === "gen-studio";
  const isWorkspaceVariant = variant === "workspace";
  const headerClassName = isWorkspaceVariant
    ? cn("sticky top-0 z-30 h-14 w-full border-b border-border bg-background", className)
    : `sticky top-0 z-20 w-full bg-background/50 backdrop-blur-sm ${className}`;

  return (
    <>
      <header className={headerClassName}>
        <div
          className={
            isWorkspaceVariant
              ? "flex-between h-full items-center px-3 sm:px-4"
              : cn("flex-between p-3 sm:p-4", isGenStudio ? "items-start" : "items-center")
          }
        >
          {/* 좌측 로고 섹션 */}
          <div className={cn("header-section-left", leading && "flex items-center gap-2")}>
            {leading}
            {children &&
              (isWorkspaceVariant ? (
                <div className="flex items-center gap-2">{children}</div>
              ) : (
                <h1 className="flex gap-2 text-xl font-semibold">{children}</h1>
              ))}
          </div>

          {/* 우측 유틸리티 섹션 */}
          <div className="header-section-right flex">{renderHeaderSectionRight()}</div>
        </div>
      </header>

      {/* 사용자 정보 수정 다이얼로그 */}
      {hasHydrated && isLogged() && (
        <UserInfoEdit
          isOpen={openOnboarding || isUserInfoEditOpen}
          onOpenChange={(open) => {
            if (!open) {
              setOpenOnboarding(false);
              setIsUserInfoEditOpen(false);
              setForceEditMode(false);
            } else {
              setIsUserInfoEditOpen(true);
            }
          }}
          isOnboarding={openOnboarding}
          forceEditMode={forceEditMode}
          onComplete={() => {
            setIsUserInfoEditOpen(false);
            setOpenOnboarding(false);
            setForceEditMode(false);
            onBoardingClosedRef.current = true;
            refetchUserData().finally(() => {
              setTimeout(() => {
                onBoardingClosedRef.current = false;
              }, 800);
            });
          }}
        />
      )}

      {/* 로그인 다이얼로그 */}
      <LoginDialog open={isLoginDialogOpen} onOpenChange={setIsLoginDialogOpen} onLoginSuccess={onLoginSuccess} />
    </>
  );
}
