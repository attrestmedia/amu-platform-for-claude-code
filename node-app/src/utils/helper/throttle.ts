import { debounce } from "./debounce";

/**
 * @docHint
 * @purpose throttle 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain utils
 * @scope global
 */

// 스로틀 유틸리티 함수 - 일정 시간 간격으로 함수 호출을 제한
export function throttle<T extends (this: unknown, ...args: unknown[]) => unknown>(
  func: T,
  wait = 300,
  options: {
    leading?: boolean;
    trailing?: boolean;
  } = {}
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  // debounce 함수를 사용하여 스로틀 구현
  // maxWait을 wait과 동일하게 설정하여 일정 간격으로 실행되도록 함
  return debounce(func, wait, {
    leading: options.leading ?? true,
    trailing: options.trailing ?? true,
    maxWait: wait,
  }) as unknown as (...args: Parameters<T>) => ReturnType<T> | undefined;
}
