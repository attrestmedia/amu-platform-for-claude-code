"use client";

import React, { useRef, useCallback, useState, useMemo, useEffect } from "react";
import type { EmblaCarouselType } from "embla-carousel";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import Image from "next/image";
import type { ICommerceProduct } from "types/commerce";
import { Lang, lang } from "../../i18n";
import { Carousel } from "../../carousel";
import type { ICarouselRef } from "../../carousel";
import { useUniverseData } from "hooks/game/core";
import { useKeyboardNavigation } from "hooks/common";
import { cn, sanitizeProductSummary, truncateToString, stripHtml } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";
import { formatKRW } from "utils/commerce";
import { useUiControlStore } from "store/game";
import { useProductStore } from "store/commerce";
import { GAME_CONSTANTS as GC } from "consts/game";
import { COMMERCE_PLACEHOLDER_IMAGE } from "consts/app";
import { Link, X, MessageSquareHeart, Check } from "lucide-react";

interface ProductActionDialogProps {
  open: boolean;
  product: ICommerceProduct | null;
  locate?: "stage" | "chat";
  primaryLabel?: string;
  secondaryLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onAsk?: (product: ICommerceProduct) => void;
}

// 상품 상호작용 다이얼로그
const ProductActionDialog = ({
  open,
  product,
  locate = "stage",
  primaryLabel = lang({ ko: "상품 보기", en: "Open" }),
  secondaryLabel = lang({ ko: "닫기", en: "Close" }),
  onConfirm,
  onCancel,
  onAsk,
}: ProductActionDialogProps) => {
  // 상세 모드용 스토어 상태
  const { productDetailOpen, selectedProduct, productDetailSolo, closeProduct, startProductCooldown } =
    useUiControlStore();
  const isDetailOpen = !!productDetailOpen;
  const dialogOpen = open || isDetailOpen;
  const p: ICommerceProduct | null = (isDetailOpen ? selectedProduct : product) || null;

  // 버튼 참조
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // 슬라이더 참조
  const carouselRef = useRef<ICarouselRef>(null);
  const initialIndexRef = useRef<number | null>(null); // 초기 인덱스 저장
  const { universeId, isCommerceUniverse } = useUniverseData();
  const allProducts = useProductStore((s) => s.byUniverse?.[universeId]?.products);
  const [currentIndex, setCurrentIndex] = useState(0);

  // 상세 모드에서 사용할 상품 배열: 커머스 유니버스면 전 상품, 아니면 단일
  const detailProducts = useMemo<ICommerceProduct[]>(() => {
    if (!isDetailOpen || !p) return [];
    if (productDetailSolo) return [p]; // 단일 상품 모드면 현재 상품만
    if (isCommerceUniverse && (allProducts?.length ?? 0) > 0) return allProducts!; // 그 외엔 전체
    return [p];
  }, [isDetailOpen, p, isCommerceUniverse, allProducts, productDetailSolo]);

  // 현재 슬라이드의 상품
  const cp = detailProducts[currentIndex] || p;

  // 요약 html 메모이제이션 — 전체 cp를 의존성으로 사용해 React Compiler 추론 일치
  const safeSummaryHtml = useMemo(() => (cp?.summary ? sanitizeProductSummary(cp.summary) : ""), [cp]);

  // 초기 진입 시 현재 선택 상품 위치로 스크롤 — state 갱신은 adjusting state during render, ref/카루셀 조작은 effect로 분리
  const [trackedDetailKey, setTrackedDetailKey] = useState<{ open: boolean; id?: string; len: number }>({
    open: isDetailOpen,
    id: p?.id,
    len: detailProducts.length,
  });
  const [pendingScrollTarget, setPendingScrollTarget] = useState<number | null>(null);
  if (
    trackedDetailKey.open !== isDetailOpen ||
    trackedDetailKey.id !== p?.id ||
    trackedDetailKey.len !== detailProducts.length
  ) {
    setTrackedDetailKey({ open: isDetailOpen, id: p?.id, len: detailProducts.length });
    if (isDetailOpen && p && detailProducts.length > 0) {
      const idx = Math.max(
        0,
        detailProducts.findIndex((it) => it.id === p.id),
      );
      const target = idx >= 0 ? idx : 0;
      setCurrentIndex(target);
      setPendingScrollTarget(target);
    }
  }

  // refs/imperative API는 effect에서 동기화 (render 중 ref 변경/접근 회피) — null 가드만 두어 cascade 회피
  useEffect(() => {
    if (pendingScrollTarget == null) return;
    initialIndexRef.current = pendingScrollTarget;
    carouselRef.current?.jumpTo(pendingScrollTarget);
  }, [pendingScrollTarget]);

  // Embla onInit에서 select 이벤트로 인덱스 동기화
  const handleSliderInit = useCallback((api: EmblaCarouselType) => {
    const onSelect = () => setCurrentIndex(api.selectedScrollSnap());
    api.on("select", onSelect);

    if (initialIndexRef.current != null) {
      api.scrollTo(initialIndexRef.current, true); // 즉시 점프
    }
  }, []);

  // 키보드 네비게이션
  const { focusedIndex } = useKeyboardNavigation({
    isOpen: dialogOpen && !isDetailOpen, // 상세 모드에선 기본 포커스만
    refs: [confirmButtonRef, cancelButtonRef],
    direction: "horizontal",
    onEnterActions: [onConfirm, onCancel],
    autoFocusDelay: 180,
    useCapture: true,
    stopPropagation: true,
  });

  // 다이얼로그 닫기
  const handleCloseAll = useCallback(() => {
    if (isDetailOpen) {
      closeProduct();
      startProductCooldown(GC.INTERACTION.COOLDOWN_MS);
    }
    onCancel();
  }, [isDetailOpen, closeProduct, startProductCooldown, onCancel]);

  // 키보드 컨트롤
  useEffect(() => {
    if (!isDetailOpen || productDetailSolo) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        carouselRef.current?.scrollPrev?.();
      } else if (e.key === "ArrowRight") {
        carouselRef.current?.scrollNext?.();
      }
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [isDetailOpen, productDetailSolo]);

  if (!p) return null;

  return (
    <Dialog
      open={dialogOpen}
      modal={false}
      onOpenChange={(state) => {
        if (!state) handleCloseAll();
      }}
    >
      <DialogContent
        centered={!isDetailOpen}
        className={cn(
          !isDetailOpen
            ? "top-auto bottom-4 left-1/2 -translate-x-1/2 translate-y-0 w-[92vw] bg-gradient-to-b from-black/80 to-black/95 min-w-[20rem] max-w-[25rem]"
            : "w-full h-dvh",
        )}
        innerWrapClassName={cn(
          "max-w-none gap-2",
          isDetailOpen ? "flex items-center justify-center h-full" : "overflow-hidden",
        )}
        hideClose={true}
        hideOverlay={true}
        disableOutsideClick={true}
      >
        {/** 헤더(접근성 유지) */}
        <DialogHeader className="text-left sr-only">
          <DialogTitle>
            <Lang
              text={{
                ko: isDetailOpen ? "상품 상세" : "상품 확인",
                en: isDetailOpen ? "Product Detail" : "Product Confirmation",
              }}
            />
          </DialogTitle>
          {!isDetailOpen && (
            <DialogDescription>
              <Lang text={{ ko: "상품 정보를 확인하시겠습니까?", en: "Would you like to view product information?" }} />
            </DialogDescription>
          )}
        </DialogHeader>

        <Button
          variant="ghost"
          className="absolute top-2 right-2 p-2 w-auto h-auto z-[60] touch-manipulation"
          onClick={handleCloseAll}
          aria-label="닫기"
        >
          <X />
        </Button>

        {/* 1) 미리보기 모드 */}
        {!isDetailOpen && (
          <>
            <div className="product-info-container">
              <div className="product-info flex gap-6">
                <div className="product-info-header">
                  <div className="product-thumbnail relative w-26 h-26 bg-gray-200 overflow-hidden border border-muted rounded-xl">
                    <Image
                      src={p.image || COMMERCE_PLACEHOLDER_IMAGE}
                      alt={p.title || "상품"}
                      fill
                      className={cn(p.imageFit === "cover" ? "object-cover" : "object-contain", "origin-center")}
                      sizes="(max-width: 560px) 100vw, 560px"
                      unoptimized
                    />
                  </div>
                </div>
                <div className="product-info-body flex-1">
                  {p.category && (
                    <span className="inline-block text-xs px-2 border border-gray-300 rounded-sm mb-1 relative -top-1">
                      {p.category}
                    </span>
                  )}
                  <h3 className="flex text-lg overflow-y-auto font-semibold leading-[1.2]">{p.title}</h3>
                  <div className="flex items-center justify-between gap-2">
                    <span className="block text-sm text-gray-600">{truncateToString(stripHtml(p.summary), 45)}</span>
                  </div>
                  {p.price != null && p.price !== 0 && (
                    <div className="block text-base font-bold text-primary">{formatKRW(p.price)}</div>
                  )}
                  {p.priceMin != null && p.priceMax != null && (
                    <div className="block text-base font-bold text-primary">
                      {formatKRW(p.priceMin)} ~ {formatKRW(p.priceMax)}
                    </div>
                  )}
                  {/* <span className="block text-base text-gray-600 mt-2">이 상품에 대해 더 알아보실래요?</span> */}
                </div>
              </div>
            </div>

            {/* 확인/취소 버튼 */}
            <div className="flex justify-end gap-2 mt-4 -mx-6 -mb-6 p-6 bg-[#f5f5f5]">
              <Button
                ref={confirmButtonRef}
                onClick={onConfirm}
                className={cn(
                  "transition-all",
                  focusedIndex === 0 && "ring-2 ring-primary animate-glow glow-purple scale-105",
                )}
                autoFocus={true}
              >
                {primaryLabel}
              </Button>

              <Button
                ref={cancelButtonRef}
                variant="secondary"
                onClick={onCancel}
                className={cn(
                  "transition-all",
                  focusedIndex === 1 && "ring-2 ring-secondary animate-glow glow-cyan scale-105",
                )}
              >
                {secondaryLabel}
              </Button>
            </div>
          </>
        )}

        {/*2) 상세 모드 */}
        {isDetailOpen && (
          <div className="product-info-detail flex flex-col items-center justify-center w-full min-w-0">
            {/* Carousel 영역 */}
            <div className="w-full min-w-0">
              <Carousel
                ref={carouselRef}
                mode="instant"
                showNav={!productDetailSolo && detailProducts.length > 1}
                // showIndicator
                options={{ loop: false, containScroll: "trimSnaps", dragFree: false }}
                onInit={handleSliderInit}
                fullscreen
                wrapperClassName="bg-transparent min-w-0"
                containerClassName="items-center"
                slideClassName="p-4"
              >
                {detailProducts.map((prod) => {
                  const priceNum = prod?.price != null ? Number(prod.price) : NaN;
                  const priceMinNum = prod?.priceMin != null ? Number(prod.priceMin) : NaN;
                  const priceMaxNum = prod?.priceMax != null ? Number(prod.priceMax) : NaN;

                  const showPrice = Number.isFinite(priceNum) && priceNum > 0;
                  const showRange =
                    Number.isFinite(priceMinNum) &&
                    Number.isFinite(priceMaxNum) &&
                    (priceMinNum > 0 || priceMaxNum > 0);

                  return (
                    <div key={prod.id} className="w-full h-full flex flex-col items-center justify-center">
                      {/* 이미지 */}
                      <ImageBox
                        src={prod.image || COMMERCE_PLACEHOLDER_IMAGE}
                        alt={prod.title ? `${prod.title} 이미지` : "상품 이미지"}
                        objectFit={prod.imageFit === "cover" ? "object-cover" : "object-contain"}
                        maxWidth={320}
                        maxHeight={320}
                      />

                      {/* 텍스트 정보 */}
                      <div className="flex-1 space-y-2 text-center mt-4 px-4 py-2 max-w-[640px]">
                        {prod.title && <h3 className="text-base font-bold leading-tight">{prod.title}</h3>}
                        {cp?.summary && (
                          <div
                            className={cn(
                              "text-sm text-gray-700 leading-relaxed",
                              "[&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-2",
                              "[&_h4]:text-base [&_h4]:font-bold [&_h4]:mb-2",
                              "[&_h5]:text-sm [&_h5]:font-bold [&_h5]:mb-2",
                              "[&_ul]:list-disc [&_ul]:pl-5",
                              "[&_ol]:list-decimal [&_ol]:pl-5",
                              "[&_a]:underline [&_a]:underline-offset-2",
                            )}
                            dangerouslySetInnerHTML={{ __html: safeSummaryHtml }}
                          />
                        )}
                        {showPrice && <div className="text-xl font-bold text-primary my-2">{formatKRW(priceNum)}</div>}
                        {!showPrice && showRange && (
                          <div className="text-xl font-bold text-primary my-2">
                            {formatKRW(priceMinNum)} ~ {formatKRW(priceMaxNum)}
                          </div>
                        )}
                        {prod?.priceText && <div className="text-xl font-bold text-primary my-2">{prod.priceText}</div>}
                      </div>

                      {/* CTA 영역 - 현재 슬라이드 상품(cp)에 바인딩 */}
                      <div className="product-info-detail-cta">
                        {locate === "chat" && <div className="selling-msg">이 상품에 대해 설명해드릴까요?</div>}

                        <div className="product-info-detail-buttons flex gap-6 items-center justify-center">
                          {locate === "stage" ? (
                            <a
                              href={cp?.url || String(toUnknownRecord(cp).link || "") || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex gap-2 items-center justify-center rounded-full text-gray-800 text-base font-semibold hover:text-primary"
                            >
                              <Link width={16} height={16} />
                              <span>구매하기</span>
                            </a>
                          ) : (
                            <Button
                              variant="link"
                              className="inline-flex gap-2 items-center justify-center rounded-full text-gray-800 text-base font-semibold p-0 hover:text-primary focus:outline-none"
                              onClick={() => {
                                try {
                                  window.dispatchEvent(new CustomEvent("amu:product-ask", { detail: { product: cp } }));
                                } catch {}
                                handleCloseAll();
                              }}
                            >
                              <Check width={16} height={16} />
                              <span>예</span>
                            </Button>
                          )}
                          <Button
                            variant="link"
                            onClick={() => {
                              if (locate === "stage") {
                                onAsk?.(cp);
                              } else {
                                try {
                                  window.dispatchEvent(
                                    new CustomEvent("amu:product-decline", { detail: { product: cp } }),
                                  );
                                } catch {}
                              }
                              handleCloseAll();
                            }}
                            className="inline-flex gap-2 items-center justify-center rounded-full text-gray-800 text-base font-semibold p-0 hover:text-secondary focus:outline-none"
                            aria-label="물어보기"
                          >
                            {locate === "stage" ? (
                              <MessageSquareHeart width={16} height={16} />
                            ) : (
                              <X width={16} height={16} />
                            )}
                            <span>{locate === "stage" ? "물어보기" : "아니오"}</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Carousel>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProductActionDialog;
