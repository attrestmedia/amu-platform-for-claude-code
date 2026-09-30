"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import fetchClient from "libs/api/fetchClient";
import { Input } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";

/**
 * @docHint
 * @purpose 네이버 카테고리 검색 선택기 — 카테고리 번호를 판매자가 외우지 않아도 되도록
 *          이름(한글) 검색으로 leaf 카테고리를 찾아 ID를 채운다. 서버는 전체 카테고리를
 *          redis에 캐시하고 이름 매칭 결과만 반환한다.
 * @domain commerce.naver
 * @scope client
 */

type NaverCategoryItem = {
  id: string;
  name: string;
  wholeCategoryName: string;
};

type NaverCategorySearchInputProps = {
  universeId: string;
  categoryId: string;
  onSelect: (categoryId: string) => void;
};

export function NaverCategorySearchInput({ universeId, categoryId, onSelect }: NaverCategorySearchInputProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const suggestionsQuery = useQuery<NaverCategoryItem[]>({
    queryKey: ["naver-category-search", universeId, debouncedQuery],
    queryFn: async () => {
      const response = await fetchClient.get<{ data?: { categories?: NaverCategoryItem[] } }>(
        `/universe/${universeId}/commerce/naver-categories?q=${encodeURIComponent(debouncedQuery)}`,
        { cache: "no-store" },
      );
      return response?.data?.data?.categories || [];
    },
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = suggestionsQuery.data || [];

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={query}
          placeholder={lang({
            ko: "카테고리 검색 (예: 여성의류)",
            en: "Search category (e.g. women's clothing)",
          })}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            // 항목 선택(mouseDown)이 blur보다 먼저 처리되도록 지연 닫기
            setTimeout(() => setOpen(false), 150);
          }}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
      </div>

      {open && debouncedQuery.length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
          {suggestionsQuery.isLoading ? (
            <p className="px-3 py-3 text-xs text-secondary-text">
              <Lang text={{ ko: "검색 중...", en: "Searching..." }} />
            </p>
          ) : suggestions.length === 0 ? (
            <p className="px-3 py-3 text-xs text-secondary-text">
              <Lang text={{ ko: "검색 결과가 없습니다.", en: "No categories found." }} />
            </p>
          ) : (
            suggestions.map((item) => (
              <button
                key={item.id}
                type="button"
                className="block w-full px-3 py-2.5 text-left text-xs leading-4 text-primary-text transition hover:bg-primary/5"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(item.id);
                  setSelectedName(item.wholeCategoryName || item.name);
                  setQuery(item.wholeCategoryName || item.name);
                  setOpen(false);
                }}
              >
                <span className="block truncate">{item.wholeCategoryName || item.name}</span>
                <span className="mt-0.5 block text-xxs text-secondary-text">{item.id}</span>
              </button>
            ))
          )}
        </div>
      ) : null}

      <p className="mt-1 text-xxs text-secondary-text">
        {categoryId ? (
          <Lang text={{ ko: "선택된 카테고리 번호", en: "Selected category no." }} />
        ) : (
          <Lang text={{ ko: "검색 후 항목을 선택하면 번호가 자동으로 입력됩니다.", en: "Search and pick one to fill the category no." }} />
        )}
        {categoryId ? `: ${categoryId}` : ""}
        {selectedName ? ` · ${selectedName}` : ""}
      </p>
    </div>
  );
}
