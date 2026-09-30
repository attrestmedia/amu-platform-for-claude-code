import { Texture, ImageSource, Sprite } from "pixi.js";

/**
 * @docHint
 * @purpose textureUpdateUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain pixi
 * @scope client-only
 */

// 이미지 URL에서 동적으로 텍스처 생성
export function createTextureFromUrl(imageUrl: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      try {
        // v8 방식으로 소스 및 텍스처 생성
        const source = new ImageSource({
          resource: image,
        });

        const texture = new Texture({
          source,
        });

        resolve(texture);
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      reject(new Error(`이미지 로드 실패: ${imageUrl}`));
    };

    // 이미지 로드 시작
    image.src = imageUrl;
  });
}

// 주어진 이미지 URL로 Sprite 텍스처를 교체하는 유틸
// - state → imageUrl 매핑은 호출하는 쪽(StageDoc.meta 등)에서 결정
export async function updateSpriteTextureFromUrl(sprite: Sprite, imageUrl: string): Promise<Texture> {
  const texture = await createTextureFromUrl(imageUrl);
  sprite.texture = texture;
  return texture;
}
