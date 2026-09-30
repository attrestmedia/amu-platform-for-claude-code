"use client";

import { useState, useEffect } from "react";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, Preloader, Tabs, TabsList, TabsTrigger, TabsContent, TooltipBasic, ScrollArea, Dropdown } from "@amu-labs/ui";
import { UniverseTypeSections, UniverseForm, UniverseDetailManager } from "components/module/admin/universe";
import { Logout } from "components/module/auth";
import type { IUniverse } from "types/game";
import { getUniverseList } from "libs/api/universe";
import { logger } from "utils/log";
import {
  Plus,
  Database,
  Volume2,
  Wand2,
  ContactRound,
  NotepadText,
  Settings,
  ImagePlus,
  Key,
  type LucideIcon,
  Home,
  LogOut,
  Power,
  ListChecks,
  Activity,
} from "lucide-react";
import { useAuthStore } from "store/auth";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useUniverseAdminAccess } from "hooks/admin";
import { useRouter } from "next/navigation";
import { SystemPersonaManager, PersonaManager } from "components/module/admin/persona";
import { UserPersonaManager } from "components/module/persona/UserPersonaManager";
import {
  ContentPromptManager,
  ImagePromptManager,
  TemplateGroupAdminPanel,
} from "components/module/admin/prompt-manager";
import { Lang, lang } from "components/module/i18n";
import {
  ServiceAvailabilityPanel,
  SpeechRuntimeControlsPanel,
  JevRuntimeControlsPanel,
  SystemControlBox,
  TtsPreviewModerationPanel,
} from "components/module/admin/system";
import { MARKETING_FEATURE_ENABLED } from "consts/marketing/public";
import { PAGE_LAYOUT_CLASS, SHEET_CLASS, SHEET_HEADER_CLASS, STAT_CARD_CLASS } from "utils/theme";
import { cn } from "utils/common";

const ADMIN_HEADER_MENU_ACTION = {
  systemControls: "system-controls",
  serviceAvailability: "service-availability",
  jevRuntimeControls: "jev-runtime-controls",
  speechRuntimeControls: "speech-runtime-controls",
  addUniverse: "add-universe",
} as const;

const ADMIN_NAV_MENU_ROUTE = {
  mainHome: "/",
  genStudio: "/gen-studio",
  tutors: "/tutors",
} as const;

type AdminNavMenuRoute = (typeof ADMIN_NAV_MENU_ROUTE)[keyof typeof ADMIN_NAV_MENU_ROUTE];

type AdminHeaderMenuAction = (typeof ADMIN_HEADER_MENU_ACTION)[keyof typeof ADMIN_HEADER_MENU_ACTION];

type AdminToolButtonConfig = {
  key: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?:
    | "outlinePrimary"
    | "link"
    | "text"
    | "accent"
    | "primary"
    | "secondary"
    | "destructive"
    | "neutral"
    | "outline"
    | "outlineSecondary"
    | "outlineAccent"
    | "outlineMuted";
  enabled?: boolean;
};

const ADMIN_HEADER_MENU_OPTIONS: Array<{ value: AdminHeaderMenuAction; label: string }> = [
  { value: ADMIN_HEADER_MENU_ACTION.systemControls, label: "System controls" },
  { value: ADMIN_HEADER_MENU_ACTION.serviceAvailability, label: "Service availability" },
  { value: ADMIN_HEADER_MENU_ACTION.jevRuntimeControls, label: "JEV Decision Runtime Controls" },
  { value: ADMIN_HEADER_MENU_ACTION.speechRuntimeControls, label: "Speech Runtime Controls" },
  { value: ADMIN_HEADER_MENU_ACTION.addUniverse, label: "Add universe" },
];

