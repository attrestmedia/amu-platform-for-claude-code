import React, { createContext, useContext, useState, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import type { CurrentModeType } from "types/catalog/annotation";
import { colorMappingClassType, labelMappingClassType } from "utils/catalog/catalog";

/**
 * @docHint
 * @purpose useAnnotationState 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain catalog
 * @scope feature
 */

// Context에 필요한 상태 타입 정의
interface AnnotationStateContextType {
  userId: string | null; // 유저 아이디 정보
  setUserId: React.Dispatch<React.SetStateAction<string | null>>;

  appMode: string; // 앱 실행 모드 ("edit", "view" 등)
  setAppMode: React.Dispatch<React.SetStateAction<string>>;

  currentMode: CurrentModeType; // 현재 라벨 생성 모드 상태(ojbject, masking)
  setCurrentMode: React.Dispatch<React.SetStateAction<CurrentModeType>>;

  currentClassType: string; // 현재의 클래스 상태
  setCurrentClassType: React.Dispatch<React.SetStateAction<string>>;

  currentColor: string; // 현재의 컬러 상태
  setCurrentColor: React.Dispatch<React.SetStateAction<string>>;

  categoryName: string | undefined; // 현재 카테고리명
  setCategoryName: React.Dispatch<React.SetStateAction<string | undefined>>;

  selectedThumbnailIndex: number | null; // 현재 선택된 썸네일 인덱스
  setSelectedThumbnailIndex: React.Dispatch<React.SetStateAction<number | null>>;

  selectedClassLabel: string; // 현재 선택된 클래스의 라벨명
  setSelectedClassLabel: React.Dispatch<React.SetStateAction<string>>;

  scale: number; // 현재의 스케일 값
  setScale: React.Dispatch<React.SetStateAction<number>>;

  isPanning: boolean; // 패닝 설정
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;

  isPanningActive: boolean; // 패닝 활성화
  setIsPanningActive: React.Dispatch<React.SetStateAction<boolean>>;

  panStart: { x: number; y: number } | null; // 패닝 시작
  setPanStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;

  panOffset: { x: number; y: number }; // 패닝 오프셋
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;

  oriImageSize: { width: number; height: number } | null; // 이미지의 원본 사이즈
  setOriImageSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>;

  scaleImageSize: { width: number; height: number } | null; // 이미지의 현재 사이즈
  setScaleImageSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>;

  isScrollbarClicked: boolean; // 라벨링 이미지 영역의 스크롤바 클릭 여부
  setIsScrollbarClicked: React.Dispatch<React.SetStateAction<boolean>>;

  isCrosshair: boolean; // 마우스 십자 표시
  setIsCrosshair: React.Dispatch<React.SetStateAction<boolean>>;

  currentPage: number; // 현재 페이지 인덱스
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;

  totalPage: number; // 전체 페이지 인덱스
  setTotalPage: React.Dispatch<React.SetStateAction<number>>;

  imageRef: React.RefObject<HTMLImageElement | null>; // 이미지 객체
  containerRef: React.RefObject<HTMLDivElement | null>; // 컨테이너 객체
}

// Context 생성 및 타입 지정
const AnnotationStateContext = createContext<AnnotationStateContextType | undefined>(undefined);

interface AnnotationStateProviderProps {
  children: ReactNode;
  initMode?: string;
}

export const AnnotationStateProvider = ({ children, initMode = "edit" }: AnnotationStateProviderProps) => {
  // 컨테이너 및 이미지 요소
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // 모든 상태 정의
  const [userId, setUserId] = useState<string | null>(null);
  const [appMode, setAppMode] = useState<string>(initMode);

  const [currentMode, setCurrentMode] = useState<CurrentModeType>("object");
  const [currentClassType, setCurrentClassType] = useState<string>("0");
  const [currentColor, setCurrentColor] = useState<string>(colorMappingClassType(currentClassType));
  const [currentPage, setCurrentPage] = useState<number>(1); // 현재 페이지
  const [totalPage, setTotalPage] = useState<number>(0); // 현재 페이지

  const [categoryName, setCategoryName] = useState<string | undefined>(undefined); // 현재 카테고리 이름
  const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState<number | null>(null);
  const [selectedClassLabel, setSelectedClassLabel] = useState<string>(labelMappingClassType(currentClassType)); // 선택된 클래스

  const [scale, setScale] = useState(1);
  const [oriImageSize, setOriImageSize] = useState<{ width: number; height: number } | null>(null);
  const [scaleImageSize, setScaleImageSize] = useState<{ width: number; height: number } | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const [isScrollbarClicked, setIsScrollbarClicked] = useState(false);
  const [isCrosshair, setIsCrosshair] = useState<boolean>(false); // 마우스 크로스라인 표시 여부
  const [isPanning, setIsPanning] = useState(false);
  const [isPanningActive, setIsPanningActive] = useState(false);

  // 리렌더링 방지를 위한 메모제이션 => 컨텍스트 값이 의존성 중 하나가 변경될 때만 변경
  const contextValue = useMemo(
    () => ({
      userId,
      setUserId,
      appMode,
      setAppMode,
      currentMode,
      setCurrentMode,
      categoryName,
      setCategoryName,
      selectedThumbnailIndex,
      setSelectedThumbnailIndex,
      currentClassType,
      setCurrentClassType,
      currentColor,
      setCurrentColor,
      selectedClassLabel,
      setSelectedClassLabel,
      scale,
      setScale,
      isPanning,
      setIsPanning,
      isPanningActive,
      setIsPanningActive,
      panStart,
      setPanStart,
      panOffset,
      setPanOffset,
      oriImageSize,
      setOriImageSize,
      scaleImageSize,
      setScaleImageSize,
      isScrollbarClicked,
      setIsScrollbarClicked,
      imageRef,
      containerRef,
      isCrosshair,
      setIsCrosshair,
      currentPage,
      setCurrentPage,
      totalPage,
      setTotalPage,
    }),
    [
      userId,
      appMode,
      currentMode,
      categoryName,
      selectedThumbnailIndex,
      currentClassType,
      currentColor,
      selectedClassLabel,
      scale,
      isPanning,
      isPanningActive,
      panStart,
      panOffset,
      oriImageSize,
      scaleImageSize,
      isScrollbarClicked,
      isCrosshair,
      currentPage,
      totalPage,
    ]
  );

  return <AnnotationStateContext.Provider value={contextValue}>{children}</AnnotationStateContext.Provider>;
};

export const useAnnotationState = (): AnnotationStateContextType => {
  const context = useContext(AnnotationStateContext);
  if (!context) {
    throw new Error("useAnnotationState must be used within an AnnotationStateProvider");
  }
  return context;
};
