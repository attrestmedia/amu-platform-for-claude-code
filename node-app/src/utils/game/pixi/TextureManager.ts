import { Texture, Assets } from "pixi.js";
import { buildImageProxyUrl, isProxyImageUrl } from "../../common";
import { logger } from "../../log";

/**
 * @docHint
 * @purpose TextureManager 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain pixi
 * @scope client-only
 */

class TextureManager {
  private textureCache: Map<string, Texture>;
  private loadingPromises: Map<string, Promise<Texture>>;
  private priorityCache: Set<string>; // 우선순위가 높은 텍스처 집합
  private lastAccessTime: Map<string, number>; // 텍스처별 마지막 접근 시간
  private memoryLimit: number; // 메모리 사용량 제한 (MB)
  private estimatedMemoryUsage: number; // 추정 메모리 사용량 (MB)

  constructor(memoryLimitMB = 256) {
    this.textureCache = new Map();
    this.loadingPromises = new Map();
    this.priorityCache = new Set();
    this.lastAccessTime = new Map();
    this.memoryLimit = memoryLimitMB;
    this.estimatedMemoryUsage = 0;
  }

  private getTextureSource(texture: Texture): { width?: number; height?: number; realWidth?: number; realHeight?: number } | null {
    return (texture as Texture & {
      source?: { width?: number; height?: number; realWidth?: number; realHeight?: number };
    }).source ?? null;
  }

  // 텍스처 가져오기
  async getTexture(path: string, priority = false): Promise<Texture> {
    if (!path) {
      throw new Error("Texture path is empty or undefined");
    }

    // 캐시 히트 처리
    if (this.textureCache.has(path)) {
      // 마지막 접근 시간 업데이트
      this.lastAccessTime.set(path, Date.now());

      // 우선순위 플래그가 true면 우선순위 캐시에 추가
      if (priority && !this.priorityCache.has(path)) {
        this.priorityCache.add(path);
      }

      return this.textureCache.get(path) as Texture;
    }

    // 동일한 텍스처의 중복 로드 방지
    if (this.loadingPromises.has(path)) {
      return this.loadingPromises.get(path) as Promise<Texture>;
    }

    try {
      // 새 로드 작업 시작
      const loadPromise = this.loadTexture(path, priority);
      this.loadingPromises.set(path, loadPromise);

      // 로딩 완료 후 로딩 프로미스 맵에서 제거
      const texture = await loadPromise;
      this.loadingPromises.delete(path);

      return texture;
    } catch (error) {
      this.loadingPromises.delete(path);
      logger.error(`Error loading texture from path: ${path}`, error);
      throw error;
    }
  }

  // 외부 이미지 URL인지 확인
  private isExternalImageUrl(path: string): boolean {
    return /^https?:\/\//i.test(path);
  }

  // 이미지 프록시 URL 생성
  private getProxyImageUrl(originalUrl: string): string {
    return buildImageProxyUrl(originalUrl);
  }

  // 확장자 확인
  private hasImageExt(u: string): boolean {
    const clean = u.split("?")[0].toLowerCase();
    return /\.(png|jpe?g|webp|gif|avif)$/i.test(clean);
  }

  // 프록시 URL 판별
  private isProxyUrl(u: string): boolean {
    return isProxyImageUrl(u);
  }

  // URL에서 안전한 텍스처 생성: '원본(또는 프록시) URL'을 alias로 사용
  private async createTextureFromUrl(url: string) {
    // 1) fetch → blob → ImageBitmap → Texture
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();

      // 일부 브라우저/포맷에서 createImageBitmap가 실패할 수도 있으니 try-catch로 감쌉니다.
      try {
        const bmp = await createImageBitmap(blob);
        const tex = Texture.from(bmp);
        if (Number(tex.width) > 0 && Number(tex.height) > 0) return tex;
        throw new Error("empty texture after createImageBitmap");
      } catch {
        // 2) 폴백: <img> 경유 → Texture.from(img)
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.crossOrigin = "anonymous";
          im.onload = () => resolve(im);
          im.onerror = (e) => reject(e);
          // blob URL로 로드하면 CORS 영향이 거의 없음
          const objUrl = URL.createObjectURL(blob);
          im.onload = () => {
            URL.revokeObjectURL(objUrl);
            resolve(im);
          };
          im.onerror = (e) => {
            URL.revokeObjectURL(objUrl);
            reject(e);
          };
          im.src = objUrl;
        });

