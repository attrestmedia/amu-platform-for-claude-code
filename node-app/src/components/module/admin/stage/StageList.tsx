"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { IStageDoc, IStageListParams, IUniverse } from "types/game";
import { Button, Input, dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { listStages, deleteStage, updateStage } from "libs/api/game/stageAdminClient";
import { getUniverseList } from "libs/api/universe/universeClient";
import { useUniverseAdminAccess } from "hooks/admin/useUniverseAdminAccess";
import { useUserData } from "hooks/auth";
import { logger } from "utils/log";
import { StageEditor } from "./StageEditor";
import { StageMapEditor } from "./StageMapEditor";
import { StageListTable, type StageDocWithId } from "./StageListTable";
import type { StageDocDomain, StageUsageType } from "types/game/stage-doc";
import { extractApiErrorMessage } from "utils/common/typeUtils";

type UsageFilter = "" | StageUsageType;
type OwnerScope = "all" | "global" | "universe" | "my";
type VisibilityFilter = "" | "private" | "universe" | "public";
type DomainFilter = "" | StageDocDomain;

interface StageListProps {
  universeId?: string; // ownerType="universe", ownerId=universeId 로 필터링
}

export function StageList({ universeId }: StageListProps) {
  const router = useRouter();
  const { userData } = useUserData();

  const [universes, setUniverses] = useState<IUniverse[]>([]);
  const { isAdministrator, editableUniverses } = useUniverseAdminAccess(universes);

  const [stages, setStages] = useState<StageDocWithId[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [usageFilter, setUsageFilter] = useState<UsageFilter>("");
  const [domainFilter, setDomainFilter] = useState<DomainFilter>("stage");
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(universeId ? "universe" : "all");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("");
  const [selectedUniverseId, setSelectedUniverseId] = useState<string>(universeId || "");
  const [search, setSearch] = useState("");

  const [selectedStage, setSelectedStage] = useState<StageDocWithId | null>(null);
  const [mapStage, setMapStage] = useState<StageDocWithId | null>(null);
  const [mapReadOnly, setMapReadOnly] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const effectiveUniverseOptions = useMemo(
    () => (isAdministrator ? universes : editableUniverses),
    [isAdministrator, universes, editableUniverses],
  );

  const currentUserOwnerKey = useMemo(() => {
    if (!userData) return "";

    const first = String(userData.userEmailLower || userData.userEmail || "").trim();
    return first ? first.toLowerCase() : "";
  }, [userData]);

  // Forge 탭 안에서 맵 편집면을 열고, 기존 전용 라우트는 별도 딥링크로 유지한다.
  const openMapEditor = useCallback(
    (stage: StageDocWithId, mode: "edit" | "view" = "edit") => {
      if (!stage._id) {
        void dialog.alert({ variant: "danger", message: lang({ ko: "Mongo _id가 없어 열 수 없습니다.", en: "Missing Mongo _id." }) });
        return;
      }
      setMapStage(stage);
      setMapReadOnly(mode === "view");
    },
    [],
  );

  const openMapEditorDeepLink = useCallback((stage: StageDocWithId, mode: "edit" | "view" = "edit") => {
    if (!stage._id) return;
    router.push(`/admin/stagemap/${stage._id}${mode === "view" ? "?mode=view" : ""}`);
  }, [router]);

  // 유니버스 목록 로드 (필터 select용)
  useEffect(() => {
    async function loadUniverses() {
      try {
        const list = await getUniverseList({
          enabledOnly: false,
          sortByOrder: true,
          displayFor: "",
        });
        setUniverses(list);
      } catch (e) {
        logger.error("[StageList] 유니버스 목록 로드 실패:", extractApiErrorMessage(e));
      }
    }
    loadUniverses();
  }, []);

  // universeId가 고정된 페이지인 경우, 필터 초기값 고정
  useEffect(function syncOwnerScopeFromUniverseProp() {
    if (universeId) {
      // universeId prop이 고정된 페이지에서 필터를 강제 동기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOwnerScope("universe");
      setSelectedUniverseId(universeId);
    }
  }, [universeId]);

  const fetchStages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: IStageListParams = {
        page,
        pageSize,
      };

      // domain 필터
      if (domainFilter) {
        params.domain = domainFilter;
      }

      // 타입(usageType) 필터
      if (usageFilter) {
        params.usageType = usageFilter;
      }

      // 공개 범위 필터
      if (visibilityFilter) {
        params.visibility = visibilityFilter;
      }

      // 검색어 (stageId / stageName)
      if (search.trim().length > 0) {
        params.q = search.trim();
      }

      // 유니버스별 페이지: ownerType/ownerId 강제
      if (universeId) {
        params.ownerType = "universe";
        params.ownerId = universeId;
      } else {
        // 공통 Admin 페이지의 소유 필터
        switch (ownerScope) {
          case "global":
            params.ownerType = "global";
            break;
          case "universe":
            params.ownerType = "universe";
            if (selectedUniverseId) {
              params.ownerId = selectedUniverseId;
            }
            break;
          case "my": {
            // ownerType=user + 현재 유저의 ownerKey 로 필터
            if (currentUserOwnerKey) {
              params.ownerType = "user";
              params.ownerId = currentUserOwnerKey;
            } else {
              // 유저 정보를 못 읽어온 경우, 잘못된 My 필터가 되지 않도록 로그만 남기고 필터는 적용하지 않음
              logger.warn(
                "[StageList] ownerScope='my' 이지만 currentUserOwnerKey가 비어 있습니다. owner 필터를 생략합니다.",
              );
            }
            break;
          }
          case "all":
          default:
            break; // ownerType 필터 없이 전체
        }
      }

      const res = await listStages(params);
      const docs = (res.data || []) as StageDocWithId[];

      setStages(docs);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (e) {
      const msg = extractApiErrorMessage(
        e,
        lang({ ko: "Stage 목록을 가져오는데 실패했습니다.", en: "Failed to load stages." }) as string,
      );
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    usageFilter,
    visibilityFilter,
    ownerScope,
    selectedUniverseId,
    search,
    universeId,
    currentUserOwnerKey,
    domainFilter,
  ]);

  useEffect(function runFetchStages() {
    // fetchStages 내부에서 loading/error/list state를 동기화하는 외부 데이터 fetch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStages();
  }, [fetchStages]);

  const handleClickNew = () => {
    setIsCreating(true);
    setSelectedStage(null);
  };

  const handleClickEdit = (stage: StageDocWithId) => {
    setSelectedStage(stage);
    setIsCreating(false);
  };

  const handleDelete = async (stage: StageDocWithId) => {
    if (!stage._id) return;
    const confirmed = await dialog.confirm({
      variant: "danger",
      message: lang({
        ko: `정말로 이 스테이지를 삭제할까요?\n${stage.stageId} / ${stage.stageName}`,
        en: `Are you sure you want to delete this stage?\n${stage.stageId} / ${stage.stageName}`,
      }),
    });
    if (!confirmed) return;

    try {
      setLoading(true);
      await deleteStage(stage._id);
      if (selectedStage?._id === stage._id) {
        setSelectedStage(null);
        setIsCreating(false);
      }
      if (mapStage?._id === stage._id) setMapStage(null);
      await fetchStages();
    } catch (e) {
      const msg = extractApiErrorMessage(
        e,
        lang({ ko: "Stage 삭제 중 오류가 발생했습니다.", en: "Failed to delete stage." }) as string,
      );
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleMapSave = async (doc: IStageDoc) => {
    const id = mapStage?._id;
    if (!id) throw new Error("stage_document_id_required");
    const saved = await updateStage(id, doc) as StageDocWithId;
    const next = { ...saved, _id: saved._id || id };
    setMapStage(next);
    setStages((current) => current.map((stage) => stage._id === id ? next : stage));
  };

  const handleSaved = (saved: StageDocWithId) => {
    // 저장 후 목록 갱신 + 선택 상태 업데이트
    setSelectedStage(saved);
    setIsCreating(false);
    fetchStages();
  };

  const handleDeletedFromEditor = (id: string) => {
    if (selectedStage?._id === id) {
      setSelectedStage(null);
      setIsCreating(false);
    }
    fetchStages();
  };

  const canEditStage = (stage: StageDocWithId): boolean => {
    // 간단한 클라이언트 힌트:
    // - ownerType === "global" 인 Stage는 최고 관리자만 편집 권장
    // - universeId 페이지에서는 ownerType="universe" && ownerId === universeId 인 Stage 만 편집 권장
    if (stage.ownerType === "global") {
      return isAdministrator;
    }
    if (universeId) {
      return stage.ownerType === "universe" && stage.ownerId === universeId;
    }
    return true;
  };

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-3 min-w-0">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{lang({ ko: "스테이지/에셋 관리", en: "Stage & Asset Management" })}</h1>
        <p className="text-sm text-muted-foreground">
          {lang({
            ko: "아이소메트릭 기준 StageDoc을 등록·수정하고, 같은 탭에서 맵 타일과 레이어를 편집합니다.",
            en: "Register and edit isometric StageDocs, then edit map tiles and layers in the same tab.",
          })}
        </p>
      </div>

      {/* 필터 영역 */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border rounded-default p-3 bg-muted/30">
        {/* 타입(usageType) 필터 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">{lang({ ko: "타입", en: "Type" })} (usageType)</label>
          <select
            className="border rounded px-2 py-1 text-sm min-w-[140px]"
            value={usageFilter}
            onChange={(e) => {
              setPage(1);
              setUsageFilter(e.target.value as UsageFilter);
            }}
          >
            <option value="">{lang({ ko: "전체", en: "All" })}</option>
            <option value="game">game</option>
            <option value="commerce">commerce</option>
            <option value="both">both</option>
          </select>
        </div>

        {/* 도메인(domain) 필터 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">{lang({ ko: "도메인", en: "Domain" })}</label>
          <select
            className="border rounded px-2 py-1 text-sm min-w-[160px]"
            value={domainFilter}
            onChange={(e) => {
              setDomainFilter(e.target.value as DomainFilter);
              setPage(1);
            }}
          >
            <option value="">{lang({ ko: "전체", en: "All" })}</option>
            <option value="stage">stage</option>
            <option value="asset-pack">asset-pack</option>
            <option value="layout-template">layout-template</option>
          </select>
        </div>

        {/* 소유 범위 필터 (공통 Admin 페이지에서만 표시) */}
        {!universeId && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">{lang({ ko: "소유", en: "Owner" })}</label>
            <select
              className="border rounded px-2 py-1 text-sm min-w-[140px]"
              value={ownerScope}
              onChange={(e) => {
                const v = e.target.value as OwnerScope;
                setOwnerScope(v);
                setPage(1);
              }}
            >
              <option value="all">{lang({ ko: "전체", en: "All" })}</option>
              <option value="global">global</option>
              <option value="universe">universe</option>
              <option value="my">{lang({ ko: "내 것(my)", en: "My" })}</option>
            </select>
          </div>
        )}

        {/* 유니버스 필터 (ownerScope === 'universe' 일 때만) */}
        {!universeId && ownerScope === "universe" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">{lang({ ko: "유니버스", en: "Universe" })}</label>
            <select
              className="border rounded px-2 py-1 text-sm min-w-[180px]"
              value={selectedUniverseId}
              onChange={(e) => {
                setSelectedUniverseId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{lang({ ko: "전체", en: "All" })}</option>
              {effectiveUniverseOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.id})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 유니버스별 페이지에서는 Universe가 고정 */}
        {universeId && (
          <div
            className="flex flex-col gap-1 min-w-[160px] max-w-[260px]"
            title={lang({
              ko: "이 페이지에서는 해당 유니버스 소유 Stage만 관리합니다.",
              en: "This page manages stages owned by this universe only.",
            })}
          >
            <label className="text-xs font-medium">{lang({ ko: "유니버스", en: "Universe" })}</label>
            <div className="border rounded px-2 py-1 text-sm font-medium truncate bg-surface">{universeId}</div>
          </div>
        )}

        {/* visibility 필터 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">visibility</label>
          <select
            className="border rounded px-2 py-1 text-sm min-w-[140px]"
            value={visibilityFilter}
            onChange={(e) => {
              setPage(1);
              setVisibilityFilter(e.target.value as VisibilityFilter);
            }}
          >
            <option value="">{lang({ ko: "전체", en: "All" })}</option>
            <option value="private">private</option>
            <option value="universe">universe</option>
            <option value="public">public</option>
          </select>
        </div>

        {/* 검색어 */}
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium">{lang({ ko: "검색", en: "Search" })} (stageId / stageName)</label>
          <div className="flex gap-2">
            <Input
              value={search}
              className="text-sm"
              placeholder={lang({
                ko: "stageId 또는 stageName 입력",
                en: "Enter stageId or stageName",
              })}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPage(1);
                fetchStages();
              }}
            >
              {lang({ ko: "검색", en: "Search" })}
            </Button>
          </div>
        </div>

        {/* 새 Stage 생성 버튼 */}
        <div className="ml-auto flex flex-col gap-1">
          <label className="text-xs font-medium invisible">.</label>
          <Button size="sm" onClick={handleClickNew}>
            {lang({ ko: "새 Stage 생성", en: "Create New Stage" })}
          </Button>
        </div>
      </div>

      {/* 에러/상태 표시 */}
      {error && <div className="text-sm text-red-600 whitespace-pre-line">{error}</div>}
      {loading && <div className="text-sm text-muted-foreground">{lang({ ko: "로딩 중...", en: "Loading..." })}</div>}

      <StageListTable
        stages={stages}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        canEditStage={canEditStage}
        onEdit={handleClickEdit}
        onOpenMap={openMapEditor}
        onOpenDeepLink={openMapEditorDeepLink}
        onDelete={(stage) => void handleDelete(stage)}
        onPageChange={setPage}
      />

      {mapStage ? (
        <section className="min-w-0 rounded-default border p-3" aria-label={lang({ ko: "인라인 맵 편집기", en: "Inline map editor" })}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{lang({ ko: "맵 편집", en: "Map editor" })} — {mapStage.stageId} / {mapStage.stageName}</h2>
              <p className="text-xs text-muted-foreground">{mapReadOnly ? lang({ ko: "읽기 전용", en: "Read only" }) : lang({ ko: "변경 후 맵 저장을 눌러 반영하세요.", en: "Save the map to apply changes." })}</p>
            </div>
            <Button size="sm" variant="outline" className="min-h-11" onClick={() => setMapStage(null)}>{lang({ ko: "편집면 닫기", en: "Close editor" })}</Button>
          </div>
          <StageMapEditor stageDoc={mapStage} readOnly={mapReadOnly} onSave={mapReadOnly ? undefined : handleMapSave} />
        </section>
      ) : null}

      {/* Stage 에디터 (선택/생성) */}
      <div className="border rounded-default p-3">
        <h2 className="text-sm font-semibold mb-2">
          {isCreating
            ? lang({ ko: "새 Stage 생성", en: "Create New Stage" })
            : selectedStage
              ? lang({ ko: "Stage 상세/편집", en: "Stage Detail / Edit" })
              : lang({ ko: "Stage 선택", en: "Select a Stage" })}
        </h2>
        {isCreating || selectedStage ? (
          <StageEditor
            mode={isCreating ? "create" : "edit"}
            initialStage={selectedStage || undefined}
            universeIdForOwner={universeId}
            onSaved={handleSaved}
            onDeleted={handleDeletedFromEditor}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {lang({
              ko: "위 목록에서 편집할 Stage를 선택하거나, 상단의 [새 Stage 생성] 버튼을 눌러 새로운 스테이지를 추가하세요.",
              en: "Select a stage from the list above or click [Create New Stage] to add a new one.",
            })}
          </p>
        )}
      </div>
    </div>
  );
}
