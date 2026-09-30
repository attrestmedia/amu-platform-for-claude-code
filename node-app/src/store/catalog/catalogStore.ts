import { create } from "zustand";
import type { IAnnotation, ICategory, IMaskingPoint, IDragMasking, ICategoryStatus } from "types/catalog";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain catalog
 * @scope client
 */

// setter 함수들이 새로운 값이나 업데이트 함수를 모두 받을 수 있도록 StateUpdater<T> 타입 정의
type StateUpdater<T> = T | ((prevState: T) => T);

interface CatalogStoreState {
  currentData: ICategory | null; // 현재 프레임의 데이터 정보 :: current frame data
  setCurrentData: (data: StateUpdater<ICategory | null>) => void;

  projectData: ICategory[]; // 현재 페이지의 전체 프레임 데이터 : : current page data
  setProjectData: (data: StateUpdater<ICategory[]>) => void;

  selectedAnnotationIndex: number | null; // 현재 선택된 라벨 인덱스
  setSelectedAnnotationIndex: (index: number | null) => void;

  clonedAnnotation: IAnnotation | null; // 복사된 라벨 정보
  setClonedAnnotation: (annotation: IAnnotation | null) => void;

  annotations: IAnnotation[]; // 현재 프레임의 라벨링 데이터
  setAnnotations: (annotations: StateUpdater<IAnnotation[]>) => void;
  updateAnnotation: (index: number, updatedAnnotation: IAnnotation) => void;
  addAnnotation: (annotation: IAnnotation) => void;
  removeAnnotation: (index: number) => void;

  isSaved: boolean; // 라벨링 데이터 저장 여부
  setIsSaved: (saved: boolean) => void;

  statusData: ICategoryStatus[]; // 변경된 데이터 목록
  setStatusData: (data: StateUpdater<ICategoryStatus[]>) => void;
  addStatusData: (data: ICategoryStatus) => void;

  points: IMaskingPoint[]; // 마스킹 생성을 위한 좌표 정보 배열
  setPoints: (points: StateUpdater<IMaskingPoint[]>) => void;
  addPoint: (point: IMaskingPoint) => void;
  clearPoints: () => void;

  polygons: IMaskingPoint[][]; // 그려진 도형들의 점 배열
  setPolygons: (polygons: StateUpdater<IMaskingPoint[][]>) => void;
  addPolygon: (polygon: IMaskingPoint[]) => void;
  removePolygon: (index: number) => void;

  selectedPolygonIndex: number | null; // 선택된 폴리곤의 인덱스
  setSelectedPolygonIndex: (index: StateUpdater<number | null>) => void;

  draggingPolygon: IDragMasking | null; // 드래그 중인 폴리곤
  setDraggingPolygon: (polygon: StateUpdater<IDragMasking | null>) => void;
}

export const useCatalogStore = create<CatalogStoreState>((set) => ({
  currentData: null,
  setCurrentData: (dataOrUpdater) =>
    set((state) => ({
      currentData: typeof dataOrUpdater === "function" ? dataOrUpdater(state.currentData) : dataOrUpdater,
    })),

  projectData: [],
  setProjectData: (dataOrUpdater) =>
    set((state) => ({
      projectData: typeof dataOrUpdater === "function" ? dataOrUpdater(state.projectData) : dataOrUpdater,
    })),

  selectedAnnotationIndex: null,
  setSelectedAnnotationIndex: (index) => set({ selectedAnnotationIndex: index }),

  clonedAnnotation: null,
  setClonedAnnotation: (annotation) => set({ clonedAnnotation: annotation }),

  annotations: [],
  setAnnotations: (annotationsOrUpdater) =>
    set((state) => ({
      annotations:
        typeof annotationsOrUpdater === "function" ? annotationsOrUpdater(state.annotations) : annotationsOrUpdater,
    })),
  updateAnnotation: (index, updatedAnnotation) => {
    set((state) => {
      const annotations = state.annotations.slice();
      annotations[index] = updatedAnnotation;
      return { annotations };
    });
  },
  addAnnotation: (annotation) => {
    set((state) => ({ annotations: [...state.annotations, annotation] }));
  },
  removeAnnotation: (index) => {
    set((state) => {
      const annotations = state.annotations.slice();
      annotations.splice(index, 1);
      return { annotations };
    });
  },

  isSaved: true,
  setIsSaved: (saved) => set({ isSaved: saved }),

  statusData: [],
  setStatusData: (dataOrUpdater) =>
    set((state) => ({
      statusData: typeof dataOrUpdater === "function" ? dataOrUpdater(state.statusData) : dataOrUpdater,
    })),
  addStatusData: (data) => set((state) => ({ statusData: [...state.statusData, data] })),

  points: [],
  setPoints: (pointsOrUpdater) =>
    set((state) => ({
      points: typeof pointsOrUpdater === "function" ? pointsOrUpdater(state.points) : pointsOrUpdater,
    })),
  addPoint: (point) => set((state) => ({ points: [...state.points, point] })),
  clearPoints: () => set({ points: [] }),

  polygons: [],
  setPolygons: (polygonsOrUpdater) =>
    set((state) => ({
      polygons: typeof polygonsOrUpdater === "function" ? polygonsOrUpdater(state.polygons) : polygonsOrUpdater,
    })),
  addPolygon: (polygon) => set((state) => ({ polygons: [...state.polygons, polygon] })),
  removePolygon: (index) => {
    set((state) => {
      const polygons = state.polygons.slice();
      polygons.splice(index, 1);
      return { polygons };
    });
  },

  selectedPolygonIndex: null,
  setSelectedPolygonIndex: (indexOrUpdater) =>
    set((state) => ({
      selectedPolygonIndex:
        typeof indexOrUpdater === "function" ? indexOrUpdater(state.selectedPolygonIndex) : indexOrUpdater,
    })),

  draggingPolygon: null,
  setDraggingPolygon: (polygonOrUpdater) =>
    set((state) => ({
      draggingPolygon:
        typeof polygonOrUpdater === "function" ? polygonOrUpdater(state.draggingPolygon) : polygonOrUpdater,
    })),
}));
