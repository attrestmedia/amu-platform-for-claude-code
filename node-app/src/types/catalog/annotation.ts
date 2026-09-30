export type CurrentModeType = "object" | "masking";

// Annotation 데이터 타입
export interface IAnnotation {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  classType: string;
}

// Masking Point 데이터 타입
export interface IMaskingPoint {
  x: number;
  y: number;
}

// Masking 드래그 타입 정의
export interface IDragMasking {
  index: number;
  lastX: number;
  lastY: number;
}

// 각 카테고리 데이터 타입
export type ICategory = {
  id: string;
  src: string;
  storage?: Record<string, unknown>;
  status: string;
  annotations?: IAnnotation[];
  maskings?: IMaskingPoint[][];
};

// 카테고리 리스트 데이터 타입
export interface ICategoryList {
  id: string;
  name: string;
  list: ICategory[];
}

// 이미지 상태 업데이트 데이터 타입
export interface ICategoryStatus {
  category: string; // 프로젝트 내 서브 카테고리 아이디
  id: string; // 이미지 아이디
  src: string; // 이미지 주소
  type: string; // "del": deleted, "mod": modified, ...
}
