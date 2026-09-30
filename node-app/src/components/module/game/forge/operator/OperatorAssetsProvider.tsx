"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  createGameAsset,
  listGameAssets,
  listGameAssetTemplates,
  seedGameAssetTemplates,
} from "libs/api/game";
import { listStudioImageMetas } from "libs/api/lab";
import { uploadPersonaImageLibraryAsset } from "libs/api/persona/imageLibrary";
import { lang } from "components/module/i18n";
import type { ImagePromptMetaType, PromptItemExtendedType } from "types/app";
import type { GameAssetInventorySummaryType, IGameAssetDoc } from "types/game/asset";
import { logger } from "utils/log";
import { validateStageAssetProjectionMeta } from "utils/game";
import { isGameSpecEnforcedAssetType } from "utils/game/gameAssetSpec";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app";
import {
  DEFAULT_FORM,
  DEFAULT_LIST_FILTERS,
  applyStudioImageToDraft,
  splitTags,
  type DraftFormType,
  type GameAssetListFiltersType,
} from "components/module/admin/game-assets/gameAssetForgeModel";
import { useGameAssetRuntimeEditor } from "components/module/admin/game-assets/useGameAssetRuntimeEditor";

type RuntimeEditorType = ReturnType<typeof useGameAssetRuntimeEditor>;
type ProjectionMetaValidationType = ReturnType<typeof validateStageAssetProjectionMeta> | null;

export type AssetsStudioContextValue = {
  templates: PromptItemExtendedType[];
  registeredKeySet: Set<string>;
  assets: IGameAssetDoc[];
  loading: boolean;
  saving: boolean;
  form: DraftFormType;
  setForm: Dispatch<SetStateAction<DraftFormType>>;
  listFilters: GameAssetListFiltersType;
  setListFilters: Dispatch<SetStateAction<GameAssetListFiltersType>>;
  inventory: GameAssetInventorySummaryType | null;
  studioImages: ImagePromptMetaType[];
  studioTemplateKey: string;
  studioSearched: boolean;
  studioLoading: boolean;
  selectedAssetId: string;
  setSelectedAssetId: Dispatch<SetStateAction<string>>;
  drawingOpen: boolean;
  setDrawingOpen: Dispatch<SetStateAction<boolean>>;
  drawingSaving: boolean;
  personaManagerOpen: boolean;
  setPersonaManagerOpen: Dispatch<SetStateAction<boolean>>;
  postProductionOpen: boolean;
  setPostProductionOpen: Dispatch<SetStateAction<boolean>>;
  chromaKeyOpen: boolean;
  setChromaKeyOpen: Dispatch<SetStateAction<boolean>>;
  selectedAsset: IGameAssetDoc | null;
  projectionMetaValidation: ProjectionMetaValidationType;
  runtimeEditor: RuntimeEditorType;
  busy: boolean;
  load: () => Promise<void>;
  handleStudioTemplateKeyChange: (value: string) => void;
  loadStudioImages: () => Promise<void>;
  handleSelectStudioImage: (image: ImagePromptMetaType) => void;
  handleSeedTemplates: () => Promise<void>;
  handleCreateAsset: () => Promise<void>;
  handleApplyAnchorDrawing: (file: File) => Promise<void>;
};

const AssetsStudioContext = createContext<AssetsStudioContextValue | null>(null);

