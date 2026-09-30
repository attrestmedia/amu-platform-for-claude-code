import Image from "next/image";
import React from "react";
import { cn } from "utils/common";

/**
 * 이미지 실제 사이즈에 부모 컴포넌트를 맞추는 헬퍼 UI
 */
type TWObjectFit = "object-contain" | "object-cover" | "object-fill" | "object-none" | "object-scale-down";

type TWObjectPosition =
  | "object-bottom"
  | "object-center"
  | "object-left"
  | "object-left-bottom"
  | "object-left-top"
  | "object-right"
  | "object-right-bottom"
  | "object-right-top"
  | "object-top";

type ImageBoxProps = {
  src: string;
  alt?: string;
  allowUpscale?: boolean;
  sizes?: string;
  className?: string;
  objectFit?: TWObjectFit;
  objectPosition?: TWObjectPosition;
  width?: number | string;
  height?: number | string;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
};

const failedLocalImageSrcs = new Set<string>();
const retryingLocalImageSrcs = new Set<string>();

function appendImageRetryParam(src: string, nonce: number) {
  if (!nonce) return src;
  if (!src.startsWith("/")) return src;
  const joiner = src.includes("?") ? "&" : "?";
  return `${src}${joiner}amuImageRetry=${nonce}`;
}

export function ImageBox({
  src,
  alt,
  allowUpscale = false,
  sizes,
  className = "",
  objectFit = "object-scale-down",
  objectPosition = "object-center",
  width,
  height,
  minWidth = 160,
  maxWidth = 320,
  minHeight = minWidth,
  maxHeight = maxWidth,
}: ImageBoxProps) {
  // 로딩 완료 후 최종 박스 크기
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [sourceUnavailable, setSourceUnavailable] = React.useState(() => failedLocalImageSrcs.has(src));
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // width/height 중 하나가 auto(또는 미지정)일 때, 비율 계산
  const [aspect, setAspect] = React.useState<number | null>(null);

  const isAutoValue = React.useCallback((v?: number | string) => {
    if (v == null) return true;
    if (typeof v === "string") return v.trim().toLowerCase() === "auto";
    return false;
  }, []);

  // 한 쪽만 고정 + 다른 쪽이 auto/미지정이면 aspect-ratio로 자동 계산
  const useAutoAspect = React.useMemo(() => {
    const wFixed = width != null && !isAutoValue(width);
    const hFixed = height != null && !isAutoValue(height);
    return (wFixed && isAutoValue(height)) || (hFixed && isAutoValue(width));
  }, [width, height, isAutoValue]);

  // src/크기 조건이 "변경"될 때만 리셋 (초기 마운트에서는 리셋 금지)
  const sig = React.useMemo(() => `${src}|${String(width)}|${String(height)}`, [src, width, height]);
  const prevSigRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (prevSigRef.current && prevSigRef.current !== sig) {
      setAspect(null);
      setBox(null);
      setRetryNonce(0);
      setSourceUnavailable(failedLocalImageSrcs.has(src));
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }
    prevSigRef.current = sig;
  }, [sig, src]);

  React.useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const displaySrc = React.useMemo(() => appendImageRetryParam(src, retryNonce), [src, retryNonce]);

  const markLocalSourceFailed = React.useCallback(() => {
    if (!src.startsWith("/")) return;
    failedLocalImageSrcs.add(src);
    retryingLocalImageSrcs.delete(src);
    setSourceUnavailable(true);
  }, [src]);

  // 초기 렌더에서는 "최소 크기"로 자리 확보 - 명시적 크기 우선 적용
  const initialWH = React.useMemo(() => {
    const explicitW = typeof width === "number" ? width : null;
    const explicitH = typeof height === "number" ? height : null;

    // 숫자 width만 지정 → 임시 정사각 자리, 로딩 후 비율 계산
    if (explicitW != null && explicitH == null) return { w: explicitW, h: explicitW };
    // 숫자 height만 지정 → 임시 정사각 자리, 로딩 후 비율 계산
    if (explicitH != null && explicitW == null) return { w: explicitH, h: explicitH };
    // 둘 다 숫자면 그대로
    if (explicitW != null && explicitH != null) return { w: explicitW, h: explicitH };

    // 문자열 또는 미지정: 최소 가로/세로로 안전 확보
    const fallbackW = Math.min(Math.max(minWidth, 1), maxWidth);
    const fallbackH = Math.min(Math.max(minHeight, 1), maxHeight);
    return { w: fallbackW, h: fallbackH };
  }, [minWidth, maxWidth, minHeight, maxHeight, width, height]);

  // Image 로딩 후 naturalWidth/Height로 원본 사이즈를 얻고,
  // allowUpscale 여부에 따라 scale 계산 후 최종 w/h를 min~max 범위로 클램프
  const applyNaturalSize = (w: number, h: number) => {
    if (!w || !h) return;
    const ratio = w / h || 1;

    // auto-aspect 모드에서만 aspect 상태를 사용(불필요한 리렌더 줄임)
    if (useAutoAspect) {
      setAspect((prev) => (prev === ratio ? prev : ratio));
      return;
    }

    // 1) 명시적 width/height 처리
    if (typeof width === "number" && typeof height !== "number") {
      const autoH = Math.round(width / ratio);
      setBox({ w: width, h: autoH });
      return;
    }
    if (typeof height === "number" && typeof width !== "number") {
      const autoW = Math.round(height * ratio);
      setBox({ w: autoW, h: height });
      return;
    }
    if (typeof width === "number" && typeof height === "number") {
      setBox({ w: width, h: height });
      return;
    }

    // 2) 가로/세로 독립 클램프 스케일 계산
    // - sMin: 최소 요구를 만족하기 위한 스케일(둘 중 큰 값)
    // - sMax: 최대 한계를 넘지 않기 위한 스케일(둘 중 작은 값)
    const sMinW = minWidth / w;
    const sMinH = minHeight / h;
    const sMaxW = maxWidth / w;
    const sMaxH = maxHeight / h;

    const sMin = Math.max(sMinW, sMinH);
    const sMax = Math.min(sMaxW, sMaxH);

    let scale: number;

    if (allowUpscale) {
      // 업스케일 허용: [sMin ~ sMax] 범위 내에서 1을 우선 선택, 범위를 벗어나면 가장 가까운 경계로
      if (sMin <= sMax) {
        const oneClamped = Math.max(sMin, Math.min(1, sMax));
        scale = oneClamped;
      } else {
        // 모순 제약(최소가 최대를 초과) → 최대 한계 쪽으로 맞춤
        scale = sMax;
      }
    } else {
      // 업스케일 불가: 1을 초과하지 않으면서도 최대 한계를 넘지 않는 가장 큰 값
      scale = Math.min(1, sMax);
      if (!isFinite(scale) || scale <= 0) scale = 1;
    }

    const targetW = Math.round(w * scale);
    const targetH = Math.round(h * scale);

    setBox({ w: targetW, h: targetH });
  };

  return (
    <div
      className={cn("relative block overflow-hidden", className)}
      style={
        useAutoAspect
          ? ({
              ...(isAutoValue(width) ? {} : { width }),
              ...(isAutoValue(height) ? {} : { height }),
              // 로딩 전엔 1:1로 자리 확보 → 로딩 후 원본 비율로 갱신
              aspectRatio: aspect ?? 1,
            } as React.CSSProperties)
          : ({
              width: typeof width === "string" && !isAutoValue(width) ? width : (box?.w ?? initialWH.w),
              height: typeof height === "string" && !isAutoValue(height) ? height : (box?.h ?? initialWH.h),
            } as React.CSSProperties)
      }
    >
      {!sourceUnavailable && (
        <Image
          src={displaySrc}
          alt={alt ?? ""}
          fill
          className={cn(objectFit, objectPosition)}
          sizes={sizes ?? "(max-width: 640px) 92vw, 520px"}
          unoptimized
          onError={() => {
            if (!src.startsWith("/")) return;
            if (retryNonce > 0) {
              markLocalSourceFailed();
              return;
            }
            if (retryTimerRef.current) return;
            if (failedLocalImageSrcs.has(src) || retryingLocalImageSrcs.has(src)) {
              setSourceUnavailable(true);
              return;
            }
            retryingLocalImageSrcs.add(src);
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              setRetryNonce((prev) => (prev > 0 ? prev : Date.now()));
            }, 250);
          }}
          onLoad={(e) => {
            retryingLocalImageSrcs.delete(src);
            const img = e.currentTarget;
            applyNaturalSize(img.naturalWidth || 0, img.naturalHeight || 0);
          }}
        />
      )}
    </div>
  );
}
