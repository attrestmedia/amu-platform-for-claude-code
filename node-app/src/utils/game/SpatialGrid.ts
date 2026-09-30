import type { ICollisionRect } from "types/game";
import { toUnknownRecord, pickRoleList } from "utils/common/typeUtils";
import { logger } from "../log";

/** v2 논리 좌표계의 AABB 충돌 조회용 공간 해시. */
export class SpatialGrid {
  private readonly grid = new Map<string, ICollisionRect[]>();
  private readonly idToCells = new Map<string, string[]>();
  private readonly idToRect = new Map<string, ICollisionRect>();
  private readonly bucketSize: number;
  private debugMode: boolean;

  constructor(bucketSize: number, debugMode = false) {
    const valid = Number.isFinite(bucketSize) && bucketSize > 0;
    this.bucketSize = valid ? bucketSize : 1;
    this.debugMode = debugMode;
    if (!valid && debugMode) {
      logger.warn("[SpatialGrid] invalid bucketSize:", bucketSize, "→ fallback to", this.bucketSize);
    }
  }

  private hasRole(obj: ICollisionRect, role: string): boolean {
    return pickRoleList(toUnknownRecord(obj).role).includes(role);
  }

  private isValidRect(obj: ICollisionRect): boolean {
    return (
      Number.isFinite(obj?.x) &&
      Number.isFinite(obj?.y) &&
      Number.isFinite(obj?.width) &&
      Number.isFinite(obj?.height) &&
      obj.width > 0 &&
      obj.height > 0
    );
  }

  private getCellIDs(obj: ICollisionRect): string[] {
    if (!this.isValidRect(obj)) {
      if (this.debugMode) logger.warn("[SpatialGrid] invalid rect:", obj);
      return [];
    }

    const epsilon = 1e-6;
    const startCol = Math.floor(obj.x / this.bucketSize);
    const endCol = Math.floor((obj.x + obj.width - epsilon) / this.bucketSize);
    const startRow = Math.floor(obj.y / this.bucketSize);
    const endRow = Math.floor((obj.y + obj.height - epsilon) / this.bucketSize);
    const cols = endCol - startCol + 1;
    const rows = endRow - startRow + 1;
    if (cols <= 0 || rows <= 0) return [];
    if (cols * rows > 10_000) {
      if (this.debugMode) logger.warn("[SpatialGrid] too many buckets:", { cols, rows, obj });
      return [];
    }

    const result: string[] = [];
    for (let col = startCol; col <= endCol; col += 1) {
      for (let row = startRow; row <= endRow; row += 1) result.push(`${col},${row}`);
    }
    return result;
  }

  private isColliding(a: ICollisionRect, b: ICollisionRect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  clear(): void {
    this.grid.clear();
    this.idToCells.clear();
    this.idToRect.clear();
  }

  remove(id: string): void {
    if (!id) return;
    for (const cellId of this.idToCells.get(id) ?? []) {
      const remaining = (this.grid.get(cellId) ?? []).filter((item) => item.id !== id);
      if (remaining.length > 0) this.grid.set(cellId, remaining);
      else this.grid.delete(cellId);
    }
    this.idToCells.delete(id);
    this.idToRect.delete(id);
  }

  delete(id: string): void {
    this.remove(id);
  }

  insert(obj: ICollisionRect): void {
    if (!this.isValidRect(obj)) {
      if (this.debugMode) logger.warn("[SpatialGrid] invalid insert:", obj);
      return;
    }
    if (obj.id) this.remove(obj.id);
    const cellIds = this.getCellIDs(obj);
    for (const cellId of cellIds) {
      const cell = this.grid.get(cellId) ?? [];
      cell.push(obj);
      this.grid.set(cellId, cell);
    }
    if (obj.id) {
      this.idToCells.set(obj.id, cellIds);
      this.idToRect.set(obj.id, obj);
    }
  }

  upsert(obj: ICollisionRect): void {
    this.insert(obj);
  }

  update(rect: ICollisionRect): void;
  update(id: string, rect: ICollisionRect): void;
  update(value: ICollisionRect | string, rect?: ICollisionRect): void {
    const candidate = typeof value === "string" ? rect : value;
    if (candidate) this.upsert(candidate);
  }

  getCellsForRect(rect: ICollisionRect): string[] {
    return this.getCellIDs(rect);
  }

  queryRect(rect: ICollisionRect, filterFn?: (obj: ICollisionRect) => boolean): ICollisionRect[] {
    const visited = new Set<string>();
    const result: ICollisionRect[] = [];
    for (const cellId of this.getCellIDs(rect)) {
      for (const object of this.grid.get(cellId) ?? []) {
        const objectId = object.id || `${object.x}-${object.y}-${object.width}-${object.height}`;
        if (visited.has(objectId)) continue;
        visited.add(objectId);
        if (!filterFn || filterFn(object)) result.push(object);
      }
    }
    return result;
  }

  isCollidingWithRect(rectA: ICollisionRect, rectB: ICollisionRect): boolean {
    return this.isColliding(rectA, rectB);
  }

  checkCollision(rect: ICollisionRect, filterFn?: (obj: ICollisionRect) => boolean): ICollisionRect | null {
    for (const object of this.queryRect(rect)) {
      if (this.hasRole(object, "pass")) continue;
      if (this.isColliding(rect, object) && (!filterFn || filterFn(object))) return object;
    }
    return null;
  }

  checkCollisionWithRoles(
    rect: ICollisionRect,
    excludeRoles: string[] = ["pass"],
    excludeTypes: string[] = [],
  ): ICollisionRect | null {
    for (const object of this.queryRect(rect)) {
      if (object.type && excludeTypes.includes(object.type)) continue;
      const hasPark = this.hasRole(object, "park");
      const hasPass = this.hasRole(object, "pass");
      if (!hasPark && hasPass && excludeRoles.includes("pass")) continue;
      const roles = pickRoleList(toUnknownRecord(object).role);
      if (roles.some((role) => role !== "pass" && excludeRoles.includes(role.trim()))) continue;
      if (!this.isColliding(rect, object)) continue;
      if (hasPark && ["protagonist", "npc", "user"].includes(rect.type ?? "")) continue;
      return object;
    }
    return null;
  }

  queryArea(area: ICollisionRect, filterFn?: (obj: ICollisionRect) => boolean): ICollisionRect[] {
    return this.queryRect(area, (object) => this.isColliding(area, object) && (!filterFn || filterFn(object)));
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  getStats(): { cellCount: number; objectCount: number } {
    let objectCount = 0;
    for (const cell of this.grid.values()) objectCount += cell.length;
    return { cellCount: this.grid.size, objectCount };
  }

  getAllEntities(): ICollisionRect[] {
    return Array.from(this.idToRect.values());
  }

  getEntitiesByType(type: string): ICollisionRect[] {
    return this.getAllEntities().filter((entity) => entity.type === type);
  }

  getEntitiesByRole(role: string): ICollisionRect[] {
    return this.getAllEntities().filter((entity) => this.hasRole(entity, role));
  }

  checkCollisionWithType(rect: ICollisionRect, targetType: string, buffer = 0): ICollisionRect | null {
    for (const object of this.queryRect(rect)) {
      if (object.type !== targetType && !this.hasRole(object, targetType)) continue;
      if (
        rect.x - buffer < object.x + object.width &&
        rect.x + rect.width + buffer > object.x &&
        rect.y - buffer < object.y + object.height &&
        rect.y + rect.height + buffer > object.y
      ) {
        return object;
      }
    }
    return null;
  }
}
