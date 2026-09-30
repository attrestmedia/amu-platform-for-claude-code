/**
 * @docHint
 * @purpose 카메라 clamp 순수 유틸 (P1-4) — gameStore / useGameLoop 공용 (store 의존 없음)
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-camera
 * @scope game-runtime
 */

// min..max 월드 범위에 viewport 폭을 배치할 때의 카메라 좌표를 클램프한다.
// 범위가 viewport보다 작으면(월드 < 화면) 월드를 화면 중앙에 정렬해 clamp 역전(지터)을 방지한다.
export function clampCameraAxis(value: number, min?: number | null, max?: number | null, viewport = 0): number {
  const hasMin = typeof min === "number" && Number.isFinite(min);
  const hasMax = typeof max === "number" && Number.isFinite(max);

  if (hasMin && hasMax && (max as number) - (min as number) < viewport) {
    return (min as number) - (viewport - ((max as number) - (min as number))) / 2;
  }

  let next = value;
  if (hasMin) next = Math.max(next, min as number);
  if (hasMax) next = Math.min(next, (max as number) - viewport);
  return next;
}

interface SoftLockCameraState {
  x: number;
  y: number;
  width: number;
  height: number;
  softLockRadiusX: number;
  softLockRadiusY: number;
  constraints?: {
    minX?: number | null;
    maxX?: number | null;
    minY?: number | null;
    maxY?: number | null;
  } | null;
}

interface CameraTargetPoint {
  x: number;
  y: number;
}

/**
 * 주인공이 소프트 락 박스를 벗어난 거리만큼만 카메라 목표를 이동한다.
 * 매 프레임 화면 중앙을 새 목표로 삼으면 경계 안/밖을 반복하며 카메라가
 * 시작·정지하는 지터가 생기므로, 경계 초과분을 연속적으로 따라간다.
 */
export function getSoftLockCameraTarget(
  camera: SoftLockCameraState,
  target: CameraTargetPoint,
): CameraTargetPoint {
  const radiusX = Math.min(Math.max(camera.softLockRadiusX, 0), camera.width / 2);
  const radiusY = Math.min(Math.max(camera.softLockRadiusY, 0), camera.height / 2);
  const left = camera.x + radiusX;
  const right = camera.x + camera.width - radiusX;
  const top = camera.y + radiusY;
  const bottom = camera.y + camera.height - radiusY;

  let x = camera.x;
  let y = camera.y;

  if (target.x < left) x += target.x - left;
  else if (target.x > right) x += target.x - right;

  if (target.y < top) y += target.y - top;
  else if (target.y > bottom) y += target.y - bottom;

  if (camera.constraints) {
    x = clampCameraAxis(x, camera.constraints.minX, camera.constraints.maxX, camera.width);
    y = clampCameraAxis(y, camera.constraints.minY, camera.constraints.maxY, camera.height);
  }

  return { x, y };
}

export function isPointOutsideCameraViewport(
  camera: Pick<SoftLockCameraState, "x" | "y" | "width" | "height">,
  point: CameraTargetPoint,
): boolean {
  return (
    point.x < camera.x ||
    point.x > camera.x + camera.width ||
    point.y < camera.y ||
    point.y > camera.y + camera.height
  );
}
