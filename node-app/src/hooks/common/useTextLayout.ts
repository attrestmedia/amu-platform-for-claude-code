"use client";

import { useEffect, useState } from "react";
import type { PreparedTextLayoutHandle, TextLayoutMetrics, TextLayoutRequest } from "types/ui";
import { ensurePreparedTextLayoutFontReady, measurePreparedTextLayoutSync, prepareTextLayoutSync } from "utils/common";

type UseTextLayoutState = {
  metrics: TextLayoutMetrics | null;
  prepared: PreparedTextLayoutHandle | null;
  pending: boolean;
  error: Error | null;
};

/**
 * @docHint
 * @purpose useTextLayout 훅 클라이언트 텍스트 레이아웃 측정 캡슐화
 * @process 공통 preset/font-ready/cache 기반 텍스트 메트릭 계산 제공
 * @domain text-layout
 * @scope client
 */
// request=null 시 안정 참조
const EMPTY_LAYOUT_STATE: UseTextLayoutState = {
  metrics: null,
  prepared: null,
  pending: false,
  error: null,
};

export function useTextLayout(request: TextLayoutRequest | null): UseTextLayoutState {
  const [state, setState] = useState<UseTextLayoutState>(EMPTY_LAYOUT_STATE);

  const requestText = request?.text;
  const requestPreset = request?.preset;
  const requestMaxWidth = request?.maxWidth;
  const requestMaxLines = request?.maxLines;
  const requestLocale = request?.locale;
  const requestDirection = request?.direction;
  const requestWhiteSpace = request?.whiteSpace;
  const requestWordBreak = request?.wordBreak;
  const requestFontFamily = request?.fontFamily;
  const requestFontSizePx = request?.fontSizePx;
  const requestLineHeightPx = request?.lineHeightPx;
  const requestFontWeight = request?.fontWeight;
  const requestKey = requestPreset
    ? JSON.stringify([
        requestText,
        requestPreset,
        requestMaxWidth,
        requestMaxLines,
        requestLocale,
        requestDirection,
        requestWhiteSpace,
        requestWordBreak,
        requestFontFamily,
        requestFontSizePx,
        requestLineHeightPx,
        requestFontWeight,
      ])
    : "";

  // request null 전환을 render-time 비교로 처리 → effect 내부 setState(null reset) 제거
  const [prevRequestKey, setPrevRequestKey] = useState(requestKey);
  if (prevRequestKey !== requestKey) {
    setPrevRequestKey(requestKey);
    if (!requestPreset) setState(EMPTY_LAYOUT_STATE);
  }

  // 외부 입력(request)에 동기화하는 정당한 measure/prepare 패턴 — setState는 cascading render 트리거가 아님.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!requestPreset || typeof requestMaxWidth !== "number") return;

    let cancelled = false;
    const layoutRequest: TextLayoutRequest = {
      text: requestText ?? "",
      preset: requestPreset,
      maxWidth: requestMaxWidth,
      maxLines: requestMaxLines,
      locale: requestLocale,
      direction: requestDirection,
      whiteSpace: requestWhiteSpace,
      wordBreak: requestWordBreak,
      fontFamily: requestFontFamily,
      fontSizePx: requestFontSizePx,
      lineHeightPx: requestLineHeightPx,
      fontWeight: requestFontWeight,
    };

    try {
      const prepared = prepareTextLayoutSync(layoutRequest);
      const metrics = measurePreparedTextLayoutSync(prepared, layoutRequest.maxWidth, { maxLines: layoutRequest.maxLines });

      setState({
        metrics,
        prepared,
        pending: !metrics.fontReady,
        error: null,
      });

      if (!metrics.fontReady) {
        void ensurePreparedTextLayoutFontReady(prepared)
          .then(() => {
            if (cancelled) return;

            const nextPrepared = prepareTextLayoutSync(layoutRequest);
            const nextMetrics = measurePreparedTextLayoutSync(nextPrepared, layoutRequest.maxWidth, { maxLines: layoutRequest.maxLines });

            setState({
              metrics: nextMetrics,
              prepared: nextPrepared,
              pending: false,
              error: null,
            });
          })
          .catch((error) => {
            if (cancelled) return;

            setState({
              metrics,
              prepared,
              pending: false,
              error: error instanceof Error ? error : new Error("text_layout_font_ready_failed"),
            });
          });
      }
    } catch (error) {
      setState({
        metrics: null,
        prepared: null,
        pending: false,
        error: error instanceof Error ? error : new Error("text_layout_measure_failed"),
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    requestText,
    requestPreset,
    requestMaxWidth,
    requestMaxLines,
    requestLocale,
    requestDirection,
    requestWhiteSpace,
    requestWordBreak,
    requestFontFamily,
    requestFontSizePx,
    requestLineHeightPx,
    requestFontWeight,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return state;
}
