import {
  distributeGeneratedContentImageSlots,
  splitGeneratedContentBlocks,
} from "./generatedContentLayout";

export type SmartstoreDetailHtmlIssueSeverity = "error" | "warning";

export type SmartstoreDetailHtmlIssue = {
  code: string;
  severity: SmartstoreDetailHtmlIssueSeverity;
  count: number;
  message: {
    ko: string;
    en: string;
  };
};

export type SmartstoreDetailHtmlValidationResult = {
  ready: boolean;
  issues: SmartstoreDetailHtmlIssue[];
  errors: SmartstoreDetailHtmlIssue[];
  warnings: SmartstoreDetailHtmlIssue[];
};

const BLOCKED_TAGS = [
  "script",
  "style",
  "title",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "button",
  "table",
] as const;

const REMOVE_WITH_CONTENT_TAGS = new Set(["script", "style", "title", "iframe", "object", "embed"]);
const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "h2",
  "h3",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "u",
  "ul",
]);

const VALID_CLASS_TOKEN_RE = /^[A-Za-z0-9_-]+$/;

function isBrowserDomAvailable() {
  return typeof document !== "undefined";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function countPattern(source: string, pattern: RegExp) {
  return source.match(pattern)?.length || 0;
}

function isSafeUrl(value: string) {
  const url = value.trim();
  return /^https?:\/\//i.test(url);
}

function sanitizeClassName(value: string) {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && VALID_CLASS_TOKEN_RE.test(token))
    .slice(0, 16)
    .join(" ");
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function removeUnsafeAttributes(element: Element) {
  const tagName = element.tagName.toLowerCase();

  if (tagName === "img") {
    const src = element.getAttribute("src") || "";
    const dataSrc = element.getAttribute("data-src") || "";
    if (!isSafeUrl(src) && isSafeUrl(dataSrc)) {
      element.setAttribute("src", dataSrc);
    }
  }

  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    const value = attribute.value.trim();

    if (name.startsWith("on") || name === "style" || name === "srcset") {
      element.removeAttribute(attribute.name);
      return;
    }

    if (name === "class") {
      const className = sanitizeClassName(value);
      if (className) element.setAttribute("class", className);
      else element.removeAttribute(attribute.name);
      return;
    }

    if (tagName === "a" && name === "href") {
      if (!isSafeUrl(value)) {
        element.removeAttribute(attribute.name);
        return;
      }
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
      return;
    }

    if (tagName === "img" && name === "src") {
      if (!isSafeUrl(value)) {
        element.remove();
        return;
      }
      return;
    }

    if (tagName === "img" && (name === "alt" || name === "loading")) return;
    if (name === "target" || name === "rel") return;

    element.removeAttribute(attribute.name);
  });

  if (tagName === "img") {
    if (!element.getAttribute("src")) {
      element.remove();
      return;
    }
    if (!element.getAttribute("loading")) element.setAttribute("loading", "lazy");
  }

  if (tagName === "a" && !element.getAttribute("href")) unwrapElement(element);
}

function sanitizeDomNode(node: Node) {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const element = child as Element;
    const tagName = element.tagName.toLowerCase();

    if (REMOVE_WITH_CONTENT_TAGS.has(tagName)) {
      element.remove();
      return;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      sanitizeDomNode(element);
      unwrapElement(element);
      return;
    }

    removeUnsafeAttributes(element);
    if (element.isConnected || element.parentNode) sanitizeDomNode(element);
  });
}

function sanitizeHtmlWithDom(raw: string) {
  const template = document.createElement("template");
  template.innerHTML = raw;
  sanitizeDomNode(template.content);
  return template.innerHTML;
}

