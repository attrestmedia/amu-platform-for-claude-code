/**
 * @docHint
 * @purpose SmartstoreDetailEditor의 contentEditable 편집 명령(인라인 서식/블록 변환/목록/HTML 삽입)을 Selection/Range API로 처리
 * @process 현재 selection 검증 → DOM 변형(wrap/unwrap/rename/split) → caret/selection 복원
 * @domain commerce.naver
 * @scope client
 */

export type SmartstoreInlineFormatTag = "strong" | "em" | "u";
export type SmartstoreBlockFormatTag = "p" | "h2" | "h3";

// 같은 서식으로 취급할 태그 별칭 (b→strong, i→em)
const INLINE_TAG_ALIASES: Record<SmartstoreInlineFormatTag, readonly string[]> = {
  strong: ["strong", "b"],
  em: ["em", "i"],
  u: ["u"],
};

const LEAF_BLOCK_TAGS = new Set(["p", "h2", "h3", "li"]);
const BLOCK_LEVEL_TAGS = new Set(["blockquote", "div", "h2", "h3", "hr", "li", "ol", "p", "ul"]);
const LEAF_BLOCK_SELECTOR = "p, h2, h3, li, div";
const INNER_BLOCK_SELECTOR = "p, h2, h3, ul, ol, li, blockquote, div, hr";

function toElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function getEditorRange(editor: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const target = toElement(range.commonAncestorContainer);
  if (!target || !editor.contains(target)) return null;
  return range;
}

function setSelectionRange(range: Range) {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function hasVisibleContent(node: Element | DocumentFragment) {
  return Boolean((node.textContent || "").trim()) || Boolean(node.querySelector("img, hr, br"));
}

function closestMatching(node: Node | null, editor: HTMLElement, matches: (element: Element) => boolean) {
  let current = toElement(node);
  while (current && current !== editor) {
    if (matches(current)) return current as HTMLElement;
    current = current.parentElement;
  }
  return null;
}

function closestLeafBlock(node: Node | null, editor: HTMLElement) {
  return closestMatching(node, editor, (element) => LEAF_BLOCK_TAGS.has(element.tagName.toLowerCase()));
}

// class 없는 div만 "느슨한 블록"으로 취급 (se-component 계열 div는 class를 가짐)
function isPlainDiv(element: Element) {
  return element.tagName.toLowerCase() === "div" && !element.getAttribute("class");
}

function renameElement(element: HTMLElement, tag: string): HTMLElement {
  if (element.tagName.toLowerCase() === tag) return element;
  const next = document.createElement(tag);
  const className = element.getAttribute("class");
  if (className) next.setAttribute("class", className);
  while (element.firstChild) next.appendChild(element.firstChild);
  element.replaceWith(next);
  return next;
}

function unwrapKeepChildren(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function stripInlineTags(root: ParentNode, aliases: readonly string[]) {
  aliases.forEach((alias) => {
    Array.from(root.querySelectorAll(alias)).forEach((element) => unwrapKeepChildren(element));
  });
}

type RangePoints = {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
};

function captureRangePoints(range: Range): RangePoints {
  return {
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
  };
}

function maxOffset(node: Node) {
  return node.nodeType === Node.TEXT_NODE ? (node.textContent || "").length : node.childNodes.length;
}

// 블록 rename/이동은 자식 노드를 그대로 옮기므로, 기존 텍스트 노드 기준 selection을 복원할 수 있다.
function restoreRangePoints(editor: HTMLElement, points: RangePoints) {
  if (!editor.contains(points.startContainer) || !editor.contains(points.endContainer)) return false;
  try {
    const range = document.createRange();
    range.setStart(points.startContainer, Math.min(points.startOffset, maxOffset(points.startContainer)));
    range.setEnd(points.endContainer, Math.min(points.endOffset, maxOffset(points.endContainer)));
    setSelectionRange(range);
    return true;
  } catch {
    return false;
  }
}

function placeCaretAtEndOf(target: Element) {
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  setSelectionRange(range);
}

// selection과 교차하는 "leaf 블록"(내부에 다른 블록이 없는 p/h2/h3/li/plain div) 수집
function collectLeafBlocks(editor: HTMLElement, range: Range): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  editor.querySelectorAll<HTMLElement>(LEAF_BLOCK_SELECTOR).forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "div" && !isPlainDiv(element)) return;
    if (element.querySelector(LEAF_BLOCK_SELECTOR)) return;
    if (!range.intersectsNode(element)) return;
    blocks.push(element);
  });
  if (blocks.length === 0) {
    const closest = closestLeafBlock(range.startContainer, editor);
    if (closest) blocks.push(closest);
  }
  return blocks;
}

