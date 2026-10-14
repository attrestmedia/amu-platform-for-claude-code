"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Input, Label } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { useDebounceValue } from "hooks/common";
import { listStudioImageMetasPage } from "libs/api/lab/imagePrompts";
import { StudioImageGallery } from "components/template/gen-studio/modules/StudioImageGallery";
import { isAnchorCandidate } from "components/module/game/forge/steps/character/characterSourceModel";
import type { ImagePromptMetaType } from "types/app";

const PAGE_SIZE = 12;

/**
 * @docHint
 * @purpose 사용자가 캐릭터 기준 이미지로 쓸 Gen Studio 자산을 검색·선택
 * @process user-scope 페이지 조회  서버 anchor 필터 적용  선택 자산 반환
 * @domain game.user-character
 * @scope user-client
 */
export function CharacterImagePicker({
  selectedAssetId,
  onSelect,
}: {
  selectedAssetId?: string;
  onSelect: (image: ImagePromptMetaType) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearchTerm = useDebounceValue(searchTerm, 300);
  const imagesQuery = useQuery({
    queryKey: ["character-studio-image-picker", "character-anchor", debouncedSearchTerm, page],
    queryFn: () => listStudioImageMetasPage({
      scope: "user",
      libraryKind: "generated",
      purpose: "character-anchor",
      q: debouncedSearchTerm,
      searchField: "prompt",
      limit: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
  });
  const items = (imagesQuery.data?.items || []).filter(isAnchorCandidate);
  const emptyText = searchTerm.trim()
    ? { ko: "검색 결과가 없어요.", en: "No matching images found." }
    : { ko: "아직 캐릭터로 쓸 이미지가 없어요. 새 캐릭터 만들기에서 시작해 보세요.", en: "You do not have a character image yet. Start by creating a new character." };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value.slice(0, 120));
    setPage(1);
  };

  return (
    <section className="space-y-3" aria-labelledby="character-image-picker-title">
      <div className="space-y-2">
        <Label id="character-image-picker-title" htmlFor="character-image-picker-search">
          <Lang text={{ ko: "Gen Studio 이미지", en: "Gen Studio images" }} />
        </Label>
        <Input
          id="character-image-picker-search"
          type="search"
          className="min-h-11"
          aria-label={lang({ ko: "이미지 프롬프트 검색", en: "Search image prompts" })}
          placeholder={lang({ ko: "이미지 프롬프트 검색", en: "Search image prompts" })}
          value={searchTerm}
          maxLength={120}
          onChange={(event) => handleSearchChange(event.target.value)}
        />
      </div>

      {imagesQuery.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <p>
            <Lang text={{ ko: "이미지를 불러오지 못했습니다.", en: "Could not load images." }} />
          </p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            loading={imagesQuery.isFetching}
            disabled={imagesQuery.isFetching}
            onClick={() => void imagesQuery.refetch()}
          >
            <Lang text={{ ko: "다시 시도", en: "Try again" }} />
          </Button>
        </div>
      ) : null}

      {imagesQuery.isError && !imagesQuery.data ? null : (
        <StudioImageGallery
          items={items}
          loading={imagesQuery.isLoading}
          emptyText={emptyText}
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={imagesQuery.data?.pageInfo?.total ?? imagesQuery.data?.items.length ?? 0}
          onPageChange={setPage}
          onSelect={(image) => onSelect(image)}
          selectedAssetId={selectedAssetId ?? ""}
        />
      )}
    </section>
  );
}
