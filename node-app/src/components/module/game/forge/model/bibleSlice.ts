/**
 * 5방향 바이블 시트 슬라이스 유틸 (S2 대시보드 카드 · S5 BibleSliceGrid 공유).
 *
 * 바이블 시트는 down, down-right, up-left, up, left 5개 방향을 한 행에 담는다.
 * 한 방향 슬라이스는 backgroundSize 500% 100% + backgroundPosition (index/4)*100% 50%로 잘라낸다.
 */

export const BIBLE_DIRECTION_ORDER = ["down", "down-right", "up-left", "up", "left"] as const;
export type BibleDirectionType = (typeof BIBLE_DIRECTION_ORDER)[number];

export function bibleSliceBackground(index: number, url: string) {
  const safeUrl = String(url || "").replace(/"/g, "%22");
  const position = `${(index / (BIBLE_DIRECTION_ORDER.length - 1)) * 100}% 50%`;
  return {
    backgroundImage: safeUrl ? `url("${safeUrl}")` : undefined,
    backgroundSize: "500% 100%",
    backgroundPosition: position,
    backgroundRepeat: "no-repeat",
  };
}