const ADMIN_NAV_MENU_OPTIONS: Array<{
  value: AdminNavMenuRoute;
  label: string;
  text: {
    ko: string;
    en: string;
  };
}> = [
  {
    value: ADMIN_NAV_MENU_ROUTE.mainHome,
    label: "Main Home",
    text: { ko: "메인 홈", en: "Main Home" },
  },
  {
    value: ADMIN_NAV_MENU_ROUTE.genStudio,
    label: "Gen Studio",
    text: { ko: "Gen Studio", en: "Gen Studio" },
  },
  {
    value: ADMIN_NAV_MENU_ROUTE.tutors,
    label: "Tutors",
    text: { ko: "Tutors", en: "Tutors" },
  },
];

const ADMIN_NAV_MENU_TEXT: Record<AdminNavMenuRoute, { ko: string; en: string }> = {
  [ADMIN_NAV_MENU_ROUTE.mainHome]: { ko: "메인 홈", en: "Main Home" },
  [ADMIN_NAV_MENU_ROUTE.genStudio]: { ko: "Gen Studio", en: "Gen Studio" },
  [ADMIN_NAV_MENU_ROUTE.tutors]: { ko: "Tutors", en: "Tutors" },
};

export default function UniverseAdminPage() {
  const router = useRouter();
  const [universes, setUniverses] = useState<IUniverse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUniverse, setEditingUniverse] = useState<IUniverse | null>(null);
  const [showSystemPersonaManager, setShowSystemPersonaManager] = useState(false);
  const [showPersonaManager, setShowPersonaManager] = useState(false);
  const [showPromptManager, setShowPromptManager] = useState(false);
  const [showSystemControls, setShowSystemControls] = useState(false);
  const [showServiceAvailability, setShowServiceAvailability] = useState(false);
  const [showJevRuntimeControls, setShowJevRuntimeControls] = useState(false);
  const [showTtsPreviewModeration, setShowTtsPreviewModeration] = useState(false);
  const [showSpeechControls, setShowSpeechControls] = useState(false);

  // 인증 및 권한 체크 추가
  const { userData } = useUserData();
  const isLoggedIn = useAuthStore((state) => state.isLogged());

  // universes 상태 로드 후 권한 계산
  const { isAdministrator, editableUniverses } = useUniverseAdminAccess(universes);

  // 로그인 상태 체크
  useAuthCheck();

  // 기본 권한 체크 (로그인 및 기본 권한)
  useEffect(() => {
    logger.log("universe admin:", userData);

    // 로그인되지 않았으면 로그인 페이지로 리다이렉트
    if (!isLoggedIn) {
      router.push("/login?next=/admin");
      return;
    }

    // 사용자 데이터가 로드되었는데 권한이 없으면 리다이렉트
    if (userData && !userData.roles?.includes("administrator")) {
      router.push("/");
      return;
    }
  }, [isLoggedIn, userData, router]);

  // editor 자동 분기
  useEffect(() => {
    if (loading) return;
    if (!isAdministrator) {
      const first = editableUniverses[0];
      if (first) {
        router.replace(`/admin/${first.id}`);
      } else {
        // 편집 가능한 유니버스가 없는 editor: 홈으로 회피
        router.replace("/");
      }
    }
  }, [loading, isAdministrator, editableUniverses, router]);

  // 유니버스 목록 조회
  const fetchUniverses = async () => {
    try {
      setLoading(true);
      const data = await getUniverseList({ enabledOnly: false, sortByOrder: true });
      setUniverses(data);
    } catch (error) {
      logger.error("유니버스 목록 조회 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(function fetchUniversesOnMount() {
    // 마운트 시 외부 API에서 유니버스 목록 fetch — 내부에서 universes/loading 동기화
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUniverses();
  }, []);

  // 유니버스 생성/수정 성공 시 목록 새로고침
  const handleUniverseChange = () => {
    fetchUniverses();
    setShowCreateDialog(false);
    setEditingUniverse(null);
  };

  const handleHeaderMenuSelect = (action: string) => {
    if (action === ADMIN_HEADER_MENU_ACTION.systemControls) {
      setShowSystemControls(true);
      return;
    }

    if (action === ADMIN_HEADER_MENU_ACTION.serviceAvailability) {
      setShowServiceAvailability(true);
      return;
    }

    if (action === ADMIN_HEADER_MENU_ACTION.jevRuntimeControls) {
      setShowJevRuntimeControls(true);
      return;
    }

    if (action === ADMIN_HEADER_MENU_ACTION.speechRuntimeControls) {
      setShowSpeechControls(true);
      return;
    }

    if (action === ADMIN_HEADER_MENU_ACTION.addUniverse) {
      setShowCreateDialog(true);
    }
  };

  const handleNavMenuSelect = (route: string) => {
    router.push(route);
  };

  const adminToolButtons: AdminToolButtonConfig[] = [
    {
      key: "service-availability",
      icon: Power,
      label: lang({ ko: "서비스 공개 관리", en: "Service Availability" }),
      onClick: () => setShowServiceAvailability(true),
      variant: "accent",
    },
    {
      key: "tts-preview-moderation",
      icon: ListChecks,
      label: lang({ ko: "TTS 공개 검수", en: "TTS Preview Review" }),
      onClick: () => setShowTtsPreviewModeration(true),
      variant: "outlinePrimary",
    },
    {
      key: "system-persona",
      icon: Wand2,
      label: lang({ ko: "공통 시스템 페르소나 관리", en: "Common System-Persona Management" }),
      onClick: () => setShowSystemPersonaManager(true),
    },
    {
      key: "persona",
      icon: ContactRound,
      label: lang({ ko: "페르소나 관리", en: "Persona Management" }),
      onClick: () => setShowPersonaManager(true),
      variant: "outlinePrimary",
    },
    {
      key: "prompt",
      icon: NotepadText,
      label: lang({ ko: "프롬프트 관리", en: "Prompt Management" }),
      onClick: () => setShowPromptManager(true),
      variant: "outlineSecondary",
    },
    {
      key: "game-asset-forge",
      icon: ImagePlus,
      label: lang({ ko: "에셋 스튜디오", en: "Assets Studio" }),
      onClick: () => router.push("/assets-studio"),
      variant: "secondary",
    },
    {
      key: "platform-credentials",
      icon: Key,
      label: lang({ ko: "플랫폼 자격증명", en: "Platform Credentials" }),
      onClick: () => router.push("/admin/credentials"),
      variant: "accent",
    },
    {
      key: "marketing",
      icon: Database,
      label: "Marketing Oops",
      onClick: () => router.push("/marketing-oops/workspace"),
      variant: "accent",
      enabled: MARKETING_FEATURE_ENABLED,
    },
    {
      key: "intelligence-review",
      icon: Database,
      label: "Article Intelligence",
      onClick: () => router.push("/admin/magazine/intelligence"),
      variant: "accent",
    },
  ];

  if (loading || !isLoggedIn) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  if (!isAdministrator) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-sm text-gray-500">
          <Lang text={{ ko: "권한 확인 중입니다...", en: "Checking permissions..." }} />
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE_LAYOUT_CLASS}>
      <div className="container mx-auto max-w-7xl p-4">
        {/* 헤더 */}
        <div className="flex justify-between items-start gap-4 mb-6">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-primary">
              <Lang text={{ ko: "유니버스 관리", en: "Universe Management" }} />
            </h1>
            <TooltipBasic>
              <p className="text-muted-foreground truncate text-xs">
                <Lang
                  text={{
                    ko: "유니버스 정보를 생성, 편집, 관리할 수 있어요.",
                    en: "Create, edit, and manage universe information.",
                  }}
                />
              </p>
            </TooltipBasic>
          </div>

          {/* 우측 도구 영역 */}
          <div className="flex items-center gap-4">
            <Dropdown
              options={ADMIN_NAV_MENU_OPTIONS}
              selected={null}
              onSelect={handleNavMenuSelect}
              renderTrigger={() => <Home className="icon-xs" />}
              renderOption={(option) => (
                <span className="inline-flex items-center gap-2">
                  <Lang text={ADMIN_NAV_MENU_TEXT[option.value as AdminNavMenuRoute]} />
                </span>
              )}
              hideArrow
              variant="ghost"
              size="xs"
              openPortal
              contentAlign="end"
              contentSideOffset={8}
              placeholder={lang({ ko: "이동 메뉴", en: "Navigation menu" })}
              triggerAriaLabel={lang({ ko: "이동 메뉴 열기", en: "Open navigation menu" })}
              className="icon-sm justify-center rounded-full border-0 bg-transparent p-0"
              dropdownClassName="min-w-[180px] rounded-lg border border-border bg-surface text-sm text-primary-text shadow-lg"
              itemClassName="text-sm"
            />

            <Dropdown
              options={ADMIN_HEADER_MENU_OPTIONS}
              selected={null}
              onSelect={handleHeaderMenuSelect}
              renderTrigger={() => <Settings className="icon-xs" />}
              renderOption={(option) => (
                <span className="inline-flex items-center gap-2">
                  {option.value === ADMIN_HEADER_MENU_ACTION.systemControls ? (
                    <Settings className="icon-xs" />
                  ) : option.value === ADMIN_HEADER_MENU_ACTION.serviceAvailability ? (
                    <Power className="icon-xs" />
                  ) : option.value === ADMIN_HEADER_MENU_ACTION.jevRuntimeControls ? (
                    <Activity className="icon-xs" />
                  ) : option.value === ADMIN_HEADER_MENU_ACTION.speechRuntimeControls ? (
                    <Volume2 className="icon-xs" />
                  ) : (
                    <Plus className="icon-xs" />
                  )}
                  <Lang
                    text={
                      option.value === ADMIN_HEADER_MENU_ACTION.systemControls
                        ? { ko: "시스템 컨트롤", en: "System controls" }
                        : option.value === ADMIN_HEADER_MENU_ACTION.serviceAvailability
                          ? { ko: "서비스 공개 관리", en: "Service availability" }
                          : option.value === ADMIN_HEADER_MENU_ACTION.jevRuntimeControls
                            ? { ko: "JEV 판단 런타임 제어", en: "JEV Decision Runtime Controls" }
                            : option.value === ADMIN_HEADER_MENU_ACTION.speechRuntimeControls
                              ? { ko: "음성 런타임 제어", en: "Speech Runtime Controls" }
                              : { ko: "유니버스 추가", en: "Add universe" }
                    }
                  />
                </span>
              )}
              hideArrow
              variant="ghost"
              size="xs"
              openPortal
              contentAlign="end"
              contentSideOffset={8}
              placeholder={lang({ ko: "관리 메뉴", en: "Management menu" })}
              triggerAriaLabel={lang({ ko: "관리 메뉴 열기", en: "Open management menu" })}
              className="icon-sm justify-center rounded-full border-0 bg-transparent p-0"
              dropdownClassName="min-w-[180px] rounded-lg border border-border bg-surface text-sm text-primary-text shadow-lg"
              itemClassName="text-sm"
            />

            <Logout className="icon-sm px-0 text-primary-text" size="sm" icon={<LogOut className="icon-xs" />} />
          </div>
        </div>

        {/* 관리 도구 섹션 */}
        <div className="mb-4 -mx-4 sm:mx-0">
          <ScrollArea className="w-full pb-2" dragOnScrollX wheelOnScrollX>
            <div className="flex w-max gap-1.5 px-4 sm:px-0">
              {adminToolButtons
                .filter((item) => item.enabled !== false)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button key={item.key} variant={item.variant || "outline"} rounded="full" onClick={item.onClick}>
                      <Icon className="icon-xxs" />
                      <span>{item.label}</span>
                    </Button>
                  );
                })}
            </div>
          </ScrollArea>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-6">
          <div className={cn(STAT_CARD_CLASS, "col-span-2 sm:col-span-1")}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  <Lang text={{ ko: "편집 가능한 유니버스", en: "Editable Universes" }} />
                </p>
                <p className="text-2xl font-bold">{editableUniverses.length}</p>
              </div>
              <Database className="text-primary" size={24} />
            </div>
          </div>
          <div className={STAT_CARD_CLASS}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  <Lang text={{ ko: "활성화됨", en: "Enabled" }} />
                </p>
                <p className="text-2xl font-bold text-green-600">{editableUniverses.filter((u) => u.enabled).length}</p>
              </div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
          </div>
          <div className={STAT_CARD_CLASS}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  <Lang text={{ ko: "비활성화됨", en: "Disabled" }} />
                </p>
                <p className="text-2xl font-bold text-gray-500">{editableUniverses.filter((u) => !u.enabled).length}</p>
              </div>
              <div className="w-3 h-3 rounded-full bg-gray-400"></div>
            </div>
          </div>
        </div>

        {/* 컨텐츠 영역 */}
        <UniverseTypeSections
          universes={editableUniverses}
          onEdit={setEditingUniverse}
          onRefresh={fetchUniverses}
        />

        {/* 시스템 컨트롤 */}
        <Sheet open={showSystemControls} onOpenChange={setShowSystemControls}>
          <SheetContent side="bottom" className={SHEET_CLASS}>
            <div className="flex h-full flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "시스템 컨트롤", en: "System Controls" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <SystemControlBox />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* 서비스 공개 관리 */}
        <Sheet open={showServiceAvailability} onOpenChange={setShowServiceAvailability}>
          <SheetContent
            side="bottom"
            responsiveModal
            overlayClassName="bg-black/50"
            className={cn(
              SHEET_CLASS,
              "xs:!h-[min(82dvh,44rem)] xs:w-[min(calc(100vw-2rem),48rem)] xs:!max-w-3xl",
            )}
          >
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "서비스 공개 관리", en: "Service Availability" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] xs:pb-4">
                <ServiceAvailabilityPanel />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* 음성 런타임 제어 — kill switch·provider 활성·지출 상한 */}
        <Sheet open={showSpeechControls} onOpenChange={setShowSpeechControls}>
          <SheetContent
            side="bottom"
            responsiveModal
            overlayClassName="bg-black/50"
            className={cn(
              SHEET_CLASS,
              "xs:!h-[min(88dvh,52rem)] xs:w-[min(calc(100vw-2rem),48rem)] xs:!max-w-3xl",
            )}
          >
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "음성 런타임 제어", en: "Speech Runtime Controls" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] xs:pb-4">
                <SpeechRuntimeControlsPanel />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* JEV 판단 런타임 제어 — 전역/서비스/판단 지점별 safe-off 설정 */}
        <Sheet open={showJevRuntimeControls} onOpenChange={setShowJevRuntimeControls}>
          <SheetContent
            side="bottom"
            responsiveModal
            overlayClassName="bg-black/50"
            className={cn(
              SHEET_CLASS,
              "xs:!h-[min(88dvh,52rem)] xs:w-[min(calc(100vw-2rem),48rem)] xs:!max-w-3xl",
            )}
          >
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "JEV 판단 런타임 제어", en: "JEV Decision Runtime Controls" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] xs:pb-4">
                <JevRuntimeControlsPanel />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* TTS 미리듣기 공개 검수 */}
        <Sheet open={showTtsPreviewModeration} onOpenChange={setShowTtsPreviewModeration}>
          <SheetContent
            side="bottom"
            responsiveModal
            overlayClassName="bg-black/50"
            className={cn(SHEET_CLASS, "xs:!h-[min(88dvh,52rem)] xs:w-[min(calc(100vw-2rem),64rem)] xs:!max-w-5xl")}
          >
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "TTS 미리듣기 공개 검수", en: "TTS Preview Moderation" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] xs:pb-4">
                <TtsPreviewModerationPanel />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* 프롬프트 관리 */}
        <Sheet open={showPromptManager} onOpenChange={setShowPromptManager}>
          <SheetContent side="bottom" className={SHEET_CLASS}>
            <div className="flex h-full flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "프롬프트 관리", en: "Prompt Management" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                {/* 이미지/콘텐츠 프롬프트와 중앙 템플릿 그룹 원장 */}
                <Tabs defaultValue="image" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="image">
                      <Lang text={{ ko: "이미지 프롬프트", en: "Image Prompts" }} />
                    </TabsTrigger>
                    <TabsTrigger value="content">
                      <Lang text={{ ko: "콘텐츠 프롬프트", en: "Content Prompts" }} />
                    </TabsTrigger>
                    <TabsTrigger value="groups">
                      <Lang text={{ ko: "템플릿 그룹", en: "Template Groups" }} />
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="image" className="mt-4">
                    <ImagePromptManager />
                  </TabsContent>

                  <TabsContent value="content" className="mt-4">
                    <ContentPromptManager />
                  </TabsContent>

                  <TabsContent value="groups" className="mt-4">
                    <TemplateGroupAdminPanel />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* 유니버스 생성 */}
        <Sheet open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <SheetContent side="bottom" className={SHEET_CLASS}>
            <div className="flex h-full flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "새 유니버스 추가", en: "Add New Universe" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <UniverseForm onSuccess={handleUniverseChange} onCancel={() => setShowCreateDialog(false)} />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* 유니버스 편집 (기본 정보 + 상세 데이터 통합 탭) */}
        <Sheet open={!!editingUniverse} onOpenChange={(open) => !open && setEditingUniverse(null)}>
          <SheetContent side="bottom" className={SHEET_CLASS}>
            <div className="flex h-full flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "유니버스 편집", en: "Edit Universe" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                {editingUniverse && (
                  <Tabs defaultValue="basic" className="mx-auto w-full max-w-6xl">
                    <TabsList scrollable className="flex mb-4 w-full" variant="chip">
                      <TabsTrigger value="basic" className="flex-1">
                        <Lang text={{ ko: "기본 정보 편집", en: "Basic Data" }} />
                      </TabsTrigger>
                      <TabsTrigger value="detail" className="flex-1">
                        <Lang text={{ ko: "상세 데이터 편집", en: "Detail Data" }} />
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="basic" className="mt-0">
                      <UniverseForm
                        universe={editingUniverse}
                        onSuccess={handleUniverseChange}
                        onCancel={() => setEditingUniverse(null)}
                      />
                    </TabsContent>

                    <TabsContent value="detail" className="mt-0">
                      <UniverseDetailManager
                        universes={editableUniverses}
                        selectedUniverse={editingUniverse.id}
                        lockSelection
                      />
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* 공통 시스템 페르소나 관리 */}
        <Sheet open={showSystemPersonaManager} onOpenChange={setShowSystemPersonaManager}>
          <SheetContent side="bottom" className={SHEET_CLASS}>
            <div className="flex h-full flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "공통 시스템 페르소나 관리", en: "Common System-Persona Management" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col p-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <SystemPersonaManager />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* 페르소나 관리 */}
        <Sheet open={showPersonaManager} onOpenChange={setShowPersonaManager}>
          <SheetContent side="bottom" className={SHEET_CLASS}>
            <div className="flex h-full flex-col">
              <SheetHeader className={SHEET_HEADER_CLASS}>
                <SheetTitle>
                  <Lang text={{ ko: "페르소나 관리", en: "Persona Management" }} />
                </SheetTitle>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col p-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <Tabs defaultValue="universe" className="flex min-h-0 flex-1 flex-col">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="universe">
                      <Lang text={{ ko: "공용 유니버스", en: "Universe Personas" }} />
                    </TabsTrigger>
                    <TabsTrigger value="tutors">
                      <Lang text={{ ko: "내 Tutors", en: "My Tutors" }} />
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="universe" className="mt-2 min-h-0 flex-1 overflow-y-auto">
                    <PersonaManager availableUniverses={editableUniverses} />
                  </TabsContent>
                  <TabsContent value="tutors" className="mt-2 min-h-0 flex-1 overflow-y-auto p-2">
                    <UserPersonaManager
                      surface="tutors"
                      imageGenerationPresentation="embedded"
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </SheetContent>
        </Sheet>

      </div>
    </div>
  );
}
