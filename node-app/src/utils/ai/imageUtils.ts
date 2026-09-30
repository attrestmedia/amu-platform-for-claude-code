import type { SupportedAspectRatio } from "consts/ai";
import { DEFAULT_IMAGE_ASPECT, SUPPORTED_ASPECT_RATIOS } from "consts/ai";
import { lang } from "components/module/i18n";

/**
 * @docHint
 * @purpose imageUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain ai
 * @scope client
 */

// 클라이언트용 비율 정규화
export const normalizeAspectRatioClient = (
  input?: string | null,
  allowedRatios: readonly SupportedAspectRatio[] = SUPPORTED_ASPECT_RATIOS,
): SupportedAspectRatio => {
  const raw = (input || "").trim();
  if (!raw) return DEFAULT_IMAGE_ASPECT;
  const found = allowedRatios.find((r) => r === raw);
  return (found || DEFAULT_IMAGE_ASPECT) as SupportedAspectRatio;
};

// 이미지 비율 계산하여 자동 라벨링
export const renderAspectOptionLabel = (ratio: SupportedAspectRatio) => {
  const [wStr, hStr] = ratio.split(":");
  const w = Number(wStr);
  const h = Number(hStr);

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    // 혹시 이상한 값이 들어와도 최소한 원래 비율은 보여주기
    return ratio;
  }

  if (w === h) {
    return `${ratio} (${lang({ ko: "정사각형", en: "Square" })})`;
  }
  if (w < h) {
    return `${ratio} (${lang({ ko: "세로형", en: "Portrait" })})`;
  }
  return `${ratio} (${lang({ ko: "가로형", en: "Landscape" })})`;
};