export function AssetsStudioProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState<PromptItemExtendedType[]>([]);
  const [registeredTemplates, setRegisteredTemplates] = useState<PromptItemExtendedType[]>([]);
  const [assets, setAssets] = useState<IGameAssetDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DraftFormType>(DEFAULT_FORM);
  const [listFilters, setListFilters] = useState<GameAssetListFiltersType>(DEFAULT_LIST_FILTERS);
  const [inventory, setInventory] = useState<GameAssetInventorySummaryType | null>(null);
  const [studioImages, setStudioImages] = useState<ImagePromptMetaType[]>([]);
  const [studioTemplateKey, setStudioTemplateKey] = useState("");
  const [studioSearched, setStudioSearched] = useState(false);
  const [studioLoading, setStudioLoading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [drawingSaving, setDrawingSaving] = useState(false);
  const [personaManagerOpen, setPersonaManagerOpen] = useState(false);
  const [postProductionOpen, setPostProductionOpen] = useState(false);
  const [chromaKeyOpen, setChromaKeyOpen] = useState(false);

  const registeredKeySet = useMemo(
    () => new Set(registeredTemplates.map((template) => String(template.key || ""))),
    [registeredTemplates],
  );
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.gameAssetId === selectedAssetId) || null,
    [assets, selectedAssetId],
  );
  const projectionMetaValidation = useMemo(() => {
    if (!selectedAsset || !isGameSpecEnforcedAssetType(String(selectedAsset.assetType || ""))) return null;
    const runtime = selectedAsset.runtime || {};
    return validateStageAssetProjectionMeta({
      isoFootprint: runtime.footprint
        ? { width: Number(runtime.footprint.width), height: Number(runtime.footprint.height), offsetX: 0, offsetY: 0 }
        : undefined,
      isoAnchor:
        runtime.anchor && runtime.anchor.x !== undefined && runtime.anchor.y !== undefined
          ? { x: Number(runtime.anchor.x), y: Number(runtime.anchor.y) }
          : undefined,
      isoHeightPx: runtime.isoHeightPx !== undefined ? Number(runtime.isoHeightPx) : undefined,
    });
  }, [selectedAsset]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const commonFilters = {
        assetType: listFilters.assetType === "all" ? undefined : listFilters.assetType,
        universeId: listFilters.universeId.trim() || undefined,
        stageId: listFilters.stageId.trim() || undefined,
        scope: listFilters.scope,
      };
      const [templateData, assetData, inventoryData] = await Promise.all([
        listGameAssetTemplates(),
        listGameAssets({ ...commonFilters, status: listFilters.status, pageSize: 40 }),
        listGameAssets({ ...commonFilters, assetType: undefined, status: "all", pageSize: 1 }),
      ]);
      setTemplates(templateData.templates || []);
      setRegisteredTemplates(templateData.registered || []);
      setAssets(assetData.data || []);
      setInventory(inventoryData.inventory || null);
    } catch (error) {
      logger.error("[AssetsStudioProvider] load failed:", error);
      toast.error(lang({ ko: "게임 에셋 데이터를 불러오지 못했습니다.", en: "Failed to load game asset data." }));
    } finally {
      setLoading(false);
    }
  }, [listFilters]);

  useEffect(
    function fetchAssetsOnStatusChange() {
      // 필터가 바뀌면 재조회한다. load가 첫 줄에서 setLoading(true)를 부르므로
      // effect 본문에서 곧바로 호출하면 동기 setState가 되어 연쇄 렌더를 만든다.
      // 마이크로태스크 뒤로 한 번 미루고, 그 사이 effect가 정리되면 요청을 시작하지 않는다.
      let cancelled = false;
      void (async () => {
        await Promise.resolve();
        if (cancelled) return;
        await load();
      })();
      return function cancelPendingLoad() {
        cancelled = true;
      };
    },
    [load],
  );

  const runtimeEditor = useGameAssetRuntimeEditor({
    selectedAsset,
    defaultUniverseId: form.universeId,
    onReload: load,
  });
  const busy = saving || runtimeEditor.saving;

  const loadStudioImages = async () => {
    try {
      setStudioSearched(true);
      setStudioLoading(true);
      const rows = await listStudioImageMetas({
        scope: "all",
        q: studioTemplateKey.trim() || undefined,
        searchField: "all",
        generationMode: "template",
        limit: 24,
      });
      setStudioImages(rows || []);
    } catch (error) {
      logger.error("[AssetsStudioProvider] studio images load failed:", error);
      toast.error(lang({ ko: "Gen Studio 결과를 불러오지 못했습니다.", en: "Failed to load Gen Studio results." }));
    } finally {
      setStudioLoading(false);
    }
  };

  const handleStudioTemplateKeyChange = (value: string) => {
    setStudioTemplateKey(value);
    setStudioSearched(false);
    setStudioImages([]);
  };

  const handleSeedTemplates = async () => {
    try {
      setSaving(true);
      await seedGameAssetTemplates();
      toast.success(lang({ ko: "게임 에셋 템플릿을 등록했습니다.", en: "Game asset templates were registered." }));
      await load();
    } catch (error) {
      logger.error("[AssetsStudioProvider] seed failed:", error);
      toast.error(lang({ ko: "템플릿 등록에 실패했습니다.", en: "Failed to register templates." }));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAsset = async () => {
    const name = form.name.trim();
    const sourceImageAssetId = form.sourceImageAssetId.trim();
    const storageUrl = form.storageUrl.trim();
    if (!name || (!sourceImageAssetId && !storageUrl)) {
      toast.error(lang({ ko: "이름과 sourceImageAssetId 또는 보정 이미지 URL이 필요합니다.", en: "Name and either sourceImageAssetId or edited image URL are required." }));
      return;
    }

    try {
      setSaving(true);
      await createGameAsset({
        name,
        assetType: form.assetType,
        sourceImageAssetId,
        sourceType: sourceImageAssetId ? "generated" : "uploaded",
        templateKey: form.templateKey.trim(),
        universeId: form.universeId.trim(),
        stageId: form.stageId.trim(),
        tags: splitTags(form.tagsText),
        categories: ["all-my-universe", "game-asset", form.assetType],
        storage: storageUrl ? { url: storageUrl } : undefined,
      });
      setForm(DEFAULT_FORM);
      toast.success(lang({ ko: "게임 에셋 드래프트를 생성했습니다.", en: "Game asset draft was created." }));
      await load();
    } catch (error) {
      logger.error("[AssetsStudioProvider] create failed:", error);
      toast.error(lang({ ko: "게임 에셋 드래프트 생성에 실패했습니다.", en: "Failed to create game asset draft." }));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectStudioImage = (image: ImagePromptMetaType) => {
    setForm((current) => applyStudioImageToDraft(current, image));
  };

  const handleApplyAnchorDrawing = async (file: File) => {
    try {
      setDrawingSaving(true);
      const saved = await uploadPersonaImageLibraryAsset({
        file,
        universeId: form.universeId.trim() || DEFAULT_PLAY_UNIVERSE,
        source: "uploaded_reference",
        tags: ["game-asset-forge", "character-style-anchor", "drawing-edited"],
        reference: {
          kind: "profile_reference_sketch",
          note: form.name.trim() || lang({ ko: "게임 캐릭터 스타일 기준", en: "Game character style anchor" }),
        },
      });
      const url = String(saved.storage.originalUrl || saved.storage.optimizedUrl || "").trim();
      if (!url) throw new Error("edited_anchor_url_missing");
      setForm((current) => ({
        ...current,
        sourceImageAssetId: "",
        storageUrl: url,
        name: current.name || lang({ ko: "편집한 캐릭터 기준", en: "Edited character anchor" }),
      }));
      toast.success(lang({ ko: "드로잉 편집본을 R2에 저장하고 스타일 기준 이미지로 적용했습니다.", en: "Saved the drawing edit to R2 and applied it as the style anchor." }));
    } catch (error) {
      logger.error("[AssetsStudioProvider] anchor drawing save failed:", error);
      toast.error(lang({ ko: "편집 이미지를 스타일 기준으로 저장하지 못했습니다.", en: "Failed to save the edited image as the style anchor." }));
      throw error;
    } finally {
      setDrawingSaving(false);
    }
  };

  const value: AssetsStudioContextValue = {
    templates,
    registeredKeySet,
    assets,
    loading,
    saving,
    form,
    setForm,
    listFilters,
    setListFilters,
    inventory,
    studioImages,
    studioTemplateKey,
    studioSearched,
    studioLoading,
    selectedAssetId,
    setSelectedAssetId,
    drawingOpen,
    setDrawingOpen,
    drawingSaving,
    personaManagerOpen,
    setPersonaManagerOpen,
    postProductionOpen,
    setPostProductionOpen,
    chromaKeyOpen,
    setChromaKeyOpen,
    selectedAsset,
    projectionMetaValidation,
    runtimeEditor,
    busy,
    load,
    handleStudioTemplateKeyChange,
    loadStudioImages,
    handleSelectStudioImage,
    handleSeedTemplates,
    handleCreateAsset,
    handleApplyAnchorDrawing,
  };

  return <AssetsStudioContext.Provider value={value}>{children}</AssetsStudioContext.Provider>;
}

export function useAssetsStudio() {
  const value = useContext(AssetsStudioContext);
  if (!value) throw new Error("useAssetsStudio must be used within AssetsStudioProvider");
  return value;
}
