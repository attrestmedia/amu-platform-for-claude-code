export interface IMotionEditorSlideItem {
  text: string;
  color?: string;
  fontSize?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number }; // 크기 추가
  align?: "left" | "center" | "right"; // 정렬 옵션 추가
}

export type MotionEditorObjectFitType = "cover" | "contain" | "fill" | "scale-down" | "none";
export type MotionEditorObjectPositionType = "center" | "top" | "bottom" | "left" | "right";

export interface IMotionEditorSlideContent {
  id: string;
  imageName: string;
  objectFit?: MotionEditorObjectFitType;
  objectPosition?: MotionEditorObjectPositionType;
  content: IMotionEditorSlideItem[];
}

export interface IMotionEditorSlideData {
  id: string;
  name: string;
  title: string;
  slug: string;
  content: IMotionEditorSlideContent[];
}
