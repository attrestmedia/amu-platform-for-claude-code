import { getSafeImageUrl } from "./commerceUtils";

/**
 * @docHint
 * @purpose CommerceImageManager 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain commerce
 * @scope client
 */

// 상품 이미지 프리로드 상태 관리
export class CommerceImageManager {
  private preloadedImages = new Set<string>();
  private loadingImages = new Map<string, Promise<boolean>>();

  // 상품 이미지 프리로드
  async preloadImage(imageUrl: string): Promise<boolean> {
    // 이미 로드된 이미지는 건너뛰기
    if (this.preloadedImages.has(imageUrl)) {
      return true;
    }

    // 이미 로딩 중인 이미지는 기존 Promise 반환
    if (this.loadingImages.has(imageUrl)) {
      return this.loadingImages.get(imageUrl)!;
    }

    // 새 이미지 로드 시작
    const loadPromise = this.loadImageSafely(imageUrl);
    this.loadingImages.set(imageUrl, loadPromise);

    const result = await loadPromise;

    // 로딩 완료 후 Promise 제거
    this.loadingImages.delete(imageUrl);

    if (result) {
      this.preloadedImages.add(imageUrl);
    }

    return result;
  }

  // 안전한 이미지 로드
  private async loadImageSafely(imageUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();

      const finalUrl =
        imageUrl.includes("/api/proxy/image?url=") || imageUrl.startsWith("/assets/")
          ? imageUrl
          : getSafeImageUrl(imageUrl);

      const timeout = setTimeout(() => {
        console.warn(`이미지 로드 타임아웃: ${finalUrl}`);
        cleanup(false);
      }, 10000);

      const cleanup = (ok: boolean) => {
        clearTimeout(timeout);
        img.onload = null;
        img.onerror = null;
        resolve(ok);
      };

      img.onload = () => cleanup(true);
      img.onerror = () => {
        console.warn(`이미지 프리로드 실패: ${finalUrl}`);
        cleanup(false);
      };

      img.crossOrigin = "anonymous";
      img.src = finalUrl;
    });
  }

  // 프리로드 상태 확인
  isPreloaded(imageUrl: string): boolean {
    return this.preloadedImages.has(imageUrl);
  }

  // 캐시 정리
  clearCache(): void {
    this.preloadedImages.clear();
    this.loadingImages.clear();
  }
}

// 싱글톤 인스턴스 생성
export const commerceImageManager = new CommerceImageManager();
