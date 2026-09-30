"use client";

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { MAX_BASE_FILE_BYTES } from "consts/app";
import { formatBytes } from "utils/normalize";
import type { ImageAttachFailureType } from "./hooks/useReferenceImageManager";

type Props = {
  failure: ImageAttachFailureType | null;
  onClose: () => void;
};

function getFailureMessage(failure: ImageAttachFailureType) {
  if (failure.reason === "unsupported_type") {
    return {
      ko: "이미지 파일만 첨부할 수 있습니다.",
      en: "Only image files can be attached.",
    };
  }

  if (failure.reason === "file_too_large") {
    return {
      ko: `이미지는 ${formatBytes(MAX_BASE_FILE_BYTES)} 이하로 줄여 다시 첨부해 주세요.`,
      en: `Please reduce the image to ${formatBytes(MAX_BASE_FILE_BYTES)} or less and attach it again.`,
    };
  }

  return {
    ko: "선택한 이미지를 처리하지 못했습니다. 잠시 후 재시도해주세요.",
    en: "The selected image could not be processed. Please resize it to 2048-3072px or smaller and attach it again.",
  };
}

function getFileInfo(failure: ImageAttachFailureType) {
  const diagnostic = failure.diagnostic;
  const items = [
    diagnostic.name,
    diagnostic.width && diagnostic.height ? `${diagnostic.width}x${diagnostic.height}` : "",
    diagnostic.size > 0 ? formatBytes(diagnostic.size) : "",
  ].filter(Boolean);

  return items.join(" · ");
}

export function ImageAttachFailureDialog({ failure, onClose }: Props) {
  const fileInfo = failure ? getFileInfo(failure) : "";

  return (
    <Dialog open={Boolean(failure)} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        overlayClassName="z-[100]"
        className="z-[101] w-[calc(100vw-2rem)] max-w-md"
        innerWrapClassName="gap-5"
      >
        <DialogHeader className="text-left">
          <DialogTitle>
            <Lang text={{ ko: "이미지 첨부 실패", en: "Image Attachment Failed" }} />
          </DialogTitle>
          {failure && (
            <DialogDescription className="leading-relaxed">
              <Lang text={getFailureMessage(failure)} />
            </DialogDescription>
          )}
        </DialogHeader>

        {fileInfo ? (
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground break-all">
            <span className="font-medium text-foreground">
              <Lang text={{ ko: "선택한 파일", en: "Selected file" }} />
            </span>
            <span className="mx-1">:</span>
            {fileInfo}
          </p>
        ) : null}

        <DialogFooter>
          <Button onClick={onClose}>{lang({ ko: "확인", en: "OK" })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
