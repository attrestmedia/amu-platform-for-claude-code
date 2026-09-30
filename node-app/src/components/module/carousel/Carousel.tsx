"use client";

import React, { useEffect, useState, useMemo, forwardRef, useImperativeHandle, useCallback } from "react";
import type { EmblaOptionsType, EmblaCarouselType } from "embla-carousel";
import type { EmblaPluginType } from "embla-carousel";
import useEmblaCarousel from "embla-carousel-react";
import Fade from "embla-carousel-fade";
import Autoplay from "embla-carousel-autoplay";
import AutoScroll from "embla-carousel-auto-scroll";
import AutoHeight from "embla-carousel-auto-height";
import ClassNames from "embla-carousel-class-names";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { cn, runAfterCurrentRender } from "utils/common";
import { Button } from "@amu-labs/ui";

// embla autoplay 플러그인 슬롯 타입 (react-rnd/re-resizable과 달리 embla는 plugins 맵 타입을 export하지 않음)
type EmblaAutoplaySlot = { play?: () => void; stop?: () => void } | undefined;
type EmblaPluginMap = { autoplay?: EmblaAutoplaySlot };

interface ICarouselProps {
  options?: EmblaOptionsType;
  mode?: "fade" | "instant";
  autoPlay?: boolean;
  autoPlayDelay?: number;
  autoScroll?: boolean;
  autoHeight?: boolean;
  classNames?: boolean;
  wheelGestures?: boolean;
  showDots?: boolean;
  showNav?: boolean;
  showIndicator?: boolean;
  children: React.ReactNode;
  onInit?: (emblaApi: EmblaCarouselType) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  slideClassName?: string;
  containerClassName?: string;
  wrapperClassName?: string;
  fullscreen?: boolean;
}

export interface ICarouselRef {
  scrollTo: (index: number) => void;
  jumpTo: (index: number) => void; // 애니메이션 없이 즉시 이동
  scrollPrev: () => void;
  scrollNext: () => void;
  getEmblaApi: () => EmblaCarouselType | undefined;
  pauseAutoplay: () => void;
  playAutoplay: () => void;
}

// 슬라이더 화살표 버튼 컴포넌트
function PrevButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      variant="blank"
      className={cn(
        "embla__button embla__button--prev",
        "absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-card/90 p-0 text-primary-text shadow-md backdrop-blur transition-all hover:bg-surface",
        disabled && "opacity-30 cursor-not-allowed",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label="Previous slide"
    >
      <svg className="icon-xs" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Button>
  );
}

function NextButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      variant="blank"
      className={cn(
        "embla__button embla__button--next",
        "absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-card/90 p-0 text-primary-text shadow-md backdrop-blur transition-all hover:bg-surface",
        disabled && "opacity-30 cursor-not-allowed",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label="Next slide"
    >
      <svg className="icon-xs" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Button>
  );
}

// 슬라이더 인디케이터 컴포넌트
function SelectedSnapDisplay({ selectedSnap, snapCount }: { selectedSnap: number; snapCount: number }) {
  return (
    <div className="embla__selected-snap-display absolute bottom-4 right-4 z-10 rounded-full border border-border/70 bg-card/90 px-3 py-1 text-sm text-primary-text shadow-sm backdrop-blur">
      {selectedSnap + 1} / {snapCount}
    </div>
  );
}

