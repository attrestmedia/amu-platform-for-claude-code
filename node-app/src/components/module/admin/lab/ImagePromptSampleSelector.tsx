"use client";

import { useCallback, useEffect, useState } from "react";
import { listStudioImages } from "libs/api/lab";
import { Label, Input, Button, Preloader } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";
import type { UserExtendedScopeType } from "types/ai";

type Props = {
  value?: string[]; // 현재 선택된 샘플 이미지 URL들
  onChange?: (urls: string[]) => void;
  scope?: UserExtendedScopeType; // images 조회 범위
  universeId?: string;
  maxSelect?: number; // 최대 선택 개수
  label?: React.ReactNode; // 라벨 텍스트
  initialFolder?: string; // 초기 폴더 값(자동으로 해당 폴더 기준 검색)
};

export function ImagePromptSampleSelector({
  value,
  onChange,
  scope = "all",
  universeId,
  maxSelect = 1,
  label,
  initialFolder = "",
}: Props) {
  const [images, setImages] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(value || []);
  const [folder, setFolder] = useState(initialFolder);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // 외부 value 변경 시 내부 선택값 동기화
  useEffect(function syncSelectedFromValueProp() {
    // value prop(외부 controlled) 변경 시 내부 selected 동기화
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(value || []);
  }, [value]);

  const loadImages = useCallback(async (folderParam?: string) => {
    setLoading(true);
    try {
      const list = await listStudioImages({
        scope,
        universeId,
        folder: folderParam?.trim() || undefined,
      });
      setImages(list);
      setLoadedOnce(true);
    } catch (e) {
      console.warn("Failed to load studio images", e);
      setImages([]);
      setLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [scope, universeId]);

  // 초기 로딩 (initialFolder 기준)
  useEffect(function loadImagesOnScopeChange() {
    // scope/universeId 변경 시 외부 스튜디오 이미지 fetch — 내부에서 images/loading 동기화
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadImages(initialFolder);
  }, [initialFolder, loadImages]);

  const handleSelect = (url: string) => {
    let next: string[];
    if (maxSelect === 1) {
      next = [url];
    } else {
      const exists = selected.includes(url);
      if (exists) {
        next = selected.filter((u) => u !== url);
      } else {
        next = [...selected, url].slice(0, maxSelect);
      }
    }
    setSelected(next);
    onChange?.(next);
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}

      {/* 폴더 필터 입력 */}
      <div className="flex gap-2">
        <Input
          className="text-xs"
          placeholder="e.g. users/attrest_admin/portrait"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={() => loadImages(folder)} disabled={loading} loading={loading}>
          <Lang text={{ ko: "검색", en: "Search" }} />
        </Button>
      </div>

      {/* 현재 선택된 샘플 미리보기 */}
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-default border bg-muted/40 p-2">
          {selected.map((src) => (
            <div key={src} className="flex items-center gap-2">
              <ImageBox src={src} alt="sample-preview" className="h-16 w-auto rounded-default border object-cover" />
              <span className="max-w-[240px] truncate text-xxs text-muted-foreground">{src}</span>
            </div>
          ))}
        </div>
      )}

      {/* 검색 결과 그리드 */}
      <div className="mt-2">
        {loading && !loadedOnce ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Preloader />
            <Lang text={{ ko: "이미지 목록을 불러오는 중...", en: "Loading images..." }} />
          </div>
        ) : images.length === 0 ? (
          <p className="text-xxs text-muted-foreground">
            <Lang
              text={{
                ko: loadedOnce
                  ? "조건에 맞는 이미지가 없습니다. 폴더 경로를 조정해보세요."
                  : "gen-studio 하위에 생성된 이미지가 없습니다.",
                en: loadedOnce
                  ? "No images match this filter. Try adjusting the folder path."
                  : "No generated images found under gen-studio.",
              }}
            />
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5">
            {images.map((src) => {
              const active = selected.includes(src);
              const fileName = src.split("/").pop() || src;
              return (
                <Button
                  key={src}
                  onClick={() => handleSelect(src)}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-default border bg-white text-left text-xxs transition-all hover:border-emerald-400",
                    active && "border-emerald-500 ring-1 ring-emerald-400",
                  )}
                >
                  <ImageBox src={src} alt={fileName} className="h-20 w-full object-cover group-hover:brightness-105" />
                  <div className="line-clamp-2 px-1 py-1 text-xxs text-gray-600">{fileName}</div>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
