import { useCallback, useEffect, useRef } from "react";
import type { IMaskingPoint, IDragMasking } from "types/catalog";
import { polygonClamp } from "utils/catalog/catalog";
import { useAnnotationState } from "./useAnnotationState";
import { useCatalogStore } from "store/catalog";

/**
 * @docHint
 * @purpose useMaskingControls 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain catalog
 * @scope feature
 */

const useMaskingControls = () => {
  const { currentMode, scale, containerRef, oriImageSize } = useAnnotationState();
  const {
    points,
    setPoints,
    polygons,
    setPolygons,
    selectedPolygonIndex,
    setSelectedPolygonIndex,
    setDraggingPolygon,
    setIsSaved,
  } = useCatalogStore();

  // 드래그 상태를 추적하는 ref
  const isDraggingRef = useRef(false);

  // 드래그 상태를 ref로 관리
  const draggingRef = useRef<IDragMasking | null>(null);

  // 컨테이너 내부 좌표로 변환하는 유틸리티 함수
  const getRelativeCoordinates = useCallback(
    (clientX: number, clientY: number): IMaskingPoint => {
      if (!containerRef.current) {
        return { x: 0, y: 0 };
      }
      const containerRect = containerRef.current.getBoundingClientRect();
      return {
        x: (clientX - containerRect.left) / scale,
        y: (clientY - containerRect.top) / scale,
      };
    },
    [containerRef, scale]
  );

  // 마우스 클릭 시 점 추가
  const handleMouseClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (currentMode === "masking") {
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          return;
        }

        const { clientX, clientY } = e;
        const newPoint = getRelativeCoordinates(clientX, clientY);

        // 클램핑 적용
        const clampedPoint = {
          x: polygonClamp(newPoint.x, 0, oriImageSize!.width),
          y: polygonClamp(newPoint.y, 0, oriImageSize!.height),
        };

        // 최초 포인트와의 거리 계산
        if (points.length > 2) {
          // 최소 3개의 포인트가 있어야 폴리곤을 닫을 수 있음
          const firstPoint = points[0];
          const distance = Math.sqrt(
            Math.pow(firstPoint.x - clampedPoint.x, 2) + Math.pow(firstPoint.y - clampedPoint.y, 2)
          );

          const CLOSE_DISTANCE = 10; // 클로징 거리 범위 (픽셀 단위)

          if (distance < CLOSE_DISTANCE) {
            // 자동으로 폴리곤 닫기
            setPolygons([...polygons, [...points, firstPoint]]); // 첫 포인트를 다시 추가하여 폴리곤 닫기
            setPoints([]);
            setSelectedPolygonIndex(polygons.length);
            return;
          }
        }

        setPoints([...points, clampedPoint]);
        setSelectedPolygonIndex(null);
        setIsSaved(false);
      }
    },
    [
      currentMode,
      getRelativeCoordinates,
      points,
      polygons,
      setPolygons,
      setPoints,
      setSelectedPolygonIndex,
      setIsSaved,
      oriImageSize,
    ]
  );

  // 폴리곤 클릭 시 해당 폴리곤 선택
  const handlePolygonClick = useCallback(
    (index: number) => {
      // 폴리곤 생성 중일 때는 선택하지 않음
      if (points.length > 0) {
        return;
      }
      setSelectedPolygonIndex(index);
    },
    [points.length, setSelectedPolygonIndex]
  );

  // 선택된 폴리곤 삭제
  const handleDeletePolygon = useCallback(() => {
    if (points.length > 0) {
      // 폴리곤을 그리는 중이라면 현재 점들을 초기화하여 폴리곤 삭제
      setPoints([]);
    } else if (selectedPolygonIndex !== null) {
      // 선택된 폴리곤이 있다면 삭제
      setPolygons((prevPolygons) => prevPolygons.filter((_, index) => index !== selectedPolygonIndex));
      setSelectedPolygonIndex(null);
    }
    setIsSaved(false);
  }, [points.length, selectedPolygonIndex, setPoints, setPolygons, setSelectedPolygonIndex, setIsSaved]);

  // 폴리곤 마우스 다운 이벤트
  const handlePolygonMouseDown = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>, index: number) => {
      if (selectedPolygonIndex !== index) {
        handlePolygonClick(index);
      }

      const { clientX, clientY } = e;
      draggingRef.current = {
        index,
        lastX: clientX,
        lastY: clientY,
      };

      isDraggingRef.current = false; // 드래그 시작 시 플래그 초기화

      e.stopPropagation(); // 이벤트 전파 방지
    },
    [selectedPolygonIndex, handlePolygonClick]
  );

  const handlePolygonMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingRef.current || !oriImageSize) return;

      const { index, lastX, lastY } = draggingRef.current;
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;

      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
        isDraggingRef.current = true;
      }

      // 계산하려는 새로운 delta
      let newDeltaX = deltaX / scale;
      let newDeltaY = deltaY / scale;

      const polygon = polygons[index];
      if (!polygon) return;

      // 폴리곤의 모든 점에 새로운 delta를 적용했을 때 이미지 경계를 벗어나는지 확인
      const minX = Math.min(...polygon.map((point) => point.x));
      const maxX = Math.max(...polygon.map((point) => point.x));
      const minY = Math.min(...polygon.map((point) => point.y));
      const maxY = Math.max(...polygon.map((point) => point.y));

      // deltaX 조정
      if (minX + newDeltaX < 0) {
        newDeltaX = -minX;
      } else if (maxX + newDeltaX > oriImageSize.width) {
        newDeltaX = oriImageSize.width - maxX;
      }

      // deltaY 조정
      if (minY + newDeltaY < 0) {
        newDeltaY = -minY;
      } else if (maxY + newDeltaY > oriImageSize.height) {
        newDeltaY = oriImageSize.height - maxY;
      }

      // delta가 조정되었는지 확인
      const adjusted = newDeltaX !== deltaX / scale || newDeltaY !== deltaY / scale;

      if (adjusted) {
        // delta를 다시 계산하여 마지막 위치 업데이트
        draggingRef.current = {
          ...draggingRef.current,
          lastX: lastX + newDeltaX * scale,
          lastY: lastY + newDeltaY * scale,
        };
      } else {
        // delta가 조정되지 않았다면 마지막 위치 업데이트
        draggingRef.current = {
          ...draggingRef.current,
          lastX: e.clientX,
          lastY: e.clientY,
        };
      }

      setPolygons((prevPolygons) => {
        const newPolygons = [...prevPolygons];
        const polygonToMove = newPolygons[index];

        if (!polygonToMove) return prevPolygons;

        const updatedPolygon = polygonToMove.map((point) => ({
          x: point.x + newDeltaX,
          y: point.y + newDeltaY,
        }));

        newPolygons[index] = updatedPolygon;
        return newPolygons;
      });
      setIsSaved(false);
    },
    [scale, setPolygons, oriImageSize, polygons, setIsSaved]
  );

  const handlePolygonMouseUp = useCallback(() => {
    draggingRef.current = null;
    setDraggingPolygon(null);
  }, [setDraggingPolygon]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      handlePolygonMouseMove(e);
    };
    const handleUp = () => {
      handlePolygonMouseUp();
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [handlePolygonMouseMove, handlePolygonMouseUp]);

  return {
    handleMouseClick,
    handlePolygonClick,
    handleDeletePolygon,
    handlePolygonMouseDown,
  };
};

export default useMaskingControls;
