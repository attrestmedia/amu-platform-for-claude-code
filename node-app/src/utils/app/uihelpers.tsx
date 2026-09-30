import type { PromptItemType, PromptSearchFieldType } from "types/app";

// 프롬프트 검색 필드
export function getPromptFieldText(row: PromptItemType, field: PromptSearchFieldType) {
  if (field === "categories") return (row.categories || []).join(" ");
  if (field === "tags") return (row.tags || []).join(" ");
  if (field === "title") return String(row.title || "");
  if (field === "key") return String(row.key || "");
  return [row.key, row.title, row.accessLevel || "", ...(row.categories || []), ...(row.tags || [])].join(" ");
}
