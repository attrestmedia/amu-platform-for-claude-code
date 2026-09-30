/**
 * @docHint
 * @purpose debounce 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain utils
 * @scope global
 */

type ArgsOf<T> = T extends (...args: infer TArgs) => unknown ? TArgs : never;
type ResultOf<T> = T extends (...args: never[]) => infer TResult ? TResult : unknown;

interface DebouncedFunction<T> {
  (...args: ArgsOf<T>): ResultOf<T> | undefined;
  cancel(): void;
  flush(): ResultOf<T> | undefined;
  pending(): boolean;
}

export function debounce<T>(
  func: T,
  wait = 300,
  options: {
    leading?: boolean; // 첫 호출 시 즉시 실행 여부
    trailing?: boolean; // 마지막 호출 후 실행 여부
    maxWait?: number; // 최대 대기 시간 (밀리초)
  } = {}
): DebouncedFunction<T> {
  const { leading = false, trailing = true, maxWait } = options;

  let lastCallTime = 0; // 마지막 함수 호출 시간
  let lastInvokeTime = 0; // 마지막 함수 실행 시간
  let timerId: NodeJS.Timeout | null = null; // 타이머 ID
  let lastArgs: ArgsOf<T> | null = null; // 마지막 함수 인자
  let lastThis: unknown; // 마지막 this 컨텍스트
  let result: ResultOf<T>; // 함수 실행 결과

  // 최대 대기 시간 설정
  const maxWaitTime = maxWait !== undefined ? Math.max(maxWait, wait) : 0;

  // 함수 실행 여부 확인
  const shouldInvoke = (time: number): boolean => {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    // 첫 호출이거나 마지막 호출 후 대기 시간이 지났거나 최대 대기 시간이 지난 경우
    return (
      lastCallTime === 0 || // 첫 호출
      timeSinceLastCall >= wait || // 일반 대기 시간 초과
      (maxWaitTime > 0 && timeSinceLastInvoke >= maxWaitTime) // 최대 대기 시간 초과
    );
  };

  // 실제 함수 실행
  const invokeFunc = (time: number): ResultOf<T> => {
    const args = lastArgs!;
    const thisArg = lastThis;

    // 상태 초기화
    lastArgs = null;
    lastThis = undefined;
    lastInvokeTime = time;

    // 원본 함수 실행
    result = (func as (this: unknown, ...args: ArgsOf<T>) => ResultOf<T>).apply(thisArg, args);
    return result;
  };

  // 타이머 실행
  const startTimer = (pendingFunc: () => void, wait: number): NodeJS.Timeout => {
    return setTimeout(pendingFunc, wait) as unknown as NodeJS.Timeout;
  };

  // 타이머 실행 함수
  const timerExpired = (): void => {
    const time = Date.now();

    // 함수를 실행해야 하는지 확인
    if (shouldInvoke(time)) {
      trailingEdge(time);
      return;
    }

    // 다음 타이머 예약
    timerId = startTimer(timerExpired, remainingWait(time));
  };

  // leading edge 처리 (함수 호출 시작 시)
  const leadingEdge = (time: number): ResultOf<T> | undefined => {
    lastInvokeTime = time;

    // 트레일링 엣지용 타이머 설정
    timerId = startTimer(timerExpired, wait);

    // leading=true인 경우에만 즉시 함수 실행
    return leading ? invokeFunc(time) : result;
  };

  // trailing edge 처리 (함수 호출 종료 시)
  const trailingEdge = (time: number): ResultOf<T> | undefined => {
    timerId = null;

    // trailing=true이고 마지막 호출 인자가 있는 경우에만 실행
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }

    // 상태 초기화
    lastArgs = null;
    lastThis = undefined;

    return result;
  };

  // 남은 대기 시간 계산
  const remainingWait = (time: number): number => {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = wait - timeSinceLastCall;

    // 일반 대기 시간과 최대 대기 시간 중 더 짧은 시간 반환
    return maxWaitTime > 0 ? Math.min(timeWaiting, maxWaitTime - timeSinceLastInvoke) : timeWaiting;
  };

  // 디바운스된 함수 (명확한 반환 타입 지정)
  const debounced = function (this: unknown, ...args: ArgsOf<T>): ResultOf<T> | undefined {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    // 함수 호출 상태 저장
    lastArgs = args;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastThis = this;
    lastCallTime = time;

    // 함수 실행 여부 확인
    if (isInvoking) {
      if (timerId === null) {
        return leadingEdge(time);
      }

      // 최대 대기 시간이 설정된 경우
      if (maxWaitTime > 0) {
        timerId = startTimer(timerExpired, wait);
        return invokeFunc(time);
      }
    }

    // 타이머가 없는 경우 새 타이머 시작
    if (timerId === null) {
      timerId = startTimer(timerExpired, wait);
    }

    return result;
  };

  // 디바운스 함수 취소 메서드
  debounced.cancel = function (): void {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastCallTime = 0;
    timerId = null;
    lastArgs = null;
    lastThis = undefined;
  };

  // 디바운스 함수 즉시 실행 메서드
  debounced.flush = function (): ResultOf<T> | undefined {
    return timerId === null ? result : trailingEdge(Date.now());
  };

  // 디바운스 함수가 대기 중인지 확인하는 메서드
  debounced.pending = function (): boolean {
    return timerId !== null;
  };

  return debounced;
}
