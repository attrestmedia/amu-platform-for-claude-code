"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, MoreVertical, RefreshCcw } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { BottomSheetDialog, Button, Dropdown, Preloader, dialog } from "@amu-labs/ui";
import { getStudioContentMeta } from "libs/api/lab";
import type { ContentAssetMetaType, ContentStudioApplyContentArgsType, ContentStudioReferenceImageType } from "types/app";
import { runAfterCurrentRender } from "utils/common";
import { writeTextToClipboard } from "utils/helper";
import { getContentAssetPreviewTitle } from "utils/lab/contentAssetPreview";
import type { ContentAssetCardItem } from "./RecentGeneratedContents";
import { GeneratedContentRenderer } from "./content-studio/GeneratedContentRenderer";

type ContentAssetViewerProps = {
  asset: ContentAssetCardItem | null;
  templateTitle?: string;
  onClose: () => void;
  onUseTemplate?: (templateKey: string) => void;
  onReuse?: (asset: ContentAssetMetaType) => void;
  referenceImages?: readonly ContentStudioReferenceImageType[];
  onApplyContent?: (args: ContentStudioApplyContentArgsType) => Promise<void> | void;
  onToggleVisibility?: (asset: ContentAssetMetaType) => Promise<void> | void;
  onDelete?: (asset: ContentAssetMetaType) => Promise<void> | void;
};

function hasFullText(asset: ContentAssetCardItem): asset is ContentAssetMetaType {
  return "text" in asset && typeof asset.text === "string";
}

