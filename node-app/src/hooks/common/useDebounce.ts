import { useState, useEffect, useRef, useCallback } from "react";
import { debounce } from "utils/helper";

/**
 * @docHint
 * @purpose useDebounce 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain common-hooks
 * @scope global
 */

// 함수 generic 제약 — never[] 인수로 contravariance를 활용해 어떤 함수도 받을 수 있게 한다.
// (no-explicit-any 회피용 표준 패턴)
interface DebouncedFunction<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  cancel: () => void;
  flush: () => ReturnType<T> | undefined;
  pending: () => boolean;
}

// 값을 디바운스하는 훅
export function useDebounceValue<T>(
  value: T,
  delay = 500,
  options: {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number;
  } = {}
): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  // 객체 deps 정적 추적 회피용 원시값 추출
  const { leading: optLeading, trailing: optTrailing, maxWait: optMaxWait } = options;

  useEffect(() => {
    // 디바운스 함수 생성
    // 더 명확한 타입 명시
    const handler = debounce<() => void>(
      () => {
        setDebouncedValue(value);
      },
      delay,
      { leading: optLeading, trailing: optTrailing, maxWait: optMaxWait }
    ) as DebouncedFunction<() => void>;

    // 값이 변경될 때마다 디바운스 함수 호출
    handler();

    // 컴포넌트 언마운트 또는 의존성 변경 시 정리
    return () => {
      handler.cancel();
    };
  }, [value, delay, optLeading, optTrailing, optMaxWait]);

  return debouncedValue;
}

// 콜백 함수를 디바운스하는 훅
export function useDebounceCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay = 500,
  options: {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number;
    dependencies?: readonly unknown[];
  } = {}
) {
  const { dependencies = [], leading: optLeading, trailing: optTrailing, maxWait: optMaxWait } = options;

  // 최신 콜백을 보존하기 위한 ref
  const callbackRef = useRef<T>(callback);

  // 디바운스된 함수 ref - null 초기값 제공
  const debouncedRef = useRef<DebouncedFunction<(...args: Parameters<T>) => ReturnType<T> | undefined> | null>(null);

  // 콜백 함수 업데이트
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 디바운스된 함수 생성 또는 업데이트 — dependencies는 사용자가 명시한 외부 deps로 spread하여 동적 추적 불가(static-deps 경고는 의도적 disable)
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    // 더 명확한 타입 명시 — never[] 제약 하에서 ReturnType<T> 좁힘이 어렵기에 명시적 cast 사용.
    const wrappedCallback = ((...args: Parameters<T>): ReturnType<T> => {
      return callbackRef.current(...args) as ReturnType<T>;
    }) as (...args: Parameters<T>) => ReturnType<T>;

    debouncedRef.current = debounce<(...args: Parameters<T>) => ReturnType<T>>(
      wrappedCallback,
      delay,
      { leading: optLeading, trailing: optTrailing, maxWait: optMaxWait }
    ) as DebouncedFunction<(...args: Parameters<T>) => ReturnType<T> | undefined>;

    return () => {
      debouncedRef.current?.cancel();
    };
  }, [delay, optLeading, optTrailing, optMaxWait, ...dependencies]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // 메모이제이션된 디바운스 함수 및 제어 메서드 반환
  const debouncedCallback = useCallback(
    (...args: Parameters<T>): ReturnType<T> | undefined => {
      return debouncedRef.current?.(...args);
    },
    [debouncedRef]
  );

  const cancel = useCallback(() => {
    debouncedRef.current?.cancel();
  }, [debouncedRef]);

  const flush = useCallback(() => {
    return debouncedRef.current?.flush();
  }, [debouncedRef]);

  const pending = useCallback(() => {
    return debouncedRef.current?.pending() ?? false;
  }, [debouncedRef]);

  return {
    callback: debouncedCallback,
    cancel,
    flush,
    pending,
  };
}
