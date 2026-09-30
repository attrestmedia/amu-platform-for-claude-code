const BODY_SCROLL_LOCK_COUNT_ATTR = "data-amu-body-scroll-lock-count";
const BODY_SCROLL_LOCK_PREV_OVERFLOW_ATTR = "data-amu-body-scroll-lock-prev-overflow";

const getBody = () => {
  if (typeof document === "undefined") return null;
  return document.body;
};

const getLockCount = (body: HTMLElement) => {
  const count = Number.parseInt(body.getAttribute(BODY_SCROLL_LOCK_COUNT_ATTR) || "0", 10);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
};

// body 스크롤 잠금 헬퍼: 여러 모달/시트가 동시에 열려도 먼저 닫힌 쪽이 lock을 풀지 않도록 카운터로 관리
export function lockBodyScroll() {
  const body = getBody();
  if (!body) return;

  const currentCount = getLockCount(body);

  if (currentCount === 0) {
    body.setAttribute(BODY_SCROLL_LOCK_PREV_OVERFLOW_ATTR, body.style.overflow || "");
    body.style.overflow = "hidden";
  }

  body.setAttribute(BODY_SCROLL_LOCK_COUNT_ATTR, String(currentCount + 1));
}

// body 스크롤 잠금 해제: 마지막 lock이 해제될 때만 기존 overflow 상태로 복구
export function unlockBodyScroll() {
  const body = getBody();
  if (!body) return;

  const currentCount = getLockCount(body);
  if (currentCount <= 0) return;

  const nextCount = currentCount - 1;

  if (nextCount > 0) {
    body.setAttribute(BODY_SCROLL_LOCK_COUNT_ATTR, String(nextCount));
    return;
  }

  const prevOverflow = body.getAttribute(BODY_SCROLL_LOCK_PREV_OVERFLOW_ATTR) || "";

  if (prevOverflow) {
    body.style.overflow = prevOverflow;
  } else {
    body.style.removeProperty("overflow");
  }

  body.removeAttribute(BODY_SCROLL_LOCK_COUNT_ATTR);
  body.removeAttribute(BODY_SCROLL_LOCK_PREV_OVERFLOW_ATTR);
}
