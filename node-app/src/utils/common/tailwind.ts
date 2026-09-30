import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * 프로젝트의 커스텀 Tailwind 유틸리티(`src/styles/tailwind/utilities.css`)를 tailwind-merge 그룹에 등록
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["xxs"] }],
      // z-popper를 z-index 그룹으로 등록해야 `cn("z-popper", "z-50")` 같은 조합에서 뒤 값이 앞 값을 대체한다.
      // 등록하지 않으면 두 클래스가 함께 남아 CSS 선언 순서에 따라 레이어가 뒤집힌다.
      z: [{ z: ["popper"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
