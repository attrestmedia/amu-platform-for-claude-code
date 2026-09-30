/**
 * 생성 콘텐츠를 본문 블록으로 나누고 참고 이미지를 일정한 간격으로 배치한다.
 *
 * 모델이 이미지 URL을 직접 생성하지 않도록 하면서도, 화면 미리보기와
 * 스마트스토어 HTML 변환이 같은 배치 규칙을 사용하도록 순수 함수로 둔다.
 */
export function splitGeneratedContentBlocks(raw: unknown) {
  const source = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!source) return [];

  const blankLineBlocks = source
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blankLineBlocks.length > 1) {
    const grouped: string[] = [];
    for (let index = 0; index < blankLineBlocks.length; index++) {
      const block = blankLineBlocks[index];
      const next = blankLineBlocks[index + 1];
      if (next && /^#{1,6}\s+.+$/.test(block) && !/^#{1,6}\s+/.test(next)) {
        grouped.push(`${block}\n\n${next}`);
        index++;
        continue;
      }
      grouped.push(block);
    }
    return grouped;
  }

  // 빈 줄이 없는 출력도 heading 단위로 나누어 이미지가 모두 마지막에 몰리지 않게 한다.
  const lines = source.split("\n");
  if (!lines.some((line) => /^#{1,6}\s+/.test(line.trim()))) return blankLineBlocks;

  const sections: string[] = [];
  let current: string[] = [];
  lines.forEach((line) => {
    if (/^#{1,6}\s+/.test(line.trim()) && current.some((item) => item.trim())) {
      sections.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  });
  if (current.some((item) => item.trim())) sections.push(current.join("\n").trim());
  return sections.length > 0 ? sections : blankLineBlocks;
}

/** 각 이미지가 삽입될 본문 block의 zero-based index. 결과와 서버 HTML이 동일한 순서를 쓴다. */
export function distributeGeneratedContentImageSlots(blockCount: number, imageCount: number) {
  const safeBlockCount = Math.max(0, Math.floor(Number(blockCount) || 0));
  const safeImageCount = Math.max(0, Math.floor(Number(imageCount) || 0));
  if (!safeBlockCount || !safeImageCount) return [];

  return Array.from({ length: safeImageCount }, (_, imageIndex) => {
    const proportionalIndex = Math.ceil(((imageIndex + 1) * safeBlockCount) / (safeImageCount + 1)) - 1;
    return Math.max(0, Math.min(safeBlockCount - 1, proportionalIndex));
  });
}
