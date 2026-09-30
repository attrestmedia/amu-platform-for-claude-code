"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  Label,
  Preloader,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@amu-labs/ui";
import { ExternalLink, ImagePlus, Upload } from "lucide-react";
import { listStudioImageMetas, uploadLibraryImage } from "libs/api/lab";
import type { ImagePromptMetaType } from "types/app";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";

export type CardNewsAssetSelection = {
  value: string;
  valueKind: "assetId" | "proxyUrl";
  previewUrl?: string;
  label: string;
};

type CardNewsAssetPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: CardNewsAssetSelection) => void;
};

function dedupeAssets(rows: ImagePromptMetaType[]) {
  const map = new Map<string, ImagePromptMetaType>();
  rows.forEach((row) => {
    const assetId = String(row.assetId || "").trim();
    if (assetId && row.url && !map.has(assetId)) map.set(assetId, row);
  });
  return Array.from(map.values());
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "이미지를 준비하지 못했습니다.";
}

export function CardNewsAssetPicker({ open, onOpenChange, onSelect }: CardNewsAssetPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<ImagePromptMetaType[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [loading, setLoading] = useState(open);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.allSettled([
      listStudioImageMetas({ scope: "user", limit: 40 }),
      listStudioImageMetas({ scope: "all", visibility: "public", limit: 40 }),
    ]).then((results) => {
      if (cancelled) return;
      const rows = results.flatMap((result) => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
      setAssets(dedupeAssets(rows));
      if (results.every((result) => result.status === "rejected")) {
        setError("자산 라이브러리를 불러오지 못했습니다.");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.assetId === selectedAssetId) || null,
    [assets, selectedAssetId],
  );

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 업로드할 수 있습니다.");
      const uploaded = await uploadLibraryImage(file);
      const uploadedAsset: ImagePromptMetaType = {
        assetId: uploaded.assetId,
        url: uploaded.url,
        urlKind: uploaded.urlKind,
        templateKey: "",
        visibility: "private",
        createdAt: Date.now(),
        canEdit: true,
        isOwner: true,
        sourceService: "upload",
      };
      setAssets((current) => [uploadedAsset, ...current.filter((asset) => asset.assetId !== uploaded.assetId)]);
      setSelectedAssetId(uploaded.assetId);
      setExternalUrl("");
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const handleApply = () => {
    if (selectedAsset) {
      onSelect({
        value: selectedAsset.assetId,
        valueKind: "assetId",
        previewUrl: selectedAsset.url,
        label: selectedAsset.templateTitle || selectedAsset.assetId,
      });
      onOpenChange(false);
      return;
    }

    const url = externalUrl.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("http(s) URL만 사용할 수 있습니다.");
      onSelect({
        value: `/api/proxy/image?url=${encodeURIComponent(url)}`,
        valueKind: "proxyUrl",
        previewUrl: `/api/proxy/image?url=${encodeURIComponent(url)}`,
        label: parsed.hostname,
      });
      onOpenChange(false);
    } catch (urlError) {
      setError(errorMessage(urlError));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-3xl px-4 pb-8 sm:px-6" aria-describedby="card-news-asset-picker-description">
        <SheetHeader className="mx-auto w-full max-w-4xl px-0 text-left">
          <SheetTitle>
            <Lang text={{ ko: "이미지 추가", en: "Add image" }} />
          </SheetTitle>
          <SheetDescription id="card-news-asset-picker-description">
            <Lang text={{ ko: "업로드·자산 라이브러리·검증된 외부 이미지 중 하나를 선택하세요.", en: "Choose an upload, a library asset, or a validated external image." }} />
          </SheetDescription>
        </SheetHeader>

        <div className="mx-auto mt-5 w-full max-w-4xl space-y-5">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleUpload(file);
              }}
            />
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploading} loading={uploading}>
              <Upload className="size-4" aria-hidden />
              <Lang text={{ ko: "새 이미지 업로드", en: "Upload image" }} />
            </Button>
            <p className="flex items-center text-xs text-secondary-text">
              <Lang text={{ ko: "업로드 자산은 비공개로 저장됩니다.", en: "Uploads are stored as private assets." }} />
            </p>
          </div>

          <section aria-labelledby="card-news-library-title">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id="card-news-library-title" className="text-sm font-semibold text-primary-text">
                <Lang text={{ ko: "자산 라이브러리", en: "Asset library" }} />
              </h3>
              {loading ? <Preloader variant="spin" size="sm" /> : null}
            </div>
            {assets.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
                {assets.map((asset) => {
                  const selected = asset.assetId === selectedAssetId;
                  return (
                    <button
                      key={asset.assetId}
                      type="button"
                      aria-label={`${asset.templateTitle || "이미지"} 선택`}
                      aria-pressed={selected}
                      className={`relative min-h-11 overflow-hidden rounded-lg border-2 bg-surface-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary" : "border-transparent"}`}
                      onClick={() => {
                        setSelectedAssetId(asset.assetId);
                        setExternalUrl("");
                        setError("");
                      }}
                    >
                      <ImageBox src={asset.url} alt={asset.templateTitle || "라이브러리 이미지"} width={120} height={120} minWidth={0} maxWidth={120} minHeight={0} maxHeight={120} className="h-full w-full" objectFit="object-cover" sizes="120px" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1 py-1 text-[10px] text-primary-text">
                        {asset.visibility === "private" ? "Private" : "Public"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : loading ? (
              <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border text-sm text-secondary-text">
                <Lang text={{ ko: "자산을 불러오는 중…", en: "Loading assets…" }} />
              </div>
            ) : (
              <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border text-sm text-secondary-text">
                <ImagePlus className="mr-2 size-4" aria-hidden />
                <Lang text={{ ko: "아직 선택할 자산이 없습니다.", en: "No assets available yet." }} />
              </div>
            )}
          </section>

          <div className="space-y-2">
            <Label htmlFor="card-news-external-image-url" label={<Lang text={{ ko: "외부 이미지 URL (선택)", en: "External image URL (optional)" }} />} />
            <div className="flex gap-2">
              <Input
                id="card-news-external-image-url"
                type="url"
                value={externalUrl}
                placeholder={lang({ ko: "https://example.com/image.jpg", en: "https://example.com/image.jpg" })}
                className="min-h-11"
                onChange={(event) => {
                  setExternalUrl(event.target.value);
                  if (event.target.value) setSelectedAssetId("");
                  setError("");
                }}
              />
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border text-secondary-text" title="proxy">
                <ExternalLink className="size-4" aria-hidden />
              </span>
            </div>
            <p className="text-xs leading-5 text-secondary-text">
              <Lang text={{ ko: "원본 URL은 저장하지 않고 /api/proxy/image 검증 경로로만 사용합니다.", en: "The original URL is only used through the validated image proxy." }} />
            </p>
          </div>

          {error ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
              <Lang text={{ ko: "취소", en: "Cancel" }} />
            </Button>
            <Button variant="primary" className="min-h-11" onClick={handleApply} disabled={!selectedAsset && !externalUrl.trim()}>
              <Lang text={{ ko: "선택한 이미지 적용", en: "Apply image" }} />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
