"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatImageInputType, ChatImagePreviewType } from "types/ai";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_FILE_NAME_PATTERN = /\.(jpe?g|png|webp)$/i;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1600;
const MAX_ENCODED_BYTES = 2_500_000;

export type PendingTutorsChatImage = {
  input: ChatImageInputType;
  preview: ChatImagePreviewType;
};

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_decode_failed"));
    image.src = url;
  });
}

function dataUrlToBase64(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : "";
}

function estimateBase64Bytes(data: string) {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

/**
 * @docHint
 * @purpose Tutors 채팅 이미지의 선택·정규화·브라우저 수명 관리
 * @process 파일 검증  JPEG 축소 인코딩  transient preview 생성  닫힘 시 object URL 해제
 * @domain tutors-chat
 * @scope client
 */
export function useTutorsChatImageInput(enabled: boolean) {
  const [pending, setPending] = useState<PendingTutorsChatImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const pendingRef = useRef<PendingTutorsChatImage | null>(null);
  const previewUrlsRef = useRef(new Set<string>());

  const revokePreview = useCallback((url?: string) => {
    if (!url || !previewUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    previewUrlsRef.current.delete(url);
  }, []);

  const discard = useCallback(() => {
    revokePreview(pendingRef.current?.preview.url);
    pendingRef.current = null;
    setPending(null);
  }, [revokePreview]);

  const take = useCallback(() => {
    const taken = enabled ? pendingRef.current : null;
    if (!enabled) revokePreview(pendingRef.current?.preview.url);
    pendingRef.current = null;
    setPending(null);
    return taken;
  }, [enabled, revokePreview]);

  const prepare = useCallback(
    async (file: File, source: ChatImageInputType["source"]) => {
      if (!enabled) return;
      const mimeType = String(file.type || "").toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(mimeType) && !ALLOWED_FILE_NAME_PATTERN.test(file.name || "")) {
        throw new Error("unsupported_image_type");
      }
      if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error("image_too_large");

      setPreparing(true);
      const sourceUrl = URL.createObjectURL(file);
      try {
        const image = await loadImage(sourceUrl);
        const sourceWidth = Math.max(1, image.naturalWidth);
        const sourceHeight = Math.max(1, image.naturalHeight);
        const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("image_canvas_unavailable");

        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        const data = dataUrlToBase64(canvas.toDataURL("image/jpeg", 0.84));
        const sizeBytes = estimateBase64Bytes(data);
        if (!data || sizeBytes > MAX_ENCODED_BYTES) throw new Error("prepared_image_too_large");

        const previewBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("image_preview_encode_failed"))),
            "image/jpeg",
            0.84,
          );
        });
        const previewUrl = URL.createObjectURL(previewBlob);
        previewUrlsRef.current.add(previewUrl);

        revokePreview(pendingRef.current?.preview.url);
        const next = {
          input: { mimeType: "image/jpeg" as const, data, width, height, sizeBytes, source },
          preview: { url: previewUrl, width, height },
        };
        pendingRef.current = next;
        setPending(next);
      } finally {
        URL.revokeObjectURL(sourceUrl);
        setPreparing(false);
      }
    },
    [enabled, revokePreview],
  );

  useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    },
    [],
  );

  return { pending: enabled ? pending : null, preparing: enabled && preparing, prepare, discard, take };
}
