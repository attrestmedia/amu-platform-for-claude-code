import { Sprite, TextStyle, Text } from "pixi.js";
import { GAME_CONSTANTS as GC } from "consts/game";

/**
 * @docHint
 * @purpose pixiUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain pixi
 * @scope game-runtime
 */

// objectFit 타입 정의
export type ObjectFitType =
  | "cover"
  | "contain"
  | "fill"
  | "auto"
  | "none"
  | `${number}px`
  | `${number}px ${number}px`
  | `${number}%`
  | `${number}% ${number}%`;

export type ObjectPositionType =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "custom";

// x, y 커스텀 포지션을 위한 타입
export interface CustomPositionType {
  x: number; // 0-1 사이의 값 (0: 왼쪽, 1: 오른쪽)
  y: number; // 0-1 사이의 값 (0: 위쪽, 1: 아래쪽)
}

type PixiNamedObject = {
  name?: string;
};

// 라벨 폭을 상품 이미지의 N배로(기본 1.5배) 설정
export function addProductLabel(
  obstacleSprite: Sprite & { label?: string },
  title: string,
  opts?: {
    offset?: number; // 스프라이트 하단 간격(px)
    widthRatio?: number; // 라벨 최대 폭(상품 폭 대비)
    maxWidth?: number; // 절대 최대 폭(px) 제한
  }
) {
  const parent = obstacleSprite.parent; // 스테이지 컨테이너
  const target = parent || obstacleSprite;

  const offset = opts?.offset ?? 4;
  const widthRatio = Math.max(1, opts?.widthRatio ?? 1.5);
  const baseWidth = obstacleSprite.width;

  // 최종 라벨 최대 폭 계산
  const desiredMaxWidth = baseWidth * widthRatio;
  const wrapMaxWidth = Math.max(40, opts?.maxWidth ? Math.min(desiredMaxWidth, opts.maxWidth) : desiredMaxWidth);

  // 중복 라벨 제거
  const key = `__product_title__${obstacleSprite.label ?? ""}`;
  const prev = target.children.find((c) => (c as PixiNamedObject).name === key);
  if (prev) target.removeChild(prev);

  // 라벨 스타일
  const style = new TextStyle({
    fontSize: 12,
    fill: 0xffffff,
    align: "center",
    wordWrap: true,
    wordWrapWidth: wrapMaxWidth, // ← 상품폭 * widthRatio
    stroke: { color: 0x000000, width: 2, join: "round" },
    dropShadow: { distance: 1, color: 0x000000 },
  });

  const label = new Text({ text: title, style });
  (label as Text & PixiNamedObject).name = key;
  label.anchor.set(0.5, 0); // 상단 중앙 기준
  label.zIndex = GC.STAGE.Z_INDEX.PRODUCT_LABEL;

  // 상품 중심 하단에 정렬(라벨 폭이 넓어져도 중앙 정렬 유지)
  if (parent) {
    label.x = obstacleSprite.x + baseWidth / 2;
    label.y = obstacleSprite.y + obstacleSprite.height + offset;
  } else {
    const sx = obstacleSprite.scale.x || 1;
    const sy = obstacleSprite.scale.y || 1;
    label.x = baseWidth / sx / 2;
    label.y = obstacleSprite.height / sy + offset;
  }

  target.addChild(label);
}