const Carousel = forwardRef<ICarouselRef, ICarouselProps>(function Carousel(
  {
    options,
    mode,
    autoPlay = false,
    autoPlayDelay = 3000,
    autoScroll = false,
    autoHeight = false,
    classNames = false,
    wheelGestures = false,
    showDots = false,
    showNav = false,
    showIndicator = false,
    children,
    onInit,
    onMouseEnter,
    onMouseLeave,
    slideClassName,
    containerClassName,
    wrapperClassName,
    fullscreen = false,
  },
  ref,
) {
  // 플러그인 배열을 useMemo로 메모이제이션
  const plugins = useMemo<EmblaPluginType[]>(() => {
    const arr: EmblaPluginType[] = [];
    if (mode === "fade") arr.push(Fade());
    if (autoPlay)
      arr.push(
        Autoplay({
          delay: autoPlayDelay,
          stopOnInteraction: true,
          stopOnMouseEnter: false,
          stopOnFocusIn: false,
        }),
      );
    if (autoScroll) arr.push(AutoScroll({ direction: "forward", speed: 10 }));
    if (autoHeight) arr.push(AutoHeight());
    if (classNames) arr.push(ClassNames());
    if (wheelGestures) arr.push(WheelGesturesPlugin() as unknown as EmblaPluginType);
    return arr;
  }, [mode, autoPlay, autoPlayDelay, autoScroll, autoHeight, classNames, wheelGestures]);

  const [emblaRef, emblaApi] = useEmblaCarousel(options, plugins);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevBtnDisabled, setPrevBtnDisabled] = useState(true);
  const [nextBtnDisabled, setNextBtnDisabled] = useState(true);
  const [snapCount, setSnapCount] = useState(0);
  const hasScrollableNav = showNav && (!prevBtnDisabled || !nextBtnDisabled);

  const isEmblaReady = useCallback(() => {
    if (!emblaApi) return false;
    try {
      // 루트/컨테이너 노드가 존재해야 안전
      const root = emblaApi.rootNode?.();
      const container = emblaApi.containerNode?.();
      const snaps = emblaApi.scrollSnapList?.();
      return !!root && !!container && Array.isArray(snaps) && snaps.length > 0;
    } catch {
      return false;
    }
  }, [emblaApi]);

  // 버튼 상태 업데이트
  const updateButtonState = useCallback((api: EmblaCarouselType) => {
    setPrevBtnDisabled(!api.canScrollPrev());
    setNextBtnDisabled(!api.canScrollNext());
    setCurrentIndex(api.selectedScrollSnap());
    setSnapCount(api.scrollSnapList().length);
  }, []);

  // 슬라이드 변경 이벤트 핸들러
  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      updateButtonState(emblaApi);
    };

    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    emblaApi.on("resize", onSelect);
    emblaApi.on("slidesChanged", onSelect);

    // 초기 상태 설정 — 이펙트 내 동기 setState 회피 위해 microtask로 지연
    runAfterCurrentRender(() => updateButtonState(emblaApi));

    // onInit 콜백 호출
    if (onInit) {
      onInit(emblaApi);
    }

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
      emblaApi.off("resize", onSelect);
      emblaApi.off("slidesChanged", onSelect);
    };
  }, [emblaApi, onInit, updateButtonState]);

  // 네비게이션 버튼 핸들러
  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  // autoplay 제어 함수들 추가
  const pauseAutoplay = useCallback(() => {
    if (!emblaApi || !isEmblaReady()) return;
    const plugins = emblaApi.plugins?.() as EmblaPluginMap | undefined;
    const autoplay = plugins?.autoplay;
    if (!autoplay || typeof autoplay.stop !== "function") return;

    try {
      autoplay.stop();
    } catch {
      // 안전하게 무시
    }
  }, [emblaApi, isEmblaReady]);

  const playAutoplay = useCallback(() => {
    if (!emblaApi || !isEmblaReady()) return;
    const plugins = emblaApi.plugins?.() as EmblaPluginMap | undefined;
    const autoplay = plugins?.autoplay;
    if (!autoplay || typeof autoplay.play !== "function") return;

    try {
      autoplay.play();
    } catch {
      // 안전하게 무시
    }
  }, [emblaApi, isEmblaReady]);

  useEffect(() => {
    return () => {
      try {
        const plugins = emblaApi?.plugins?.() as EmblaPluginMap | undefined;
        const autoplay = plugins?.autoplay;
        if (autoplay?.stop) autoplay.stop();
      } catch {
        // no-op
      }
    };
  }, [emblaApi]);

  // Ref를 통해 부모에게 메서드 노출
  useImperativeHandle(ref, () => ({
    scrollTo: (index: number) => {
      if (emblaApi) emblaApi.scrollTo(index);
    },
    jumpTo: (index: number) => {
      if (emblaApi) emblaApi.scrollTo(index, true);
    },
    scrollPrev: () => {
      if (emblaApi) emblaApi.scrollPrev();
    },
    scrollNext: () => {
      if (emblaApi) emblaApi.scrollNext();
    },
    getEmblaApi: () => emblaApi,
    pauseAutoplay,
    playAutoplay,
  }));

  // 자식 요소 렌더링 준비
  const slides = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return (
        <div
          className={cn(
            "embla__slide flex-none basis-full",
            fullscreen ? "h-full" : "",
            mode === "fade" && "opacity-100",
            slideClassName,
          )}
        >
          {child}
        </div>
      );
    }
    return null;
  });

  return (
    <div
      className={cn(
        "embla relative min-w-0",
        fullscreen ? "w-full h-full" : "w-full h-full max-h-[80vh]",
        wrapperClassName,
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={cn("embla__viewport overflow-hidden w-full min-w-0", fullscreen ? "h-full" : "h-full")}
        ref={emblaRef}
      >
        <div
          className={cn(
            "embla__container flex",
            mode === "fade" ? "embla__container--fade" : "",
            fullscreen ? "h-full" : "h-full",
            containerClassName,
          )}
          style={mode === "fade" ? { opacity: 1 } : undefined}
        >
          {slides}
        </div>
      </div>

      {/* Navigation Buttons */}
      {hasScrollableNav && (
        <>
          <PrevButton onClick={scrollPrev} disabled={prevBtnDisabled} />
          <NextButton onClick={scrollNext} disabled={nextBtnDisabled} />
        </>
      )}

      {/* Pagination Dots */}
      {showDots && snapCount > 0 && (
        <div className="embla__dots absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-10">
          {Array.from({ length: snapCount }).map((_, index) => (
            <Button
              variant="blank"
              key={index}
              onClick={() => emblaApi && emblaApi.scrollTo(index)}
              className={cn(
                "h-1 w-1 rounded-full border-0 p-0 transition-all duration-300",
                currentIndex === index ? "w-8 bg-primary" : "bg-muted opacity-70",
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Slide Counter */}
      {showIndicator && snapCount > 1 && <SelectedSnapDisplay selectedSnap={currentIndex} snapCount={snapCount} />}
    </div>
  );
});

Carousel.displayName = "Carousel";
export default Carousel;
