import { CLASS_KEY_MAP_DATA } from "consts/catalog";

/**
 * @docHint
 * @purpose catalog 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain ui
 * @scope client
 */

// 마스킹 폴리곤 컬러 적용 함수
export const polyColor = (opa: number = 1, type: string = "default") => {
  const color = type === "selected" ? `rgba(255, 0, 115, ${opa})` : `rgba(235, 47, 202, ${opa})`;
  return color;
};

// 클래스, 컬러 맵핑 함수
export const colorMappingClassType = (classType: string) => {
  const matchedClassData = CLASS_KEY_MAP_DATA.find((item) => item.key === classType);
  return matchedClassData ? matchedClassData.color : CLASS_KEY_MAP_DATA[0].color;
};

// 라벨, 클래스 맵핑 함수
export const labelMappingClassType = (classType: string) => {
  const matchedClassData = CLASS_KEY_MAP_DATA.find((item) => item.key === classType);
  return matchedClassData ? matchedClassData.label : CLASS_KEY_MAP_DATA[0].label;
};

// 폴리곤 좌표를 제한하기 위한 클램핑 함수
export const polygonClamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};
