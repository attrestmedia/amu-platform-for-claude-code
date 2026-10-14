"use client";

import { useState, useEffect } from "react";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, Preloader, Tabs, TabsList, TabsTrigger, TabsContent, TooltipBasic } from "@amu-labs/ui";
import { UniverseTypeSections, UniverseForm, UniverseDetailManager } from "components/module/admin/universe";
import type { IUniverse } from "types/game";
import { getUniverseList } from "libs/api/universe";
import { logger } from "utils/log";
import { Database, Plus } from "lucide-react";
import { useAuthStore } from "store/auth";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useUniverseAdminAccess } from "hooks/admin";
import { useRouter } from "next/navigation";
import { Lang } from "components/module/i18n";
import { SHEET_CLASS, SHEET_HEADER_CLASS, STAT_CARD_CLASS } from "utils/theme";
import { cn } from "utils/common";

export default function UniverseAdminPage() {
  const router = useRouter();
  const [universes, setUniverses] = useState<IUniverse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUniverse, setEditingUniverse] = useState<IUniverse | null>(null);

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
    <div className="mx-auto w-full max-w-7xl">
        {/* 헤더 */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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

          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" className="min-h-11" onClick={() => setShowCreateDialog(true)}>
              <Plus className="icon-xs" aria-hidden="true" />
              <Lang text={{ ko: "유니버스 추가", en: "Add universe" }} />
            </Button>
          </div>
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

    </div>
  );
}
