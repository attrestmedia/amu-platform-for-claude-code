"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import fetchClient from "libs/api/fetchClient";
import { BottomSheetDialog, Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";

/**
 * @docHint
 * @purpose "내 이미지" 선택 팝업 — 유니버스에 업로드했던 이미지 목록을 그리드로 노출하고
 *          하나를 선택해 대표/추가 이미지 필드에 적용한다. 데이터는 팝업이 열릴 때만 조회한다.
 * @domain commerce.naver
 * @scope client
 */

export type UploadedImageItem = {
  assetId: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  originalFilename?: string;
  createdAt?: string;
};

type UploadedImagesPickerDialogProps = {
  open: boolean;
  onClose: () => void;
  universeId: string;
  onSelect: (url: string) => void;
};

export function UploadedImagesPickerDialog({ open, onClose, universeId, onSelect }: UploadedImagesPickerDialogProps) {
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

  return (
    <BottomSheetDialog
      open={open}
      onClose={onClose}
      title={lang({ ko: "내 이미지", en: "My Images" })}
      description={lang({
        ko: "이 유니버스에 업로드했던 이미지 중 선택해 적용합니다.",
        en: "Pick from images previously uploaded to this universe.",
      })}
    >
      <div className="px-4 py-4">
        {imagesQuery.isLoading ? (
          <div className="py-10 text-center text-sm text-secondary-text">
            <Lang text={{ ko: "이미지를 불러오는 중입니다...", en: "Loading images..." }} />
          </div>
        ) : images.length === 0 ? (
          <div className="py-10 text-center text-sm leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "아직 업로드한 이미지가 없습니다. 먼저 이미지를 업로드해 주세요.",
                en: "No uploaded images yet. Upload an image first.",
              }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((image) => {
              if (!image.url) return null;
              return (
                <button
                  key={image.assetId}
                  type="button"
                  className="group overflow-hidden rounded-xl border border-border bg-surface transition hover:border-primary focus-visible:border-primary"
                  onClick={() => {
                    onSelect(image.url);
                    onClose();
                  }}
                  aria-label={image.originalFilename || image.assetId}
                >
                  <div className="relative aspect-square w-full bg-background">
                    <Image src={image.url} alt="" fill unoptimized sizes="160px" className="object-cover" />
                  </div>
                </button>
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
    </BottomSheetDialog>
  );
}
