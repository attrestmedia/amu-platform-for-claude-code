import type { TextSplit } from './types';

/**
 * 텍스트를 애니메이션 단위(unit)와 레이아웃 트리로 분할한다.
 * - 글자 분할은 Intl.Segmenter(grapheme) 기반이라 한글 조합형·이모지가 깨지지 않는다.
 * - char 분할 시 단어를 nowrap 그룹으로 묶어 줄바꿈이 단어 경계에서만 일어난다.
 * React/DOM 어댑터 모두 이 트리 하나로 마크업을 만든다.
 */

export type TextLayoutNode =
  | { type: 'unit'; index: number; text: string; space: boolean }
  | { type: 'text'; text: string }
  | { type: 'break' }
  | { type: 'word'; children: TextLayoutNode[] };

export interface TextSegmentation {
  split: TextSplit;
  units: string[];
  tree: TextLayoutNode[];
}

type GraphemeSegmenter = { segment(input: string): Iterable<{ segment: string }> };

let graphemeSegmenter: GraphemeSegmenter | null | undefined;

function splitGraphemes(text: string): string[] {
  if (graphemeSegmenter === undefined) {
    const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => GraphemeSegmenter })
      .Segmenter;
    graphemeSegmenter = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }
  if (!graphemeSegmenter) return Array.from(text);
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
}

const WHITESPACE = /^\s+$/;

export function segmentText(input: string, split: TextSplit): TextSegmentation {
  const text = input.replace(/\r\n?/g, '\n');
  const units: string[] = [];
  const tree: TextLayoutNode[] = [];
  const pushUnit = (target: TextLayoutNode[], value: string, space = false) => {
    target.push({ type: 'unit', index: units.length, text: value, space });
    units.push(value);
  };

  const lines = text.split('\n');

  if (split === 'whole') {
    // 단일 unit. 줄바꿈은 unit 내부에서 white-space: pre-line 으로 유지된다.
    if (text) pushUnit(tree, text);
    return { split, units, tree };
  }

  if (split === 'line') {
    lines.forEach((line, i) => {
      if (i > 0) tree.push({ type: 'break' });
      if (line) pushUnit(tree, line);
    });
    return { split, units, tree };
  }

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) tree.push({ type: 'break' });
    for (const token of line.split(/(\s+)/)) {
      if (!token) continue;
      const isSpace = WHITESPACE.test(token);
      if (split === 'word') {
        if (isSpace) tree.push({ type: 'text', text: token });
        else pushUnit(tree, token);
        continue;
      }
      // char
      if (isSpace) {
        for (const ch of splitGraphemes(token)) pushUnit(tree, ch, true);
      } else {
        const word: TextLayoutNode = { type: 'word', children: [] };
        for (const ch of splitGraphemes(token)) pushUnit(word.children, ch);
        tree.push(word);
      }
    }
  });

  return { split, units, tree };
}
