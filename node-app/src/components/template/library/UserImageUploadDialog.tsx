"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Lang, lang } from "components/module/i18n";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { uploadLibraryImage } from "libs/api/lab";
import { extractApiErrorMessage } from "utils/common/typeUtils";
import { formatBytes } from "utils/normalize";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function validateFile(file: File) {
  if (!ALLOWED_TYPES.has(file.type)) return "unsupported_image_type";
  if (file.size <= 0) return "image_empty";
  if (file.size > MAX_UPLOAD_BYTES) return "image_too_large";
  return "";
}

function localizeUploadError(code: string) {
  if (code === "membership_required") {
    return lang({
      ko: "이미지 업로드는 어드민과 활성 멤버십 사용자만 이용할 수 있습니다.",
      en: "Image upload is available to admins and active members.",
    });
  }
  if (code === "image_too_large") {
    return lang({ ko: "이미지는 10MB 이하만 업로드할 수 있습니다.", en: "Images must be 10 MB or smaller." });
  }
  if (code === "optimized_image_too_large") {
    return lang({
      ko: "최적화 후에도 용량이 큽니다. 더 작은 이미지를 선택해 주세요.",
      en: "The optimized image is still too large. Choose a smaller image.",
    });
  }
  if (["unsupported_image_type", "image_mime_mismatch", "invalid_image"].includes(code)) {
    return lang({ ko: "JPG, PNG, WebP 이미지 파일만 선택해 주세요.", en: "Choose a JPG, PNG, or WebP image." });
  }
  if (code === "r2_storage_required" || code === "r2_object_verification_failed") {
    return lang({
      ko: "이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      en: "Image storage is unavailable. Try again later.",
    });
  }
  return lang({
    ko: "이미지를 업로드하지 못했습니다. 다시 시도해 주세요.",
    en: "The image could not be uploaded. Try again.",
  });
}

export function UserImageUploadDialog({ onUploaded }: { onUploaded: () => void }) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const previewUrlRef = useRef("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
  };

  const reset = () => {
    clearPreview();
    setFile(null);
    setError("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (uploading) return;
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const selectFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    const code = validateFile(nextFile);
    if (code) {
      clearPreview();
      setFile(null);
      setError(localizeUploadError(code));
      return;
    }
    clearPreview();
    const nextPreviewUrl = URL.createObjectURL(nextFile);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setFile(nextFile);
    setError("");
  };

  const submit = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    try {
      await uploadLibraryImage(file);
      toast.success(
        lang({
          ko: "이미지를 최적화해 내 라이브러리에 저장했습니다.",
          en: "The optimized image was saved to your library.",
        }),
      );
      setOpen(false);
      reset();
      onUploaded();
    } catch (uploadError) {
      setError(localizeUploadError(extractApiErrorMessage(uploadError, "image_upload_failed")));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="outline"
        rounded="full"
        className="w-8 h-8 sm:w-auto sm:h-auto"
        onClick={() => setOpen(true)}
        data-dialog-trigger
      >
        <Upload className="icon-xs" aria-hidden />
        <Lang text={{ ko: "이미지 업로드", en: "Upload image" }} className="text-xs hidden sm:block" />
      </Button>

      <DialogContent disableOutsideClick={uploading} innerWrapClassName="w-[calc(100vw-2rem)] max-w-lg p-5 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>
            <Lang text={{ ko: "내 이미지 업로드", en: "Upload to My Images" }} />
          </DialogTitle>
          <DialogDescription>
            <Lang
              text={{
                ko: "JPG, PNG, WebP 이미지를 10MB까지 선택할 수 있습니다. 서버에서 WebP로 최적화한 뒤 비공개로 저장합니다.",
                en: "Choose a JPG, PNG, or WebP image up to 10 MB. It will be optimized to WebP and stored privately.",
              }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label
            htmlFor={inputId}
            className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-5 text-center transition-colors hover:border-primary focus-within:border-primary"
          >
            <ImagePlus className="h-8 w-8 text-primary" aria-hidden />
            <span className="text-sm font-semibold">
              <Lang text={{ ko: "이미지를 선택하세요", en: "Choose an image" }} />
            </span>
            <span className="text-xs text-muted-foreground">JPG · PNG · WebP · 10MB</span>
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                selectFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>

          {previewUrl && file ? (
            <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-border p-3">
              <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                <ImageBox src={previewUrl} alt="" className="h-full w-full object-cover" objectFit="object-cover" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size, 1)}</p>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {uploading ? (
            <p className="text-sm text-secondary-text" role="status" aria-live="polite">
              <Lang text={{ ko: "이미지를 최적화하고 저장하는 중입니다.", en: "Optimizing and saving the image." }} />
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="md"
            className="min-h-11"
            disabled={uploading}
            onClick={() => handleOpenChange(false)}
          >
            <Lang text={{ ko: "취소", en: "Cancel" }} />
          </Button>
          <Button
            size="md"
            className="min-h-11"
            disabled={!file}
            loading={uploading}
            loadingText={<Lang text={{ ko: "업로드 중", en: "Uploading" }} />}
            onClick={submit}
          >
            <Lang text={{ ko: "업로드", en: "Upload" }} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
