"use client";

/* eslint-disable react-hooks/set-state-in-effect -- selected asset is the external editor identity */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app";
import { listStages, publishGameAsset, updateGameAsset } from "libs/api/game";
import { getAllPersonas } from "libs/api/universe/persona";
import type { IExtendedNpcData, IGameAssetDoc, IStageDoc } from "types/game";
import type { GameAssetStatusType } from "types/game/asset";
import { lang } from "components/module/i18n";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";
import {
  DEFAULT_METADATA_FORM,
  DEFAULT_PUBLISH_FORM,
  REGION_MIN_SIZE,
  SPRITE_DIRECTION_GUIDES,
  clampNumber,
  createRegionDraft,
  createSpritePreview,
  formatRegionNumber,
  getAssetSpriteSheetForm,
  getFrameSequence,
  getRegionPreviewSize,
  getRegionRect,
  splitTags,
  toPositiveInteger,
  type PublishFormType,
  type RegionDragMode,
  type RegionDragState,
  type RegionDraftType,
  type RegionRect,
} from "./gameAssetForgeModel";

export function useGameAssetRuntimeEditor({
  selectedAsset,
  defaultUniverseId,
  onReload,
}: {
  selectedAsset: IGameAssetDoc | null;
  defaultUniverseId: string;
  onReload: () => Promise<void>;
}) {
  const regionPreviewRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [metadataForm, setMetadataForm] = useState(DEFAULT_METADATA_FORM);
  const [publishForm, setPublishForm] = useState<PublishFormType>(DEFAULT_PUBLISH_FORM);
  const [stageOptions, setStageOptions] = useState<IStageDoc[]>([]);
  const [personaOptions, setPersonaOptions] = useState<IExtendedNpcData[]>([]);
  const [targetLoading, setTargetLoading] = useState(false);
  const [spriteSequenceIndex, setSpriteSequenceIndex] = useState(0);
  const [spritePreviewPlaying, setSpritePreviewPlaying] = useState(false);
  const [activeRegionIndex, setActiveRegionIndex] = useState<number | null>(null);
  const [regionDrag, setRegionDrag] = useState<RegionDragState | null>(null);

  const spritePreview = useMemo(
    () => createSpritePreview(selectedAsset, metadataForm),
    [selectedAsset, metadataForm],
  );
  const regionPreviewSize = useMemo(
    () => getRegionPreviewSize(selectedAsset, metadataForm),
    [selectedAsset, metadataForm],
  );

  useEffect(function syncFormsFromSelectedAsset() {
    // Selection is the external editor identity; reset the controlled form snapshot atomically.
    if (!selectedAsset) {
      setMetadataForm(DEFAULT_METADATA_FORM);
      setPublishForm(DEFAULT_PUBLISH_FORM);
      setActiveRegionIndex(null);
      return;
    }

    setMetadataForm(getAssetSpriteSheetForm(selectedAsset));
    const spriteAction = toUnknownRecord(toUnknownRecord(selectedAsset.meta).spriteAction);
    setPublishForm((current) => ({
      ...current,
      universeId: selectedAsset.universeId || current.universeId || defaultUniverseId || DEFAULT_PLAY_UNIVERSE,
      personaPid: "",
      spriteActionKey: String(spriteAction.key || "walk"),
      stageId: selectedAsset.stageId || "",
      assetName: selectedAsset.name || selectedAsset.gameAssetId,
      width: String(selectedAsset.runtime?.footprint?.width || 1),
      height: String(selectedAsset.runtime?.footprint?.height || 1),
    }));
    setActiveRegionIndex(null);
  }, [defaultUniverseId, selectedAsset]);

  useEffect(function animateSpritePreview() {
    if (!spritePreview || !spritePreviewPlaying) return;
    const delay = Math.max(80, Math.round(1000 / Number(spritePreview.fps || 8)));
    const timer = window.setInterval(() => {
      setSpriteSequenceIndex((current) => (current + 1) % Math.max(1, spritePreview.columns));
    }, delay);
    return () => window.clearInterval(timer);
  }, [spritePreview, spritePreviewPlaying]);

  useEffect(function followReducedMotionPreference() {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSpritePreviewPlaying(!media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(function bindRegionPointerDrag() {
    if (!regionDrag) return;

    const updateRegionByPointer = (event: PointerEvent) => {
      event.preventDefault();
      const dx = (event.clientX - regionDrag.startClientX) * regionDrag.scaleX;
      const dy = (event.clientY - regionDrag.startClientY) * regionDrag.scaleY;
      const origin = regionDrag.origin;
      const next: RegionRect = { ...origin };

      if (regionDrag.mode === "move") {
        next.x = clampNumber(origin.x + dx, 0, regionDrag.imageWidth - origin.width);
        next.y = clampNumber(origin.y + dy, 0, regionDrag.imageHeight - origin.height);
      } else {
        if (regionDrag.mode.includes("e")) {
          next.width = clampNumber(origin.width + dx, REGION_MIN_SIZE, regionDrag.imageWidth - origin.x);
        }
        if (regionDrag.mode.includes("s")) {
          next.height = clampNumber(origin.height + dy, REGION_MIN_SIZE, regionDrag.imageHeight - origin.y);
        }
        if (regionDrag.mode.includes("w")) {
          const right = origin.x + origin.width;
          next.x = clampNumber(origin.x + dx, 0, right - REGION_MIN_SIZE);
          next.width = right - next.x;
        }
        if (regionDrag.mode.includes("n")) {
          const bottom = origin.y + origin.height;
          next.y = clampNumber(origin.y + dy, 0, bottom - REGION_MIN_SIZE);
          next.height = bottom - next.y;
        }
      }

      setMetadataForm((current) => ({
        ...current,
        regions: current.regions.map((region, index) =>
          index === regionDrag.index
            ? {
                ...region,
                x: formatRegionNumber(next.x),
                y: formatRegionNumber(next.y),
                width: formatRegionNumber(next.width),
                height: formatRegionNumber(next.height),
              }
            : region,
        ),
      }));
    };

    const endRegionDrag = () => setRegionDrag(null);
    window.addEventListener("pointermove", updateRegionByPointer, { passive: false });
    window.addEventListener("pointerup", endRegionDrag);
    window.addEventListener("pointercancel", endRegionDrag);
    return () => {
      window.removeEventListener("pointermove", updateRegionByPointer);
      window.removeEventListener("pointerup", endRegionDrag);
      window.removeEventListener("pointercancel", endRegionDrag);
    };
  }, [regionDrag]);

  const loadPublishTargets = async () => {
    try {
      setTargetLoading(true);
      const universeId =
        publishForm.universeId.trim() || selectedAsset?.universeId || defaultUniverseId || DEFAULT_PLAY_UNIVERSE;
      const [stageData, personaData] = await Promise.all([
        listStages({ pageSize: 100 }),
        universeId ? getAllPersonas(universeId) : Promise.resolve([]),
      ]);
      setStageOptions(stageData.data || []);
      setPersonaOptions(personaData || []);
    } catch (error) {
      logger.error("[GameAssetForge] publish targets load failed:", error);
      toast.error(lang({ ko: "발행 대상 목록을 불러오지 못했습니다.", en: "Failed to load publish targets." }));
    } finally {
      setTargetLoading(false);
    }
  };

  const loadStageTargets = async () => {
    try {
      setTargetLoading(true);
      const stageData = await listStages({ pageSize: 100, domain: "stage" });
      setStageOptions(stageData.data || []);
    } catch (error) {
      logger.error("[GameAssetForge] stage targets load failed:", error);
      toast.error(lang({ ko: "스테이지 목록을 불러오지 못했습니다.", en: "Failed to load stages." }));
    } finally {
      setTargetLoading(false);
    }
  };

  const attachToStage = async (stageDocumentId: string) => {
    if (!selectedAsset || !stageDocumentId) return;
    try {
      setSaving(true);
      await publishGameAsset({
        gameAssetId: selectedAsset.gameAssetId,
        targetType: "stage",
        stageDocumentId,
      });
      toast.success(lang({ ko: "에셋을 스테이지 팔레트에 추가했습니다.", en: "Asset added to the stage palette." }));
      await onReload();
    } catch (error) {
      logger.error("[GameAssetForge] quick stage attach failed:", error);
      toast.error(lang({ ko: "스테이지 연결에 실패했습니다.", en: "Failed to attach the asset to the stage." }));
    } finally {
      setSaving(false);
    }
  };

  const addRegion = () => {
    setMetadataForm((current) => ({
      ...current,
      regions: [...current.regions, createRegionDraft(current.regions.length)],
    }));
  };

  const changeRegion = (index: number, patch: Partial<RegionDraftType>) => {
    setMetadataForm((current) => ({
      ...current,
      regions: current.regions.map((region, currentIndex) =>
        currentIndex === index ? { ...region, ...patch } : region,
      ),
    }));
  };

  const removeRegion = (index: number) => {
    setMetadataForm((current) => ({
      ...current,
      regions: current.regions.filter((_, currentIndex) => currentIndex !== index),
    }));
    setActiveRegionIndex((current) =>
      current === index ? null : current && current > index ? current - 1 : current,
    );
  };

  const beginRegionPointerDrag = (
    event: ReactPointerEvent<HTMLElement>,
    index: number,
    mode: RegionDragMode,
  ) => {
    const previewRect = regionPreviewRef.current?.getBoundingClientRect();
    const region = metadataForm.regions[index];
    if (!previewRect || !region || previewRect.width <= 0 || previewRect.height <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    setActiveRegionIndex(index);

    const imageWidth = Math.max(1, regionPreviewSize.width);
    const imageHeight = Math.max(1, regionPreviewSize.height);
    const origin = getRegionRect(region);
    setRegionDrag({
      index,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      scaleX: imageWidth / previewRect.width,
      scaleY: imageHeight / previewRect.height,
      imageWidth,
      imageHeight,
      origin: {
        x: clampNumber(origin.x, 0, imageWidth - REGION_MIN_SIZE),
        y: clampNumber(origin.y, 0, imageHeight - REGION_MIN_SIZE),
        width: clampNumber(origin.width, REGION_MIN_SIZE, imageWidth - origin.x),
        height: clampNumber(origin.height, REGION_MIN_SIZE, imageHeight - origin.y),
      },
    });
  };

  const saveMetadata = async () => {
    if (!selectedAsset) return;
    try {
      setSaving(true);
      await updateGameAsset({
        gameAssetId: selectedAsset.gameAssetId,
        spriteSheet: {
          frameWidth: toPositiveInteger(metadataForm.frameWidth, 256),
          frameHeight: toPositiveInteger(metadataForm.frameHeight, 256),
          columns: toPositiveInteger(metadataForm.columns, 4),
          rows: toPositiveInteger(metadataForm.rows, 4),
          fps: toPositiveInteger(metadataForm.fps, 8),
          animations: Object.fromEntries(
            SPRITE_DIRECTION_GUIDES.map(({ direction }, row) => [
              direction,
              { row, frames: getFrameSequence(toPositiveInteger(metadataForm.columns, 4)) },
            ]),
          ),
        },
        regions: metadataForm.regions
          .map((region, index) => ({
            key: region.key.trim() || `region-${index + 1}`,
            rect: {
              x: Math.max(0, Number(region.x || 0)),
              y: Math.max(0, Number(region.y || 0)),
              width: toPositiveInteger(region.width, 1),
              height: toPositiveInteger(region.height, 1),
            },
            role: region.role.trim(),
          }))
          .filter((region) => region.rect.width > 0 && region.rect.height > 0),
      });
      toast.success(lang({ ko: "에셋 메타를 저장했습니다.", en: "Asset metadata was saved." }));
      await onReload();
    } catch (error) {
      logger.error("[GameAssetForge] metadata save failed:", error);
      toast.error(lang({ ko: "에셋 메타 저장에 실패했습니다.", en: "Failed to save asset metadata." }));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!selectedAsset) return;
    try {
      setSaving(true);
      await publishGameAsset({
        gameAssetId: selectedAsset.gameAssetId,
        targetType: publishForm.targetType,
        universeId: publishForm.universeId.trim() || selectedAsset.universeId || defaultUniverseId,
        personaPid: publishForm.personaPid.trim(),
        spriteActionKey: publishForm.spriteActionKey.trim() || "walk",
        stageDocumentId: publishForm.stageDocumentId.trim(),
        stageId: publishForm.stageId.trim(),
        stageName: publishForm.stageName.trim(),
        assetName: publishForm.assetName.trim(),
        roles: splitTags(publishForm.rolesText),
        size: {
          width: toPositiveInteger(publishForm.width, 1),
          height: toPositiveInteger(publishForm.height, 1),
        },
      });
      toast.success(lang({ ko: "게임 에셋을 발행했습니다.", en: "Game asset was published." }));
      await onReload();
    } catch (error) {
      logger.error("[GameAssetForge] publish failed:", error);
      toast.error(lang({ ko: "게임 에셋 발행에 실패했습니다.", en: "Failed to publish game asset." }));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (gameAssetId: string, status: GameAssetStatusType) => {
    try {
      setSaving(true);
      await updateGameAsset({ gameAssetId, status });
      await onReload();
    } catch (error) {
      logger.error("[GameAssetForge] status update failed:", error);
      toast.error(lang({ ko: "상태 변경에 실패했습니다.", en: "Failed to update status." }));
    } finally {
      setSaving(false);
    }
  };

  return {
    activeRegionIndex,
    addRegion,
    beginRegionPointerDrag,
    attachToStage,
    changeStatus,
    changeRegion,
    loadPublishTargets,
    loadStageTargets,
    metadataForm,
    personaOptions,
    publish,
    publishForm,
    regionPreviewRef,
    regionPreviewSize,
    removeRegion,
    saveMetadata,
    saving,
    setActiveRegionIndex,
    setMetadataForm,
    setPublishForm,
    spritePreview,
    spritePreviewPlaying,
    spriteSequenceIndex,
    setSpritePreviewPlaying,
    stageOptions,
    targetLoading,
  };
}