function sanitizeHtmlFallback(raw: string) {
  let next = raw;
  REMOVE_WITH_CONTENT_TAGS.forEach((tag) => {
    next = next.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    next = next.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  });
  next = next.replace(/<!--[\s\S]*?-->/g, "");
  next = next.replace(/\s(?:on[a-z]+|style|srcset)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  next = next.replace(/\s(?:href|src)\s*=\s*("|\')\s*(?:javascript:|data:)[\s\S]*?\1/gi, "");
  next = next.replace(/<\/?(?:table|thead|tbody|tfoot|tr|td|th|col|colgroup)[^>]*>/gi, " ");
  return next.trim();
}

function pushIssue(
  bucket: Map<string, SmartstoreDetailHtmlIssue>,
  code: string,
  severity: SmartstoreDetailHtmlIssueSeverity,
  count: number,
  message: SmartstoreDetailHtmlIssue["message"],
) {
  if (count <= 0) return;
  bucket.set(code, { code, severity, count, message });
}

function renderInlineMarkdown(raw: string) {
  let next = escapeHtml(raw);
  next = next.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  next = next.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  next = next.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  next = next.replace(/_([^_]+)_/g, "<em>$1</em>");
  return next;
}

function plainTextToParagraphHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${renderInlineMarkdown(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function sanitizeSmartstoreDetailHtml(raw: unknown) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return isBrowserDomAvailable() ? sanitizeHtmlWithDom(value) : sanitizeHtmlFallback(value);
}

export function markdownToSmartstoreHtml(raw: unknown) {
  const source = String(raw || "").trim();
  if (!source) return "";
  if (/<[a-z][\s\S]*>/i.test(source)) return sanitizeSmartstoreDetailHtml(source);

  const lines = source.split(/\r?\n/);
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index++;
      continue;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h2) {
      html.push(`<h2>${renderInlineMarkdown(h2[1].trim())}</h2>`);
      index++;
      continue;
    }
    if (h3) {
      html.push(`<h3>${renderInlineMarkdown(h3[1].trim())}</h3>`);
      index++;
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(orderedList ? /^\d+[.)]\s+(.+)$/ : /^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(`<li>${renderInlineMarkdown(item[1].trim())}</li>`);
        index++;
      }
      html.push(`<${orderedList ? "ol" : "ul"}>${items.join("")}</${orderedList ? "ol" : "ul"}>`);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^#{2,3}\s+/.test(next) || /^[-*]\s+/.test(next) || /^\d+[.)]\s+/.test(next)) break;
      paragraph.push(next);
      index++;
    }
    html.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
  }

  return sanitizeSmartstoreDetailHtml(html.join(""));
}

export function markdownToSmartstoreHtmlWithImages(raw: unknown, imageUrls: string[] = []) {
  const source = String(raw || "").trim();
  const safeUrls = Array.from(new Set((imageUrls || []).map((url) => String(url || "").trim()).filter(isSafeUrl))).slice(0, 4);
  if (!source || !safeUrls.length) return markdownToSmartstoreHtml(source);

  const blocks = splitGeneratedContentBlocks(source);
  if (!blocks.length) return "";

  const imageSlots = distributeGeneratedContentImageSlots(blocks.length, safeUrls.length);
  const imagesByBlock = new Map<number, string[]>();
  safeUrls.forEach((url, index) => {
    const blockIndex = imageSlots[index] ?? blocks.length - 1;
    const current = imagesByBlock.get(blockIndex) || [];
    current.push(url);
    imagesByBlock.set(blockIndex, current);
  });

  const html: string[] = [];
  blocks.forEach((block, blockIndex) => {
    html.push(markdownToSmartstoreHtml(block));
    (imagesByBlock.get(blockIndex) || []).forEach((url) => {
      html.push(buildSmartstoreDetailImageHtml(url));
    });
  });
  return sanitizeSmartstoreDetailHtml(html.join(""));
}

export function plainTextToSmartstoreHtml(raw: unknown) {
  return sanitizeSmartstoreDetailHtml(plainTextToParagraphHtml(String(raw || "")));
}

export function buildSmartstoreDetailImageHtml(url: string, align: "left" | "center" | "right" = "center") {
  const safeUrl = escapeAttribute(String(url || "").trim());
  if (!isSafeUrl(safeUrl)) return "";
  return [
    '<div class="se-component se-image se-l-default __se-component">',
    '<div class="se-component-content se-component-content-fit">',
    `<div class="se-section se-section-image se-l-default se-section-align-${align}">`,
    '<div class="se-module se-module-image">',
    `<img src="${safeUrl}" alt="" loading="lazy" class="se-image-resource">`,
    "</div>",
    "</div>",
    "</div>",
    "</div>",
  ].join("");
}

export function buildSmartstoreQuoteBlockHtml(text = "") {
  const safeText = escapeHtml(String(text || "").trim());
  return [
    '<blockquote class="amu-smartstore-quote-block">',
    safeText ? `<p>${safeText.replace(/\r?\n/g, "<br>")}</p>` : "<p><br></p>",
    "</blockquote>",
  ].join("");
}

export function extractSmartstoreDetailImageUrls(raw: unknown) {
  const value = String(raw || "");
  if (!value.trim()) return [];

  const urls: string[] = [];
  const pushUrl = (url: string) => {
    const trimmed = String(url || "").trim();
    if (isSafeUrl(trimmed) && !urls.includes(trimmed)) urls.push(trimmed);
  };

  if (isBrowserDomAvailable()) {
    const template = document.createElement("template");
    template.innerHTML = value;
    template.content.querySelectorAll("img").forEach((image) => {
      pushUrl(image.getAttribute("src") || "");
      pushUrl(image.getAttribute("data-src") || "");
    });
    return urls;
  }

  Array.from(value.matchAll(/<img\b[^>]*>/gi)).forEach((match) => {
    const tag = match[0] || "";
    const src = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const dataSrc = tag.match(/\sdata-src\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    pushUrl(src);
    pushUrl(dataSrc);
  });

  return urls;
}

export function validateSmartstoreDetailHtml(raw: unknown): SmartstoreDetailHtmlValidationResult {
  const value = String(raw || "").trim();
  const issueMap = new Map<string, SmartstoreDetailHtmlIssue>();

  if (!value) {
    pushIssue(issueMap, "detail_empty", "error", 1, {
      ko: "상세 설명은 필수입니다.",
      en: "Detail content is required.",
    });
  }

  BLOCKED_TAGS.forEach((tag) => {
    const count = countPattern(value, new RegExp(`<\\/?${tag}\\b`, "gi"));
    pushIssue(issueMap, `blocked_tag_${tag}`, tag === "table" ? "warning" : "error", count, {
      ko: `<${tag}> 태그는 스마트스토어 상세 HTML에서 차단되거나 변환되지 않을 수 있습니다.`,
      en: `<${tag}> may be blocked or ignored in Smart Store detail HTML.`,
    });
  });

  pushIssue(issueMap, "event_attribute", "error", countPattern(value, /\son[a-z]+\s*=/gi), {
    ko: "이벤트 속성(on*)은 보안상 제거해야 합니다.",
    en: "Event attributes (on*) must be removed for security.",
  });
  pushIssue(issueMap, "style_attribute", "warning", countPattern(value, /\sstyle\s*=/gi), {
    ko: "인라인 style은 네이버 등록 과정에서 제거되거나 다르게 보일 수 있습니다.",
    en: "Inline style may be removed or rendered differently by Naver.",
  });
  pushIssue(issueMap, "data_image", "error", countPattern(value, /<img\b[^>]*\ssrc\s*=\s*["']\s*data:image\//gi), {
    ko: "data:image 이미지는 스마트스토어에 반영되지 않을 수 있습니다. 업로드된 이미지 URL을 사용하세요.",
    en: "data:image sources may not be accepted. Use uploaded image URLs.",
  });
  pushIssue(issueMap, "unsafe_link", "error", countPattern(value, /\shref\s*=\s*["']\s*(?:javascript:|data:)/gi), {
    ko: "허용되지 않는 링크 프로토콜이 포함되어 있습니다.",
    en: "The detail contains an unsafe link protocol.",
  });

  const issues = Array.from(issueMap.values());
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    ready: errors.length === 0,
    issues,
    errors,
    warnings,
  };
}

export function isSmartstoreDetailHtmlReady(raw: unknown) {
  return validateSmartstoreDetailHtml(raw).ready;
}

export { ALLOWED_TAGS as SMARTSTORE_DETAIL_ALLOWED_TAGS };
