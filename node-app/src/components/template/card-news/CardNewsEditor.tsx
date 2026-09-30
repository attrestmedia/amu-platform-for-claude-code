"use client";

import { useCallback, useState } from "react";
import {
  Button,
  Input,
  Label,
  Preloader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@amu-labs/ui";
import {
  Download,
  Globe,
  ImagePlus,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Square,
  Undo2,
  Upload,
} from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { useAuthStore } from "store/auth";
import { useCardNewsEditor } from "hooks/app/useCardNewsEditor";
import { useCardNewsScenePreparation } from "hooks/app/useCardNewsScenePreparation";
import { exportCardNewsDeckPng, exportCardNewsPng } from "libs/card-news/export";
import { setStudioImageVisibility, uploadLibraryImage } from "libs/api/lab";
import { trackCardNewsAssetsUploaded, trackCardNewsExported } from "utils/analytics/cardNews";
import {
  addCardNewsCard,
  addCardNewsLayer,
  addCardNewsSolidLayer,
  createCardNewsImageLayer,
  createCardNewsSolidLayer,
  createCardNewsTextLayer,
  deleteCardNewsCard,
  deleteCardNewsLayer,
  duplicateCardNewsLayer,
  moveCardNewsLayer,
  normalizeCardNewsKeyboardDelta,
  reorderCardNewsCard,
  resizeCardNewsLayer,
  updateCardNewsBackground,
} from "libs/card-news/editor";
import {
  CARD_NEWS_ASPECT_RATIOS,
  CARD_NEWS_MAX_CARDS,
  type CardNewsAspectRatio,
  type CardNewsDeckPayload,
} from "types/card-news";
import { CardNewsAssetPicker, type CardNewsAssetSelection } from "./CardNewsAssetPicker";
import { CardNewsCanvasStage } from "./CardNewsCanvasStage";
import { CardNewsCardRail } from "./CardNewsCardRail";
import { CardNewsPropertiesPanel, type CardNewsAssetPickerTarget } from "./CardNewsPropertiesPanel";
import { CardNewsTemplatePicker } from "./CardNewsTemplatePicker";
import { resolveCardNewsTemplateStarter } from "libs/card-news/templateResolver";
import { CardNewsTemplateResolutionError } from "types/card-news";
import type { CardNewsTemplatePreset, CardNewsTemplateReference } from "types/card-news";

type CardNewsEditorProps = {
  deckId?: string;
  canUpload?: boolean;
  onRequireLogin: () => void;
  onDeckCreated?: (deckId: string) => void;
};

type AssetPickerTarget = CardNewsAssetPickerTarget | "template-evidence";

function frameSizeForAspectRatio(aspectRatio: CardNewsAspectRatio) {
  return aspectRatio === "4:5" ? { w: 1080, h: 1350 } : { w: 1080, h: 1080 };
}

function saveLabel(saveState: string) {
  if (saveState === "pending" || saveState === "saving") return { ko: "저장 중…", en: "Saving…" };
  if (saveState === "saved") return { ko: "저장됨", en: "Saved" };
  if (saveState === "error") return { ko: "저장 실패", en: "Save failed" };
  return { ko: "변경 없음", en: "No changes" };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
}

function sceneErrorLabel(error: string) {
  switch (error) {
    case "FONT_EXTERNAL_GATE_BLOCKED":
      return lang({
        ko: "폰트 사용 승인이 확인되지 않았어요. 운영 설정을 확인해 주세요.",
        en: "Font usage approval is not configured. Check the release settings.",
      });
    case "FONT_LOAD_FAILED":
      return lang({
        ko: "선택한 폰트를 불러오지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.",
        en: "The selected font could not be loaded. Check your network and try again.",
      });
    case "FONT_BROWSER_UNAVAILABLE":
      return lang({
        ko: "이 브라우저에서 폰트를 준비할 수 없어요. 페이지를 새로고침해 주세요.",
        en: "Fonts are unavailable in this browser. Refresh the page and try again.",
      });
    default:
      return lang({
        ko: "카드 미리보기를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.",
        en: "The card preview could not be prepared. Please try again.",
      });
  }
}

export function CardNewsEditor({ deckId, canUpload = false, onRequireLogin, onDeckCreated }: CardNewsEditorProps) {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const [assetPickerTarget, setAssetPickerTarget] = useState<AssetPickerTarget | null>(null);
  const [mobilePropertiesOpen, setMobilePropertiesOpen] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [assetState, setAssetState] = useState<"idle" | "uploading" | "publishing" | "error">("idle");
  const [assetMessage, setAssetMessage] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<CardNewsTemplateReference | null>(null);
  const [pendingTemplatePreset, setPendingTemplatePreset] = useState<CardNewsTemplatePreset | null>(null);
  const [templateMessage, setTemplateMessage] = useState("");

  const editor = useCardNewsEditor({ deckId, hasHydrated, isLoggedIn, onDeckCreated });
  const {
    deck,
    activeCard,
    activeCardId,
    selectedLayer,
    selectedLayerId,
    textInputLayerId,
    textDraft,
    commitDocument,
    selectCard,
    selectLayer,
    undo,
    redo,
    canUndo,
    canRedo,
  } = editor;
  const {
    scene,
    thumbnailScenes,
    status: sceneStatus,
    error: sceneError,
    prepareAllScenes,
    retryScene,
  } = useCardNewsScenePreparation(deck, activeCardId);

  const commit = useCallback((next: CardNewsDeckPayload) => {
    commitDocument(next);
  }, [commitDocument]);

  const addTextLayer = useCallback(() => {
    if (!deck || !activeCard) return;
    const layer = createCardNewsTextLayer(deck);
    commitDocument(addCardNewsLayer(deck, activeCard.cardId, layer));
    selectLayer(layer.id);
  }, [activeCard, commitDocument, deck, selectLayer]);

  const addSolidLayer = useCallback(() => {
    if (!deck || !activeCard) return;
    const layer = createCardNewsSolidLayer();
    commitDocument(addCardNewsSolidLayer(deck, activeCard.cardId, layer));
    selectLayer(layer.id);
  }, [activeCard, commitDocument, deck, selectLayer]);

  const openAssetPicker = useCallback((target: AssetPickerTarget) => {
    setAssetPickerTarget(target);
  }, []);

  const startTemplate = useCallback((template: CardNewsTemplateReference, preset: CardNewsTemplatePreset) => {
    setTemplateMessage("");
    setPendingTemplate(template);
    setPendingTemplatePreset(preset);
    setAssetPickerTarget("template-evidence");
  }, []);

  const applyAsset = useCallback((selection: CardNewsAssetSelection) => {
    if (!deck || !activeCard) return;
    if (assetPickerTarget === "template-evidence") {
      if (!pendingTemplate || !pendingTemplatePreset) return;
      try {
        const resolved = resolveCardNewsTemplateStarter({
          title: deck.title,
          aspectRatio: deck.aspectRatio,
          template: pendingTemplate,
          evidence: {
            [selection.valueKind === "assetId" ? "assetId" : "proxyUrl"]: selection.value,
            altText: "카드뉴스 대표 이미지",
          },
        }, pendingTemplatePreset);
        commitDocument(resolved);
        selectCard(resolved.cards[0]?.cardId || "");
        setTemplateMessage(lang({ ko: "템플릿을 적용했습니다. 텍스트와 이미지를 자유롭게 수정하세요.", en: "Template applied. Edit the text and images as needed." }));
      } catch (error) {
        setTemplateMessage(error instanceof CardNewsTemplateResolutionError
          ? lang({ ko: `템플릿을 적용하지 못했어요. (${error.code})`, en: `The template could not be applied. (${error.code})` })
          : lang({ ko: "템플릿을 적용하지 못했어요. 다시 시도해 주세요.", en: "The template could not be applied. Try again." }));
      }
    } else if (assetPickerTarget === "background") {
      commit(updateCardNewsBackground(deck, activeCard.cardId, {
        type: "image",
        value: selection.value,
        valueKind: selection.valueKind,
        fit: "cover",
        focalPoint: { x: 0.5, y: 0.5 },
        opacity: 1,
      }));
    } else if (assetPickerTarget === "layer") {
      const layer = createCardNewsImageLayer({ value: selection.value, valueKind: selection.valueKind });
      commit(addCardNewsLayer(deck, activeCard.cardId, layer));
      selectLayer(layer.id);
    } else if (assetPickerTarget === "watermark-logo") {
      const watermark = deck.watermark || {
        enabled: true,
        text: "AMU",
        size: 24,
        opacity: 0.72,
        position: "bottom-right" as const,
      };
      commitDocument({
        ...deck,
        watermark: {
          ...watermark,
          enabled: true,
          logo: { value: selection.value, valueKind: selection.valueKind },
        },
      });
    }
    setAssetPickerTarget(null);
    setPendingTemplate(null);
    setPendingTemplatePreset(null);
  }, [activeCard, assetPickerTarget, commit, commitDocument, deck, pendingTemplate, pendingTemplatePreset, selectCard, selectLayer]);

  const addCard = useCallback((sourceCardId?: string) => {
    if (!deck) return;
    const result = addCardNewsCard(deck, sourceCardId);
    if (result.cardId) {
      commit(result.document);
      selectCard(result.cardId);
    }
  }, [commit, deck, selectCard]);

  const deleteCard = useCallback((cardId: string) => {
    if (!deck || deck.cards.length <= 1) return;
    const index = deck.cards.findIndex((card) => card.cardId === cardId);
    const result = deleteCardNewsCard(deck, cardId);
    if (result.blocked) return;
    commit(result.document);
    if (cardId === activeCardId) {
      const nextCard = result.document.cards[Math.max(0, Math.min(index, result.document.cards.length - 1))];
      selectCard(nextCard?.cardId || result.document.cards[0].cardId);
    }
  }, [activeCardId, commit, deck, selectCard]);

  const duplicateCard = useCallback((cardId: string) => addCard(cardId), [addCard]);

  const deleteSelectedLayer = useCallback((layerId: string) => {
    if (!deck || !activeCard) return;
    commit(deleteCardNewsLayer(deck, activeCard.cardId, layerId));
    if (layerId === selectedLayerId) selectLayer(null);
  }, [activeCard, commit, deck, selectLayer, selectedLayerId]);

  const duplicateSelectedLayer = useCallback(() => {
    if (!deck || !activeCard || !selectedLayerId) return;
    const result = duplicateCardNewsLayer(deck, activeCard.cardId, selectedLayerId);
    if (!result.layerId) return;
    commit(result.document);
    selectLayer(result.layerId);
  }, [activeCard, commit, deck, selectLayer, selectedLayerId]);

  const changeAspectRatio = useCallback((value: string) => {
    if (!deck || !CARD_NEWS_ASPECT_RATIOS.includes(value as CardNewsAspectRatio)) return;
    const aspectRatio = value as CardNewsAspectRatio;
    commit({ ...deck, aspectRatio, frameSize: frameSizeForAspectRatio(aspectRatio) });
  }, [commit, deck]);

  const commitTitle = useCallback((value: string) => {
    if (!deck) return;
    const title = value.trim().slice(0, 120) || lang({ ko: "새 카드뉴스", en: "New card news" });
    if (title !== deck.title) commitDocument({ ...deck, title });
  }, [commitDocument, deck]);

  const moveSelectedLayerByKeyboard = useCallback((key: string, shiftKey: boolean) => {
    if (!deck || !activeCard || !selectedLayerId) return false;
    const delta = normalizeCardNewsKeyboardDelta(deck, selectedLayerId, shiftKey);
    if (shiftKey) {
      const resizeDelta = {
        w: key === "ArrowRight" ? delta.x : key === "ArrowLeft" ? -delta.x : 0,
        h: key === "ArrowDown" ? delta.y : key === "ArrowUp" ? -delta.y : 0,
      };
      commit(resizeCardNewsLayer(deck, activeCard.cardId, selectedLayerId, resizeDelta));
    } else {
      const moveDelta = {
        x: key === "ArrowRight" ? delta.x : key === "ArrowLeft" ? -delta.x : 0,
        y: key === "ArrowDown" ? delta.y : key === "ArrowUp" ? -delta.y : 0,
      };
      commit(moveCardNewsLayer(deck, activeCard.cardId, selectedLayerId, moveDelta));
    }
    return true;
  }, [activeCard, commit, deck, selectedLayerId]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(event.target)) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelectedLayer();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedLayerId) {
        event.preventDefault();
        deleteSelectedLayer(selectedLayerId);
      }
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      if (moveSelectedLayerByKeyboard(event.key, event.shiftKey)) event.preventDefault();
    }
  }, [deleteSelectedLayer, duplicateSelectedLayer, moveSelectedLayerByKeyboard, redo, selectedLayerId, undo]);

  const exportCurrent = useCallback(async () => {
    if (!scene || !deck || !activeCard) return;
    setExportState("exporting");
    setExportMessage("");
    try {
      await exportCardNewsPng(scene, {
        download: true,
        filename: `${deck.title}-card-${String(activeCard.order + 1).padStart(2, "0")}`,
      });
      trackCardNewsExported({ cardCount: 1, aspectRatio: deck.aspectRatio, exportScope: "card" });
      setExportState("idle");
      setExportMessage(lang({ ko: "현재 카드를 다운로드했습니다.", en: "The current card was downloaded." }));
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : lang({ ko: "내보내기에 실패했습니다.", en: "Export failed." }));
    }
  }, [activeCard, deck, scene]);

  const exportAll = useCallback(async () => {
    if (!deck) return;
    setExportState("exporting");
    setExportMessage("");
    try {
      const scenes = await prepareAllScenes();
      await exportCardNewsDeckPng(scenes, { deckName: deck.title, download: true });
      trackCardNewsExported({ cardCount: scenes.length, aspectRatio: deck.aspectRatio, exportScope: "deck" });
      setExportState("idle");
      setExportMessage(lang({ ko: "모든 카드를 다운로드했습니다.", en: "All cards were downloaded." }));
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : lang({ ko: "내보내기에 실패했습니다.", en: "Export failed." }));
    }
  }, [deck, prepareAllScenes]);

  const uploadAllAssets = useCallback(async () => {
    if (!deck || !canUpload) return;
    setAssetState("uploading");
    setAssetMessage("");
    try {
      const scenes = await prepareAllScenes();
      const exports = await exportCardNewsDeckPng(scenes, {
        deckName: deck.title,
        retainBlobs: true,
      });
      const uploaded = [] as Array<{ cardId: string; assetId: string }>;
      for (const [index, result] of exports.entries()) {
        if (!result.blob) throw new Error("CARD_NEWS_EXPORT_BLOB_MISSING");
        const scene = scenes[index];
        const file = new File([result.blob], result.filename, { type: "image/png" });
        const stored = await uploadLibraryImage(file);
        if (!stored.assetId) throw new Error("CARD_NEWS_ASSET_ID_MISSING");
        uploaded.push({ cardId: scene.cardId, assetId: stored.assetId });
      }
      if (uploaded.length !== deck.cards.length) throw new Error("CARD_NEWS_ASSET_COUNT_MISMATCH");

      const assetIdByCardId = new Map(uploaded.map((item) => [item.cardId, item.assetId]));
      commitDocument({
        ...deck,
        cards: deck.cards.map((card) => ({
          ...card,
          exportedAssetId: assetIdByCardId.get(card.cardId) || card.exportedAssetId,
        })),
      });
      trackCardNewsAssetsUploaded({ cardCount: deck.cards.length, assetCount: uploaded.length, aspectRatio: deck.aspectRatio });
      setAssetState("idle");
      setAssetMessage(lang({
        ko: "검수용 자산을 업로드했습니다. 발행하려면 공개 전환을 진행하세요.",
        en: "Review assets uploaded. Make them public before publishing.",
      }));
    } catch (error) {
      setAssetState("error");
      setAssetMessage(error instanceof Error && error.message === "membership_required"
        ? lang({ ko: "검수용 업로드는 멤버십 또는 관리자 권한이 필요합니다. 다운로드는 계속 사용할 수 있어요.", en: "Review uploads require membership or admin access. Downloads remain available." })
        : lang({ ko: "검수용 자산 업로드에 실패했습니다. 기존 자산 연결은 변경되지 않았어요.", en: "Review asset upload failed. Existing asset references were not changed." }));
    }
  }, [canUpload, commitDocument, deck, prepareAllScenes]);

  const makeAssetsPublic = useCallback(async () => {
    if (!deck || !canUpload) return;
    const assetIds = deck.cards.map((card) => card.exportedAssetId || "").filter(Boolean);
    if (assetIds.length !== deck.cards.length) {
      setAssetState("error");
      setAssetMessage(lang({ ko: "먼저 모든 카드를 검수용으로 업로드해 주세요.", en: "Upload every card for review first." }));
      return;
    }

    setAssetState("publishing");
    setAssetMessage("");
    try {
      for (const assetId of assetIds) await setStudioImageVisibility(assetId, "public");
      setAssetState("idle");
      setAssetMessage(lang({
        ko: "모든 카드 자산을 공개 발행용으로 전환했습니다. 이전 자산은 자동 삭제하지 않습니다.",
        en: "All card assets are public for publishing. Previous assets are not deleted automatically.",
      }));
    } catch {
      setAssetState("error");
      setAssetMessage(lang({
        ko: "일부 자산의 공개 전환에 실패했습니다. 현재 상태를 확인한 뒤 다시 시도해 주세요.",
        en: "Some assets could not be made public. Check their status and try again.",
      }));
    }
  }, [canUpload, deck]);

  const assetBusy = assetState === "uploading" || assetState === "publishing";
  const saveStatus = saveLabel(editor.saveState);
  const sceneStatusText = sceneError
    ? sceneErrorLabel(sceneError)
    : sceneStatus === "preparing" ? lang({ ko: "이미지와 폰트를 준비하는 중…", en: "Preparing images and fonts…" }) : "";

  if (editor.phase === "login-required") {
    return (
      <section className="mx-auto flex min-h-[34rem] w-full max-w-xl items-center justify-center px-4 py-16 text-center">
        <div className="w-full rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-primary-text"><Lang text={{ ko: "카드뉴스 편집기는 로그인이 필요해요.", en: "Log in to use the card news editor." }} /></h1>
          <p className="mt-3 text-sm leading-6 text-secondary-text"><Lang text={{ ko: "작업물을 안전하게 저장하고 다시 편집하려면 로그인해 주세요.", en: "Log in to save your work and edit it again later." }} /></p>
          <Button className="mt-6 min-h-11" onClick={onRequireLogin}><Lang text={{ ko: "로그인", en: "Log in" }} /></Button>
        </div>
      </section>
    );
  }

  if (editor.phase === "error") {
    return (
      <section className="mx-auto flex min-h-[34rem] w-full max-w-xl items-center justify-center px-4 py-16 text-center">
        <div className="w-full rounded-2xl border border-danger/30 bg-surface p-8 shadow-sm">
          <p role="alert" className="text-sm leading-6 text-danger">{editor.error}</p>
          <Button variant="outline" className="mt-6 min-h-11 gap-2" onClick={() => void editor.reloadFromServer()}>
            <RefreshCw className="size-4" aria-hidden />
            <Lang text={{ ko: "다시 불러오기", en: "Try again" }} />
          </Button>
        </div>
      </section>
    );
  }

  if (!deck || !activeCard) {
    return <div className="flex min-h-[34rem] items-center justify-center" role="status"><Preloader variant="spin" size="lg" /></div>;
  }

  return (
    <div
      className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-5 lg:px-7"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <CardNewsTemplatePicker onStart={startTemplate} />
      {templateMessage ? <p role="status" aria-live="polite" className="mb-4 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-secondary-text sm:px-4">{templateMessage}</p> : null}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-surface px-3 py-3 shadow-sm sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor="card-news-title" label={<Lang text={{ ko: "카드뉴스 제목", en: "Card news title" }} />} />
            <Input
              id="card-news-title"
              key={`${deck.deckId}:${deck.title}`}
              defaultValue={deck.title}
              maxLength={120}
              className="mt-1 min-h-11 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
              onBlur={(event) => commitTitle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <div className="w-28 shrink-0 sm:w-32">
            <Label htmlFor="card-news-aspect" label={<Lang text={{ ko: "비율", en: "Ratio" }} />} />
            <Select value={deck.aspectRatio} onValueChange={(value) => changeAspectRatio(String(value))}>
              <SelectTrigger id="card-news-aspect" className="mt-1 min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CARD_NEWS_ASPECT_RATIOS.map((ratio) => <SelectItem key={ratio} value={ratio}>{ratio}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex min-h-11 items-center gap-1.5 px-2 text-xs text-secondary-text" role="status" aria-live="polite">
            <Save className="size-4" aria-hidden />
            <Lang text={saveStatus} />
          </span>
          <Button variant="outline" size="icon-md" aria-label="실행 취소" disabled={!canUndo} onClick={undo}>
            <Undo2 className="size-4" aria-hidden />
          </Button>
          <Button variant="outline" size="icon-md" aria-label="다시 실행" disabled={!canRedo} onClick={redo}>
            <Redo2 className="size-4" aria-hidden />
          </Button>
          <Button variant="outline" className="min-h-11 gap-2" disabled={exportState === "exporting" || assetBusy || !scene} onClick={() => void exportCurrent()}>
            <Download className="size-4" aria-hidden />
            <span className="hidden sm:inline"><Lang text={{ ko: "현재 카드", en: "Current card" }} /></span>
          </Button>
          <Button className="min-h-11 gap-2" disabled={exportState === "exporting" || assetBusy} loading={exportState === "exporting"} onClick={() => void exportAll()}>
            <Download className="size-4" aria-hidden />
            <span><Lang text={{ ko: "전체 다운로드", en: "Download all" }} /></span>
          </Button>
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            disabled={!canUpload || exportState === "exporting" || assetBusy}
            loading={assetState === "uploading"}
            title={!canUpload ? lang({ ko: "멤버십 또는 관리자 권한이 필요합니다.", en: "Membership or admin access is required." }) : undefined}
            onClick={() => void uploadAllAssets()}
          >
            <Upload className="size-4" aria-hidden />
            <span className="hidden sm:inline"><Lang text={{ ko: "검수용 업로드", en: "Upload for review" }} /></span>
          </Button>
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            disabled={!canUpload || assetBusy || !deck.cards.every((card) => card.exportedAssetId)}
            loading={assetState === "publishing"}
            onClick={() => void makeAssetsPublic()}
          >
            <Globe className="size-4" aria-hidden />
            <span className="hidden sm:inline"><Lang text={{ ko: "공개 발행용 전환", en: "Make public" }} /></span>
          </Button>
          {!canUpload ? (
            <span className="text-xs text-secondary-text" role="note">
              <Lang text={{ ko: "검수용 업로드는 멤버십 또는 관리자 권한이 필요합니다.", en: "Review uploads require membership or admin access." }} />
            </span>
          ) : null}
        </div>
      </div>

      <div className="mb-3 lg:hidden">
        <CardNewsCardRail
          cards={deck.cards}
          activeCardId={activeCardId}
          thumbnailScenes={thumbnailScenes}
          horizontal
          onSelect={editor.selectCard}
          onAdd={() => addCard()}
          onDuplicate={duplicateCard}
          onDelete={deleteCard}
          onReorder={(cardId, direction) => commit(reorderCardNewsCard(deck, cardId, direction))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_20rem] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        <aside className="hidden min-h-[34rem] rounded-2xl border border-border bg-surface p-3 lg:flex lg:flex-col">
          <CardNewsCardRail
            cards={deck.cards}
            activeCardId={activeCardId}
            thumbnailScenes={thumbnailScenes}
            onSelect={editor.selectCard}
            onAdd={() => addCard()}
            onDuplicate={duplicateCard}
            onDelete={deleteCard}
            onReorder={(cardId, direction) => commit(reorderCardNewsCard(deck, cardId, direction))}
          />
        </aside>

        <main className="min-w-0 rounded-2xl border border-border bg-surface p-3 shadow-sm sm:p-5" aria-labelledby="card-news-editor-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 id="card-news-editor-title" className="text-sm font-semibold text-primary-text"><Lang text={{ ko: `카드 ${activeCard.order + 1} 편집`, en: `Edit card ${activeCard.order + 1}` }} /></h1>
              <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "레이어를 선택하거나 더블클릭해 텍스트를 편집하세요.", en: "Select a layer or double-click text to edit." }} /></p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="min-h-11 gap-2 lg:hidden" onClick={() => setMobilePropertiesOpen(true)}>
                <Plus className="size-4" aria-hidden />
                <Lang text={{ ko: "속성", en: "Properties" }} />
              </Button>
              <Button variant="outline" className="min-h-11 gap-2" onClick={addTextLayer}>
                <Plus className="size-4" aria-hidden />
                <span><Lang text={{ ko: "텍스트 추가", en: "Add text" }} /></span>
              </Button>
              <Button variant="outline" className="min-h-11 gap-2" onClick={() => openAssetPicker("layer")}>
                <ImagePlus className="size-4" aria-hidden />
                <span className="hidden sm:inline"><Lang text={{ ko: "이미지 추가", en: "Add image" }} /></span>
              </Button>
              <Button variant="outline" className="min-h-11 gap-2" onClick={addSolidLayer}>
                <Square className="size-4" aria-hidden />
                <span className="hidden sm:inline"><Lang text={{ ko: "솔리드 추가", en: "Add solid" }} /></span>
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[760px]">
            <CardNewsCanvasStage
              document={deck}
              card={activeCard}
              scene={scene}
              sceneStatus={sceneStatus}
              selectedLayerId={selectedLayerId}
              textInputLayerId={textInputLayerId}
              textDraft={textDraft}
              onSelectLayer={editor.selectLayer}
              onBeginTransform={editor.beginTransform}
              onUpdateTransform={editor.updateTransform}
              onEndTransform={editor.endTransform}
              onBeginTextInput={editor.beginTextInput}
              onTextInputChange={editor.updateTextInput}
              onTextInputEnd={editor.endTextInput}
            />
          </div>
          <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-2 text-xs" aria-live={sceneError ? "assertive" : "polite"}>
            {sceneError ? (
              <div className="flex min-h-11 flex-wrap items-center gap-2 text-danger" role="alert">
                <span>{sceneStatusText}</span>
                <Button variant="outline" className="min-h-11 gap-1.5 border-danger/40 px-3 text-danger hover:bg-danger/5" onClick={retryScene}>
                  <RefreshCw className="size-4" aria-hidden />
                  <Lang text={{ ko: "다시 시도", en: "Try again" }} />
                </Button>
              </div>
            ) : <span className="text-secondary-text">{sceneStatusText}</span>}
            <span className="text-secondary-text"><Lang text={{ ko: `${activeCard.layers.length}개 레이어 · ${deck.cards.length}/${CARD_NEWS_MAX_CARDS}개 카드`, en: `${activeCard.layers.length} layers · ${deck.cards.length}/${CARD_NEWS_MAX_CARDS} cards` }} /></span>
          </div>
          {exportMessage ? <p role={exportState === "error" ? "alert" : "status"} className={`mt-2 text-xs ${exportState === "error" ? "text-danger" : "text-secondary-text"}`}>{exportMessage}</p> : null}
          {assetMessage ? <p role={assetState === "error" ? "alert" : "status"} className={`mt-2 text-xs ${assetState === "error" ? "text-danger" : "text-secondary-text"}`}>{assetMessage}</p> : null}
        </main>

        <aside className="hidden min-h-[34rem] overflow-y-auto rounded-2xl border border-border bg-surface p-4 lg:block">
          <CardNewsPropertiesPanel
            key={`desktop-${activeCard.cardId}:${activeCard.altText}`}
            document={deck}
            card={activeCard}
            selectedLayer={selectedLayer}
            onDocumentChange={commit}
            onSelectLayer={editor.selectLayer}
            onOpenAssetPicker={openAssetPicker}
            onAddText={addTextLayer}
            onAddSolid={addSolidLayer}
            onDeleteLayer={deleteSelectedLayer}
          />
        </aside>
      </div>

      <Sheet open={mobilePropertiesOpen} onOpenChange={setMobilePropertiesOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-3xl px-4 pb-8 sm:px-6" aria-describedby="card-news-mobile-properties-description">
          <SheetHeader className="mx-auto w-full max-w-2xl px-0 text-left">
            <SheetTitle><Lang text={{ ko: "카드 속성", en: "Card properties" }} /></SheetTitle>
            <SheetDescription id="card-news-mobile-properties-description"><Lang text={{ ko: "배경과 레이어 설정을 조정하세요.", en: "Adjust the background and layer settings." }} /></SheetDescription>
          </SheetHeader>
          <div className="mx-auto mt-4 w-full max-w-2xl">
            <CardNewsPropertiesPanel
              key={`mobile-${activeCard.cardId}:${activeCard.altText}`}
              document={deck}
              card={activeCard}
              selectedLayer={selectedLayer}
              onDocumentChange={commit}
              onSelectLayer={editor.selectLayer}
              onOpenAssetPicker={openAssetPicker}
              onAddText={addTextLayer}
              onAddSolid={addSolidLayer}
              onDeleteLayer={deleteSelectedLayer}
            />
          </div>
        </SheetContent>
      </Sheet>

      <CardNewsAssetPicker
        key={assetPickerTarget || "closed"}
        open={assetPickerTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAssetPickerTarget(null);
            setPendingTemplate(null);
            setPendingTemplatePreset(null);
          }
        }}
        onSelect={applyAsset}
      />
    </div>
  );
}
