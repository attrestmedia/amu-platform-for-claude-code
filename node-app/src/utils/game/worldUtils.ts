import type {
  IWorldEntity,
  IWorldObject,
  IWorldTrigger,
} from "types/game";
import { useGameStore } from "store/game";

/**
 * @docHint
 * @purpose worldUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-world
 * @scope game-runtime
 */

// ================================================
// 카메라 뷰포트 헬퍼
// ================================================

type CameraViewport = IWorldEntity; // 카메라 영역을 의미하는 별칭 적용
type WorldEntityLike = Pick<IWorldEntity, "x" | "y" | "width" | "height">;

// Zustand 카메라 상태 → 뷰포트 rect
export function getCameraViewport(): CameraViewport {
  const { camera } = useGameStore.getState();
  return {
    x: camera.x,
    y: camera.y,
    width: camera.width,
    height: camera.height,
  };
}

// 월드 rect vs 임의의 뷰포트
export function isWorldRectInViewport(rect: WorldEntityLike, viewport: CameraViewport, padding = 0): boolean {
  const viewX = viewport.x - padding;
  const viewY = viewport.y - padding;
  const viewW = viewport.width + padding * 2;
  const viewH = viewport.height + padding * 2;

  return (
    rect.x + rect.width >= viewX && rect.x <= viewX + viewW && rect.y + rect.height >= viewY && rect.y <= viewY + viewH
  );
}

// “카메라 뷰포트 기준”으로 바로 체크하는 헬퍼
export function isWorldRectInCameraViewport(rect: WorldEntityLike, padding = 0): boolean {
  const viewport = getCameraViewport();
  return isWorldRectInViewport(rect, viewport, padding);
}

// 화면 좌표(screen/canvas) → 월드 좌표
export function screenToWorld(screenX: number, screenY: number): { worldX: number; worldY: number } {
  const { camera } = useGameStore.getState();
  const zoom = camera.zoom || 1;

  return {
    worldX: camera.x + screenX / zoom,
    worldY: camera.y + screenY / zoom,
  };
}

// 월드 좌표 → 화면 좌표(screen/canvas)
export function worldToScreen(worldX: number, worldY: number): { screenX: number; screenY: number } {
  const { camera } = useGameStore.getState();
  const zoom = camera.zoom || 1;

  return {
    screenX: (worldX - camera.x) * zoom,
    screenY: (worldY - camera.y) * zoom,
  };
}

// 반경(원) 기준으로 월드 오브젝트 검색
export function findWorldObjectsInRadius(
  worldX: number,
  worldY: number,
  radius: number,
  filter?: (obj: IWorldObject) => boolean
): IWorldObject[] {
  const { worldData } = useGameStore.getState();
  const objects = worldData?.objects ?? [];
  const r2 = radius * radius;

  return objects.filter((obj) => {
    if (filter && !filter(obj)) return false;

    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const dx = cx - worldX;
    const dy = cy - worldY;

    return dx * dx + dy * dy <= r2;
  });
}

// 화면 좌표 기준 상호작용 대상 검색 (screen → world 변환 포함)
export function pickWorldObjectsAtScreenPoint(
  screenX: number,
  screenY: number,
  radius: number,
  filter?: (obj: IWorldObject) => boolean
): IWorldObject[] {
  const { worldX, worldY } = screenToWorld(screenX, screenY);
  return findWorldObjectsInRadius(worldX, worldY, radius, filter);
}

// 월드 트리거 헬퍼
export function isPointInsideTrigger(worldX: number, worldY: number, trigger: IWorldTrigger): boolean {
  const area = trigger.area;

  if (area.shape === "circle") {
    const dx = worldX - area.cx;
    const dy = worldY - area.cy;
    return dx * dx + dy * dy <= area.radius * area.radius;
  }

  return worldX >= area.x && worldX <= area.x + area.width && worldY >= area.y && worldY <= area.y + area.height;
}

// 월드 트리거 포인트 찾기
export function findWorldTriggersAtPoint(
  worldX: number,
  worldY: number,
  filter?: (trigger: IWorldTrigger) => boolean
): IWorldTrigger[] {
  const { worldTriggers } = useGameStore.getState();
  const triggers = worldTriggers ?? [];

  return triggers.filter((trigger) => {
    if (trigger.enabled === false) return false;
    if (filter && !filter(trigger)) return false;
    return isPointInsideTrigger(worldX, worldY, trigger);
  });
}
