"use client";

import { useEffect, useState } from "react";
import type { PreparedTextLayoutHandle, PreparedTextLayoutRequest } from "types/ui";
import { ensurePreparedTextLayoutFontReady, measurePreparedTextLayoutSync, prepareTextLayoutSync } from "utils/common";

type UsePreparedTextLayoutState = {
  prepared: PreparedTextLayoutHandle | null;
  pending: boolean;
  error: Error | null;
};

/**
 * @docHint
 * @purpose usePreparedTextLayout 훅 클라이언트 prepare/layout 분리 캡슐화
 * @process 텍스트 준비 결과를 캐시하고 width 변화 시 재측정 함수 제공
 * @domain text-layout
 * @scope client
 */
// request=null 시 노출되는 안정 참조 (매 렌더 새 객체로 인한 소비자 재실행 방지)
const EMPTY_PREPARED_STATE: UsePreparedTextLayoutState = {
  prepared: null,
  pending: false,
  error: null,
};

export function usePreparedTextLayout(request: PreparedTextLayoutRequest | null) {
  const [state, setState] = useState<UsePreparedTextLayoutState>(EMPTY_PREPARED_STATE);

  const requestText = request?.text;
  const requestPreset = request?.preset;
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
    if (!requestPreset) setState(EMPTY_PREPARED_STATE);
  }

  // 외부 입력(request)에 동기화하는 정당한 measure/prepare 패턴 — setState는 cascading render 트리거가 아님.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!requestPreset) return;

    let cancelled = false;
    const preparedRequest: PreparedTextLayoutRequest = {
      text: requestText ?? "",
      preset: requestPreset,
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
      const prepared = prepareTextLayoutSync(preparedRequest);

      setState({
        prepared,
        pending: !prepared.fontReady,
        error: null,
      });

      if (!prepared.fontReady) {
        void ensurePreparedTextLayoutFontReady(prepared)
          .then(() => {
            if (cancelled) return;

            setState({
              prepared: prepareTextLayoutSync(preparedRequest),
              pending: false,
              error: null,
            });
          })
          .catch((error) => {
            if (cancelled) return;

            setState({
              prepared,
              pending: false,
              error: error instanceof Error ? error : new Error("prepared_text_layout_font_ready_failed"),
            });
          });
      }
    } catch (error) {
      setState({
        prepared: null,
        pending: false,
        error: error instanceof Error ? error : new Error("prepared_text_layout_failed"),
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    requestText,
    requestPreset,
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

  return {
    ...state,
    measure: (maxWidth: number, maxLines?: number) => {
      if (!state.prepared) return null;
      return measurePreparedTextLayoutSync(state.prepared, maxWidth, { maxLines });
    },
  };
}
