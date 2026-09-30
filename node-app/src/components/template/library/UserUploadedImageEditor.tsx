"use client";

import { useEffect, useState } from "react";
import { Copy, Save } from "lucide-react";
import { toast } from "sonner";
import { Lang, lang } from "components/module/i18n";
import { ImageOverlayDrawingDialog } from "components/module/image/ImageOverlayDrawingDialog";
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@amu-labs/ui";
import {
  saveEditedLibraryImage,
  type LibraryImageEditResult,
  type LibraryImageEditSaveMode,
  type LibraryImageOptimizationMode,
} from "libs/api/lab";
import type { ImagePromptMetaType } from "types/app";
import { extractApiErrorMessage } from "utils/common/typeUtils";
import { logger } from "utils/log";

type Props = {
  item: ImagePromptMetaType;
  imageSrc: string;
  imageName: string;
  onClose: () => void;
  onSaved: (result: LibraryImageEditResult) => void;
};

function localizeEditError(code: string) {
  if (code === "membership_required") {
    return lang({
      ko: "이미지 편집 저장은 어드민과 활성 멤버십 사용자만 이용할 수 있습니다.",
      en: "Saving image edits is available to admins and active members.",
    });
  }
  if (code === "image_overwrite_conflict") {
    return lang({
      ko: "이미지가 다른 작업에서 변경되었습니다. 라이브러리를 새로고침한 뒤 다시 시도해 주세요.",
      en: "The image changed in another operation. Refresh the library and try again.",
    });
  }
  if (["image_overwrite_storage_invalid", "image_overwrite_source_verification_failed"].includes(code)) {
    return lang({
      ko: "기존 이미지의 저장 상태를 확인하지 못해 덮어쓰기를 중단했습니다. 다시 시도해 주세요.",
      en: "The existing image could not be verified, so overwrite was stopped. Try again.",
    });
  }
  if (code === "optimized_image_too_large") {
    return lang({
      ko: "고화질 기준으로 저장 가능한 크기를 초과했습니다. ‘더 작은 파일로 추가 최적화’를 선택하거나 더 작은 영역으로 편집해 주세요.",
      en: "The result exceeds the high-quality storage limit. Select smaller-file optimization or edit a smaller region.",
    });
  }
  return lang({
    ko: "편집 이미지를 저장하지 못했습니다. 다시 시도해 주세요.",
    en: "The edited image could not be saved. Try again.",
  });
}