export function ContentAssetViewer({
  asset,
  templateTitle,
  onClose,
  onUseTemplate,
  onReuse,
  referenceImages = [],
  onApplyContent,
  onToggleVisibility,
  onDelete,
}: ContentAssetViewerProps) {
  const [loadedAsset, setLoadedAsset] = useState<ContentAssetMetaType | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assetId = asset?.assetId || "";

  useEffect(() => {
    let cancelled = false;
    if (!asset || hasFullText(asset)) return;

    runAfterCurrentRender(() => {
      if (cancelled) return;
      setLoading(true);
      setLoadError(false);
      void getStudioContentMeta(asset.assetId, asset.visibility, Boolean(asset.canEdit))
        .then((row) => {
          if (!cancelled) {
            setLoadedAsset(row);
            setLoadError(!row);
          }
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [asset, assetId, retryNonce]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
    };
  }, []);

  const fullAsset = asset && hasFullText(asset) ? asset : loadedAsset?.assetId === assetId ? loadedAsset : null;
  const previewText = asset && "textPreview" in asset ? String(asset.textPreview || "") : "";
  const title = useMemo(
    () => getContentAssetPreviewTitle(fullAsset?.text || previewText, templateTitle || lang({ ko: "생성 콘텐츠", en: "Generated content" })),
    [fullAsset?.text, previewText, templateTitle],
  );

  const handleCopy = async () => {
    if (!fullAsset?.text) return;
    try {
      await writeTextToClipboard(fullAsset.text);
      setCopied(true);
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = setTimeout(() => setCopied(false), 1_800);
    } catch {
      void dialog.alert({ variant: "danger", message: lang({ ko: "복사에 실패했습니다.", en: "Copy failed." }) });
    }
  };

  const managementOptions = fullAsset?.canEdit
    ? [
        ...(onToggleVisibility
          ? [
              {
                value: "visibility",
                label:
                  fullAsset.visibility === "public"
                    ? lang({ ko: "비공개로 전환", en: "Make private" })
                    : lang({ ko: "공개로 전환", en: "Make public" }),
              },
            ]
          : []),
        ...(onDelete ? [{ value: "delete", label: lang({ ko: "삭제", en: "Delete" }) }] : []),
      ]
    : [];

  return (
    <BottomSheetDialog
      open={Boolean(asset)}
      onClose={onClose}
      title={title}
      description={templateTitle}
      panelClassName="sm:max-w-4xl"
    >
      {/*
        본문을 flex 아이템으로 만들지 않는다. 스크롤 컨테이너(dialog body)를 flex column으로 바꾸고
        본문에 flex-1 + min-h-*를 주면, 명시한 min-height가 flex의 automatic minimum size를 대체해
        본문 박스가 내용보다 작게 눌린다. 그러면 flex 컨테이너의 content 높이가 scrollHeight까지
        자라지 못하고, sticky 하단 바의 containing block이 첫 화면 끝에서 끊겨 스크롤과 함께 딸려 올라간다.
      */}
      <article className="min-h-52 px-4 py-5 sm:px-6" aria-label={title}>
        {loading ? (
          <div className="flex min-h-52 items-center justify-center" role="status">
            <Preloader />
          </div>
        ) : loadError || !fullAsset ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <Lang text={{ ko: "전체 콘텐츠를 불러오지 못했습니다.", en: "Could not load the full content." }} />
            <Button size="sm" variant="outline" onClick={() => setRetryNonce((value) => value + 1)}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              <Lang text={{ ko: "다시 시도", en: "Try again" }} />
            </Button>
          </div>
        ) : (
          <GeneratedContentRenderer
            content={fullAsset.text}
            referenceImages={referenceImages}
            className="mx-auto max-w-3xl break-words text-sm leading-7"
          />
        )}
      </article>

      <div
        className="sticky bottom-0 z-10 flex min-h-16 items-center justify-end border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-6"
        role="group"
        aria-label={lang({ ko: "콘텐츠 작업", en: "Content actions" })}
      >
        {fullAsset ? (
          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => void handleCopy()}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              <Lang text={copied ? { ko: "복사됨", en: "Copied" } : { ko: "복사", en: "Copy" }} />
            </Button>
            {onApplyContent ? (
              <Button
                variant="primary"
                className="min-h-11 flex-1 sm:flex-none"
                loading={applying}
                onClick={async () => {
                  setApplying(true);
                  try {
                    await onApplyContent({
                      assetId: fullAsset.assetId,
                      text: fullAsset.text,
                      referenceImages: referenceImages.length ? [...referenceImages] : undefined,
                    });
                  } finally {
                    setApplying(false);
                  }
                }}
              >
                <Lang text={{ ko: "적용하기", en: "Apply" }} />
              </Button>
            ) : null}
            {onUseTemplate && fullAsset.templateKey ? (
              <Button variant="primary" className="min-h-11 flex-1 sm:flex-none" onClick={() => onUseTemplate(fullAsset.templateKey)}>
                <Lang text={{ ko: "이 템플릿 사용", en: "Use this template" }} />
              </Button>
            ) : null}
            {onReuse ? (
              <Button variant="primary" className="min-h-11 flex-1 sm:flex-none" onClick={() => onReuse(fullAsset)}>
                <Lang text={{ ko: "프롬프트로 재사용", en: "Reuse as prompt" }} />
              </Button>
            ) : null}
            {managementOptions.length ? (
              <Dropdown
                options={managementOptions}
                selected={null}
                onSelect={(value) => {
                  if (value === "visibility" && onToggleVisibility) void onToggleVisibility(fullAsset);
                  if (value === "delete" && onDelete) void onDelete(fullAsset);
                }}
                renderTrigger={() => <MoreVertical className="h-4 w-4" aria-hidden />}
                hideArrow
                openPortal
                openSide="top"
                contentAlign="end"
                contentSideOffset={8}
                triggerAriaLabel={lang({ ko: "콘텐츠 관리", en: "Manage content" })}
                className="h-11 w-11 min-h-11 min-w-11 flex-none justify-center rounded-lg border border-border p-0"
                dropdownClassName="min-w-44 rounded-xl border-border p-1 shadow-xl"
                itemClassName={(option) =>
                  option.value === "delete" ? "rounded-lg text-danger focus:bg-danger/10 focus:text-danger" : "rounded-lg"
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </BottomSheetDialog>
  );
}
