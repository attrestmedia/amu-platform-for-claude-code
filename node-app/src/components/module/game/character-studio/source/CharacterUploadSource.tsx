"use client";

import { useRef, useState } from "react";
import { Lang } from "components/module/i18n";
import { uploadLibraryImage } from "libs/api/lab/imagePrompts";
import { MethodUpload } from "components/module/game/forge/steps/character/MethodUpload";
import type { CharacterRegisterSource } from "components/module/game/forge/steps/character/MethodTemplateGrid";

const UPLOAD_ERROR_COPY: Record<string, { ko: string; en: string }> = {
  membership_required: {
    ko: "이미지 업로드에는 유효한 멤버십이 필요합니다.",
    en: "A valid membership is required to upload images.",
  },
  unsupported_image_type: {
    ko: "PNG, JPG, WEBP 이미지 파일만 업로드할 수 있습니다.",
    en: "Only PNG, JPG, and WEBP image files can be uploaded.",
  },
  image_too_large: {
    ko: "이미지 파일 크기가 허용 범위를 초과했습니다.",
    en: "The image file exceeds the allowed size.",
  },
  optimized_image_too_large: {
    ko: "최적화 후에도 이미지 파일이 허용 크기를 초과했습니다.",
    en: "The image still exceeds the allowed size after optimization.",
  },
  image_source_surface_invalid: {
    ko: "이미지 업로드 요청을 확인할 수 없습니다. 다시 시도해 주세요.",
    en: "The image upload request could not be verified. Please try again.",
  },
};

const FALLBACK_UPLOAD_ERROR = {
  ko: "이미지를 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  en: "Could not upload the image. Please try again shortly.",
};

/**
 * @docHint
 * @purpose 비공개 업로드 이미지를 캐릭터 기준 자산으로 선택
 * @process 파일 업로드 API 호출  private ImageAsset 수신  선택 가능한 upload source 반환
 * @domain game.user-character
 * @scope user-client
 */
export function CharacterUploadSource({
  onSelect,
  onClear,
}: {
  onSelect: (source: CharacterRegisterSource) => void;
  onClear: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const uploadLock = useRef(false);
  const errorMessage = UPLOAD_ERROR_COPY[errorCode] || FALLBACK_UPLOAD_ERROR;

  const handlePick = async (file: File) => {
    if (uploadLock.current) return;
    uploadLock.current = true;
    setUploading(true);
    setErrorCode("");
    try {
      const uploaded = await uploadLibraryImage(file, { sourceSurface: "assets-studio-character" });
      setPreviewUrl(uploaded.url);
      onSelect({
        key: `upload:${uploaded.assetId}`,
        sourceType: "upload",
        assetId: uploaded.assetId,
        url: uploaded.url,
        label: file.name.slice(0, 40),
      });
    } catch (caught) {
      setErrorCode(caught instanceof Error ? caught.message : "image_upload_failed");
    } finally {
      uploadLock.current = false;
      setUploading(false);
    }
  };

  const handleClear = () => {
    setPreviewUrl("");
    setErrorCode("");
    onClear();
  };

  return (
    <div className="space-y-3">
      <MethodUpload
        previewUrl={previewUrl || undefined}
        uploading={uploading}
        disabled={uploading}
        onPick={handlePick}
        onClear={handleClear}
      />
      {errorCode ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <Lang text={errorMessage} />
        </p>
      ) : null}
    </div>
  );
}
