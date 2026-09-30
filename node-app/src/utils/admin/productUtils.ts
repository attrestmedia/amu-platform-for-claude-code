import type { IProduct } from "types/game";

/**
 * @docHint
 * @purpose productUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain commerce
 * @scope shared
 */

// 가격 표시 헬퍼
export const formatProductPrice = (p: IProduct) => {
  const type = p.priceType || "fixed";

  if (type === "text") {
    return p.priceText?.trim() || "문의";
  }

  if (type === "range") {
    const min = Number(p.priceMin || 0);
    const max = Number(p.priceMax || 0);
    if (min && max) return `${min.toLocaleString()} ~ ${max.toLocaleString()}원`;
    if (min && !max) return `${min.toLocaleString()}원~`;
    if (!min && max) return `~${max.toLocaleString()}원`;
    return "가격 문의";
  }

  // fixed
  const v = Number(p.price || 0);
  return v ? `${v.toLocaleString()}원` : "가격 문의";
};

// 노출 순서 정렬 헬퍼
export const sortProductsByOrder = (list: IProduct[]) => {
  return [...(list || [])].sort((a, b) => {
    const ao = a.order ?? 0;
    const bo = b.order ?? 0;
    if (ao !== bo) return ao - bo;
    // 동일 순서일 때 제목으로 보조 정렬(안정적 UI)
    return (a.title || "").localeCompare(b.title || "");
  });
};
