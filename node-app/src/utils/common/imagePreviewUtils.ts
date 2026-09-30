export function dedupeImagePreviewsByUrl<T extends { url?: unknown }>(images: readonly T[]) {
  const seenUrls = new Set<string>();

  return images.filter((image) => {
    const url = String(image.url || "").trim();
    if (!url || seenUrls.has(url)) return false;
    seenUrls.add(url);
    return true;
  });
}
