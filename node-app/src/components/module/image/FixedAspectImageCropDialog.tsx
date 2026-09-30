"use client";

import { Lang } from "components/module/i18n";
import { ImageOverlayDrawingDialog } from "components/module/image/ImageOverlayDrawingDialog";
import { fileToDataUrl } from "utils/app/imageFile";

type FixedAspectImageCropDialogProps = {
  open: boolean;
  imageSrc: string;
  aspectRatio?: number;
  disabled?: boolean;
  downloadBaseFileName?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (result: { blob: Blob; previewUrl: string }) => void | Promise<void>;
};

export default function FixedAspectImageCropDialog({
  open,
  imageSrc,
  aspectRatio = 2 / 3,
  disabled = false,
  downloadBaseFileName = "tutor-profile-2x3",
  onOpenChange,
  onConfirm,
}: FixedAspectImageCropDialogProps) {
  const regionCaptureLabel =
    aspectRatio === 1 ? { ko: "1:1 자르기", en: "1:1 crop" } : { ko: "비율 자르기", en: "Ratio crop" };

  if (!open || !imageSrc) return null;

  return (
    <ImageOverlayDrawingDialog
      open={open}
      onOpenChange={onOpenChange}
      imageSrc={imageSrc}
      imageName={`${downloadBaseFileName}.png`}
      cropAspectRatio={aspectRatio}
      titleText={{ ko: "프로필 이미지 편집", en: "Edit profile image" }}
      regionCaptureLabel={regionCaptureLabel}
      cropRegionLabel={regionCaptureLabel}
      applyLabel={<Lang text={{ ko: "적용하기", en: "Apply" }} />}
      applyingLabel={<Lang text={{ ko: "적용 중...", en: "Applying..." }} />}
      disabled={disabled}
      onApply={async (file) => {
        await onConfirm({ blob: file, previewUrl: await fileToDataUrl(file) });
      }}
    />
  );
}
