import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import clsx from "clsx";

import { AnnotationThumbnails, AnnotationBox, AnnotationButtons } from "./modules";
import { Button, dialog } from "@amu-labs/ui";
import { toast } from "sonner";
import type { ICategory, ICategoryList, IAnnotation, ICategoryStatus, IMaskingPoint } from "types/catalog";
import { CLASS_KEY_MAP_DATA } from "consts/catalog";
import { useCatalogStore } from "store/catalog";
import { useAnnotationState } from "hooks/catalog/useAnnotationState";
import useImageInteraction from "hooks/catalog/useImageInteraction";
import useAnnotationKeyControls from "hooks/catalog/useAnnotationKeyControls";
import useAnnotationControls from "hooks/catalog/useAnnotationControls";
import useMaskingControls from "hooks/catalog/useMaskingControls";
import { isDev } from "utils/common";
import { logger } from "utils/log";
import { colorMappingClassType, labelMappingClassType, polyColor } from "utils/catalog/catalog";
import styles from "./ImageAnnotator.module.scss";

type ImageAnnotatorProps = {
  data: ICategoryList;
};

export type handleResetProps = {
  isNoConfirm?: boolean;
};

const ImageAnnotator = ({ data }: ImageAnnotatorProps) => {
  // ==================================================================================
  // ::: State Variables :::
  // ==================================================================================

  // UI 관련 상태 가져오기(**useAnnotationState)
  const annotationStates = useAnnotationState();
  const {
    currentMode,
    selectedThumbnailIndex,
    setSelectedThumbnailIndex,
    currentClassType,
    setCurrentClassType,
    currentColor,
    setCurrentColor,
    selectedClassLabel,
    setSelectedClassLabel,
    scale,
    isPanning,
    panOffset,
    oriImageSize,
    scaleImageSize,
    setScaleImageSize,
    containerRef,
    isCrosshair,
    categoryName,
  } = annotationStates;

  // 데이터 관련 상태 가져오기(**useCatalogStore)
  const {
    currentData,
    setCurrentData,
    projectData,
    setProjectData,
    selectedAnnotationIndex,
    setSelectedAnnotationIndex,
    setClonedAnnotation,
    annotations,
    setAnnotations,
    isSaved,
    setIsSaved,
    statusData,
    addStatusData,
    points,
    polygons,
    setPolygons,
    selectedPolygonIndex,
  } = useCatalogStore();

  const [imageOpacity, setImageOpacity] = useState<number>(1); // 이미지 투명도 조절

  // const [batchQuantity, setBatchQuantity] = useState<number>(0); // 일괄 생성 수량
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: -1, y: -1 }); // 마우스 크로스 라인

  // 페이지가 변경 될 때 이전 페이지의 id와 비교하기 위한 변수
  const previousDataIdRef = useRef<string | null>(null);

  // ::: START :::

  // ==================================================================================
  // ::: Handlers :::
  // ==================================================================================

  // 마우스 이동 이벤트 핸들러
  const handleMouseMoveCrosshair = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e;

    // 이미지 Annotator의 컨테이너 기준으로 마우스 좌표를 계산
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      setMousePosition({
        x: clientX - containerRect.left, // 컨테이너의 경계로 보정
        y: clientY - containerRect.top,
      });
    } else {
      setMousePosition({ x: clientX, y: clientY });
    }
  };

  // 현재 프레임의 어노테이션 리셋
  const handleReset = async (props: Partial<handleResetProps> = {}) => {
    const { isNoConfirm = false } = props;
    if (currentData && currentData.id) {
      if (!isSaved) {
        if (!isNoConfirm) {
          const confirmReset = await dialog.confirm({
            variant: "danger",
            message: "어노테이션이 저장되지 않았습니다. 추가된 어노테이션을 삭제 할까요?",
          });
          if (!confirmReset) return; // 사용자가 이동을 취소하면 함수 종료
        }

        const existingAnnotations = projectData.find((item) => item.id === currentData.id)?.annotations || [];
        const existingMaskings = projectData.find((item) => item.id === currentData.id)?.maskings || [];
        setAnnotations(existingAnnotations);
        setPolygons(existingMaskings); // maskings 데이터도 복원
        setSelectedAnnotationIndex(existingAnnotations.length > 0 ? 0 : null);
      } else {
        const confirmReset = await dialog.confirm({
          variant: "danger",
          message: "어노테이션이 모두 초기화 됩니다. 초기화 할까요?",
        });
        if (!confirmReset) return; // 사용자가 초기화를 취소하면 함수 종료

        const updatedAnnotations: IAnnotation[] = []; // 어노테이션을 모두 삭제
        const updatedMaskings: IMaskingPoint[][] = []; // 마스킹을 모두 삭제

        setAnnotations(updatedAnnotations); // 로컬 상태를 업데이트하여 화면에서 어노테이션 제거
        setPolygons(updatedMaskings); // 마스킹 상태 초기화
        setSelectedAnnotationIndex(null); // 선택된 어노테이션 인덱스 초기화

        setTimeout(() => {
          toast.success("어노테이션이 초기화되었습니다.");
        }, 300);
      }

      setIsSaved(true); // 초기화 후 저장 상태를 true로 설정
    }
  };

  // 모든 프레임의 데이터를 초기화
  const handleResetAll = useCallback(async () => {
    const confirmResetAll = await dialog.confirm({
      variant: "danger",
      message: "모든 프레임의 데이터를 초기화하시겠습니까?",
    });
    if (!confirmResetAll) return;

    try {
      // 모든 프레임의 annotations과 maskings을 초기화
      // const resetProjectData = projectData.map((item) => ({
      //   ...item,
      //   annotations: [],
      //   maskings: [],
      // }));
      // setProjectData(resetProjectData);
      // 현재 선택된 프레임의 annotations과 polygons도 초기화
      // setAnnotations([]);
      // setPolygons([]);
      // setSelectedAnnotationIndex(null);
      // setIsSaved(false);
      // 각 이미지에 대해 재작업 API 요청 생성
      // const requests = imagesToRework.map((src) => { ... });
      // 모든 API 요청을 병렬로 실행
      // await Promise.all(requests);
      // 상태 업데이트: 다시 작업 이미지 목록에 모든 이미지 추가
    } catch (error) {
      logger.error("모든 프레임을 재작업으로 등록하는 중 오류 발생:", error);
      void dialog.alert({ variant: "danger", message: "모든 프레임을 재작업으로 등록하는 중 오류가 발생했습니다." });
    }
  }, []);

  // 썸네일 클릭
  const handleThumbnailClick = (thumbnail: ICategory, index: number) => {
    handleResetProgressMasking(); // 진행 중인 마스킹이 있을 경우 초기화

    if (!isSaved && annotations.length > 0) {
      handleSave(true);
      setIsSaved(true);
    }

    setCurrentData(thumbnail);
    setSelectedThumbnailIndex(index);

    logger.log("thumbnail.annotations => ", thumbnail.annotations);

    // 썸네일 클릭 시 어노테이션 및 마스킹 업데이트
    const updatedThumbnail = projectData.find((item) => item.id === thumbnail.id);
    const existingAnnotations = updatedThumbnail?.annotations || [];
    const existingMaskings = updatedThumbnail?.maskings || []; // 마스킹 데이터 가져오기

    if (existingAnnotations.length > 0) {
      setAnnotations(existingAnnotations); // 어노테이션 데이터 설정
      setPolygons(existingMaskings); // 마스킹 데이터 설정
      setSelectedAnnotationIndex(existingAnnotations.length > 0 ? 0 : null);
    } else {
      setAnnotations([]); // 어노테이션 초기화
      setPolygons([]); // 마스킹 초기화
      setSelectedAnnotationIndex(null);
    }
  };

  // 일괄 생성(임시)
  // const handleBatchCreate = () => {
  //   const newAnnotations = [];
  //   for (let i = 0; i < batchQuantity; i++) {
  //     const newAnnotation: IAnnotation = {
  //       x: i * 10 + DEFAULT_SPACING,
  //       y: i * 10 + DEFAULT_SPACING,
  //       width: 100,
  //       height: 100,
  //       color: currentColor, // 기본 색상
  //       label: "자동 생성 객체", // 기본 라벨
  //       classType: "1",
  //     };
  //     newAnnotations.push(newAnnotation);
  //   }
  //   setAnnotations([...annotations, ...newAnnotations]); // 기존 어노테이션에 추가
  //   setIsBatchObjects(false); // 모달 닫기
  // };

  // 삭제 버튼 핸들러
  const handleDeleteImage = useCallback(
    async (image: ICategory) => {
      const confirmDelete = await dialog.confirm({ variant: "danger", message: "이 이미지를 삭제하시겠습니까?" });
      if (!confirmDelete) return;

      try {
        // 삭제된 이미지 상태를 statusData에 추가
        const deletedStatus: ICategoryStatus = {
          category: currentData?.id || "",
          id: image.id,
          src: image.src,
          type: "del",
        };
        addStatusData(deletedStatus);

        // projectData에서 이미지 제거
        const updatedProjectData = projectData.filter((item) => item.src !== image.src);
        setProjectData(updatedProjectData);

        // selectedThumbnailIndex 조정
        if (selectedThumbnailIndex !== null && selectedThumbnailIndex >= updatedProjectData.length) {
          if (updatedProjectData.length > 0) {
            setSelectedThumbnailIndex(0);
          } else {
            setSelectedThumbnailIndex(null);
          }
        }
      } catch (error) {
        logger.error("이미지 삭제 중 오류 발생:", error);
      }
    },
    [currentData, projectData, addStatusData, selectedThumbnailIndex, setProjectData, setSelectedThumbnailIndex],
  );

  // ==================================================================================
  // ::: Hooks :::
  // ==================================================================================

  // 어노테이션 생성 및 인터렉션 설정 훅
  const { handleImageLoad, handleMouseDown, handleMouseMove } = useImageInteraction();

  // 상단 버튼 컨트롤 훅
  const {
    handleSave,
    handlePreviousFrame,
    handleNextFrame,
    handleAddAnnotation,
    handleDeleteAnnotation,
    handleAddClassToAnnotation,
    handleResetProgressMasking,
    isSaving,
  } = useAnnotationControls({ data });

  // 마스킹 컨트롤 훅
  const { handleMouseClick, handlePolygonClick, handlePolygonMouseDown } = useMaskingControls();

  // 어노테이션 키 컨트롤 훅
  const { handleKeyDown } = useAnnotationKeyControls({
    data,
    handleReset,
    handleResetAll,
    handleDeleteImage,
  });

  // 배경 클릭 시 선택된 인덱스를 초기화하는 핸들러
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      handleMouseClick(e); // 기존 마스킹 클릭 처리
      if (currentMode === "object") {
        setSelectedAnnotationIndex(null); // 선택된 어노테이션 인덱스 초기화
      }
      // setSelectedPolygonIndex(null); // 선택된 마스킹 인덱스 초기화
    },
    [currentMode, handleMouseClick, setSelectedAnnotationIndex],
  );

  // ==================================================================================
  // ::: UseEffects :::
  // ==================================================================================

  // ::: Start Debuggings :::
  useEffect(() => {
    logger.log("::: ImageAnnotator debugging ::: data => ", data);
    logger.log("::: ImageAnnotator debugging ::: projectData => ", projectData);
    logger.log("::: ImageAnnotator debugging ::: currentData => ", currentData);
  }, [data, projectData, currentData]);
  // ::: End Debuggings :::

  // 현재 페이지의 데이터 업데이트
  useEffect(() => {
    if (data) {
      setProjectData(data.list);
      logger.log(">> projectData => ", data.list);

      // 이전 페이지의 id와 비교하여 페이지가 변경되지 않았을 때만 Thumbnail Index 설정
      if (data.id !== previousDataIdRef.current) {
        if (data.list.length > 0) {
          setSelectedThumbnailIndex(0);
        } else {
          setSelectedThumbnailIndex(null);
        }
      }
      previousDataIdRef.current = data.id; // 페이지의 id를 저장
    }
  }, [data, setProjectData, setSelectedThumbnailIndex]);

  // 이미지가 삭제되어 statusData가 변경될 때, projectData를 업데이트하고 selectedThumbnailIndex가 유효한지 확인
  useEffect(() => {
    if (statusData.length > 0) {
      const deletedImages = statusData.filter((status) => status.type === "del").map((status) => status.src);

      const filteredProjectData = projectData.filter((item) => !deletedImages.includes(item.src));
      setProjectData(filteredProjectData);

      // selectedThumbnailIndex 조정
      if (selectedThumbnailIndex !== null && selectedThumbnailIndex >= filteredProjectData.length) {
        if (filteredProjectData.length > 0) {
          setSelectedThumbnailIndex(0);
        } else {
          setSelectedThumbnailIndex(null);
        }
      }
    }
    // projectData/selectedThumbnailIndex를 deps에 넣으면 필터링 결과 배열 갱신으로 반복 실행될 수 있어 statusData 전이에만 반응시킨다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusData]);

  // selectedThumbnailIndex나 projectData가 변경될 때 currentData 업데이트
  useEffect(() => {
    if (selectedThumbnailIndex !== null && projectData.length > 0) {
      const restoredData = projectData[selectedThumbnailIndex];
      setCurrentData(restoredData);
      setAnnotations(restoredData.annotations || []);
      setPolygons(restoredData.maskings || []);

      if (restoredData.annotations && restoredData.annotations.length > 0) {
        setSelectedAnnotationIndex(0);
        setCurrentClassType(restoredData.annotations[0].classType);
      } else {
        setSelectedAnnotationIndex(null);
      }
    } else {
      setCurrentData(null);
    }
  }, [selectedThumbnailIndex, projectData, setAnnotations, setCurrentClassType, setCurrentData, setPolygons, setSelectedAnnotationIndex]);

  // 프로젝트 데이터에 어노테이션과 마스킹이 있는 경우 로드
  // useEffect(() => {
  //   if (projectData.length > 0) {
  //     const indexToUse =
  //       selectedThumbnailIndex !== null && projectData[selectedThumbnailIndex] ? selectedThumbnailIndex : 0;

  //     const restoredData = projectData[indexToUse];
  //     setCurrentData(restoredData);
  //     setAnnotations(restoredData.annotations || []);
  //     setPolygons(restoredData.maskings || []);

  //     if (restoredData.annotations && restoredData.annotations.length > 0) {
  //       setSelectedAnnotationIndex(0);
  //       setCurrentClassType(restoredData.annotations[0].classType);
  //     } else {
  //       setSelectedAnnotationIndex(null);
  //     }
  //   } else {
  //     setCurrentData(null);
  //   }
  // }, [projectData]);

  // scale이나 oriImageSize가 변경될 때만 scaleImageSize를 업데이트
  useEffect(() => {
    if (oriImageSize) {
      const newWidth = oriImageSize.width * scale;
      const newHeight = oriImageSize.height * scale;

      // 이전의 scaleImageSize와 비교하여 변경이 있을 때만 업데이트
      if (!scaleImageSize || scaleImageSize.width !== newWidth || scaleImageSize.height !== newHeight) {
        logger.log("Updating scaleImageSize => ", newWidth, newHeight);
        setScaleImageSize({
          width: newWidth,
          height: newHeight,
        });
      }
    }
  }, [scale, oriImageSize, scaleImageSize, setScaleImageSize]); // scale과 oriImageSize가 변경될 때만 실행

  // 어노테이션 초기화 시 색상 설정
  useEffect(() => {
    logger.log("selectedAnnotationIndex => ", selectedAnnotationIndex);
    if (selectedAnnotationIndex === null) {
      // 선택된 어노테이션이 없을 때만 현재 색상을 설정
      // setCurrentColor(classKeyMapData[0].color);
      setCurrentClassType("1");
    } else {
      setCurrentClassType(annotations[selectedAnnotationIndex].classType);
    }
  }, [annotations, selectedAnnotationIndex, setCurrentClassType]);

  // classType에 따라 currentColor와 selectedClassLabel 상태 업데이트
  useEffect(() => {
    setCurrentColor(colorMappingClassType(currentClassType));
    setSelectedClassLabel(labelMappingClassType(currentClassType));
  }, [currentClassType, setCurrentColor, setSelectedClassLabel]);

  // currentColor가 변경될 때마다 선택된 어노테이션의 색상 업데이트
  useEffect(() => {
    if (selectedAnnotationIndex !== null && currentColor) {
      setAnnotations((prevAnnotations) => {
        const updatedAnnotations = [...prevAnnotations];
        updatedAnnotations[selectedAnnotationIndex] = {
          ...updatedAnnotations[selectedAnnotationIndex],
          color: currentColor,
          label: selectedClassLabel,
          classType: currentClassType,
        };
        logger.log("updatedAnnotations[selectedAnnotationIndex] => ", updatedAnnotations[selectedAnnotationIndex]);
        return updatedAnnotations;
      });
    }
  }, [currentColor, selectedClassLabel, currentClassType, selectedAnnotationIndex, setAnnotations]);

  // 이미지 로드 후 크기 설정 및 어노테이션 정보 업데이트
  useEffect(() => {
    if (currentData) {
      handleImageLoad(); // 이미지 로드 후 크기 설정

      // currentData에 어노테이션과 마스킹이 있는 경우 업데이트, 없는 경우 초기화
      // const existingAnnotations = projectData.find((item) => item.id === currentData.id)?.annotations || [];
      // const existingMaskings = projectData.find((item) => item.id === currentData.id)?.maskings || []; // 마스킹 데이터 가져오기
      // if (existingAnnotations.length > 0) {
      //   setAnnotations(existingAnnotations);
      //   setPolygons(existingMaskings); // 마스킹 데이터 설정
      //   setSelectedAnnotationIndex(existingAnnotations.length > 0 ? 0 : null);
      // } else {
      //   setAnnotations([]); // 어노테이션 초기화
      //   setPolygons([]); // 마스킹 초기화
      //   setSelectedAnnotationIndex(null);
      // }
    }
  }, [currentData, handleImageLoad]);

  // 페이지가 처음 렌더링되거나 변경될 때 항상 첫번째 썸네일 선택
  useEffect(() => {
    if (statusData.length > 0 && data && projectData.length > 0) {
      // statusData에서 type이 "del"인 이미지 src 추출
      const deletedImages = statusData.filter((status) => status.type === "del").map((status) => status.src);

      // 삭제된 이미지를 제외한 프로젝트 데이터를 필터링
      const filteredProjectData = projectData.filter((item) => !deletedImages.includes(item.src));
      setProjectData(filteredProjectData);

      // 저장된 썸네일 인덱스가 있을 경우 해당 인덱스로 이동
      if (selectedThumbnailIndex !== null && filteredProjectData.length > 0) {
        const restoredData = filteredProjectData[selectedThumbnailIndex];
        setCurrentData(restoredData);
        setAnnotations(restoredData.annotations || []);
        setPolygons(restoredData.maskings || []);

        // 어노테이션이 있는 경우 색상 업데이트
        if (restoredData.annotations && restoredData.annotations.length > 0) {
          const selectedAnnotation = restoredData.annotations[0]; // 첫 번째 어노테이션 선택
          setCurrentClassType(selectedAnnotation.classType);
          setSelectedAnnotationIndex(0); // 첫 번째 어노테이션 선택
        } else {
          setSelectedAnnotationIndex(null); // 어노테이션이 없을 경우 선택 해제
        }
      } else if (filteredProjectData.length > 0) {
        // selectedThumbnailIndex가 null 이면 첫 번째 이미지를 선택
        setCurrentData(filteredProjectData[0]);
        setSelectedThumbnailIndex(0);
      }
    }
  }, [
    data,
    statusData,
    projectData,
    selectedThumbnailIndex,
    setAnnotations,
    setCurrentClassType,
    setCurrentData,
    setPolygons,
    setProjectData,
    setSelectedAnnotationIndex,
    setSelectedThumbnailIndex,
  ]);

  // 어노테이션 추가 및 단축키 컨트롤(컴포넌트 마운트 시 한 번만 이벤트 리스너를 등록)
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <>
      <div className="flex flex-col">
        {createPortal(
          <AnnotationButtons
            handlePreviousFrame={handlePreviousFrame}
            handleNextFrame={handleNextFrame}
            handleAddAnnotation={handleAddAnnotation}
            handleDeleteAnnotation={handleDeleteAnnotation}
            handleAddClass={handleAddClassToAnnotation}
            classKeyMaps={CLASS_KEY_MAP_DATA}
          />,
          document.getElementById("header-buttons-portal") as HTMLElement,
        )}

        <div className={clsx("relative bg-black", styles.imageAnnotatorContainer)}>
          <div
            ref={containerRef}
            className={clsx(
              "relative overflow-auto w-full h-[calc(100vh-19.25rem)] my-0 mx-auto",
              styles.annotationContainer,
            )}
            style={{
              cursor: isPanning ? "move" : "default",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onClick={handleBackgroundClick}
          >
            <div
              className="absolute"
              style={{
                top: panOffset.y,
                left: panOffset.x,
                cursor: isPanning ? "move" : `${currentMode === "masking" ? "pointer" : "default"}`,
              }}
              onMouseMove={handleMouseMoveCrosshair}
            >
              {/* START :: 크로스라인 표시 */}
              {isCrosshair && (
                <>
                  <div className={styles.crosshairVertical} style={{ left: `${mousePosition.x}px` }} />
                  <div className={styles.crosshairHorizontal} style={{ top: `${mousePosition.y}px` }} />
                </>
              )}
              {/* END :: 크로스라인 표시 */}
              {currentData?.src && (
                <Image
                  src={currentData.src}
                  alt="Annotatable"
                  fill
                  style={{
                    display: "block",
                    maxWidth: "none",
                    objectFit: "contain",
                  }}
                  sizes={`${scaleImageSize?.width}px`}
                  onLoad={(event) => handleImageLoad(event.currentTarget)}
                  unoptimized={currentData.src.startsWith("data:")} // 데이터 URL인 경우 최적화 비활성화
                />
              )}

              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: scaleImageSize?.width || "100%",
                  height: scaleImageSize?.height || "100%",
                }}
              >
                {/* 마스킹 폴리곤 영역 */}
                {polygons.map((polygon, index) => (
                  <polygon
                    key={`masking-${index}`}
                    points={polygon.map((point) => `${point.x * scale},${point.y * scale}`).join(" ")}
                    style={{
                      fill: index === selectedPolygonIndex ? polyColor(0.6, "selected") : polyColor(0.6),
                      stroke: index === selectedPolygonIndex ? polyColor(1, "selected") : polyColor(1),
                      strokeWidth: 2,
                      cursor: currentMode === "masking" ? "move" : "default", // 드래그 가능한 커서
                    }}
                    onClick={(e) => {
                      logger.log("test");
                      if (points.length === 0) {
                        e.stopPropagation(); // 이벤트 전파 방지
                        handlePolygonClick(index);
                      }
                    }}
                    onMouseDown={(e) => currentMode === "masking" && handlePolygonMouseDown(e, index)} // 드래그 시작
                  />
                ))}

                {/* 기존의 마스킹 폴리곤 외에 현재 그리고 있는 도형 */}
                {currentMode === "masking" && points.length > 0 && (
                  <>
                    {/* 클릭한 좌표에 점 표시 */}
                    {points.map((point, index) => (
                      <circle
                        key={`current-point-${index}`}
                        cx={point.x * scale}
                        cy={point.y * scale}
                        r={4}
                        fill={polyColor(1)}
                      />
                    ))}

                    {/* 선 연결 (점과 점을 선으로 연결) */}
                    {points.length > 1 && (
                      <polyline
                        points={points.map((point) => `${point.x * scale},${point.y * scale}`).join(" ")}
                        style={{ fill: "none", stroke: polyColor(1), strokeWidth: 2 }}
                      />
                    )}

                    {/* 도형이 닫히면 polygon */}
                    {points.length > 2 && (
                      <polygon
                        points={points.map((point) => `${point.x * scale},${point.y * scale}`).join(" ")}
                        style={{ fill: polyColor(0.6), stroke: polyColor(1), strokeWidth: 2 }}
                      />
                    )}
                  </>
                )}
              </svg>

              {annotations.map((annotation, index) => (
                <AnnotationBox
                  key={`annotation-${index}`}
                  annotation={annotation}
                  index={index}
                  scale={scale}
                  isSelected={index === selectedAnnotationIndex}
                  onClick={() => {
                    if (currentMode === "masking") return; // 마스킹 모드일 경우 리턴
                    setSelectedAnnotationIndex(index);
                    setCurrentClassType(annotation.classType);
                    // setCurrentColor(colorMappingClassType(annotation.classType));
                    // setSelectedClassLabel(labelMappingClassType(annotation.classType));
                    setClonedAnnotation(annotations[index]); // 어노테이션 복사
                  }}
                  onDragStop={(index, e, d) => {
                    if (currentMode === "masking") return; // 마스킹 모드일 경우 리턴
                    const newAnnotations = [...annotations];
                    newAnnotations[index] = {
                      ...newAnnotations[index],
                      x: d.x / scale, // 기존의 x 좌표를 scale로 나누어 원본 위치를 계산
                      y: d.y / scale, // 기존의 y 좌표를 scale로 나누어 원본 위치를 계산
                    };
                    setAnnotations(newAnnotations);
                    setSelectedAnnotationIndex(index);
                    setIsSaved(false); // 어노테이션이 변경되면 저장되지 않은 상태로 설정
                  }}
                  onResizeStop={(index, e, direction, ref, delta, position) => {
                    if (currentMode === "masking") return; // 마스킹 모드일 경우 리턴
                    const newAnnotations = [...annotations];
                    newAnnotations[index] = {
                      ...newAnnotations[index],
                      width: parseInt(ref.style.width, 10) / scale, // 기존의 width를 scale로 나누어 원본 크기를 계산
                      height: parseInt(ref.style.height, 10) / scale, // 기존의 height를 scale로 나누어 원본 크기를 계산
                      x: position.x / scale, // 기존의 x 좌표를 scale로 나누어 원본 위치를 계산
                      y: position.y / scale, // 기존의 y 좌표를 scale로 나누어 원본 위치를 계산
                    };
                    setAnnotations(newAnnotations);
                    setSelectedAnnotationIndex(index);
                    setIsSaved(false); // 어노테이션이 변경되면 저장되지 않은 상태로 설정
                  }}
                  onDelete={handleDeleteAnnotation}
                />
              ))}
            </div>
          </div>
          {isDev && (
            <ul className="fixed bottom-1 right-1 p-[5px_10px] bg-black/50 border border-white/35 text-xxs overflow-y-auto">
              <li>{`category name: ${categoryName}`}</li>
              <li>{`subCategory id: ${data.id}`}</li>
              <li>{`subCategory name: ${data.name}`}</li>
              <li>{`-----`}</li>
              <li>{`current mode: ${currentMode}`}</li>
              <li>{`current color: ${currentColor}`}</li>
              <li>{`current scale: ${scale.toFixed(2)}`}</li>
              <li>{`current src: ${currentData?.src}`}</li>
              <li>{`-----`}</li>
              {scaleImageSize && (
                <>
                  <li>{`scaleImageSize: ${scaleImageSize.width}`}</li>
                  <li>{`scaleImageSize: ${scaleImageSize.height}`}</li>
                </>
              )}
              {oriImageSize && (
                <>
                  <li>{`oriImageWidth: ${oriImageSize.width}`}</li>
                  <li>{`oriImageHeight: ${oriImageSize.height}`}</li>
                </>
              )}
              <li>{`-----`}</li>
              <li>{`selectedAnnotationIndex: ${selectedAnnotationIndex}`}</li>
              <li>{`selectedThumbnailIndex: ${selectedThumbnailIndex}`}</li>
              <li>{`isSaved: ${isSaved}`}</li>
              <li>{`annotations count: ${annotations.length}`}</li>
              <li>{`maskings count: ${polygons.length}`}</li> {/* 마스킹 카운트 추가 */}
            </ul>
          )}
        </div>
        <div className="flex justify-between mt-4">
          <div className="flex">
            {/* <Button onClick={() => setIsBatchObjects(true)}>
              <Image width={12} height={12} src="/icons/focus.svg" alt="" />
              기능 1
            </Button> */}
            <Button className="ml-2">
              <Image width={12} height={12} src="/icons/arrow_pointer.svg" alt="" />
              기능 2
            </Button>
            <div className="flex items-center ml-4">
              <input
                type="range"
                id="opacityRange"
                min="0"
                max="1"
                step="0.01"
                value={imageOpacity}
                onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
                className="w-24 mr-2"
              />
              <span className="text-white">{Math.round(imageOpacity * 100)}%</span>
            </div>
          </div>
          <div className="flex">
            <Button onClick={() => handleReset()}>
              <Image src="/icons/check.svg" alt="" width={16} height={16} />
              리셋
            </Button>
            <Button onClick={() => handleSave()} disabled={isSaving} className="ml-2">
              <Image width={12} height={12} src="/icons/check.svg" alt="" />
              {isSaving ? "저장 중" : "저장"}
            </Button>
            <Button
              onClick={() => {
                if (currentData) {
                  handleDeleteImage(currentData);
                }
              }}
              className="ml-2"
            >
              삭제
            </Button>
          </div>
        </div>
        <AnnotationThumbnails
          items={projectData}
          onClick={handleThumbnailClick}
          selected={selectedThumbnailIndex !== null ? selectedThumbnailIndex : 0}
        />
      </div>
      {/* 모달 주석 해제시 아래 코드 사용
      <Dialog onClose={() => setIsBatchObjects(false)} title="테스트 모달">
        <div className="form">
          <div className="flex items-center justify-between">
            <input
              type="number"
              min={0}
              max={1000}
              value={batchQuantity}
              placeholder="생성할 객체의 [개수]를 입력해주세요."
              onChange={(e) => setBatchQuantity(Number(e.target.value))}
              className="flex-1 bg-background text-white border-0 p-[0_0.5rem] h-8 rounded-full focus:outline-2 focus:outline-primary"
            />
            <Button onClick={handleBatchCreate} className="ml-2">
              생성
            </Button>
          </div>
          <div className="text-xxs mt-2">일괄 생성 가능한 자동 객체의 수는 최대 1,000개 입니다.</div>
        </div>
      </Dialog>
      */}
    </>
  );
};

export default ImageAnnotator;
