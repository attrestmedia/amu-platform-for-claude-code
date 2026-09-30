"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { LayoutGrid, Lock, Map as MapIcon, Plus, Shield } from "lucide-react";
import { Button, Input, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";
import { listGameAssets, listStages, createStage, updateStage } from "libs/api/game";
import type { IGameAssetDoc, IStageAsset, IStageDoc } from "types/game";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app";
import { STAGE_MAP_LIMITS } from "utils/game";
import { extractApiErrorMessage } from "utils/common/typeUtils";
import { trackPlayEvent } from "utils/analytics/play";
import { StageMapEditor } from "components/module/admin/stage/StageMapEditor";
import {
  buildNewMapPayload,
  getStageThumbnail,
  mergeStagePaletteAssets,
  toStagePaletteAsset,
} from "./mapStudioModel";
import { useRouter, useSearchParams } from "next/navigation";

type StageDocWithId = IStageDoc & { _id?: string };

function stageKey(stage: StageDocWithId) {
  return stage._id || `${stage.stageId}:${stage.stageName}`;
}

function LockedMapStudio() {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
      <div className="relative mx-auto flex min-h-[360px] max-w-2xl flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-2 text-secondary-text">
          <Lock className="size-7" aria-hidden />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-secondary-text">STEP 5</p>
        <h1 className="mt-2 text-2xl font-bold text-primary-text sm:text-3xl">
          <Lang text={{ ko: "맵 편집 권한이 필요합니다", en: "Map editing permission is required" }} />
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-secondary-text">
          <Lang
            text={{
              ko: "맵은 게임 세계의 운영 데이터라 관리자 또는 별도 저작 권한이 있는 사용자만 편집할 수 있습니다.",
              en: "Maps are operational game-world data, so editing is limited to administrators or users with authoring permission.",
            }}
          />
        </p>
        <Button
          variant="outline"
          className="mt-6 min-h-11"
          aria-expanded={showGuide}
          onClick={() => setShowGuide((current) => !current)}
        >
          <Shield className="mr-2 size-4" aria-hidden />
          <Lang text={{ ko: "권한 안내 보기", en: "View permission guide" }} />
        </Button>
        {showGuide ? (
          <p className="mt-4 max-w-lg rounded-xl border border-border bg-background p-4 text-left text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "현재 맵 저작 권한은 관리자 플래그로 판정합니다. 권한이 필요하면 서비스 운영 담당자에게 맵 편집 요청을 전달해 주세요.",
                en: "Map authoring is currently gated by the administrator role. Contact the service operator to request map editing access.",
              }}
            />
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function MapStudioView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdministrator } = useUserData();
  const requestedStageId = searchParams.get("stageId")?.trim() || "";
  const [maps, setMaps] = useState<StageDocWithId[]>([]);
  const [paletteAssets, setPaletteAssets] = useState<IStageAsset[]>([]);
  const [selectedMapKey, setSelectedMapKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paletteLoading, setPaletteLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paletteWarning, setPaletteWarning] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mapName, setMapName] = useState("");
  const [mapSize, setMapSize] = useState("32");

  const selectedMap = useMemo(
    () => maps.find((stage) => stageKey(stage) === selectedMapKey) || null,
    [maps, selectedMapKey],
  );
  const editorStage = useMemo(
    () => (selectedMap && !paletteLoading ? mergeStagePaletteAssets(selectedMap, paletteAssets) : null),
    [paletteAssets, paletteLoading, selectedMap],
  );

  const loadMaps = useCallback(async () => {
    if (!isAdministrator) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listStages({ domain: "stage", page: 1, pageSize: 100 });
      const nextMaps = (result.data || []) as StageDocWithId[];
      setMaps(nextMaps);
      setSelectedMapKey((current) => {
        const requested = nextMaps.find((stage) => stage.stageId === requestedStageId || stage._id === requestedStageId);
        if (requested) return stageKey(requested);
        return current && nextMaps.some((stage) => stageKey(stage) === current)
          ? current
          : nextMaps[0] ? stageKey(nextMaps[0]) : null;
      });
    } catch (cause) {
      setError(extractApiErrorMessage(cause, lang({ ko: "맵 목록을 불러오지 못했습니다.", en: "Failed to load maps." })));
    } finally {
      setLoading(false);
    }
  }, [isAdministrator, requestedStageId]);

  const loadPalette = useCallback(async () => {
    if (!isAdministrator) return;
    setPaletteLoading(true);
    const [mine, published] = await Promise.allSettled([
      listGameAssets({ scope: "mine", status: "all", page: 1, pageSize: 100 }),
      listGameAssets({ status: "published", page: 1, pageSize: 100 }),
    ]);
    const sourceAssets: IGameAssetDoc[] = [
      ...(mine.status === "fulfilled" ? mine.value.data : []),
      ...(published.status === "fulfilled" ? published.value.data : []),
    ];
    const nextPalette = Array.from(
        new globalThis.Map<string, IStageAsset>(
        sourceAssets
          .map(toStagePaletteAsset)
          .filter((asset): asset is IStageAsset => Boolean(asset))
          .map((asset) => [asset.name, asset]),
      ).values(),
    );
    setPaletteAssets(nextPalette);
    setPaletteWarning(mine.status === "rejected" || published.status === "rejected"
      ? lang({ ko: "공용 팔레트를 일부 불러오지 못해 현재 맵 에셋도 함께 표시합니다.", en: "Some shared palette assets could not be loaded; map assets are still available." })
      : null);
    setPaletteLoading(false);
  }, [isAdministrator]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- API 결과를 화면 상태와 동기화한다.
    void loadMaps();
    void loadPalette();
  }, [loadMaps, loadPalette]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = mapName.trim();
    const size = Math.floor(Number(mapSize));
    if (!name) {
      setError(lang({ ko: "맵 이름을 입력해 주세요.", en: "Enter a map name." }));
      return;
    }
    if (!Number.isInteger(size) || size < 1 || size > STAGE_MAP_LIMITS.maxWidth) {
      setError(lang({ ko: `크기는 1×1부터 ${STAGE_MAP_LIMITS.maxWidth}×${STAGE_MAP_LIMITS.maxHeight}까지 입력할 수 있습니다.`, en: `Size must be between 1×1 and ${STAGE_MAP_LIMITS.maxWidth}×${STAGE_MAP_LIMITS.maxHeight}.` }));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createStage(buildNewMapPayload(name, size)) as StageDocWithId;
      setMaps((current) => [created, ...current]);
      setSelectedMapKey(stageKey(created));
      setCreateOpen(false);
      setMapName("");
      setMapSize("32");
    } catch (cause) {
      setError(extractApiErrorMessage(cause, lang({ ko: "맵을 만들지 못했습니다.", en: "Failed to create the map." })));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (doc: IStageDoc) => {
    if (!selectedMap?._id) throw new Error("stage_document_id_required");
    setSaving(true);
    try {
      const saved = await updateStage(selectedMap._id, doc) as StageDocWithId;
      const next = { ...saved, _id: saved._id || selectedMap._id };
      setMaps((current) => current.map((stage) => stageKey(stage) === stageKey(selectedMap) ? next : stage));
      trackPlayEvent("forge_map_save", {
        universeId: DEFAULT_PLAY_UNIVERSE,
        tileCount: next.layout?.tiles.length || 0,
      });
      router.push(`/play/${DEFAULT_PLAY_UNIVERSE}/stagemap/${encodeURIComponent(next.stageId)}?mode=view`);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    if (!selectedMap) return;
    router.push(`/play/${DEFAULT_PLAY_UNIVERSE}/stagemap/${encodeURIComponent(selectedMap.stageId)}?mode=view`);
  };

  if (!isAdministrator) return <LockedMapStudio />;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-text">STEP 5</p>
          <h1 className="mt-2 text-2xl font-bold text-primary-text sm:text-3xl">
            <Lang text={{ ko: "맵 스튜디오", en: "Map studio" }} />
          </h1>
          <p className="mt-2 text-sm leading-6 text-secondary-text">
            <Lang text={{ ko: "맵을 고르고, 에셋을 배치한 뒤 저장하면 미리보기로 이어집니다.", en: "Choose a map, place assets, and save to continue to preview." }} />
          </p>
        </div>
        <Button className="min-h-11 shrink-0" onClick={() => setCreateOpen((current) => !current)}>
          <Plus className="mr-2 size-4" aria-hidden />
          <Lang text={{ ko: "새 맵 만들기", en: "Create new map" }} />
        </Button>
      </section>

      {createOpen ? (
        <form className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end" onSubmit={handleCreate}>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <Lang text={{ ko: "맵 이름", en: "Map name" }} />
            <Input value={mapName} maxLength={40} autoFocus onChange={(event) => setMapName(event.target.value)} placeholder={lang({ ko: "예: 숲속 마을", en: "e.g. Forest village" })} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <Lang text={{ ko: "크기", en: "Size" }} />
            <Input type="number" inputMode="numeric" min={1} max={STAGE_MAP_LIMITS.maxWidth} value={mapSize} onChange={(event) => setMapSize(event.target.value)} />
            <span className="text-xs font-normal text-secondary-text">{mapSize || 32}×{mapSize || 32}</span>
          </label>
          <Button type="submit" className="min-h-11" disabled={saving}>
            <Lang text={{ ko: "맵 만들기", en: "Create map" }} />
          </Button>
        </form>
      ) : null}

      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
      {loading || paletteLoading ? <Preloader variant="spin" size="lg" container /> : null}

      {!loading && maps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <LayoutGrid className="mx-auto size-8 text-secondary-text" aria-hidden />
          <p className="mt-3 text-sm font-semibold"><Lang text={{ ko: "아직 만든 맵이 없습니다.", en: "No maps yet." }} /></p>
          <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "새 맵 만들기에서 32×32 기본 맵을 시작하세요.", en: "Start with a 32×32 map from Create new map." }} /></p>
        </div>
      ) : null}

      {maps.length > 0 ? (
        <section aria-label={lang({ ko: "맵 목록", en: "Map list" })}>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <MapIcon className="size-4 text-secondary-text" aria-hidden />
            <Lang text={{ ko: "내 맵", en: "My maps" }} />
            <span className="text-xs font-normal text-secondary-text">{maps.length}</span>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {maps.map((stage) => {
              const key = stageKey(stage);
              const thumbnail = getStageThumbnail(stage);
              const selected = key === selectedMapKey;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`group flex min-h-48 w-full flex-col overflow-hidden rounded-2xl border bg-surface text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transform-none ${selected ? "border-primary" : "border-border"}`}
                    aria-pressed={selected}
                    onClick={() => setSelectedMapKey(key)}
                  >
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-2">
                      {thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element -- R2 맵 에셋의 카드 썸네일
                        <img src={thumbnail} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transform-none" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-secondary-text"><LayoutGrid className="size-8" aria-hidden /></div>
                      )}
                    </div>
                    <div className="flex flex-1 items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-primary-text">{stage.stageName}</p>
                        <p className="mt-1 text-xs text-secondary-text">{stage.layout?.width || 32}×{stage.layout?.height || 32} · {stage.layout?.tiles.length || 0}개 배치</p>
                      </div>
                      {selected ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary"><Lang text={{ ko: "선택됨", en: "Selected" }} /></span> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {paletteWarning ? <p className="text-xs text-secondary-text" role="status">{paletteWarning}</p> : null}

      {editorStage ? (
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-label={lang({ ko: "맵 편집기", en: "Map editor" })}>
          <StageMapEditor
            key={stageKey(selectedMap as StageDocWithId)}
            stageDoc={editorStage}
            variant="studio"
            onSave={handleSave}
            onPreview={handlePreview}
          />
        </section>
      ) : null}
    </div>
  );
}