/** 선택 영역에 strong/em/u 인라인 서식을 토글한다. collapsed selection은 무시. */
export function toggleSmartstoreInlineFormat(editor: HTMLElement, tag: SmartstoreInlineFormatTag): boolean {
  const range = getEditorRange(editor);
  if (!range || range.collapsed) return false;

  const aliases = INLINE_TAG_ALIASES[tag];
  const wrapper = closestMatching(range.commonAncestorContainer, editor, (element) =>
    aliases.includes(element.tagName.toLowerCase()),
  );

  if (wrapper) {
    // 해제: wrapper를 (head)(선택 구간: 서식 제거)(tail)로 분할
    const points = captureRangePoints(range);
    const tailRange = document.createRange();
    tailRange.setStart(points.endContainer, points.endOffset);
    tailRange.setEndAfter(wrapper);
    const tailFragment = tailRange.extractContents();

    const middleRange = document.createRange();
    middleRange.setStart(points.startContainer, points.startOffset);
    middleRange.setEndAfter(wrapper);
    const middleFragment = middleRange.extractContents();
    stripInlineTags(middleFragment, aliases);

    const parent = wrapper.parentNode;
    if (!parent) return false;
    const anchor = wrapper.nextSibling;
    const middleNodes = Array.from(middleFragment.childNodes);
    parent.insertBefore(middleFragment, anchor);
    parent.insertBefore(tailFragment, anchor);
    if (!hasVisibleContent(wrapper)) wrapper.remove();

    if (middleNodes.length > 0) {
      const nextRange = document.createRange();
      nextRange.setStartBefore(middleNodes[0]);
      nextRange.setEndAfter(middleNodes[middleNodes.length - 1]);
      setSelectionRange(nextRange);
    }
    return true;
  }

  // 적용: 선택 구간을 추출해 중첩된 같은 서식을 제거한 뒤 새 태그로 감싼다
  const fragment = range.extractContents();
  stripInlineTags(fragment, aliases);
  const wrapperElement = document.createElement(tag);
  wrapperElement.appendChild(fragment);
  range.insertNode(wrapperElement);

  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapperElement);
  setSelectionRange(nextRange);
  return true;
}

/** 선택 영역과 교차하는 텍스트 블록을 p/h2/h3로 변환한다. (li는 목록 구조 보존을 위해 제외) */
export function applySmartstoreBlockFormat(editor: HTMLElement, tag: SmartstoreBlockFormatTag): boolean {
  const range = getEditorRange(editor);
  if (!range) return false;

  const points = captureRangePoints(range);
  const blocks = collectLeafBlocks(editor, range).filter((element) => element.tagName.toLowerCase() !== "li");
  if (blocks.length === 0) return false;

  let changed = false;
  const renamed = blocks.map((block) => {
    const next = renameElement(block, tag);
    if (next !== block) changed = true;
    return next;
  });

  if (!restoreRangePoints(editor, points) && renamed[0]) placeCaretAtEndOf(renamed[0]);
  return changed;
}

/**
 * 목록 토글. 선택 블록이 모두 목록 안이면 같은 타입은 해제(li→p), 다른 타입은 ul↔ol 변환.
 * 목록 밖 블록은 하나의 새 목록으로 묶는다.
 */
