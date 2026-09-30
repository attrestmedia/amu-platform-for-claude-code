"use client";

import React from "react";
import { Carousel } from "components/module/carousel";
import type { ICarouselRef } from "components/module/carousel";
import type { IMotionEditorSlideContent, MotionEditorObjectFitType } from "types/app";
import { Rnd } from "react-rnd";
import type { ResizeDirection } from "re-resizable";
import type { EmblaCarouselType } from "embla-carousel";
import Image from "next/image";

interface IMotionEditViewerProps {
  slides: IMotionEditorSlideContent[];
  positions: {
    [slideId: string]: {
      [contentIndex: number]: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
  };
  scale: number;
  fitMode: MotionEditorObjectFitType; // 기존 글로벌 fitMode
  onDragStop: (
    slideId: string,
    contentIndex: number,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => void;
  onResizeStop: (
    slideId: string,
    contentIndex: number,
    direction: ResizeDirection,
    ref: HTMLElement,
    delta: { width: number; height: number },
    position: { x: number; y: number }
  ) => void;
  onTextSelect: (slideId: string, contentIndex: number) => void;
  selectedText: { slideId: string; contentIndex: number } | null;
  onInit?: (emblaApi: EmblaCarouselType) => void;
}

const MotionEditViewer = React.forwardRef<ICarouselRef, IMotionEditViewerProps>(
  ({ slides, positions, scale, fitMode, onDragStop, onResizeStop, onTextSelect, selectedText, onInit }, ref) => {
    return (
      <Carousel ref={ref} mode="fade" options={{ loop: true, watchDrag: false }} onInit={onInit}>
        {slides.map((slide) => (
          <div key={slide.id} className="embla__slide" style={{ position: "relative", width: "100%", height: "100%" }}>
            <Image
              src={`/assets/personas/character/leah_williams/${slide.imageName}`}
              alt={`${slide.content.map((obj) => obj.text).join(" ")}`}
              fill={true}
              className="slide-image"
              style={{
                objectFit: slide.objectFit || fitMode, // 개별 슬라이드의 objectFit 적용, 없으면 글로벌 fitMode 사용
                objectPosition: slide.objectPosition || "center", // 개별 슬라이드의 objectPosition 적용, 없으면 기본값 사용
              }}
              sizes="(max-width: 768px) 100vw, 50vw"
              priority={slide.id === "1"} // 첫 번째 이미지라면 우선 로드
            />
            <div
              className="slide-text-container"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            >
              {slide.content.map((contentItem, idx) => {
                const slideId = slide.id;
                const position = positions[slideId]?.[idx] || {
                  x: contentItem.position?.x || 0,
                  y: contentItem.position?.y || 0,
                  width: contentItem.size?.width || 200,
                  height: contentItem.size?.height || 100,
                };

                const isSelected = selectedText?.slideId === slideId && selectedText.contentIndex === idx;

                return (
                  <Rnd
                    key={idx}
                    size={{ width: position.width, height: position.height }}
                    position={{ x: position.x, y: position.y }}
                    scale={scale}
                    onDragStop={(e, d) =>
                      onDragStop(slideId, idx, { x: d.x, y: d.y }, { width: position.width, height: position.height })
                    }
                    onResizeStop={(e, direction, ref, delta, pos) =>
                      onResizeStop(slideId, idx, direction, ref, delta, pos)
                    }
                    bounds="parent"
                    style={{
                      border: isSelected ? "2px solid #FF5733" : "2px dashed #007BFF",
                      padding: "8px",
                      boxSizing: "border-box",
                      background: "rgba(255, 255, 255, 0.8)",
                      borderRadius: "4px",
                    }}
                    dragHandleClassName="drag-handle"
                  >
                    <p
                      className={`slide-text slide-text-${idx} drag-handle`}
                      onMouseDown={() => onTextSelect(slideId, idx)}
                      style={{
                        color: contentItem.color || "#000000",
                        fontSize: contentItem.fontSize || "1.5rem",
                        cursor: "move",
                        userSelect: "none",
                        width: "100%",
                        height: "100%",
                        overflow: "hidden",
                        whiteSpace: "pre-wrap", // 줄바꿈 적용
                      }}
                    >
                      {contentItem.text}
                    </p>
                  </Rnd>
                );
              })}
            </div>
          </div>
        ))}
      </Carousel>
    );
  }
);
MotionEditViewer.displayName = "MotionEditViewer";

export default MotionEditViewer;