export function UserUploadedImageEditor({ item, imageSrc, imageName, onClose, onSaved }: Props) {
  const [editorOpen, setEditorOpen] = useState(true);
  const [saveOptionsOpen, setSaveOptionsOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [savingMode, setSavingMode] = useState<LibraryImageEditSaveMode | null>(null);
  const [compactOptimization, setCompactOptimization] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editorOpen && !saveOptionsOpen && !pendingFile && !savingMode) onClose();
  }, [editorOpen, onClose, pendingFile, saveOptionsOpen, savingMode]);

  const handleEditedFile = (file: File) => {
    setPendingFile(file);
    setError("");
    setSaveOptionsOpen(true);
  };

  const cancelSaveOptions = () => {
    if (savingMode) return;
    setSaveOptionsOpen(false);
    setPendingFile(null);
    setError("");
    setEditorOpen(true);
  };

  const save = async (saveMode: LibraryImageEditSaveMode) => {
    if (!pendingFile || !item.assetId || savingMode) return;
    setSavingMode(saveMode);
    setError("");

    try {
      const optimizationMode: LibraryImageOptimizationMode = compactOptimization ? "compact" : "quality";
      const result = await saveEditedLibraryImage(item.assetId, pendingFile, saveMode, optimizationMode);
      toast.success(
        lang(
          saveMode === "new"
            ? {
                ko: "원본을 유지하고 편집 이미지를 새 비공개 이미지로 저장했습니다.",
                en: "The original was kept and the edited image was saved as a new private image.",
              }
            : {
                ko: "기존 업로드 이미지를 편집 결과로 덮어썼습니다.",
                en: "The uploaded image was replaced with the edited result.",
              },
        ),
      );
      onSaved(result);
      setSaveOptionsOpen(false);
      setPendingFile(null);
      onClose();
    } catch (saveError) {
      logger.warn("[UserUploadedImageEditor] 편집 이미지 저장 실패", saveError);
      setError(localizeEditError(extractApiErrorMessage(saveError, "image_edit_failed")));
    } finally {
      setSavingMode(null);
    }
  };

  return (
    <>
      <ImageOverlayDrawingDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        imageSrc={imageSrc}
        imageName={imageName}
        startWithCrop
        titleText={{ ko: "내 이미지 편집", en: "Edit My Image" }}
        applyLabel={<Lang text={{ ko: "저장 옵션", en: "Save options" }} />}
        applyingLabel={<Lang text={{ ko: "편집 결과 준비 중...", en: "Preparing edited image..." }} />}
        onApply={handleEditedFile}
      />

      <Dialog open={saveOptionsOpen} onOpenChange={(next) => (!next ? cancelSaveOptions() : undefined)}>
        <DialogContent
          hideClose={Boolean(savingMode)}
          disableOutsideClick={Boolean(savingMode)}
          innerWrapClassName="w-[calc(100vw-2rem)] max-w-lg p-5 sm:p-6"
        >
          <DialogHeader className="pr-8">
            <DialogTitle>
              <Lang text={{ ko: "편집 이미지를 어떻게 저장할까요?", en: "How should this edit be saved?" }} />
            </DialogTitle>
            <DialogDescription className="leading-6">
              <Lang
                text={{
                  ko: "새 이미지로 저장하면 원본을 유지합니다. 덮어쓰기는 되돌릴 수 없으며 기존 자산의 공개 상태를 유지합니다.",
                  en: "Saving as new keeps the original. Overwriting cannot be undone and preserves the existing asset's visibility.",
                }}
              />
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border/60 bg-surface/60 p-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-primary-text">
              <Checkbox
                className="mt-0.5"
                checked={compactOptimization}
                onCheckedChange={(checked) => setCompactOptimization(checked === true)}
                disabled={Boolean(savingMode)}
              />
              <span>
                <span className="block font-semibold">
                  <Lang text={{ ko: "더 작은 파일로 추가 최적화", en: "Optimize for a smaller file" }} />
                </span>
                <span className="mt-1 block text-xs font-normal leading-5 text-secondary-text">
                  <Lang
                    text={{
                      ko: "선택하지 않으면 장축 1920px까지 유지하고 품질을 80 아래로 낮추지 않습니다. 선택 시 장축 1280px·품질 64까지 단계적으로 줄일 수 있습니다.",
                      en: "When off, the long edge is preserved up to 1920px and quality stays at 80 or higher. When on, it may step down to 1280px and quality 64.",
                    }}
                  />
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-3" role="group" aria-label={lang({ ko: "편집 이미지 저장 방식", en: "Edited image save mode" })}>
            <Button
              className="min-h-16 h-auto w-full justify-start gap-3 px-4 py-3 text-left"
              noWrap={false}
              loading={savingMode === "new"}
              loadingText={<Lang text={{ ko: "새 이미지로 저장 중...", en: "Saving as new..." }} />}
              disabled={Boolean(savingMode)}
              onClick={() => void save("new")}
            >
              <Copy className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                <span className="block font-semibold">
                  <Lang text={{ ko: "새 이미지로 저장", en: "Save as new image" }} />
                </span>
                <span className="mt-1 block text-xs font-normal opacity-85">
                  <Lang text={{ ko: "원본 유지 · 새 이미지는 비공개", en: "Keep original · New image is private" }} />
                </span>
              </span>
            </Button>

            <Button
              variant="outlineDestructive"
              className="min-h-16 h-auto w-full justify-start gap-3 px-4 py-3 text-left"
              noWrap={false}
              loading={savingMode === "overwrite"}
              loadingText={<Lang text={{ ko: "기존 이미지 덮어쓰는 중...", en: "Overwriting image..." }} />}
              disabled={Boolean(savingMode)}
              onClick={() => void save("overwrite")}
            >
              <Save className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                <span className="block font-semibold">
                  <Lang text={{ ko: "기존 이미지 덮어쓰기", en: "Overwrite existing image" }} />
                </span>
                <span className="mt-1 block text-xs font-normal opacity-85">
                  <Lang
                    text={
                      item.visibility === "public"
                        ? { ko: "자산 ID·공개 상태 유지 · 공개 URL 변경", en: "Keep asset ID and public status · Public URL changes" }
                        : { ko: "자산 ID·비공개 상태 유지 · 원본 교체", en: "Keep asset ID and private status · Replace original" }
                    }
                  />
                </span>
              </span>
            </Button>
          </div>

          {error ? (
            <p className="text-sm leading-6 text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {savingMode ? (
            <p className="text-sm text-secondary-text" role="status" aria-live="polite">
              <Lang
                text={{
                  ko: compactOptimization
                    ? "파일 크기를 추가 최적화하고 R2 저장 상태를 확인하는 중입니다."
                    : "고화질 기준으로 최적화하고 R2 저장 상태를 확인하는 중입니다.",
                  en: compactOptimization
                    ? "Applying additional file optimization and verifying R2 storage."
                    : "Optimizing with the high-quality policy and verifying R2 storage.",
                }}
              />
            </p>
          ) : null}

          <DialogFooter className="flex justify-end">
            <Button variant="outline" className="min-h-11" disabled={Boolean(savingMode)} onClick={cancelSaveOptions}>
              <Lang text={{ ko: "편집기로 돌아가기", en: "Back to editor" }} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
