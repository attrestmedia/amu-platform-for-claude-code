import { useCallback } from "react";
import { DEFAULT_SPACING, CLASS_KEY_MAP_DATA } from "consts/catalog";
import type { ICategory, ICategoryList } from "types/catalog/annotation";
import { logger } from "utils/log";
import { labelMappingClassType } from "utils/catalog/catalog";
import { useAnnotationState } from "./useAnnotationState";
import useAnnotationControls from "./useAnnotationControls";
import useMaskingControls from "./useMaskingControls";
import { useCatalogStore } from "store/catalog";
import { dialog } from "@amu-labs/ui";
import type { handleResetProps } from "components/template/image-annotator";

/**
 * @docHint
 * @purpose useAnnotationKeyControls 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain catalog
 * @scope feature
 */

interface UseAnnotationKeyControlsParams {
  data: ICategoryList;
  handleReset: (props?: Partial<handleResetProps>) => void;
  handleResetAll: () => void;
  handleDeleteImage: (currentData: ICategory) => void;
}

const useAnnotationKeyControls = ({
  data,
  handleReset,
  handleResetAll,
  handleDeleteImage,
}: UseAnnotationKeyControlsParams) => {
  const {
    setCurrentClassType,
    currentPage,
    totalPage,
    scale,
    setIsCrosshair,
    currentMode,
    setCurrentMode,
    selectedThumbnailIndex,
    scaleImageSize,
  } = useAnnotationState();

  const {
    annotations,
    setAnnotations,
    selectedAnnotationIndex,
    setSelectedAnnotationIndex,
    clonedAnnotation,
    setClonedAnnotation,
    polygons,
    setPolygons,
    selectedPolygonIndex,
    setSelectedPolygonIndex,
    setIsSaved,
    currentData,
    projectData,
    setProjectData,
  } = useCatalogStore();

  const {
    handleSave,
    handleAddAnnotation,
    handleDeleteAnnotation,
    handlePreviousFrame,
    handleNextFrame,
    handleFirstFrame,
    handleEndFrame,
    handleAddClassToAnnotation,
    handlePageChange,
  } = useAnnotationControls({ data });

  const { handleDeletePolygon } = useMaskingControls();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      try {
        // 현재 포커스된 요소가 input 또는 textarea인 경우, 이벤트 무시
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement?.getAttribute("contenteditable") === "true"
        ) {
          return;
        }

        const lowerKey = e.key.toLowerCase();

        // 특정 키에 대해서만 preventDefault 호출
        const keysToPreventDefault = [
          "`",
          "a",
          "c",
          "e",
          "f",
          "g",
          "i",
          "m",
          "r",
          "s",
          "t",
          "u",
          "v",
          "w",
          "x",
          "y",
          "z",
          "f1",
          "tab",
          "delete",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ];
        if (keysToPreventDefault.includes(lowerKey) || keysToPreventDefault.includes(e.key)) {
          logger.log(`>> preventDefault for "${lowerKey}" Key`);
          e.preventDefault();
        }

        // Numbering Key Control
        const mapping = CLASS_KEY_MAP_DATA.find((mapping) => mapping.key === lowerKey);

        if (mapping && !e.shiftKey && !e.ctrlKey) {
          setCurrentClassType(mapping.key);
          handleAddClassToAnnotation(labelMappingClassType(mapping.key));
          return;
        }

        // Previous Page
        if (lowerKey === "t" && !e.shiftKey && !e.ctrlKey) {
          if (currentPage > 1) {
            handlePageChange(currentPage - 1);
          }
          return;
        }

        // Next Page
        if (lowerKey === "y" && !e.shiftKey && !e.ctrlKey) {
          if (currentPage < totalPage) {
            handlePageChange(currentPage + 1);
          }
          return;
        }

        // Previous Frame
        if (lowerKey === "w" && !e.shiftKey && !e.ctrlKey) {
          handlePreviousFrame();
          return;
        }

        // Next Frame
        if (lowerKey === "e" && !e.shiftKey && !e.ctrlKey) {
          handleNextFrame();
          return;
        }

        // First Frame
        if (lowerKey === "u" && !e.shiftKey && !e.ctrlKey) {
          handleFirstFrame();
          return;
        }

        // End Frame
        if (lowerKey === "i" && !e.shiftKey && !e.ctrlKey) {
          handleEndFrame();
          return;
        }

        // Delete Annotation
        if ((lowerKey === "x" || lowerKey === "delete") && !e.shiftKey && !e.ctrlKey) {
          if (currentMode === "masking") {
            handleDeletePolygon();
          } else {
            handleDeleteAnnotation();
          }
          return;
        }

        // 현재 선택된 이미지가 있을 경우에만 삭제 처리
        if (lowerKey === "f1" && !e.shiftKey && !e.ctrlKey) {
          if (currentData) {
            handleDeleteImage(currentData);
          } else {
            void dialog.alert("선택된 이미지가 없습니다.");
          }
          return;
        }

        // 프레임 리셋 및 취소
        if (lowerKey === "r" && !e.shiftKey && !e.ctrlKey) {
          handleReset();
          return;
        }

        // 전체 프레임 리셋 처리
        if (lowerKey === "r" && e.shiftKey && !e.ctrlKey) {
          handleResetAll();
          return;
        }

        // Tab 또는 Shift + Tab 키로 어노테이션을 순차적으로 선택
        if (lowerKey === "tab" && !e.ctrlKey) {
          if (annotations.length > 0) {
            if (e.shiftKey) {
              // Shift + Tab: 이전 어노테이션 선택
              if (selectedAnnotationIndex === null) {
                setSelectedAnnotationIndex(annotations.length - 1);
              } else {
                const prevIndex = (selectedAnnotationIndex - 1 + annotations.length) % annotations.length;
                setSelectedAnnotationIndex(prevIndex);
              }
            } else {
              // Tab: 다음 어노테이션 선택
              if (selectedAnnotationIndex === null) {
                setSelectedAnnotationIndex(0);
              } else {
                const nextIndex = (selectedAnnotationIndex + 1) % annotations.length;
                setSelectedAnnotationIndex(nextIndex);
              }
            }
          }
          return;
        }

        // 객체 또는 마스킹 모드 선택
        if (lowerKey === "a" && !e.shiftKey) {
          if (e.ctrlKey) {
            handleAddAnnotation();
          } else {
            setCurrentMode("object");
            setSelectedPolygonIndex(null);
          }
          return;
        }

        if (lowerKey === "m" && !e.shiftKey && !e.ctrlKey) {
          setCurrentMode("masking");
          return;
        }

        // 저장하기
        if (lowerKey === "s" && !e.shiftKey && !e.ctrlKey) {
          handleSave();
          return;
        }

        // 현재 선택된 annotation-box를 복사
        if (lowerKey === "c" && !e.shiftKey && !e.ctrlKey) {
          if (selectedAnnotationIndex !== null && annotations[selectedAnnotationIndex]) {
            const selectedAnnotation = annotations[selectedAnnotationIndex];
            const newAnnotation = {
              ...selectedAnnotation,
              x: selectedAnnotation.x + DEFAULT_SPACING, // 복사 시 약간 이동시키기 위해 x와 y 값을 조정
              y: selectedAnnotation.y + DEFAULT_SPACING,
            };
            setClonedAnnotation(newAnnotation);
          }
          return;
        }

        // 복사된 annotation-box 붙여넣기
        if (lowerKey === "v" && !e.shiftKey && !e.ctrlKey) {
          if (clonedAnnotation) {
            const newAnnotation = {
              ...clonedAnnotation,
              x: clonedAnnotation.x + DEFAULT_SPACING, // 복사 시 약간 이동시키기 위해 x와 y 값을 조정
              y: clonedAnnotation.y + DEFAULT_SPACING,
            };
            setClonedAnnotation(newAnnotation);
            setAnnotations((prevAnnotations) => {
              const updatedAnnotations = [...prevAnnotations, newAnnotation];
              setSelectedAnnotationIndex(updatedAnnotations.length - 1); // 새로 추가된 annotation을 선택
              return updatedAnnotations;
            });
          }
          return;
        }

        if (lowerKey === "z" && !e.shiftKey && !e.ctrlKey) {
          if (selectedThumbnailIndex !== null && selectedThumbnailIndex > 0) {
            const prevFrameIndex = selectedThumbnailIndex - 1;
            const prevFrame = projectData[prevFrameIndex];

            if (prevFrame) {
              const { annotations: prevAnnotations = [], maskings: prevPolygons = [] } = prevFrame;

              // 현재 어노테이션과 마스킹 업데이트
              setAnnotations([...prevAnnotations]); // 새로운 배열로 복사
              setPolygons([...prevPolygons]); // 새로운 배열로 복사

              // current frame의 projectData 업데이트
              const updatedProjectData = projectData.map((frame, index) => {
                if (index === selectedThumbnailIndex) {
                  return {
                    ...frame,
                    annotations: [...prevAnnotations],
                    maskings: [...prevPolygons],
                  };
                }
                return frame;
              });

              setProjectData(updatedProjectData);

              // selectedAnnotationIndex 업데이트
              setSelectedAnnotationIndex(prevAnnotations.length > 0 ? 0 : null);

              // 어노테이션이 변경되었음을 표시 (필요 시)
              setIsSaved(false);

              logger.log(
                `프레임 ${prevFrameIndex}에서 프레임 ${selectedThumbnailIndex}로 어노테이션과 마스킹을 복사했습니다.`,
              );
            } else {
              void dialog.alert("이전 프레임 데이터가 없습니다.");
            }
          } else {
            void dialog.alert("복사할 이전 프레임이 없습니다.");
          }
          return;
        }

        // 백틱키(`)로 크로스라인 상태 토글
        if (lowerKey === "`" && !e.shiftKey && !e.ctrlKey) {
          setIsCrosshair((prevState) => !prevState);
          return;
        }

        // 어노테이션 방향키 컨트롤(shift + ctrl, default) 및 사이즈(default) 조절
        if (currentMode === "object" && selectedAnnotationIndex !== null && annotations[selectedAnnotationIndex]) {
          const moveDistance = 5; // 크기 및 이동 거리
          const updatedAnnotations = [...annotations];
          const selectedAnnotation = updatedAnnotations[selectedAnnotationIndex];

          const centerX = selectedAnnotation.x + selectedAnnotation.width / 2;
          const centerY = selectedAnnotation.y + selectedAnnotation.height / 2;

          // 크기를 0.1배 키움
          if (lowerKey === "g" && !e.shiftKey && !e.ctrlKey) {
            selectedAnnotation.width *= 1.02;
            selectedAnnotation.height *= 1.02;

            // 새 크기에 맞춰 중앙 위치 조정
            selectedAnnotation.x = centerX - selectedAnnotation.width / 2;
            selectedAnnotation.y = centerY - selectedAnnotation.height / 2;
            setAnnotations(updatedAnnotations);
            return;
          }

          // 크기를 0.1배 줄임
          if (lowerKey === "f" && !e.shiftKey && !e.ctrlKey) {
            selectedAnnotation.width *= 0.98;
            selectedAnnotation.height *= 0.98;

            // 새 크기에 맞춰 중앙 위치 조정
            selectedAnnotation.x = centerX - selectedAnnotation.width / 2;
            selectedAnnotation.y = centerY - selectedAnnotation.height / 2;
            setAnnotations(updatedAnnotations);
          }

          if (e.shiftKey || e.ctrlKey) {
            const directionAdjustment = moveDistance / scale;

            // Shift 또는 Ctrl + 방향키로 어노테이션 크기 조절
            switch (lowerKey) {
              case "arrowup":
                if (e.ctrlKey) {
                  // Ctrl + Up: 상단을 위쪽으로 이동
                  selectedAnnotation.y -= directionAdjustment;
                  selectedAnnotation.height += directionAdjustment;
                } else {
                  // Shift + Up: 상단을 줄임
                  selectedAnnotation.height -= directionAdjustment;
                }
                break;
              case "arrowdown":
                if (e.ctrlKey) {
                  // Ctrl + Down: 상단을 아래쪽으로 이동
                  selectedAnnotation.y += directionAdjustment;
                  selectedAnnotation.height -= directionAdjustment;
                } else {
                  // Shift + Down: 하단을 늘림
                  selectedAnnotation.height += directionAdjustment;
                }
                break;
              case "arrowleft":
                if (e.ctrlKey) {
                  // Ctrl + Left: 왼쪽을 왼쪽으로 이동
                  selectedAnnotation.x -= directionAdjustment;
                  selectedAnnotation.width += directionAdjustment;
                } else {
                  // Shift + Left: 왼쪽을 줄임
                  selectedAnnotation.width -= directionAdjustment;
                }
                break;
              case "arrowright":
                if (e.ctrlKey) {
                  // Ctrl + Right: 왼쪽을 오른쪽으로 이동
                  selectedAnnotation.x += directionAdjustment;
                  selectedAnnotation.width -= directionAdjustment;
                } else {
                  // Shift + Right: 오른쪽을 늘림
                  selectedAnnotation.width += directionAdjustment;
                }
                break;
              default:
                return;
            }

            setAnnotations(updatedAnnotations);
            return;
          } else {
            // 방향키로 선택된 어노테이션 위치 이동
            let newX = selectedAnnotation.x;
            let newY = selectedAnnotation.y;

            switch (lowerKey) {
              case "arrowup":
                newY -= moveDistance / scale;
                break;
              case "arrowdown":
                newY += moveDistance / scale;
                break;
              case "arrowleft":
                newX -= moveDistance / scale;
                break;
              case "arrowright":
                newX += moveDistance / scale;
                break;
              default:
                return; // Arrow key 외의 키는 무시
            }

            // 이미지 크기 정보가 존재할 경우 경계 체크
            if (scaleImageSize) {
              const imageWidth = scaleImageSize.width / scale;
              const imageHeight = scaleImageSize.height / scale;

              // 클램핑을 통해 경계를 초과하지 않도록 조정
              newX = Math.max(0, Math.min(newX, imageWidth - selectedAnnotation.width));
              newY = Math.max(0, Math.min(newY, imageHeight - selectedAnnotation.height));

              // 어노테이션의 새로운 위치가 경계를 초과하는지 확인
              if (
                newX < 0 ||
                newY < 0 ||
                newX + selectedAnnotation.width > imageWidth ||
                newY + selectedAnnotation.height > imageHeight
              ) {
                // 이동 제한
                logger.log("이동 제한: 경계를 벗어났습니다.");
                return;
              } else {
                // 유효한 이동인 경우 업데이트
                selectedAnnotation.x = newX;
                selectedAnnotation.y = newY;
                setAnnotations(updatedAnnotations);
                setIsSaved(false); // 어노테이션이 변경되었음을 표시
              }
            } else {
              // 이미지 크기 정보가 없을 경우 기본 이동
              selectedAnnotation.x = newX;
              selectedAnnotation.y = newY;
              setAnnotations(updatedAnnotations);
              setIsSaved(false);
            }
            return;
          }
        }

        // 폴리곤 이동 처리
        if (currentMode === "masking" && selectedPolygonIndex !== null && polygons[selectedPolygonIndex]) {
          const moveAmount = 5 / scale; // 이동할 거리 (scale을 고려)

          setPolygons((prevPolygons) => {
            const newPolygons = [...prevPolygons];
            const polygon = newPolygons[selectedPolygonIndex];

            if (!polygon) return prevPolygons;

            // 잠정적으로 이동한 폴리곤을 생성
            const tentativeUpdatedPolygon = polygon.map((point) => {
              switch (lowerKey) {
                case "arrowup":
                  return { ...point, y: point.y - moveAmount };
                case "arrowdown":
                  return { ...point, y: point.y + moveAmount };
                case "arrowleft":
                  return { ...point, x: point.x - moveAmount };
                case "arrowright":
                  return { ...point, x: point.x + moveAmount };
                default:
                  return point;
              }
            });

            // 이미지 크기 정보가 존재할 경우 경계 체크
            if (scaleImageSize) {
              const imageWidth = scaleImageSize.width / scale;
              const imageHeight = scaleImageSize.height / scale;

              // 폴리곤의 모든 점이 이미지 경계 내에 있는지 확인
              const isWithinBounds = tentativeUpdatedPolygon.every(
                (point) => point.x >= 0 && point.y >= 0 && point.x <= imageWidth && point.y <= imageHeight,
              );

              if (!isWithinBounds) {
                // 경계를 벗어나면 이동을 무시
                logger.log("폴리곤 이동 제한: 경계를 벗어났습니다.");
                return prevPolygons;
              }
            }

            // 유효한 이동인 경우 업데이트
            newPolygons[selectedPolygonIndex] = tentativeUpdatedPolygon;
            return newPolygons;
          });

          // 어노테이션 저장 상태 업데이트 (필요 시)
          setIsSaved(false);

          return;
        }
      } catch (error) {
        logger.error("키 핸들링 중 오류 발생:", error);
      }
    },
    [
      currentPage,
      totalPage,
      annotations,
      handleReset,
      handleResetAll,
      handlePreviousFrame,
      handleNextFrame,
      handleFirstFrame,
      handleEndFrame,
      handlePageChange,
      currentMode,
      handleDeleteAnnotation,
      handleDeleteImage,
      handleDeletePolygon,
      handleAddClassToAnnotation,
      currentData,
      projectData,
      selectedThumbnailIndex,
      selectedAnnotationIndex,
      selectedPolygonIndex,
      polygons,
      scale,
      scaleImageSize,
      setAnnotations,
      setPolygons,
      setProjectData,
      setSelectedAnnotationIndex,
      setIsSaved,
      setCurrentMode,
      handleAddAnnotation,
      handleSave,
      setCurrentClassType,
      setClonedAnnotation,
      clonedAnnotation,
      setIsCrosshair,
      setSelectedPolygonIndex,
    ],
  );

  return {
    handleKeyDown,
  };
};

export default useAnnotationKeyControls;