        const tex = Texture.from(img);
        if (Number(tex.width) > 0 && Number(tex.height) > 0) return tex;
        throw new Error("empty texture after HTMLImageElement");
      }
    } catch (e) {
      // 최종 실패
      logger.error(`Error loading texture from path: ${url}`, e);
      throw new Error("텍스처 소스를 찾을 수 없음");
    }
  }

  private logTextureFail(url: string, e1: unknown, e2: unknown) {
    try {
      logger.error(`Error loading texture from path: ${url}`, e1 || "", e2 || "");
    } catch {}
  }

  // 텍스처 준비 상태 확인
  private isTextureReady(texture: Texture): boolean {
    if (!texture || texture.destroyed) return false;
    if (Number(texture.width) > 0 && Number(texture.height) > 0) return true;
    const src = this.getTextureSource(texture);
    return Number(src?.width) > 0 && Number(src?.height) > 0;
  }

  // 텍스처 로드 및 캐싱 - CORS 대응
  private async loadTexture(path: string, priority = false): Promise<Texture> {
    // 메모리 관리: 메모리 제한에 도달한 경우 LRU 정책으로 텍스처 제거
    await this.manageCacheSize();

    // 최종 actualPath 확정
    let actualPath = this.isExternalImageUrl(path) ? this.getProxyImageUrl(path) : path;

    // 프록시거나 확장자 없는 경우엔 fetch 경로 사용
    const shouldFetch = this.isProxyUrl(actualPath) || !this.hasImageExt(actualPath);

    // 외부 이미지인 경우 프록시 URL로 변경
    if (this.isExternalImageUrl(path)) {
      // 절대 URL은 프록시로
      actualPath = this.getProxyImageUrl(path);
      logger.log(`외부 이미지를 프록시로 로드: ${path} -> ${actualPath}`);
    }

    try {
      // 1) 텍스처 로드
      const texture: Texture = shouldFetch
        ? await this.createTextureFromUrl(actualPath) // 프록시를 포함한 최종 URL을 그대로 사용
        : ((await Assets.load(actualPath)) as Texture);

      // 2) 유효성 검사 개선
      if (!this.isTextureReady(texture)) {
        throw new Error("로드된 텍스처가 유효하지 않음");
      }

      // 3) 메모리 추정 & 캐싱
      this.estimatedMemoryUsage += this.estimateTextureSizeMB(texture);
      this.textureCache.set(path, texture); // 원본 요청 경로를 키로 사용
      this.lastAccessTime.set(path, Date.now());
      if (priority) this.priorityCache.add(path);

      return texture;
    } catch (error) {
      logger.error(`텍스처 로드 실패: ${actualPath}`, error);

      // 외부 URL 실패 시 폴백
      if (this.isExternalImageUrl(path)) {
        logger.warn(`외부 이미지 로드 실패, 기본 텍스처 사용: ${path}`);
        try {
          const fallbackTexture = await Assets.load("/assets/commerce/placeholder-product.png");
          this.textureCache.set(path, fallbackTexture);
          this.lastAccessTime.set(path, Date.now());
          return fallbackTexture;
        } catch (fallbackError) {
          logger.error(`폴백 텍스처도 로드 실패: ${path}`, fallbackError);
          return Texture.WHITE;
        }
      }

      throw error;
    }
  }

  // 여러 텍스처를 한 번에 프리로드 (배치 처리 최적화)
  async preloadTextures(paths: string[], batchSize = 10, priority = false): Promise<void> {
    if (!paths || paths.length === 0) return;

    // 중복 제거 및 유효한 경로만 필터링
    const uniquePaths = [...new Set(paths)].filter((path) => path && path.trim() !== "");

    // 이미 캐시에 있는 경로 제외
    const pathsToLoad = uniquePaths.filter((path) => !this.textureCache.has(path));

    if (pathsToLoad.length === 0) return;

    try {
      // 배치 단위로 로드
      for (let i = 0; i < pathsToLoad.length; i += batchSize) {
        const batch = pathsToLoad.slice(i, i + batchSize);

        // 배치 내 텍스처 병렬 로드
        const loadPromises = batch.map(async (path) => {
          try {
            if (!this.loadingPromises.has(path) && !this.textureCache.has(path)) {
              const loadPromise = this.loadTexture(path, priority);
              this.loadingPromises.set(path, loadPromise);
              await loadPromise;
              this.loadingPromises.delete(path);
            }
          } catch (error) {
            logger.warn(`Failed to preload texture: ${path}`, error);
            this.loadingPromises.delete(path);
          }
        });

        // 현재 배치 모두 로드 완료 대기
        await Promise.all(loadPromises);
      }
    } catch (error) {
      logger.error("Error during texture batch preloading:", error);
    }
  }

  // 텍스처 캐시 비우기
  clearCache(preservePriority = true): void {
    for (const [p, tex] of this.textureCache.entries()) {
      if (!preservePriority || !this.priorityCache.has(p)) {
        tex?.destroy(true); // GPU/베이스텍스처까지 해제
        this.textureCache.delete(p);
        this.lastAccessTime.delete(p);
      }
    }
    if (!preservePriority) this.priorityCache.clear();
    this.recalculateMemoryUsage();
  }

  // 메모리 제한에 도달했을 때 LRU 정책으로 캐시 정리
  private async manageCacheSize(): Promise<void> {
    if (this.estimatedMemoryUsage < this.memoryLimit * 0.9) {
      return; // 메모리 사용량이 제한의 90% 미만인 경우 작업 건너뜀
    }

    // 마지막 접근 시간 기준으로 정렬된 텍스처 경로 목록 (오래된 순)
    const sortedPaths = Array.from(this.lastAccessTime.entries())
      .filter(([path]) => !this.priorityCache.has(path)) // 우선순위 텍스처 제외
      .sort((a, b) => a[1] - b[1]) // 접근 시간 오름차순 정렬
      .map(([path]) => path); // 경로만 추출

    // 메모리 사용량이 목표(70% 이하)에 도달할 때까지 오래된 텍스처 제거
    for (const path of sortedPaths) {
      if (this.estimatedMemoryUsage <= this.memoryLimit * 0.7) {
        break; // 목표 달성 시 중단
      }

      if (this.textureCache.has(path)) {
        const texture = this.textureCache.get(path) as Texture;
        const textureSizeMB = this.estimateTextureSizeMB(texture);

        texture?.destroy(true); // GPU/베이스텍스처 해제

        // 캐시에서 제거
        this.textureCache.delete(path);
        this.lastAccessTime.delete(path);

        // 메모리 사용량 갱신
        this.estimatedMemoryUsage -= textureSizeMB;
      }
    }
  }

  // 텍스처 크기 추정 (메모리 관리용)
  private estimateTextureSizeMB(texture: Texture): number {
    try {
      if (!texture || texture.destroyed) return 0;

      const src = this.getTextureSource(texture);
      // valid 플래그 대신 안전한 수치 기반으로 설정
      const w = Number(src?.realWidth ?? src?.width ?? texture.width ?? 0);
      const h = Number(src?.realHeight ?? src?.height ?? texture.height ?? 0);

      if (!w || !h) return 0;
      return (w * h * 4) / (1024 * 1024);
    } catch {
      return 0;
    }
  }

  // 캐시 내 모든 텍스처의 메모리 사용량 재계산
  private recalculateMemoryUsage(): void {
    let totalSizeMB = 0;

    for (const texture of this.textureCache.values()) {
      totalSizeMB += this.estimateTextureSizeMB(texture);
    }

    this.estimatedMemoryUsage = totalSizeMB;
  }

  // 특정 텍스처 캐시에서 제거
  removeFromCache(path: string): void {
    const tex = this.textureCache.get(path);
    if (tex) tex.destroy(true); // ✅
    this.textureCache.delete(path);
    this.lastAccessTime.delete(path);
    this.priorityCache.delete(path);
    this.recalculateMemoryUsage();
  }

  // 현재 텍스처 캐시 상태 정보 반환 (디버깅용)
  getCacheStats(): {
    cacheSize: number;
    priorityCount: number;
    estimatedMemoryMB: number;
    memoryLimitMB: number;
  } {
    return {
      cacheSize: this.textureCache.size,
      priorityCount: this.priorityCache.size,
      estimatedMemoryMB: Math.round(this.estimatedMemoryUsage * 100) / 100,
      memoryLimitMB: this.memoryLimit,
    };
  }
}

// 싱글톤 인스턴스 생성
export const textureManager = new TextureManager();

export { TextureManager };
