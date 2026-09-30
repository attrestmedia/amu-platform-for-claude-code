"use client";

import { useRef, useCallback, useEffect, useMemo } from "react";
import type { ICommerceProduct } from "types/commerce";
import { cn } from "utils/common";
import { logger } from "utils/log";
import { formatKRW } from "utils/commerce";
import Image from "next/image";
import { Button } from "@amu-labs/ui";
import { X } from "lucide-react";
import { COMMERCE_PLACEHOLDER_IMAGE } from "consts/app";

type ProductListProps = {
  products: ICommerceProduct[];
  title?: string;
  maxItems?: number;
  layout?: "carousel" | "grid";
  onProductClick?: (product: ICommerceProduct) => void;
  onProductClose?: () => void;
};

export function ProductList({
  products,
  title,
  maxItems = 10,
  layout = "carousel",
  onProductClick,
  onProductClose,
}: ProductListProps) {
  // items: products → null 제거 → 최대 maxItems개로 제한 (안정적 참조)
  const items = useMemo(
    () => products.filter(Boolean).slice(0, maxItems),
    [products, maxItems],
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  // 마우스 드래그 시작
  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = viewportRef.current;
      if (!el || layout === "grid") return;
      isDraggingRef.current = true;
      dragMovedRef.current = false;
      startXRef.current = e.clientX;
      scrollLeftRef.current = el.scrollLeft;
      el.classList.add("cursor-grabbing", "select-none"); // 텍스트 선택 방지
    },
    [layout],
  );

  // 드래그 중
  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || layout === "grid") return;
      e.preventDefault(); // 드래그 중 텍스트 선택/이미지 드래그 방지
      const el = viewportRef.current;
      if (!el) return;
      const dx = e.clientX - startXRef.current;
      if (Math.abs(dx) > 3) dragMovedRef.current = true; // 소폭 이동 이상이면 클릭 취소
      el.scrollLeft = scrollLeftRef.current - dx; // 자유 스크롤
    },
    [layout],
  );

  // 드래그 종료
  const endDrag = useCallback(() => {
    const el = viewportRef.current;
    isDraggingRef.current = false;
    el?.classList.remove("cursor-grabbing", "select-none");
  }, []);

  // 개별 카드 클릭
  const handleCardClick = useCallback(
    (p: ICommerceProduct) => {
      // 드래그로 움직인 경우엔 클릭 취소
      if (isDraggingRef.current || dragMovedRef.current) return;
      onProductClick?.(p);
    },
    [onProductClick],
  );

  // 디버깅
  useEffect(() => {
    logger.log("[ProductList] data:", {
      products,
      items,
    });
  }, [products, items]);

  if (!items.length) return null;

  return (
    <section className="product-card-list-box" aria-label={title}>
      {title && (
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white shadow-[0_0.15rem_0.25rem_rgba(0,0,0,0.3)]">
          <div className="text-base font-medium mb-2">{title}</div>
          {onProductClose && (
            <Button
              variant="blank"
              aria-label="닫기"
              onClick={() => onProductClose()}
              className="absolute top-1/2 right-2 -translate-y-1/2 p-2 rounded-full"
            >
              <X width={18} height={18} />
            </Button>
          )}
        </div>
      )}

      <div
        ref={viewportRef}
        className="overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        role="group"
        aria-label={title ?? "추천 상품"}
      >
        <div
          className={cn(
            layout === "carousel" ? "flex gap-2 py-1 items-stretch" : "grid grid-cols-2 gap-3 sm:grid-cols-3",
          )}
        >
          {items.map((p) => {
            const price = typeof p.price === "number" ? formatKRW(p.price) : "";
            const imageUrl = p.image || COMMERCE_PLACEHOLDER_IMAGE;

            return (
              <div
                key={p.id}
                className={cn(
                  layout === "carousel"
                    ? "w-42 flex-none shrink-0 self-stretch rounded-2xl bg-white p-3"
                    : "rounded-2xl bg-white p-3 border border-gray-100",
                )}
                role="button"
                tabIndex={0}
                aria-label={p.title || "상품"}
                onClick={() => handleCardClick(p)}
              >
                <div className="w-full h-32 rounded-lg bg-white border border-gray-100 overflow-hidden shrink-0 relative">
                  <Image
                    src={imageUrl}
                    alt={p.title || "상품 이미지"}
                    fill
                    className={p.imageFit === "cover" ? "object-cover" : "object-contain"}
                    sizes="160px"
                    unoptimized
                  />
                </div>
                <div className="flex flex-col min-w-0 w-full text-center mt-2">
                  <div className="product-info-header">
                    {p.category && <span className="text-xs text-gray-500 mb-1">{p.category}</span>}
                    <div className="text-sm font-semibold leading-[1.25]" title={p.title}>
                      {p.title}
                    </div>
                  </div>
                  <div className="product-info-footer">
                    {price && <div className="text-sm text-primary font-semibold mt-2">{price}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default ProductList;
