export const CONTENT_ASSET_CARD_PREVIEW_MAX_CHARS = 420;

type ContentAssetPreviewLike = {
  assetId: string;
  createdAt: string | number | Date | null;
};

function toTimestamp(value: ContentAssetPreviewLike["createdAt"]) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function mergeContentAssetPreviewMaps<T extends ContentAssetPreviewLike>(
  templateKeys: string[],
  publicRowsByTemplate: Record<string, T[]>,
  ownedRowsByTemplate: Record<string, T[]>,
  perTemplate: number,
) {
  return templateKeys.reduce<Record<string, T[]>>((acc, key) => {
    const seen = new Set<string>();
    acc[key] = [...(ownedRowsByTemplate[key] || []), ...(publicRowsByTemplate[key] || [])]
      .filter((row) => {
        if (!row.assetId || seen.has(row.assetId)) return false;
        seen.add(row.assetId);
        return true;
      })
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
      .slice(0, perTemplate);
    return acc;
  }, {});
}

export function truncateContentAssetPreview(value: unknown, maxChars = CONTENT_ASSET_CARD_PREVIEW_MAX_CHARS) {
  const text = String(value || "").trim();
  const safeMaxChars = Math.max(1, Math.floor(maxChars));
  const characters = Array.from(text);
  if (characters.length <= safeMaxChars) return text;
  return `${characters.slice(0, safeMaxChars).join("").trimEnd()}…`;
}

function stripPreviewTitleSyntax(value: string) {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*+]\s+|>\s+|\d+[.)]\s+)/, "")
    .replace(/^[`*_~]+|[`*_~]+$/g, "")
    .trim();
}

export function getContentAssetPreviewTitle(value: unknown, fallback: string) {
  const source = String(value || "").trim();
  if (/^[{[]/.test(source)) return truncateContentAssetPreview(fallback, 72);

  const firstLine = source
    .split(/\r?\n/)
    .map((line) => stripPreviewTitleSyntax(line))
    .find(Boolean);
  return truncateContentAssetPreview(firstLine || fallback, 72);
}

export function getContentAssetPreviewBody(value: unknown, title: string) {
  const lines = String(value || "").split(/\r?\n/);
  const firstContentLineIndex = lines.findIndex((line) => Boolean(stripPreviewTitleSyntax(line)));
  if (firstContentLineIndex < 0) return "";

  const firstLineTitle = stripPreviewTitleSyntax(lines[firstContentLineIndex]);
  const bodyLines = firstLineTitle === title ? lines.slice(firstContentLineIndex + 1) : lines.slice(firstContentLineIndex);
  return truncateContentAssetPreview(bodyLines.join("\n").trim(), CONTENT_ASSET_CARD_PREVIEW_MAX_CHARS);
}
