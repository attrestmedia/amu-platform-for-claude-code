import { useCallback, useState } from "react";
import { DEFAULT_SPACING } from "consts/catalog";
import type { ICategoryList } from "types/catalog";
import { useAnnotationState } from "./useAnnotationState";
import { useCatalogStore } from "store/catalog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveProductData } from "libs/services/catalog";
import { logger } from "utils/log";
import { dialog } from "@amu-labs/ui";
import { toast } from "sonner";

/**
 * @docHint
 * @purpose useAnnotationControls 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain catalog
 * @scope feature
 */

// 타입 정의
interface UseAnnotationControlsParams {
  data: ICategoryList;
}

const useAnnotationControls = ({ data }: UseAnnotationControlsParams) => {
  const {
    userId,
    categoryName,
    currentMode,
    selectedThumbnailIndex,
    setSelectedThumbnailIndex,
    currentColor,
    currentClassType,
    selectedClassLabel,
    setCurrentPage,
  } = useAnnotationState();

  const {
    setCurrentData,
    setAnnotations,
    selectedAnnotationIndex,
    setSelectedAnnotationIndex,
    setIsSaved,
    points,
    setPoints,
    polygons,
    isSaved,
    annotations,
  } = useCatalogStore();

  // 로컬 상태 관리
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const queryClient = useQueryClient();

  // Mutation 설정
  interface MutationVariables {
    userId: string;
    data: unknown;
    categoryName: string;
    subCategoryId: string;
    isAutoSave: boolean; // saveFlag 추가
  }

  const mutation = useMutation<void, Error, MutationVariables>({
    mutationFn: (newData: { userId: string; data: unknown; categoryName: string; subCategoryId: string }) =>
      saveProductData(newData.userId, newData.data, newData.categoryName, newData.subCategoryId),
    onSuccess: (data, variables) => {
      logger.log(">> save mutation => ", data, variables.userId, variables.categoryName);
      setIsSaved(true);
      if (variables.userId && variables.categoryName) {
        queryClient.invalidateQueries({ queryKey: ["annotations", variables.userId, variables.categoryName] });
      } else {
        logger.warn("invalidateQueries를 호출할 수 없습니다. userId 또는 categoryName이 정의되지 않았습니다.");
      }
      if (!variables.isAutoSave) {
        toast.success("어노테이션이 성공적으로 저장되었습니다.");
      }
    },
    onError: (error: unknown) => {
      logger.error("어노테이션 저장 중 오류 발생:", error);
      void dialog.alert({ variant: "danger", message: "어노테이션 저장에 실패했습니다." });
    },
  });

  // 어노테이션 저장
  const handleSave = useCallback(
    async (isAutoSave: boolean = false) => {
      const { currentData, projectData, annotations, polygons } = useCatalogStore.getState(); // 최근 업데이트 된 데이터를 직접 가져옴

      if (data && data.id) {
        logger.log("[useAnnotationControls] handleSave => ", data, currentData);
        logger.log(`[useAnnotationControls] userId => ${userId}, categoryName => ${categoryName}`);

        if (!userId || !categoryName) {
          logger.warn("userId 또는 categoryName이 정의되지 않았습니다.");
          void dialog.alert({ variant: "danger", message: "저장할 수 없습니다. 사용자 ID 또는 카테고리가 정의되지 않았습니다." });
          return;
        }

        setIsSaving(true);

        const subCategoryId = data.id;
        const subCategoryName = data.name;
        const imageId = currentData ? currentData.id : null;

        if (!imageId) {
          logger.warn("해당 imageId를 가진 데이터가 존재하지 않습니다.");
          void dialog.alert({ variant: "danger", message: "저장할 수 없습니다. 해당 imageId를 가진 데이터가 존재하지 않습니다." });
          setIsSaving(false);
          return;
        }

        const existingImage = projectData.find((item) => item.id === imageId);

        if (!existingImage) {
          logger.warn("해당 이미지 데이터를 찾을 수 없습니다.");
          void dialog.alert({ variant: "danger", message: "저장할 수 없습니다. 해당 이미지 데이터를 찾을 수 없습니다." });
          setIsSaving(false);
          return;
        }

        // MongoDB의 데이터 구조에 맞게 payload 구성
        const payload = {
          [subCategoryId]: {
            id: subCategoryId,
            name: subCategoryName,
            list: projectData.map((item) => {
              if (item.id === imageId) {
                return {
                  ...item,
                  annotations: annotations,
                  maskings: polygons,
                };
              }
              return item;
            }),
          },
        };

        try {
          await mutation.mutateAsync({
            userId,
            data: payload,
            categoryName: categoryName,
            subCategoryId: subCategoryId,
            isAutoSave,
          });
        } catch {
          // 에러는 onError에서 처리됨
        } finally {
          setIsSaving(false);
        }
      } else {
        logger.warn("저장할 데이터가 없습니다.");
      }
    },
    [data, userId, categoryName, mutation],
  );

  // 이전 프레임으로 이동
  const handlePreviousFrame = useCallback(async () => {
    if (selectedThumbnailIndex !== null && selectedThumbnailIndex > 0) {
      if (!isSaved && annotations.length > 0) {
        await handleSave(true);
        setIsSaved(true);
      }

      setSelectedThumbnailIndex((prevIndex) => {
        const newIndex = prevIndex !== null ? prevIndex - 1 : 0;
        setCurrentData(data.list[newIndex]); // selectedThumbnailIndex가 업데이트된 후 현재 데이터 업데이트
        return newIndex;
      });
    }
  }, [
    selectedThumbnailIndex,
    setSelectedThumbnailIndex,
    setCurrentData,
    data,
    handleSave,
    isSaved,
    annotations.length,
    setIsSaved,
  ]);

  // 다음 프레임으로 이동
  const handleNextFrame = useCallback(async () => {
    if (selectedThumbnailIndex !== null && selectedThumbnailIndex < data.list.length - 1) {
      if (!isSaved && annotations.length > 0) {
        await handleSave(true);
        setIsSaved(true);
      }

      setSelectedThumbnailIndex((prevIndex) => {
        const newIndex = prevIndex !== null ? prevIndex + 1 : data.list.length - 1;
        setCurrentData(data.list[newIndex]); // selectedThumbnailIndex가 업데이트된 후 현재 데이터 업데이트
        return newIndex;
      });
    }
  }, [
    selectedThumbnailIndex,
    setSelectedThumbnailIndex,
    setCurrentData,
    data,
    handleSave,
    isSaved,
    annotations.length,
    setIsSaved,
  ]);

  // 처음 프레임으로 이동
  const handleFirstFrame = useCallback(async () => {
    if (data.list.length > 0) {
      if (!isSaved && annotations.length > 0) {
        await handleSave(true);
        setIsSaved(true);
      }

      setSelectedThumbnailIndex(() => {
        setCurrentData(data.list[0]); // 첫 번째 프레임 데이터로 업데이트
        return 0; // 첫 번째 프레임으로 이동
      });
    }
  }, [setSelectedThumbnailIndex, setCurrentData, data, handleSave, isSaved, annotations.length, setIsSaved]);

  // 마지막 프레임으로 이동
  const handleEndFrame = useCallback(async () => {
    if (data.list.length > 0) {
      if (!isSaved && annotations.length > 0) {
        await handleSave(true);
        setIsSaved(true);
      }

      setSelectedThumbnailIndex(() => {
        setCurrentData(data.list[data.list.length - 1]); // 첫 번째 프레임 데이터로 업데이트
        return data.list.length - 1; // 첫 번째 프레임으로 이동
      });
    }
  }, [setSelectedThumbnailIndex, setCurrentData, data, handleSave, isSaved, annotations.length, setIsSaved]);

  // 어노테이션 추가
  const handleAddAnnotation = useCallback(() => {
    setAnnotations((prevAnnotations) => {
      // 기본 x, y 값 설정
      let newX = 50;
      let newY = 50;
      let newWidth = 100;
      let newHeight = 100;

      // 선택된 annotation이 있는지 확인하고, 그 위치에서 10px 떨어진 위치로 새로운 좌표 설정
      if (selectedAnnotationIndex !== null && prevAnnotations[selectedAnnotationIndex]) {
        const selectedAnnotation = prevAnnotations[selectedAnnotationIndex];
        newX = selectedAnnotation.x + DEFAULT_SPACING;
        newY = selectedAnnotation.y + DEFAULT_SPACING;
        newWidth = selectedAnnotation.width;
        newHeight = selectedAnnotation.height;
      }

      const newAnnotation = {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
        label: selectedClassLabel,
        color: currentColor,
        classType: currentClassType,
      };

      const updatedAnnotations = [...prevAnnotations, newAnnotation];
      setSelectedAnnotationIndex(updatedAnnotations.length - 1); // 새로 추가된 annotation의 인덱스를 선택
      setIsSaved(false); // 어노테이션이 변경되면 저장되지 않은 상태로 설정
      return updatedAnnotations;
    });
  }, [
    selectedAnnotationIndex,
    currentClassType,
    currentColor,
    selectedClassLabel,
    setAnnotations,
    setSelectedAnnotationIndex,
    setIsSaved,
  ]);

  // 어노테이션 삭제
  const handleDeleteAnnotation = useCallback(() => {
    if (selectedAnnotationIndex !== null) {
      setAnnotations((prevAnnotations) => {
        const updatedAnnotations = prevAnnotations.filter((_, index) => index !== selectedAnnotationIndex);

        // 가장 최근에 생성된 어노테이션으로 선택 인덱스를 설정
        if (updatedAnnotations.length > 0) {
          setSelectedAnnotationIndex(updatedAnnotations.length - 1);
        } else {
          setSelectedAnnotationIndex(null);
        }
        setIsSaved(false); // 어노테이션이 변경되면 저장되지 않은 상태로 설정
        return updatedAnnotations;
      });
    }
  }, [selectedAnnotationIndex, setAnnotations, setSelectedAnnotationIndex, setIsSaved]);

  // 어노테이션에 클래스 추가
  const handleAddClassToAnnotation = useCallback(
    (className: string) => {
      if (selectedAnnotationIndex !== null) {
        setAnnotations((prevAnnotations) => {
          const updatedAnnotations = [...prevAnnotations];
          updatedAnnotations[selectedAnnotationIndex] = {
            ...updatedAnnotations[selectedAnnotationIndex],
            label: className,
          };
          return updatedAnnotations;
        });

        setSelectedAnnotationIndex(selectedAnnotationIndex);
        setIsSaved(false); // 어노테이션이 변경되면 저장되지 않은 상태로 설정
      }
    },
    [selectedAnnotationIndex, setAnnotations, setSelectedAnnotationIndex, setIsSaved],
  );

  // 프레임 또는 페이지 이동 시 생성 중인 마스트 제거
  const handleResetProgressMasking = useCallback(() => {
    if (currentMode === "masking" && points.length > 0) {
      setPoints([]); // 진행 중인 마스킹 포인트 초기화
      // alert("진행 중인 마스킹이 취소되었습니다.");
    }
  }, [currentMode, points.length, setPoints]);

  // 페이지 이동
  const handlePageChange = useCallback(
    async (page: number) => {
      handleResetProgressMasking(); // 진행 중인 마스킹이 있을 경우 초기화

      logger.log(`>> handlePageChange => isSaved: ${isSaved}`);
      logger.log(`>> handlePageChange => annotations: ${annotations.length}, polygons: ${polygons.length}`);

      if (!isSaved && (annotations.length > 0 || polygons.length > 0)) {
        await handleSave(true);
        setIsSaved(true);
      }
      setCurrentPage(page);
    },
    [
      handleResetProgressMasking,
      handleSave,
      isSaved,
      annotations.length,
      polygons.length,
      setCurrentPage,
      setIsSaved,
    ],
  );

  return {
    handlePreviousFrame,
    handleNextFrame,
    handleAddAnnotation,
    handleDeleteAnnotation,
    handleAddClassToAnnotation,
    handleFirstFrame,
    handleEndFrame,
    handleResetProgressMasking,
    handleSave,
    handlePageChange,
    isSaving,
  };
};

export default useAnnotationControls;
