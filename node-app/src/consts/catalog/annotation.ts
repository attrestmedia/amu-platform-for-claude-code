import { THEME } from "./theme";

// 어노테이션 생성 기본 사이즈
export const DEFAULT_ANNOTATION_SIZE = { width: 20, height: 20 };

// 어노테이션 생성 기본 간격
export const DEFAULT_SPACING = 5;

// 기본 컬러
export const DEFAULT_COLOR = THEME.COLORS.blue1;

// 어노테이션 타입 설정 데이터
export const CLASS_KEY_MAP_DATA = [
  { key: "1", label: "person", color: THEME.COLORS.blue1 },
  { key: "2", label: "car", color: THEME.COLORS.green1 },
  { key: "3", label: "bus", color: THEME.COLORS.purple1 },
  { key: "4", label: "truck", color: THEME.COLORS.khaki1 },
  { key: "5", label: "chair", color: THEME.COLORS.orange1 },
];
