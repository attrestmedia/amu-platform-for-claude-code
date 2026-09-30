"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { ChangeEvent } from "react";
import type { ICarouselRef } from "components/module/carousel";
import { MotionEditViewer, MotionEditEditor } from "components/module/editor";
import type { IMotionEditorSlideData, MotionEditorObjectFitType, MotionEditorObjectPositionType } from "types/app";
import { initialSlideData } from "./slide";
import type { EmblaCarouselType } from "embla-carousel";
import { presetScreens } from "./presetScreens";

// 핸들러 함수
import {
  generateNextId,
  handleAddSlide,
  handleDeleteSlide,
  handleUpdateSlide,
  handleUpdateContentItem,
  handleAddText,
  handleDeleteText,
  handleUpdatePosition,
  generateSlug,
} from "./handlers";

// Input, Dropdown, Button, Slider 컴포넌트 임포트
import { Input, Dropdown, Button, Slider } from "@amu-labs/ui";

type MotionEditorPositionMap = {
  [slideId: string]: {
    [contentIndex: number]: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
};

const MotionEditorPage = () => {
  const [slideData, setSlideData] = useState<IMotionEditorSlideData>(initialSlideData);
  const [selectedText, setSelectedText] = useState<{ slideId: string; contentIndex: number } | null>(null);

  // 핸들러에 필요한 함수 및 상태 전달
  const nextId = () => generateNextId(slideData.content);

  // 슬라이더 동기화 관련 상태 및 ref
  const [mainEmblaApi, setMainEmblaApi] = useState<EmblaCarouselType | undefined>(undefined);
  const [editorEmblaApi, setEditorEmblaApi] = useState<EmblaCarouselType | undefined>(undefined);

  const mainSliderRef = useRef<ICarouselRef>(null);
  const editorSliderRef = useRef<ICarouselRef>(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (mainEmblaApi && editorEmblaApi) {
      const onMainSelect = () => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        const index = mainEmblaApi.selectedScrollSnap();
        editorEmblaApi.scrollTo(index);
        isSyncingRef.current = false;
      };

      const onEditorSelect = () => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        const index = editorEmblaApi.selectedScrollSnap();
        mainEmblaApi.scrollTo(index);
        isSyncingRef.current = false;
      };

      mainEmblaApi.on("select", onMainSelect);
      editorEmblaApi.on("select", onEditorSelect);

      // 초기 동기화
      const initialIndex = mainEmblaApi.selectedScrollSnap();
      editorEmblaApi.scrollTo(initialIndex);

      return () => {
        mainEmblaApi.off("select", onMainSelect);
        editorEmblaApi.off("select", onEditorSelect);
      };
    }
  }, [mainEmblaApi, editorEmblaApi]);

  // 슬라이드 추가 후 자동 스크롤
  const [prevSlideCount, setPrevSlideCount] = useState(slideData.content.length);

  useEffect(() => {
    if (slideData.content.length > prevSlideCount) {
      const newIndex = slideData.content.length - 1;
      setTimeout(() => {
        mainEmblaApi?.scrollTo(newIndex);
        editorEmblaApi?.scrollTo(newIndex);
        setPrevSlideCount(slideData.content.length);
      }, 100);
    }
  }, [slideData.content.length, prevSlideCount, mainEmblaApi, editorEmblaApi]);

  // 프리셋 관련 상태
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof presetScreens>("1:1");
  const [selectedResolution, setSelectedResolution] = useState<"hd" | "fhd">("fhd");
  const [scale, setScale] = useState<number>(1);

  // 글로벌 이미지 모드 상태
  const [imageFitMode, setImageFitMode] = useState<MotionEditorObjectFitType>("contain");
  const [imagePositionMode, setImagePositionMode] = useState<MotionEditorObjectPositionType>("center");

  // 커스텀 모드 관련 상태
  const [slug, setSlug] = useState("");
  const [customWidth, setCustomWidth] = useState(1200);
  const [customHeight, setCustomHeight] = useState(1200);

  // Ref를 사용하여 DOM 요소에 접근
  const presetScreenRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const handlePresetChange = (preset: keyof typeof presetScreens, resolution: "hd" | "fhd") => {
    setSelectedPreset(preset);
    setSelectedResolution(resolution);
    const { width, height } = presetScreens[preset].resolutions[resolution];
    setCustomWidth(width);
    setCustomHeight(height);
    // 사이즈 적용은 useEffect에서 처리
  };

  const applyPresetSize = useCallback(() => {
    if (presetScreenRef.current && viewerRef.current) {
      presetScreenRef.current.style.width = `${customWidth}px`;
      presetScreenRef.current.style.height = `${customHeight}px`;

      const viewerWidth = viewerRef.current.clientWidth;
      const viewerHeight = viewerRef.current.clientHeight;

      const presetWidth = customWidth;
      const presetHeight = customHeight;

      const scaleX = viewerWidth / presetWidth;
      const scaleY = viewerHeight / presetHeight;

      const newScale = Math.min(scaleX, scaleY, 1);
      setScale(newScale);
    }
  }, [customHeight, customWidth]);

  // 초기 로드시 및 창 크기 변경 시 커스텀 사이즈 적용
  useEffect(() => {
    applyPresetSize();

    const handleResize = () => {
      applyPresetSize();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [applyPresetSize]);

  // imageFitMode 또는 imagePositionMode 변경 시 모든 슬라이드에 적용
  useEffect(function applyImageFitToSlides() {
    // 외부 옵션(fit/position) 변경 시 슬라이드 전체에 일괄 반영
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlideData((prev) => ({
      ...prev,
      content: prev.content.map((slide) => ({
        ...slide,
        objectFit: imageFitMode,
        objectPosition: imagePositionMode,
      })),
    }));
  }, [imageFitMode, imagePositionMode]);

  // Slider의 onChange는 숫자 배열을 전달하므로 이를 처리하도록 수정
  const handleScaleChange = (newValues: number[]) => {
    setScale(newValues[0]);
  };

  const handleApplyCustomSize = (width: number, height: number) => {
    setCustomWidth(width);
    setCustomHeight(height);
  };

  // slug 업데이트
  useEffect(function syncSlideSlugFromExternalSlug() {
    if (!slug) {
      // slug가 빈 값일 때 새로운 슬러그 생성 — slideData에도 반영
      const newSlug = generateSlug(12);

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlug(newSlug);
      setSlideData((prev) => ({
        ...prev,
        slug: newSlug,
      }));
    } else {
      // 외부 slug prop과 내부 slideData.slug 동기화
      setSlideData((prev) => ({
        ...prev,
        slug: slug,
      }));
    }
  }, [slug, setSlideData]);

  // Dropdown 옵션 객체 생성
  const presetOptions = Object.keys(presetScreens).map((key) => ({
    label: presetScreens[key as keyof typeof presetScreens].name,
    value: key,
  }));

  const resolutionOptions = [
    { label: "HD", value: "hd" },
    { label: "FHD", value: "fhd" },
  ];

  const fitModeOptions = [
    { label: "Cover", value: "cover" },
    { label: "Contain", value: "contain" },
    { label: "Fill", value: "fill" },
    { label: "Scale-Down", value: "scale-down" },
    { label: "None", value: "none" },
  ];

  const positionOptions = [
    { label: "Center", value: "center" },
    { label: "Top", value: "top" },
    { label: "Bottom", value: "bottom" },
    { label: "Left", value: "left" },
    { label: "Right", value: "right" },
  ];

  return (
    <div className="p-5">
      <h1 className="text-center mb-5">{slideData.title}</h1>

      {/* slug 입력 필드 */}
      <div>
        <label>Slug:</label>
        <Input type="text" onChange={(e) => setSlug(e.target.value)} value={slug || slideData.slug} />
      </div>

      {/* 프리셋 / 커스텀 선택 및 해상도, fit 모드 선택 */}
      <div className="flex flex-wrap gap-5 mb-5">
        <div className="preset">
          <label className="flex gap-2.5">
            프리셋:
            <Dropdown
              options={presetOptions}
              selected={selectedPreset}
              onSelect={(value) => handlePresetChange(value as keyof typeof presetScreens, selectedResolution)}
              renderTrigger={(selected) =>
                selected
                  ? (presetOptions.find((item) => item.value === selected)?.label ?? "프리셋 선택")
                  : "프리셋 선택"
              }
            />
          </label>
          <Dropdown
            options={resolutionOptions}
            selected={selectedResolution}
            onSelect={(value) => handlePresetChange(selectedPreset, value as "hd" | "fhd")}
            renderTrigger={(selected) =>
              selected ? resolutionOptions.find((item) => item.value === selected)?.label : "해상도 선택"
            }
          />
        </div>

        <div className="size flex items-center gap-2.5">
          <div>
            <label className="mr-2.5">Width:</label>
            <Input
              type="number"
              value={customWidth}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const newWidth = parseInt(e.target.value, 10);
                setCustomWidth(newWidth);
              }}
              min={0}
              className="w-[120px]"
            />
          </div>
          <div>
            <label className="mr-2.5">Height:</label>
            <Input
              type="number"
              value={customHeight}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const newHeight = parseInt(e.target.value, 10);
                setCustomHeight(newHeight);
              }}
              min={0}
              className="w-[120px]"
            />
          </div>
          <Button onClick={() => handleApplyCustomSize(customWidth, customHeight)}>적용</Button>
        </div>

        <div className="mode">
          <label className="flex gap-2.5">
            이미지 모드:
            <Dropdown
              options={fitModeOptions}
              selected={imageFitMode}
              onSelect={(value) => setImageFitMode(value as MotionEditorObjectFitType)}
              renderTrigger={(selected) =>
                selected ? fitModeOptions.find((item) => item.value === selected)?.label : "이미지 모드 선택"
              }
            />
          </label>
          <Dropdown
            options={positionOptions}
            selected={imagePositionMode}
            onSelect={(value) => setImagePositionMode(value as MotionEditorObjectPositionType)}
            renderTrigger={(selected) =>
              selected ? positionOptions.find((item) => item.value === selected)?.label : "위치 모드 선택"
            }
          />
        </div>

        <div className="scale-control">
          <label className="flex gap-2.5">
            스케일:
            <Slider
              min={0.2}
              max={1}
              step={0.01}
              value={[scale]}
              onValueChange={handleScaleChange}
              className="w-[100px]"
            />
          </label>
        </div>
      </div>

      <div className="flex motion-edit-box">
        {/* 메인 슬라이더 */}
        <div
          className="flex justify-center items-center w-full h-[calc(100vh-10rem)] overflow-hidden flex-[2] border border-gray-300"
          ref={viewerRef}
        >
          <div className="motion-edit-preset-screen" ref={presetScreenRef} style={{ transform: `scale(${scale})` }}>
            <MotionEditViewer
              ref={mainSliderRef}
              slides={slideData.content}
              positions={{
                ...slideData.content.reduce<MotionEditorPositionMap>((acc, slide) => {
                  acc[slide.id] = slide.content.reduce<MotionEditorPositionMap[string]>((innerAcc, item, idx) => {
                    innerAcc[idx] = {
                      x: item.position?.x || 0,
                      y: item.position?.y || 0,
                      width: item.size?.width || 200,
                      height: item.size?.height || 100,
                    };
                    return innerAcc;
                  }, {});
                  return acc;
                }, {}),
              }}
              scale={scale}
              fitMode={imageFitMode} // 글로벌 fitMode 전달
              onDragStop={(slideId, contentIndex, position, size) => {
                handleUpdatePosition(slideId, contentIndex, position, size, setSlideData);
              }}
              onResizeStop={(slideId, contentIndex, direction, ref, delta, pos) => {
                const currentSlide = slideData.content.find((s) => s.id === slideId);
                const currentItem = currentSlide?.content[contentIndex];
                const newWidth = (currentItem?.size?.width || 200) + delta.width;
                const newHeight = (currentItem?.size?.height || 100) + delta.height;

                handleUpdatePosition(slideId, contentIndex, pos, { width: newWidth, height: newHeight }, setSlideData);
              }}
              onTextSelect={(slideId, contentIndex) => {
                setSelectedText({ slideId, contentIndex });
              }}
              selectedText={selectedText}
              onInit={(embla) => setMainEmblaApi(embla)}
            />
          </div>
        </div>

        {/* 슬라이드 편집 섹션 */}
        <div className="flex-1 max-h-[80vh] overflow-y-auto">
          <h2>슬라이드 편집</h2>
          <div className="editor-slider-wrapper">
            <MotionEditEditor
              ref={editorSliderRef}
              slides={slideData.content}
              onUpdateSlide={(id, key, value) => handleUpdateSlide(id, key, value, setSlideData)}
              onUpdateContentItem={(slideId, contentIndex, key, value) =>
                handleUpdateContentItem(slideId, contentIndex, key, value, setSlideData)
              }
              onAddText={(slideId) => handleAddText(slideId, setSlideData)}
              onDeleteText={(slideId, contentIndex) => handleDeleteText(slideId, contentIndex, setSlideData)}
              onDeleteSlide={(id) => handleDeleteSlide(id, setSlideData)}
              onInit={(embla) => setEditorEmblaApi(embla)}
            />
          </div>
          <Button onClick={() => handleAddSlide(slideData, setSlideData, nextId)}>새 슬라이드 추가</Button>
        </div>
      </div>
    </div>
  );
};

export default MotionEditorPage;
