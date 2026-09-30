"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { IStageDoc, IStageAssetMeta } from "types/game";
import { Button, Input, ImageDropzone, dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { createStage, updateStage, deleteStage } from "libs/api/game/stageAdminClient";
import { uploadStageImage } from "libs/api/game/stageAssetUploadClient";
import { useUserData } from "hooks/auth";
import { extractApiErrorMessage } from "utils/common/typeUtils";
import { DEFAULT_STAGE_PROJECTION_CONFIG_V2 } from "utils/game/stageCoordinateContract";

type StageDocWithId = IStageDoc & { _id?: string };
type StageEditorMode = "create" | "edit";

interface StageEditorProps {
  mode: StageEditorMode;
  initialStage?: StageDocWithId;
  universeIdForOwner?: string;
  onSaved?: (stage: StageDocWithId) => void;
  onDeleted?: (id: string) => void;
}

const BORDER_KEYS = ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"] as const;
const ISO_LAYERS = ["ground", "object", "roof", "overlay"] as const;

function makeEmptyStage(universeIdForOwner?: string): StageDocWithId {
  return {
    stageId: "",
    stageName: "",
    domain: "stage",
    usageType: "game",
    ownerType: universeIdForOwner ? "universe" : "global",
    ownerId: universeIdForOwner,
    visibility: "private",
    coordinateContractVersion: 2,
    projectionConfig: DEFAULT_STAGE_PROJECTION_CONFIG_V2,
    background: undefined,
    border: {},
    assets: [],
    layout: undefined,
  };
}

async function probeImageSize(url: string): Promise<{ width: number; height: number }> {
  // 브라우저에서만
  if (typeof window === "undefined") return { width: 0, height: 0 };

  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

export function StageEditor({ mode, initialStage, universeIdForOwner, onSaved, onDeleted }: StageEditorProps) {
  const { userData } = useUserData();

  const [stage, setStage] = useState<StageDocWithId>(() => initialStage || makeEmptyStage(universeIdForOwner));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 업로드 상태(필드별)
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string | null>>({});

  useEffect(function syncStageFromInitialProp() {
    // initialStage prop(외부 데이터) 변경 시 내부 편집 state를 초기화
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStage(initialStage || makeEmptyStage(universeIdForOwner));
    setError(null);
    setUploading({});
    setUploadErrors({});
  }, [initialStage, mode, universeIdForOwner]);

  const currentUserKey = userData?.userEmailLower || userData?.userEmail || "";
  const releaseLocked = stage.releaseDeployment?.status === "prepared" || stage.releaseDeployment?.status === "active";

  const canUploadNow = useMemo(() => {
    return !releaseLocked && (stage.stageId || "").trim().length > 0 && (stage.stageName || "").trim().length > 0;
  }, [releaseLocked, stage.stageId, stage.stageName]);

  const setUploadingKey = (k: string, v: boolean) => setUploading((prev) => ({ ...prev, [k]: v }));
  const setUploadErrorKey = (k: string, v: string | null) => setUploadErrors((prev) => ({ ...prev, [k]: v }));

  const handleFieldChange = (field: keyof IStageDoc, value: unknown) => {
    setStage((prev) => ({ ...prev, [field]: value }));
  };

  const handleBackgroundChange = (field: "name" | "width" | "height", value: string) => {
    setStage((prev) => {
      const bg = { ...(prev.background || { name: "", size: { width: 0, height: 0 } }) };
      if (!bg.size) bg.size = { width: 0, height: 0 };

      if (field === "name") bg.name = value;
      if (field === "width") bg.size.width = Number(value) || 0;
      if (field === "height") bg.size.height = Number(value) || 0;

      // name이 빈 값이면 background 자체를 제거해도 되지만, 현재는 유지(사용자가 다시 입력할 수 있게)
      return { ...prev, background: bg };
    });
  };

  const handleBorderChange = (key: (typeof BORDER_KEYS)[number], value: string) => {
    setStage((prev) => ({
      ...prev,
      border: {
        ...(prev.border || {}),
        [key]: value || undefined,
      },
    }));
  };

  const handleAddAsset = () => {
    setStage((prev) => ({
      ...prev,
      assets: [
        ...(prev.assets || []),
        {
          name: "",
          fileName: "",
          size: { width: 1, height: 1 },
          roles: [],
          meta: {},
        },
      ],
    }));
  };

  const handleRemoveAsset = (idx: number) => {
    setStage((prev) => {
      const list = [...(prev.assets || [])];
      list.splice(idx, 1);
      return { ...prev, assets: list };
    });
  };

  const handleAssetFieldChange = (
    idx: number,
    field: "name" | "fileName" | "width" | "height" | "roles",
    value: string,
  ) => {
    setStage((prev) => {
      const list = [...(prev.assets || [])];
      const asset = { ...(list[idx] || { name: "", fileName: "", size: { width: 1, height: 1 } }) };

      if (!asset.size) asset.size = { width: 1, height: 1 };

      switch (field) {
        case "name":
          asset.name = value;
          break;
        case "fileName":
          asset.fileName = value;
          break;
        case "width":
          asset.size.width = Number(value) || 1;
          break;
        case "height":
          asset.size.height = Number(value) || 1;
          break;
        case "roles":
          asset.roles = value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
          break;
      }

      list[idx] = asset;
      return { ...prev, assets: list };
    });
  };

  const handleAssetMetaChange = (
    idx: number,
    field: "maxHp" | "defaultCondition" | "isoHeightPx" | "isoLayer",
    value: string,
  ) => {
    setStage((prev) => {
      const list = [...(prev.assets || [])];
      const asset = { ...(list[idx] || { name: "", fileName: "", size: { width: 1, height: 1 }, meta: {} as IStageAssetMeta }) };
      const meta: IStageAssetMeta = { ...(asset.meta || {}) };

      if (field === "maxHp") meta.maxHp = value === "" ? undefined : Number(value) || 0;
      if (field === "defaultCondition") meta.defaultCondition = value === "" ? undefined : Number(value);
      if (field === "isoHeightPx") meta.isoHeightPx = value === "" ? undefined : Number(value) || 0;
      if (field === "isoLayer") meta.isoLayer = (value || undefined) as IStageAssetMeta["isoLayer"];

      asset.meta = meta;
      list[idx] = asset;
      return { ...prev, assets: list };
    });
  };

  const handleAddAssetState = (idx: number) => {
    setStage((prev) => {
      const list = [...(prev.assets || [])];
      const asset = { ...(list[idx] || { name: "", fileName: "", size: { width: 1, height: 1 }, meta: {} as IStageAssetMeta }) };
      const meta: IStageAssetMeta = { ...(asset.meta || {}) };
      const states: Array<{ key: string; fileName: string }> = Array.isArray(meta.states) ? [...meta.states] : [];
      states.push({ key: "", fileName: "" });
      meta.states = states;
      asset.meta = meta;
      list[idx] = asset;
      return { ...prev, assets: list };
    });
  };

  const handleAssetStateChange = (idx: number, stateIdx: number, field: "key" | "fileName", value: string) => {
    setStage((prev) => {
      const list = [...(prev.assets || [])];
      const asset = { ...(list[idx] || { name: "", fileName: "", size: { width: 1, height: 1 }, meta: {} as IStageAssetMeta }) };
      const meta: IStageAssetMeta = { ...(asset.meta || {}) };
      const states: Array<{ key: string; fileName: string }> = Array.isArray(meta.states) ? [...meta.states] : [];
      if (!states[stateIdx]) states[stateIdx] = { key: "", fileName: "" };

      states[stateIdx] = { ...states[stateIdx], [field]: value };
      meta.states = states;
      asset.meta = meta;
      list[idx] = asset;

      return { ...prev, assets: list };
    });
  };

  const handleRemoveAssetState = (idx: number, stateIdx: number) => {
    setStage((prev) => {
      const list = [...(prev.assets || [])];
      const asset = { ...(list[idx] || { name: "", fileName: "", size: { width: 1, height: 1 }, meta: {} as IStageAssetMeta }) };
      const meta: IStageAssetMeta = { ...(asset.meta || {}) };
      const states: Array<{ key: string; fileName: string }> = Array.isArray(meta.states) ? [...meta.states] : [];
      states.splice(stateIdx, 1);
      meta.states = states;
      asset.meta = meta;
      list[idx] = asset;
      return { ...prev, assets: list };
    });
  };

  // ========= 업로드 핸들러들 (필드별) =========
  const uploadFileToStageFolder = async (uploadKey: string, file: File) => {
    if (!canUploadNow) {
      throw new Error(
        lang({ ko: "업로드 전에 stageId / stageName을 먼저 입력하세요.", en: "Set stageId/stageName before upload." }),
      );
    }

    setUploadErrorKey(uploadKey, null);
    setUploadingKey(uploadKey, true);

    try {
      const sid = stage.stageId.trim();
      const sname = stage.stageName.trim();

      const { fileName, url } = await uploadStageImage({
        universeId:
          universeIdForOwner ||
          (stage.ownerType === "universe" ? String(stage.ownerId || "") : "shared"),
        stageId: sid,
        stageName: sname,
        file,
      });

      return { fileName, url };
    } finally {
      setUploadingKey(uploadKey, false);
    }
  };

  const handleUploadBackground = async (file: File) => {
    const key = "bg";
    try {
      const { fileName, url } = await uploadFileToStageFolder(key, file);
      handleBackgroundChange("name", url || fileName);

      // 업로드 후 자동으로 이미지 픽셀 크기 입력(선택)
      const size = await probeImageSize(url);
      if (size.width && size.height) {
        handleBackgroundChange("width", String(size.width));
        handleBackgroundChange("height", String(size.height));
      }
    } catch (e) {
      setUploadErrorKey(key, extractApiErrorMessage(e, "Upload failed"));
    }
  };

  const handleUploadBorder = async (borderKey: (typeof BORDER_KEYS)[number], file: File) => {
    const key = `border:${borderKey}`;
    try {
      const { fileName, url } = await uploadFileToStageFolder(key, file);
      handleBorderChange(borderKey, url || fileName);
    } catch (e) {
      setUploadErrorKey(key, extractApiErrorMessage(e, "Upload failed"));
    }
  };

  const handleUploadAssetBase = async (idx: number, file: File) => {
    const key = `asset:${idx}:base`;
    try {
      const { fileName, url } = await uploadFileToStageFolder(key, file);
      handleAssetFieldChange(idx, "fileName", url || fileName);
    } catch (e) {
      setUploadErrorKey(key, extractApiErrorMessage(e, "Upload failed"));
    }
  };

  const handleUploadAssetState = async (idx: number, stateIdx: number, file: File) => {
    const key = `asset:${idx}:state:${stateIdx}`;
    try {
      const { fileName, url } = await uploadFileToStageFolder(key, file);
      handleAssetStateChange(idx, stateIdx, "fileName", url || fileName);
    } catch (e) {
      setUploadErrorKey(key, extractApiErrorMessage(e, "Upload failed"));
    }
  };

  // ========= 저장/삭제 =========
  const handleSave = async () => {
    if (!stage.stageId?.trim() || !stage.stageName?.trim()) {
      setError(lang({ ko: "stageId와 stageName은 필수입니다.", en: "stageId and stageName are required." }));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const basePayload: Partial<IStageDoc> & { stageId: string; stageName: string } = {
        stageId: stage.stageId.trim(),
        stageName: stage.stageName.trim(),
        coordinateContractVersion: stage.coordinateContractVersion,
        projectionConfig: stage.projectionConfig,
        domain: stage.domain || "stage",
        ownerType: stage.ownerType || (universeIdForOwner ? "universe" : "global"),
        ownerId: stage.ownerId || universeIdForOwner,
        visibility: stage.visibility || "private",
        usageType: stage.usageType || "game",
        background: stage.background,
        border: stage.border,
        assets: stage.assets || [],
        layout: stage.layout,
        createdBy: stage.createdBy || currentUserKey || undefined,
      };

      let saved: StageDocWithId;

      if (mode === "create" || !stage._id) {
        const created = await createStage(basePayload);
        saved = created as StageDocWithId;
      } else {
        const updatePayload: Partial<IStageDoc> = {
          stageId: basePayload.stageId,
          stageName: basePayload.stageName,
          coordinateContractVersion: basePayload.coordinateContractVersion,
          projectionConfig: basePayload.projectionConfig,
          domain: basePayload.domain,
          ownerType: basePayload.ownerType,
          ownerId: basePayload.ownerId,
          visibility: basePayload.visibility,
          usageType: basePayload.usageType,
          background: basePayload.background,
          border: basePayload.border,
          assets: basePayload.assets,
          layout: basePayload.layout,
        };

        const updated = await updateStage(stage._id as string, updatePayload);
        saved = updated as StageDocWithId;
      }

      setStage(saved);
      onSaved?.(saved);
    } catch (e) {
      const msg = extractApiErrorMessage(
        e,
        lang({ ko: "Stage 저장 중 오류가 발생했습니다.", en: "Failed to save stage." }) as string,
      );
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!stage._id) return;
    const confirmed = await dialog.confirm({
      variant: "danger",
      message: lang({
        ko: "이 StageDoc을 정말 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.",
        en: "Are you sure you want to delete this StageDoc? This action cannot be undone.",
      }),
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      await deleteStage(stage._id);
      onDeleted?.(stage._id);
      setStage(makeEmptyStage(universeIdForOwner));
    } catch (e) {
      const msg = extractApiErrorMessage(
        e,
        lang({ ko: "Stage 삭제 중 오류가 발생했습니다.", en: "Failed to delete stage." }) as string,
      );
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="text-xs text-red-600 whitespace-pre-line">{error}</div>}

      {stage.releaseDeployment && (
        <section className="rounded-default border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs">
          <div className="font-semibold">
            {lang({ ko: "아이소메트릭 배포 상태", en: "Isometric release status" })}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            <div>status: {stage.releaseDeployment.status}</div>
            <div>manifest: {stage.releaseDeployment.manifestVersion}</div>
            <div className="sm:col-span-2 break-all">key: {stage.releaseDeployment.manifestKey}</div>
          </div>
          {releaseLocked && (
            <div className="mt-2 text-cyan-800 dark:text-cyan-200">
              {lang({
                ko: "이 버전은 직접 수정·삭제할 수 없습니다. 변경하려면 새 versioned release를 생성하세요.",
                en: "This version cannot be edited or deleted directly. Create a new versioned release for changes.",
              })}
            </div>
          )}
        </section>
      )}

      {/* 기본 정보 */}
      <section className="border rounded-default p-3 flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{lang({ ko: "기본 정보", en: "Basic Info" })}</h3>

        <div className="text-xxs text-muted-foreground">
          {lang({
            ko: "이미지 업로드는 stageId/stageName 폴더 경로에 저장됩니다. 업로드 후 stageId/stageName을 바꾸면 파일 경로가 달라져서 깨질 수 있어요.",
            en: "Uploads are stored under stageId/stageName folder. Changing them after upload may break paths.",
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">stageId</label>
            <Input
              value={stage.stageId || ""}
              onChange={(e) => handleFieldChange("stageId", e.target.value)}
              placeholder="e.g. modern"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">stageName</label>
            <Input
              value={stage.stageName || ""}
              onChange={(e) => handleFieldChange("stageName", e.target.value)}
              placeholder="e.g. mono-city"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">usageType</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={stage.usageType || "game"}
              onChange={(e) => handleFieldChange("usageType", e.target.value)}
            >
              <option value="game">game</option>
              <option value="commerce">commerce</option>
              <option value="both">both</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">ownerType</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={stage.ownerType || (universeIdForOwner ? "universe" : "global")}
              onChange={(e) => handleFieldChange("ownerType", e.target.value)}
            >
              <option value="global">global</option>
              <option value="universe">universe</option>
              <option value="user">user</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">ownerId</label>
            <Input
              value={stage.ownerId || universeIdForOwner || ""}
              onChange={(e) => handleFieldChange("ownerId", e.target.value)}
              placeholder={lang({ ko: "유니버스 ID 또는 사용자 식별자", en: "Universe ID or user identifier" })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">visibility</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={stage.visibility || "private"}
              onChange={(e) => handleFieldChange("visibility", e.target.value)}
            >
              <option value="private">private</option>
              <option value="universe">universe</option>
              <option value="public">public</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">domain</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={stage.domain || "stage"}
              onChange={(e) => handleFieldChange("domain", e.target.value)}
            >
              <option value="stage">stage</option>
              <option value="asset-pack">asset-pack</option>
              <option value="layout-template">layout-template</option>
            </select>
          </div>
        </div>
      </section>

      {/* 배경/경계 */}
      <section className="border rounded-default p-3 flex flex-col gap-3">
        <h3 className="text-sm font-semibold">{lang({ ko: "배경/경계 설정", en: "Background / Border" })}</h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">{lang({ ko: "배경 이미지 URL", en: "Background image URL" })}</label>
            <Input
              value={stage.background?.name || ""}
              onChange={(e) => handleBackgroundChange("name", e.target.value)}
              placeholder="https://assets.allmyuniverse.com/..."
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">background.width</label>
                <Input
                  type="number"
                  value={stage.background?.size?.width ?? ""}
                  onChange={(e) => handleBackgroundChange("width", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">background.height</label>
                <Input
                  type="number"
                  value={stage.background?.size?.height ?? ""}
                  onChange={(e) => handleBackgroundChange("height", e.target.value)}
                />
              </div>
            </div>

            <ImageDropzone
              label={lang({ ko: "배경 이미지 업로드", en: "Upload background" })}
              disabled={!canUploadNow}
              uploading={!!uploading["bg"]}
              error={uploadErrors["bg"]}
              valueText={stage.background?.name || ""}
              previewUrl={stage.background?.name || undefined}
              onPick={handleUploadBackground}
              onClear={() => handleBackgroundChange("name", "")}
            />

            {!canUploadNow && (
              <div className="text-xxs text-muted-foreground">
                {lang({
                  ko: "업로드하려면 stageId / stageName을 먼저 입력하세요.",
                  en: "Enter stageId/stageName first.",
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-xs font-medium">{lang({ ko: "경계(border) 파일", en: "Border images" })}</div>

            <div className="grid grid-cols-1 gap-3">
              {BORDER_KEYS.map((k) => {
                const v = stage.border?.[k] || "";
                const upKey = `border:${k}`;
                const preview = v || undefined;

                return (
                  <div key={k} className="border rounded-default p-2 bg-muted/10">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">{k}</label>
                        <Input
                          value={v}
                          onChange={(e) => handleBorderChange(k, e.target.value)}
                          placeholder="https://assets.allmyuniverse.com/..."
                        />
                      </div>

                      <ImageDropzone
                        label={lang({ ko: `${k} 업로드`, en: `Upload ${k}` })}
                        disabled={!canUploadNow}
                        uploading={!!uploading[upKey]}
                        error={uploadErrors[upKey]}
                        valueText={v}
                        previewUrl={preview}
                        onPick={(file) => handleUploadBorder(k, file)}
                        onClear={() => handleBorderChange(k, "")}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 에셋 */}
      <section className="border rounded-default p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{lang({ ko: "에셋(Assets)", en: "Assets" })}</h3>
          <Button size="sm" onClick={handleAddAsset}>
            {lang({ ko: "에셋 추가", en: "Add Asset" })}
          </Button>
        </div>

        {(stage.assets || []).length === 0 && (
          <div className="text-xs text-muted-foreground">
            {lang({ ko: "등록된 에셋이 없습니다. [에셋 추가]로 등록하세요.", en: "No assets. Click [Add Asset]." })}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {(stage.assets || []).map((asset, idx) => {
            const baseUpKey = `asset:${idx}:base`;
            const assetPreview = asset.fileName || undefined;
            const meta: IStageAssetMeta = asset.meta || {};
            const states: Array<{ key: string; fileName: string }> = Array.isArray(meta.states) ? meta.states : [];

            return (
              <div key={`${idx}`} className="border rounded-default p-3 bg-muted/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">
                    {lang({ ko: "에셋", en: "Asset" })} #{idx + 1}
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => handleRemoveAsset(idx)}>
                    {lang({ ko: "삭제", en: "Remove" })}
                  </Button>
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* 기본 필드 */}
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">name</label>
                        <Input
                          value={asset.name || ""}
                          onChange={(e) => handleAssetFieldChange(idx, "name", e.target.value)}
                          placeholder="e.g. tree_01"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">roles (comma)</label>
                        <Input
                          value={(asset.roles || []).join(", ")}
                          onChange={(e) => handleAssetFieldChange(idx, "roles", e.target.value)}
                          placeholder="obstacle, shop"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">size.width (tiles)</label>
                        <Input
                          type="number"
                          value={asset.size?.width ?? 1}
                          onChange={(e) => handleAssetFieldChange(idx, "width", e.target.value)}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">size.height (tiles)</label>
                        <Input
                          type="number"
                          value={asset.size?.height ?? 1}
                          onChange={(e) => handleAssetFieldChange(idx, "height", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium">runtime URL</label>
                      <Input
                        value={asset.fileName || ""}
                        onChange={(e) => handleAssetFieldChange(idx, "fileName", e.target.value)}
                        placeholder="https://assets.allmyuniverse.com/..."
                      />
                    </div>

                    <ImageDropzone
                      label={lang({ ko: "에셋 이미지 업로드", en: "Upload asset image" })}
                      disabled={!canUploadNow}
                      uploading={!!uploading[baseUpKey]}
                      error={uploadErrors[baseUpKey]}
                      valueText={asset.fileName || ""}
                      previewUrl={assetPreview}
                      onPick={(file) => handleUploadAssetBase(idx, file)}
                      onClear={() => handleAssetFieldChange(idx, "fileName", "")}
                    />
                  </div>

                  {/* 메타 필드 */}
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">meta.maxHp</label>
                        <Input
                          type="number"
                          value={meta.maxHp ?? ""}
                          onChange={(e) => handleAssetMetaChange(idx, "maxHp", e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">meta.defaultCondition</label>
                        <Input
                          type="number"
                          value={meta.defaultCondition ?? ""}
                          onChange={(e) => handleAssetMetaChange(idx, "defaultCondition", e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">meta.isoHeightPx</label>
                        <Input
                          type="number"
                          value={meta.isoHeightPx ?? ""}
                          onChange={(e) => handleAssetMetaChange(idx, "isoHeightPx", e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">meta.isoLayer</label>
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          value={meta.isoLayer ?? ""}
                          onChange={(e) => handleAssetMetaChange(idx, "isoLayer", e.target.value)}
                        >
                          <option value="">{lang({ ko: "미지정", en: "Unset" })}</option>
                          {ISO_LAYERS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* states */}
                    <div className="mt-2 border rounded-default p-2 bg-background">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold">meta.states</div>
                        <Button size="sm" variant="outline" onClick={() => handleAddAssetState(idx)}>
                          {lang({ ko: "상태 추가", en: "Add state" })}
                        </Button>
                      </div>

                      {states.length === 0 && (
                        <div className="text-xxs text-muted-foreground mt-2">
                          {lang({
                            ko: "상태별 스프라이트가 없으면 비워두세요.",
                            en: "Leave empty if no state sprites.",
                          })}
                        </div>
                      )}

                      <div className="mt-2 flex flex-col gap-2">
                        {states.map((st, sIdx) => {
                          const upKey = `asset:${idx}:state:${sIdx}`;
                          const preview = st.fileName || undefined;

                          return (
                            <div key={`${idx}:${sIdx}`} className="border rounded-default p-2 bg-muted/10">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-medium">state #{sIdx + 1}</div>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRemoveAssetState(idx, sIdx)}
                                >
                                  {lang({ ko: "삭제", en: "Remove" })}
                                </Button>
                              </div>

                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs font-medium">key</label>
                                  <Input
                                    value={st.key || ""}
                                    onChange={(e) => handleAssetStateChange(idx, sIdx, "key", e.target.value)}
                                    placeholder="normal / damaged / destroyed"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs font-medium">runtime URL</label>
                                  <Input
                                    value={st.fileName || ""}
                                    onChange={(e) => handleAssetStateChange(idx, sIdx, "fileName", e.target.value)}
                                    placeholder="https://assets.allmyuniverse.com/..."
                                  />
                                </div>
                              </div>

                              <div className="mt-2">
                                <ImageDropzone
                                  label={lang({ ko: "상태 이미지 업로드", en: "Upload state sprite" })}
                                  disabled={!canUploadNow}
                                  uploading={!!uploading[upKey]}
                                  error={uploadErrors[upKey]}
                                  valueText={st.fileName || ""}
                                  previewUrl={preview}
                                  onPick={(file) => handleUploadAssetState(idx, sIdx, file)}
                                  onClear={() => handleAssetStateChange(idx, sIdx, "fileName", "")}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 저장/삭제 버튼 */}
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || releaseLocked}>
          {saving ? lang({ ko: "저장 중...", en: "Saving..." }) : lang({ ko: "저장", en: "Save" })}
        </Button>

        {stage._id && (
          <Button variant="destructive" onClick={handleDelete} disabled={saving || releaseLocked}>
            {lang({ ko: "삭제", en: "Delete" })}
          </Button>
        )}

        <div className="ml-auto text-xxs text-muted-foreground">
          {canUploadNow
            ? lang({
                ko: "업로드한 이미지는 런타임 URL로 저장됩니다.",
                en: "Uploaded images are saved as runtime URLs.",
              })
            : lang({ ko: "stageId/stageName 입력 시 업로드 가능", en: "Enter stageId/stageName to enable upload" })}
        </div>
      </div>
    </div>
  );
}
