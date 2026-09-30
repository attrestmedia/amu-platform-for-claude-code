"use client";

import React from "react";
import { Carousel } from "components/module/carousel";
import type { ICarouselRef } from "components/module/carousel";
import type {
  IMotionEditorSlideContent,
  IMotionEditorSlideItem,
  MotionEditorObjectFitType,
  MotionEditorObjectPositionType,
} from "types/app";
import type { EmblaCarouselType } from "embla-carousel";
import { Button } from "@amu-labs/ui";

interface MotionEditEditorProps {
  slides: IMotionEditorSlideContent[];
  onUpdateSlide: <K extends keyof IMotionEditorSlideContent>(
    id: string,
    key: K,
    value: IMotionEditorSlideContent[K],
  ) => void;
  onUpdateContentItem: <K extends keyof IMotionEditorSlideItem>(
    slideId: string,
    contentIndex: number,
    key: K,
    value: IMotionEditorSlideItem[K],
  ) => void;
  onAddText: (slideId: string) => void;
  onDeleteText: (slideId: string, contentIndex: number) => void;
  onDeleteSlide: (id: string) => void;
  onInit?: (emblaApi: EmblaCarouselType) => void;
}

const MotionEditEditor = React.forwardRef<ICarouselRef, MotionEditEditorProps>(
  ({ slides, onUpdateSlide, onUpdateContentItem, onAddText, onDeleteText, onDeleteSlide, onInit }, ref) => {
    return (
      <Carousel ref={ref} options={{ loop: true }} onInit={onInit} showDots={true} showNav={true}>
        {slides.map((slide) => (
          <div
            key={slide.id}
            className="embla__slide"
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginBottom: "10px",
              borderRadius: "5px",
              background: "#fff",
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              flexDirection: "column",
            }}
          >
            <label>
              이미지 이름:
              <input
                type="text"
                value={slide.imageName}
                onChange={(e) => onUpdateSlide(slide.id, "imageName", e.target.value)}
                style={{ marginLeft: "10px", width: "80%" }}
              />
            </label>
            <br />

            {/* Object Fit 설정 추가 */}
            <label>
              Object Fit:
              <select
                value={slide.objectFit || "cover"}
                onChange={(e) => onUpdateSlide(slide.id, "objectFit", e.target.value as MotionEditorObjectFitType)}
                style={{ marginLeft: "10px" }}
              >
                <option value="cover">cover</option>
                <option value="contain">contain</option>
                <option value="fill">fill</option>
                <option value="scale-down">scale-down</option>
                <option value="none">none</option>
              </select>
            </label>
            <br />

            {/* Object Position 설정을 select로 변경 */}
            <label>
              Object Position:
              <select
                value={slide.objectPosition || "center"}
                onChange={(e) =>
                  onUpdateSlide(slide.id, "objectPosition", e.target.value as MotionEditorObjectPositionType)
                }
                style={{ marginLeft: "10px" }}
              >
                <option value="center">center</option>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
                <option value="left">left</option>
                <option value="right">right</option>
              </select>
            </label>
            <br />

            <h3>텍스트 내용:</h3>
            {slide.content.map((contentItem, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid #ddd",
                  padding: "5px",
                  marginBottom: "5px",
                  borderRadius: "3px",
                  position: "relative",
                }}
              >
                <label>
                  <textarea
                    value={contentItem.text}
                    onChange={(e) => onUpdateContentItem(slide.id, idx, "text", e.target.value)}
                    style={{ marginLeft: "10px", width: "70%", height: "60px", resize: "vertical" }}
                  />
                </label>
                <br />
                <label>
                  폰트 컬러:
                  <input
                    type="color"
                    value={contentItem.color || "#000000"}
                    onChange={(e) => onUpdateContentItem(slide.id, idx, "color", e.target.value)}
                    style={{ marginLeft: "10px" }}
                  />
                </label>
                <br />
                <label>
                  폰트 사이즈:
                  <input
                    type="number"
                    value={parseInt(contentItem.fontSize || "16")}
                    onChange={(e) => onUpdateContentItem(slide.id, idx, "fontSize", `${e.target.value}px`)}
                    style={{ marginLeft: "10px", width: "60px" }}
                  />
                  px
                </label>
                <br />
                <label>
                  위치 X:
                  <input
                    type="number"
                    value={contentItem.position?.x || 0}
                    onChange={(e) =>
                      onUpdateContentItem(slide.id, idx, "position", {
                        x: parseInt(e.target.value),
                        y: contentItem.position?.y ?? 0,
                      })
                    }
                    style={{ marginLeft: "10px", width: "60px" }}
                  />
                </label>
                <br />
                <label>
                  위치 Y:
                  <input
                    type="number"
                    value={contentItem.position?.y || 0}
                    onChange={(e) =>
                      onUpdateContentItem(slide.id, idx, "position", {
                        x: contentItem.position?.x ?? 0,
                        y: parseInt(e.target.value),
                      })
                    }
                    style={{ marginLeft: "10px", width: "60px" }}
                  />
                </label>

                {/* 텍스트 삭제 버튼 */}
                <Button
                  onClick={() => onDeleteText(slide.id, idx)}
                  style={{
                    background: "red",
                    color: "#fff",
                    border: "none",
                    padding: "5px 10px",
                    borderRadius: "5px",
                    cursor: "pointer",
                    marginTop: "5px",
                  }}
                >
                  텍스트 삭제
                </Button>
              </div>
            ))}

            <Button
              onClick={() => onAddText(slide.id)}
              style={{
                background: "blue",
                color: "#fff",
                border: "none",
                padding: "5px 10px",
                borderRadius: "5px",
                cursor: "pointer",
                marginTop: "5px",
              }}
            >
              텍스트 추가
            </Button>
            <br />
            <Button
              onClick={() => onDeleteSlide(slide.id)}
              style={{
                background: "red",
                color: "#fff",
                border: "none",
                padding: "5px 10px",
                borderRadius: "5px",
                cursor: "pointer",
                marginTop: "5px",
              }}
            >
              슬라이드 삭제
            </Button>
          </div>
        ))}
      </Carousel>
    );
  },
);
MotionEditEditor.displayName = "MotionEditEditor";

export default MotionEditEditor;
