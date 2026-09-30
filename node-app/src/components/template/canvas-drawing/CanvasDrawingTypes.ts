export type SizeMode = "fixed" | "parent" | "window";
export type BgMode = "white" | "color" | "transparent";

export type Tool =
  | "select"
  | "hand"
  | "pen"
  | "eraser"
  | "rect"
  | "triangle"
  | "ellipse"
  | "polygon"
  | "comment"
  | "text";

export type CursorMode = "icon" | "circle" | "pointer";
export type CursorIcon = "brush" | "pencil";

export type Point = { x: number; y: number };

export type NormalizedFrameGuide = {
  columns: number;
  rows: number;
  anchorX?: number;
  anchorY?: number;
  safeAreaInset?: number;
  showFrameNumbers?: boolean;
};

export type StrokeItem = {
  id: string;
  type: "stroke";
  mode: "draw" | "erase";
  points: Point[];
  sizeNorm: number; // penSize / min(w,h)
  color: string; // draw일 때만 사용
  createdAt: number;
};

export type ShapeItem = {
  id: string;
  type: "shape";
  shape: "rect" | "triangle" | "ellipse";
  x1: number; // 0~1
  y1: number; // 0~1
  x2: number; // 0~1
  y2: number; // 0~1
  sizeNorm: number;
  color: string;
  createdAt: number;
};

export type PolygonItem = {
  id: string;
  type: "polygon";
  points: Point[];
  sizeNorm: number;
  color: string;
  createdAt: number;
};

export type CanvasItem = StrokeItem | ShapeItem | PolygonItem;

export type CommentKind = "bubble" | "label";

export type CommentItem = {
  id: string;
  xNorm: number; // 0~1
  yNorm: number; // 0~1
  text: string;
  createdAt: number;
  kind?: CommentKind;
  color?: string;
  fontSize?: number;

  // 버블 위치 보정(캔버스 위에서 겹침 피하기 용도)
  bubbleDx?: number; // px
  bubbleDy?: number; // px

  // 선택한 요소에 대한 코멘트(가능하면)
  targetItemId?: string | null;
};

export type DrawingDoc = {
  items: CanvasItem[];
  comments: CommentItem[];
};
