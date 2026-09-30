"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ChromaKeyApplySection, ChromaKeyPreviewPanel, useChromaKeyApply } from "components/module/game/chroma-key";
import { buildImageProxyUrl } from "utils/common";
import type { IGameAssetDoc } from "types/game";
import type { ChromaKeyOptionsType, ChromaKeyProfileType } from "types/game/chroma-key";
import { normalizeChromaKeyOptions } from "utils/game/chromaKeyOptions";

export function resolveChromaKeyProfileForAssetType(assetType: string | null | undefined): ChromaKeyProfileType | null {
  switch (assetType) {
    case "character-sprite":
    case "motion-guide":
      return "sprite-sheet";
    case "stage-tileset":
    case "prop-sheet":
    case "building-sheet":
    case "tile":
    case "object":
      return "tileset/prop/building";
    case "npc-portrait":
      return "single-character";
    default:
      return null;
  }
}

export function GameAssetChromaKeyDialog({
  open,
  asset,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  asset: IGameAssetDoc | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  if (!asset) return null;

  return (
    <GameAssetChromaKeyDialogContent
      key={`${asset.gameAssetId}:${asset.storage?.sha256 || "no-sha"}`}
      open={open}
      asset={asset}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}

function GameAssetChromaKeyDialogContent({
  open,
  asset,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  asset: IGameAssetDoc;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const profile = resolveChromaKeyProfileForAssetType(asset.assetType);
  const initialOptions = useMemo(
    () => profile ? normalizeChromaKeyOptions({ keyMode: "auto", profile }) : null,
    [profile],
  );
  const [options, setOptions] = useState<ChromaKeyOptionsType | null>(initialOptions);
  const {
    state,
    handlePreviewResult,
    applyLocal,
    confirmFallback,
    declineFallback,
    reset,
  } = useChromaKeyApply(asset.gameAssetId, asset.storage?.sha256);
  const savedCommitRef = useRef(state.commitResponse);

  useEffect(() => {
    if (state.phase !== "done" || !state.commitResponse || savedCommitRef.current === state.commitResponse) return;
    savedCommitRef.current = state.commitResponse;
    void (async () => {
      try {
        await onSaved();
      } catch {
        toast.error(lang({ ko: "저장 후 에셋 목록을 새로 고치지 못했습니다.", en: "Saved, but the asset list could not be refreshed." }));
      }
    })();
  }, [onSaved, state.commitResponse, state.phase]);

  const busy = state.phase === "applying" || state.phase === "committing";

  const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen && busy) return;
    if (!nextOpen) {
      reset();
      setOptions(initialOptions);
    }
    onOpenChange(nextOpen);
  }, [busy, initialOptions, onOpenChange, reset]);

  const unsupportedProfile = profile === null;
  const isPublished = asset.status === "published";
  const isR2Asset = asset.storage?.driver === "r2";
  const hasSourceUrl = Boolean(asset.storage?.url);
  const disabled = isPublished || !isR2Asset || unsupportedProfile || !hasSourceUrl;
  const previewRequiredNotice = !disabled
    && !state.previewResult
    && !busy
    && state.phase !== "done"
    && state.phase !== "error";
  const disabledReason = isPublished
    ? lang({ ko: "발행된 에셋은 직접 수정할 수 없습니다. 새 드래프트를 선택하세요.", en: "Published assets cannot be edited. Select a new draft." })
    : !isR2Asset
      ? lang({ ko: "R2에 저장된 에셋만 크로마키를 적용할 수 있습니다.", en: "Chroma key can only be applied to assets stored in R2." })
      : unsupportedProfile
        ? lang({ ko: "이 에셋 유형은 크로마키 처리를 지원하지 않습니다.", en: "This asset type is not supported by chroma key." })
        : !hasSourceUrl
          ? lang({ ko: "미리보기 이미지 URL이 없어 크로마키를 적용할 수 없습니다.", en: "Chroma key cannot run without a preview image URL." })
          : null;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto"
        hideClose={busy}
        disableOutsideClick={busy}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
        onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle><Lang text={{ ko: "크로마키 배경 제거", en: "Chroma key background removal" }} /></DialogTitle>
          <DialogDescription>
            <Lang text={{ ko: "키 색상과 가장자리를 미리 확인한 뒤 드래프트 에셋에 적용합니다.", en: "Preview the key color and edges before applying them to this draft asset." }} />
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {busy ? (
            <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm" role="status" aria-live="polite">
              <Lang text={{ ko: "처리 중에는 다이얼로그를 닫을 수 없습니다.", en: "The dialog cannot be closed while processing." }} />
            </p>
          ) : null}

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-semibold">{asset.name || asset.gameAssetId}</p>
          </div>

          {disabledReason ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {disabledReason}
            </p>
          ) : null}

          {profile && initialOptions && options && hasSourceUrl ? (
            <>
              <ChromaKeyPreviewPanel
                key={`${asset.gameAssetId}:${asset.storage.sha256 || "no-sha"}:${open ? "open" : "closed"}`}
                imageSrc={buildImageProxyUrl(asset.storage.url)}
                initialOptions={initialOptions}
                onOptionsChange={setOptions}
                onPreviewResult={handlePreviewResult}
                disabled={disabled}
              />
              {previewRequiredNotice ? (
                <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm" role="status">
                  <Lang text={{ ko: "미리보기가 준비되어야 적용할 수 있습니다.", en: "Apply is available after the preview is ready." }} />
                </p>
              ) : null}
              <div aria-live="polite" aria-atomic="false">
                <ChromaKeyApplySection
                  state={state}
                  options={options}
                  disabled={disabled || !state.previewResult}
                  onApplyLocal={applyLocal}
                  onConfirmFallback={confirmFallback}
                  onDeclineFallback={declineFallback}
                  onReset={reset}
                />
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
