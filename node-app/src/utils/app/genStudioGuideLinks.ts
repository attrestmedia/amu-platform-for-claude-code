const GEN_STUDIO_GUIDE_BASE_URL = "https://allmyuniverse.com";
export type GenStudioTemplateGuideKind = "image" | "content";

function toSafeTemplateKey(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

export function getGenStudioTemplateArticleUrl(
  templateKey?: string | null,
  kind: GenStudioTemplateGuideKind = "image",
) {
  const safeTemplateKey = toSafeTemplateKey(templateKey);
  if (!safeTemplateKey) return "";

  const guidePrefix = kind === "content" ? "content-prompt-guide" : "image-prompt-guide";
  return `${GEN_STUDIO_GUIDE_BASE_URL}/${guidePrefix}-${encodeURIComponent(safeTemplateKey)}/`;
}
