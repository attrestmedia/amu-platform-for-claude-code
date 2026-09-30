/**
 * @docHint
 * @purpose welcomUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain universe
 * @scope client
 */

// localStorage key prefix
const KEY_PREFIX = "amu.welcome.";

// 최근 표시 후 cooldownHours 이내면 false, 지나면 true
export function shouldShowWelcome(universeId: string, cooldownHours = 24): boolean {
  if (typeof window === "undefined") return false; // SSR 방어
  try {
    const key = KEY_PREFIX + universeId;
    const raw = localStorage.getItem(key);
    if (!raw) return true;
    const last = Number(raw);
    if (Number.isNaN(last)) return true;
    const elapsedMs = Date.now() - last;
    return elapsedMs >= cooldownHours * 60 * 60 * 1000;
  } catch {
    // 스토리지 접근 오류 시 보수적으로 표시
    return true;
  }
}

// 팝업 표시 완료 시 호출하여 현재 시각을 저장
export function markWelcomeShown(universeId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY_PREFIX + universeId, String(Date.now()));
  } catch {
    // 저장 실패는 무시 (다음 진입 시 다시 표출될 수 있음)
  }
}
