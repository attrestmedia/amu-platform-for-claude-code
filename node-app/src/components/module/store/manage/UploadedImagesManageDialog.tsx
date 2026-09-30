"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { Trash2, Upload } from "lucide-react";
import { BottomSheetDialog, Button, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import type { UploadedImageItem } from "./UploadedImagesPickerDialog";

/**
 * @docHint
 * @purpose "상품 이미지 관리" 팝업 — 유니버스 업로드 이미지(uploaded_media_assets)를 그리드로 노출하고
 *          새 이미지를 업로드하거나 기존 이미지를 삭제한다. 상품 등록 화면의 "내 이미지" 선택기와
 *          같은 목록(같은 query key)을 공유해 업로드·삭제가 즉시 반영된다.
 * @domain commerce.naver
 * @scope client
 */

type UploadedImagesManageDialogProps = {
  open: boolean;
  onClose: () => void;
  universeId: string;
};

export function UploadedImagesManageDialog({ open, onClose, universeId }: UploadedImagesManageDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState("");

  const imagesQuery = useQuery<UploadedImageItem[]>({
    queryKey: ["universe-uploaded-images", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<{ data?: { images?: UploadedImageItem[] } }>(
        `/universe/${universeId}/uploaded-images`,
        { cache: "no-store" },
      );
      return response?.data?.data?.images || [];
    },
    enabled: open,
    staleTime: 0,
  });

  const images = imagesQuery.data || [];

  const invalidateList = async () => {
    await queryClient.invalidateQueries({ queryKey: ["universe-uploaded-images", universeId] });
  };

  const uploadFiles = async (files: FileList | null) => {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    setUploadPending(true);
    let failed = 0;
    try {
      for (const file of list) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", "commerce-draft");
        try {
          await fetchClient.post(`/universe/${universeId}/upload`, formData);
        } catch {
          failed += 1;
        }
      }
      await invalidateList();
      if (failed > 0) {
        void dialog.alert(
          lang({ ko: `${failed}개 이미지 업로드에 실패했습니다.`, en: `Failed to upload ${failed} image(s).` }),
        );
      }
    } finally {
      setUploadPending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteImage = async (image: UploadedImageItem) => {
    const confirmed = await dialog.confirm({
      variant: "danger",
      message: lang({
        ko: "이 이미지를 삭제할까요? 이미 상품에 적용된 이미지라면 해당 상품 표시에도 영향을 줄 수 있습니다.",
        en: "Delete this image? If it is already applied to a product, the product display may be affected.",
      }),
    });
    if (!confirmed) return;
    setDeletingUrl(image.url);
    try {
      await fetchClient.delete(`/universe/${universeId}/upload?url=${encodeURIComponent(image.url)}`, {
        loading: "global",
      });
      await invalidateList();
    } catch {
      void dialog.alert(
        lang({ ko: "이미지 삭제에 실패했습니다.", en: "Failed to delete the image." }),
      );
    } finally {
      setDeletingUrl("");
    }
  };

  return (
    <BottomSheetDialog
      open={open}
      onClose={onClose}
      title={lang({ ko: "상품 이미지 관리", en: "Product Image Library" })}
      description={lang({
        ko: "이 유니버스에 업로드된 이미지를 관리합니다. 새 이미지를 올리면 상품 등록 화면의 '내 이미지' 선택기에도 표시됩니다.",
        en: "Manage images uploaded to this universe. Newly uploaded images also appear in the 'My Images' picker.",
      })}
    >
      <div className="px-4 py-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(event) => void uploadFiles(event.target.files)}
        />
        <Button
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          loading={uploadPending}
        >
          <Upload className="mr-2 icon-xs" />
          <Lang text={{ ko: "새 이미지 업로드", en: "Upload New Images" }} />
        </Button>

        <p className="mt-2 text-xxs leading-4 text-secondary-text">
          <Lang
            text={{
              ko: "PNG·JPEG·WebP·GIF, 파일당 최대 10MB까지 업로드할 수 있습니다.",
              en: "PNG, JPEG, WebP, and GIF up to 10MB per file.",
            }}
          />
        </p>

        <div className="mt-4">
          {imagesQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-secondary-text">
              <Lang text={{ ko: "이미지를 불러오는 중입니다...", en: "Loading images..." }} />
            </div>
          ) : images.length === 0 ? (
            <div className="py-10 text-center text-sm leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "아직 업로드한 이미지가 없습니다.",
                  en: "No uploaded images yet.",
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((image) => {
                if (!image.url) return null;
                const deleting = deletingUrl === image.url;
                return (
                  <div
                    key={image.assetId}
                    className="group relative overflow-hidden rounded-xl border border-border bg-surface"
                  >
                    <div className="relative aspect-square w-full bg-background">
                      <Image src={image.url} alt={image.originalFilename || image.assetId} fill unoptimized sizes="160px" className="object-cover" />
                    </div>
                    <button
                      type="button"
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface/90 text-danger transition hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
                      onClick={() => void deleteImage(image)}
                      disabled={deleting}
                      aria-label={lang({ ko: "이미지 삭제", en: "Delete image" })}
                    >
                      <Trash2 className="icon-xs" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {imagesQuery.isError ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-danger">
                <Lang text={{ ko: "목록을 불러오지 못했습니다.", en: "Failed to load images." }} />
              </p>
              <Button size="xs" variant="outline" onClick={() => imagesQuery.refetch()}>
                <Lang text={{ ko: "다시 시도", en: "Retry" }} />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </BottomSheetDialog>
  );
}
