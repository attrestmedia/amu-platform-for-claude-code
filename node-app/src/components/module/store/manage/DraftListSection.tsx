"use client";

import Image from "next/image";
import { Search, Sparkles } from "lucide-react";
import {
  Button,
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
} from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { ICommerceProductDraft } from "types/commerce";
import {
  DRAFT_STATUS_LABEL,
  PRODUCT_LIST_FILTER_LABEL,
  formatDate,
  getDraftPriceDisplay,
  getDraftRegisteredAt,
  getDraftStockDisplay,
  getDraftThumbnailUrl,
  getProductStatusBadge,
  toSafeString,
  type ProductListFilter,
} from "./smartstoreDraftUtils";

export type DraftListSortKey = "registered_desc" | "updated_desc" | "title_asc" | "price_desc";

type DraftListSectionProps = {
  drafts: ICommerceProductDraft[];
  filteredDrafts: ICommerceProductDraft[];
  listFilterCounts: Record<ProductListFilter, number>;
  searchKeyword: string;
  listFilter: ProductListFilter;
  sortKey: DraftListSortKey;
  onSearchKeywordChange: (keyword: string) => void;
  onListFilterChange: (filter: ProductListFilter) => void;
  onSortKeyChange: (sortKey: DraftListSortKey) => void;
  onSelectDraft: (draftId: string) => void;
  onPromoteDraft?: (draftId: string) => void;
};

export function DraftListSection({
  drafts,
  filteredDrafts,
  listFilterCounts,
  searchKeyword,
  listFilter,
  sortKey,
  onSearchKeywordChange,
  onListFilterChange,
  onSortKeyChange,
  onSelectDraft,
  onPromoteDraft,
}: DraftListSectionProps) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-text" />
            <Input
              className="pl-9"
              value={searchKeyword}
              onChange={(event) => onSearchKeywordChange(event.target.value)}
              placeholder={lang({
                ko: "상품명/관리코드/상품번호 검색",
                en: "Search title, code, product no",
              })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Select value={listFilter} onValueChange={(value) => onListFilterChange(value as ProductListFilter)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={lang({ ko: "상품 보기", en: "Product view" })} />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRODUCT_LIST_FILTER_LABEL) as ProductListFilter[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {lang(PRODUCT_LIST_FILTER_LABEL[key])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(value) => onSortKeyChange(value as DraftListSortKey)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={lang({ ko: "정렬", en: "Sort" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="registered_desc">{lang({ ko: "최근 등록순", en: "Recently registered" })}</SelectItem>
                <SelectItem value="updated_desc">{lang({ ko: "최근 수정순", en: "Recently updated" })}</SelectItem>
                <SelectItem value="title_asc">{lang({ ko: "이름순", en: "Title A→Z" })}</SelectItem>
                <SelectItem value="price_desc">{lang({ ko: "가격 높은순", en: "Price high→low" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xxs uppercase tracking-[0.18em] text-secondary-text">
        <span className="flex items-center gap-1">
          <Lang text={{ ko: "표시", en: "Showing" }} />
          <span>
            {filteredDrafts.length}/{drafts.length}
          </span>
        </span>
        <div className="min-w-0 rounded-full">
          <ScrollArea dragOnScrollX={true} dragIgnoreInteractive={true}>
            <div className="flex gap-1 w-full">
              {(Object.keys(PRODUCT_LIST_FILTER_LABEL) as ProductListFilter[]).map((key) =>
                listFilterCounts[key] ? (
                  <Badge
                    key={key}
                    variant={listFilter === key ? "primary" : "outline"}
                    size="sm"
                    onClick={() => onListFilterChange(key)}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {lang(PRODUCT_LIST_FILTER_LABEL[key])} {listFilterCounts[key]}
                  </Badge>
                ) : null,
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {filteredDrafts.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredDrafts.map((draft) => {
            const thumb = getDraftThumbnailUrl(draft);
            const productStatus = getProductStatusBadge(draft);
            const price = getDraftPriceDisplay(draft);
            const stock = getDraftStockDisplay(draft);
            const cardTitle = toSafeString(draft.display?.title || draft.smartstore?.productName || draft.draftId);
            const canPromote = draft.status === "published" && Number(draft.smartstore?.channelProductNo) > 0;
            return (
              <div key={draft.draftId} className="group flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-background/70 p-2 overflow-hidden text-left transition hover:border-primary">
                <Button
                  variant="blank"
                  noWrap={false}
                  onClick={() => onSelectDraft(String(draft.draftId))}
                  className="flex min-w-0 flex-col gap-2 overflow-hidden p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                <div className="relative aspect-square overflow-hidden bg-surface -m-2">
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt={cardTitle}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      unoptimized
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xxs text-secondary-text">
                      <Lang text={{ ko: "이미지 없음", en: "No image" }} />
                    </div>
                  )}
                  <span className="absolute left-1.5 top-0.5">
                    <Badge variant={productStatus.variant} size="xs">
                      {lang(productStatus.label)}
                    </Badge>
                  </span>
                </div>
                <div className="space-y-2 p-2 mt-2">
                  <p className="line-clamp-2 min-h-[2.4em] text-xs font-semibold text-primary-text">{cardTitle}</p>
                  <div className="flex flex-col text-xxs text-secondary-text">
                    <span className="text-sm font-semibold text-primary-text">{price || "—"}</span>
                    <span>{stock}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xxs text-secondary-text">
                    <span>{formatDate(getDraftRegisteredAt(draft))}</span>
                    {draft.status !== "published" ? (
                      <span>{lang(DRAFT_STATUS_LABEL[draft.status || "draft"])}</span>
                    ) : null}
                  </div>
                </div>
                </Button>
                {onPromoteDraft ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="min-h-11 w-full justify-center gap-1.5 text-xs"
                    disabled={!canPromote}
                    title={canPromote ? undefined : lang({ ko: "스마트스토어에 등록된 상품만 홍보할 수 있습니다.", en: "Only published Smart Store products can be promoted." })}
                    onClick={() => onPromoteDraft(String(draft.draftId))}
                  >
                    <Sparkles className="icon-xs" aria-hidden="true" />
                    <Lang text={{ ko: "이 상품 홍보하기", en: "Promote this product" }} />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-[1.1rem] border border-dashed border-border px-4 py-12 text-center text-sm text-secondary-text">
          {drafts.length === 0 ? (
            <Lang
              text={{
                ko: "아직 만든 상품이 없습니다. ‘스마트스토어 상품 가져오기’를 실행하거나 ‘새 상품 만들기’를 눌러보세요.",
                en: "No products yet. Import from Smart Store, or create a new product.",
              }}
            />
          ) : (
            <Lang
              text={{
                ko: "조건에 맞는 상품이 없습니다. 검색어 또는 상태 필터를 조정해보세요.",
                en: "No products match your filters. Try a different keyword or status.",
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}