export function toggleSmartstoreListFormat(editor: HTMLElement, ordered: boolean): boolean {
  const range = getEditorRange(editor);
  if (!range) return false;

  const listTag = ordered ? "ol" : "ul";
  const points = captureRangePoints(range);
  const blocks = collectLeafBlocks(editor, range);
  if (blocks.length === 0) return false;

  const listItems = blocks.filter((element) => element.tagName.toLowerCase() === "li");

  if (listItems.length === blocks.length) {
    const lists = Array.from(
      new Set(listItems.map((item) => item.parentElement).filter((list): list is HTMLElement => Boolean(list))),
    );
    const allSameType = lists.every((list) => list.tagName.toLowerCase() === listTag);

    if (allSameType) {
      lists.forEach((list) => {
        Array.from(list.children).forEach((item) => {
          const paragraph = document.createElement("p");
          while (item.firstChild) paragraph.appendChild(item.firstChild);
          list.parentNode?.insertBefore(paragraph, list);
        });
        list.remove();
      });
    } else {
      lists.forEach((list) => renameElement(list, listTag));
    }

    if (!restoreRangePoints(editor, points)) placeCaretAtEndOf(editor);
    return true;
  }

  const targets = blocks.filter((element) => element.tagName.toLowerCase() !== "li");
  if (targets.length === 0) return false;

  const list = document.createElement(listTag);
  targets[0].parentNode?.insertBefore(list, targets[0]);
  targets.forEach((block) => {
    const item = document.createElement("li");
    while (block.firstChild) item.appendChild(block.firstChild);
    list.appendChild(item);
    block.remove();
  });

  if (!restoreRangePoints(editor, points)) placeCaretAtEndOf(list);
  return true;
}

/**
 * 현재 selection 위치에 sanitize된 HTML을 삽입한다.
 * 블록 요소를 문단 안에 삽입하는 경우 문단을 분할해 형제로 배치하고, caret을 삽입 내용 뒤로 이동한다.
 */
export function insertSmartstoreHtmlAtSelection(editor: HTMLElement, html: string): boolean {
  const range = getEditorRange(editor);
  if (!range) return false;

  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = template.content;
  if (!fragment.firstChild) return false;

  range.deleteContents();

  const containsBlock = Array.from(fragment.children).some((element) =>
    BLOCK_LEVEL_TAGS.has(element.tagName.toLowerCase()),
  );
  const lastNode = fragment.lastChild;
  const block = containsBlock ? closestLeafBlock(range.startContainer, editor) : null;

  if (block && block.tagName.toLowerCase() !== "li") {
    // caret 이후 내용을 분리해 [block(head)] [삽입 내용] [tail] 순서로 배치
    const tailRange = document.createRange();
    tailRange.setStart(range.startContainer, range.startOffset);
    tailRange.setEndAfter(block);
    const tailFragment = tailRange.extractContents();

    const parent = block.parentNode;
    if (!parent) return false;
    const anchor = block.nextSibling;
    parent.insertBefore(fragment, anchor);
    if (hasVisibleContent(tailFragment)) parent.insertBefore(tailFragment, anchor);
    if (!hasVisibleContent(block)) block.remove();
  } else {
    range.insertNode(fragment);
  }

  if (lastNode && editor.contains(lastNode)) {
    const caret = document.createRange();
    caret.setStartAfter(lastNode);
    caret.collapse(true);
    setSelectionRange(caret);
  }
  return true;
}

/**
 * contentEditable 기본 동작이 만든 class 없는 div를 정규화한다.
 * 내부에 블록이 있으면 unwrap, 인라인만 있으면 p로 변환. (se-component div는 class가 있어 보존)
 */
export function normalizeSmartstorePlainDivs(html: string): string {
  if (typeof document === "undefined" || !html) return html;

  const template = document.createElement("template");
  template.innerHTML = html;
  let changed = false;

  Array.from(template.content.querySelectorAll("div")).forEach((div) => {
    if (!isPlainDiv(div)) return;
    if (div.querySelector(INNER_BLOCK_SELECTOR)) unwrapKeepChildren(div);
    else renameElement(div, "p");
    changed = true;
  });

  return changed ? template.innerHTML : html;
}
