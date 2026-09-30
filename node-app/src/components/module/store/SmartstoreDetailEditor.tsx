"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Clipboard,
  Copy,
  Eye,
  FileText,
  ImagePlus,
  Images,
  Info,
  Italic,
  Link,
  List,
  Minus,
  Package,
  RotateCcw,
  RotateCw,
  Shield,
  Trash2,
  Type,
  Underline,
  Upload,
  Wand,
  X,
} from "lucide-react";
import { Button, Badge, RichTextRenderer, Textarea, dialog, ScrollArea } from "@amu-labs/ui";
import { MAX_BASE_FILE_BYTES } from "consts/app";
import { Lang, lang } from "components/module/i18n";
import { cn, extractApiErrorMessage } from "utils/common";
import { writeTextToClipboard } from "utils/helper";
import { formatBytes } from "utils/normalize";
import {
  buildSmartstoreDetailImageHtml,
  buildSmartstoreQuoteBlockHtml,
  plainTextToSmartstoreHtml,
  sanitizeSmartstoreDetailHtml,
  validateSmartstoreDetailHtml,
} from "utils/commerce/smartstoreDetailHtmlUtils";
import {
  applySmartstoreBlockFormat,
  insertSmartstoreHtmlAtSelection,
  normalizeSmartstorePlainDivs,
  toggleSmartstoreInlineFormat,
  toggleSmartstoreListFormat,
  type SmartstoreBlockFormatTag,
  type SmartstoreInlineFormatTag,
} from "utils/commerce/smartstoreDetailEditorCommands";

type SmartstoreDetailEditorMode = "write" | "preview" | "html";
type SmartstoreDetailImageAlign = "left" | "center" | "right";
type SmartstoreDetailInfoTemplateKind = "product" | "shipping" | "care";
type SmartstoreDetailInfoTemplateStyle = "basic" | "compact" | "divider";

export type SmartstoreDetailImageCandidate = {
  id: string;
  url: string;
  label?: {
    ko: string;
    en: string;
  };
  description?: string;
  source?: string;
};

export type SmartstoreDetailEditorHandle = {
  insertImageUrl: (url: string) => boolean;
  insertHtml: (html: string) => boolean;
  focus: () => void;
};

export type SmartstoreDetailInfoTemplateContext = {
  productName?: string;
  summary?: string;
  price?: string;
  stockQuantity?: string;
  brandName?: string;
  manufacturerName?: string;
  modelName?: string;
  originAreaName?: string;
  originContent?: string;
  shippingPolicyText?: string;
  returnPolicyText?: string;
  asPolicyText?: string;
  sizeGuideText?: string;
  careGuideText?: string;
  noticeItems?: Array<{ label: string; value: string }>;
};

type SmartstoreDetailEditorProps = {
  value: string;
  onChange: (value: string) => void;
  detailImageUrls?: string[];
  imageCandidates?: SmartstoreDetailImageCandidate[];
  infoTemplateContext?: SmartstoreDetailInfoTemplateContext;
  onImageAiEdit?: (imageUrl: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
  onOpenImageStudio?: () => void;
  className?: string;
};

type SmartstoreInsertionMode = "focused" | "async" | "external";

type SmartstoreInsertOptions = {
  insertionMode?: SmartstoreInsertionMode;
};

type SmartstoreImageFeedback = {
  kind: "error" | "status";
  message: {
    ko: string;
    en: string;
  };
};

const SMARTSTORE_BODY_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const SMARTSTORE_BODY_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

function validateSmartstoreBodyImageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "image_url_empty";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "image_url_invalid";
    return "";
  } catch {
    return "image_url_invalid";
  }
}

function validateSmartstoreBodyImageFile(file: File) {
  if (file.size <= 0) return "empty_file";
  if (file.size > MAX_BASE_FILE_BYTES) return "file_too_large";
  if (!SMARTSTORE_BODY_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) return "invalid_file_type";
  return "";
}

function getSmartstoreImageFeedback(code: string): SmartstoreImageFeedback {
  if (code === "image_url_empty") {
    return {
      kind: "error",
      message: { ko: "이미지 URL을 입력해 주세요.", en: "Enter an image URL." },
    };
  }
  if (code === "image_url_invalid") {
    return {
      kind: "error",
      message: {
        ko: "이미지 URL은 http:// 또는 https:// 주소여야 합니다.",
        en: "The image URL must use http:// or https://.",
      },
    };
  }
  if (code === "empty_file") {
    return {
      kind: "error",
      message: { ko: "빈 이미지 파일은 업로드할 수 없습니다.", en: "An empty image file cannot be uploaded." },
    };
  }
  if (code === "file_too_large") {
    const maxSize = formatBytes(MAX_BASE_FILE_BYTES);
    return {
      kind: "error",
      message: {
        ko: `이미지는 ${maxSize} 이하만 업로드할 수 있습니다.`,
        en: `Images must be ${maxSize} or smaller.`,
      },
    };
  }
  if (["invalid_file_type", "image_mime_mismatch"].includes(code)) {
    return {
      kind: "error",
      message: {
        ko: "PNG, JPEG, WebP, GIF 이미지만 업로드할 수 있습니다.",
        en: "Upload a PNG, JPEG, WebP, or GIF image.",
      },
    };
  }
  if (code === "image_dimensions_invalid") {
    return {
      kind: "error",
      message: {
        ko: "이미지 크기를 확인해 주세요. 가로와 세로가 각각 12,000px 이하여야 합니다.",
        en: "Check the image dimensions. Each side must be 12,000 px or smaller.",
      },
    };
  }
  if (["r2_storage_required", "r2_object_verification_failed"].includes(code)) {
    return {
      kind: "error",
      message: {
        ko: "이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        en: "Image storage is unavailable. Try again later.",
      },
    };
  }
  if (code === "insertion_failed") {
    return {
      kind: "error",
      message: {
        ko: "이미지를 본문에 삽입하지 못했습니다. 커서 위치를 확인한 뒤 다시 시도해 주세요.",
        en: "The image could not be inserted. Check the cursor position and try again.",
      },
    };
  }
  return {
    kind: "error",
    message: { ko: "이미지를 업로드하지 못했습니다. 다시 시도해 주세요.", en: "The image could not be uploaded. Try again." },
  };
}

type ToolbarButtonProps = {
  label: {
    ko: string;
    en: string;
  };
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
};

function ToolbarButton({ label, onClick, children, active }: ToolbarButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      rounded="md"
      className={cn(active && "bg-primary/10 text-primary")}
      aria-label={lang(label)}
      title={lang(label)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const MAX_EDITOR_HISTORY = 100;

function normalizeEditableHtml(value: string) {
  const sanitized = normalizeSmartstorePlainDivs(sanitizeSmartstoreDetailHtml(value));
  return sanitized || "<p><br></p>";
}

function imageUrlPreviewLabel(url: string, index: number) {
  try {
    const parsed = new URL(url);
    return `${index + 1}. ${parsed.hostname}${parsed.pathname.slice(-28)}`;
  } catch {
    return `${index + 1}. ${url.slice(0, 36)}`;
  }
}

function escapeHtmlContent(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getImageAlignClass(align: SmartstoreDetailImageAlign) {
  return `se-section-align-${align}`;
}

function getSmartstoreImageSrc(image: HTMLImageElement | null) {
  return String(image?.getAttribute("data-src") || image?.getAttribute("src") || "").trim();
}

function getImageEditTarget(image: HTMLImageElement | null) {
  if (!image) return null;
  return (
    (image.closest(".se-component.se-image") as HTMLElement | null) ||
    (image.closest(".se-component") as HTMLElement | null) ||
    (image.closest("p") as HTMLElement | null) ||
    image
  );
}

function isSelectionInsideEditor(editor: HTMLElement, selection: Selection | null) {
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return isRangeInsideEditor(editor, range);
}

function isRangeInsideEditor(editor: HTMLElement, range: Range | null) {
  if (!range) return false;
  try {
    return editor.contains(range.startContainer) && editor.contains(range.endContainer);
  } catch {
    return false;
  }
}

function placeCaretAtEnd(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
}

function getRangeDisplayRect(range: Range) {
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0];
  const rect = range.getBoundingClientRect();
  return rect.width || rect.height ? rect : null;
}

function getImageCandidateKey(candidate: SmartstoreDetailImageCandidate, index: number) {
  return candidate.id || `${candidate.url}:${index}`;
}

function normalizeInfoValue(value: unknown) {
  return String(value || "").trim();
}

function buildInfoLine(label: string, value: string) {
  const trimmed = normalizeInfoValue(value);
  if (!trimmed) return "";
  return `<li><strong>${escapeHtmlContent(label)}</strong>: ${escapeHtmlContent(trimmed)}</li>`;
}

function buildInfoParagraph(text: string) {
  const trimmed = normalizeInfoValue(text);
  if (!trimmed) return "";
  return `<p>${escapeHtmlContent(trimmed).replace(/\r?\n/g, "<br>")}</p>`;
}

function buildInfoSection(title: string, body: string, style: SmartstoreDetailInfoTemplateStyle) {
  if (!body) return "";
  const heading =
    style === "compact"
      ? `<p><strong>${escapeHtmlContent(title)}</strong></p>`
      : `<h3>${escapeHtmlContent(title)}</h3>`;
  return `${heading}${body}`;
}

function buildSmartstoreInfoTemplateHtml(
  kind: SmartstoreDetailInfoTemplateKind,
  style: SmartstoreDetailInfoTemplateStyle,
  context?: SmartstoreDetailInfoTemplateContext,
) {
  const productName = normalizeInfoValue(context?.productName) || "상품명";
  const headingByKind: Record<SmartstoreDetailInfoTemplateKind, string> = {
    product: "상품 정보",
    shipping: "배송 및 교환 안내",
    care: "사이즈 및 관리 안내",
  };
  const blocks: string[] = [];
  const divider = style === "divider" ? "<hr>" : "";

  if (kind === "product") {
    const summary = buildInfoParagraph(context?.summary || "");
    const list = [
      buildInfoLine("상품명", productName),
      buildInfoLine("판매가", context?.price || ""),
      buildInfoLine("재고", context?.stockQuantity || ""),
      buildInfoLine("브랜드", context?.brandName || ""),
      buildInfoLine("제조자", context?.manufacturerName || ""),
      buildInfoLine("모델명", context?.modelName || ""),
      buildInfoLine("원산지", context?.originAreaName || context?.originContent || ""),
    ].filter(Boolean);

    blocks.push(summary);
    if (list.length > 0) blocks.push(`<ul>${list.join("")}</ul>`);
  }

  if (kind === "shipping") {
    blocks.push(
      buildInfoSection(
        "배송 안내",
        buildInfoParagraph(context?.shippingPolicyText || "상품별 배송 정책에 따라 발송됩니다."),
        style,
      ),
    );
    blocks.push(
      buildInfoSection(
        "교환 및 반품",
        buildInfoParagraph(
          context?.returnPolicyText || "수령 후 상품 상태를 확인한 뒤 판매자 안내에 따라 접수해 주세요.",
        ),
        style,
      ),
    );
    blocks.push(
      buildInfoSection(
        "A/S 안내",
        buildInfoParagraph(context?.asPolicyText || "상품 관련 문의는 판매자 고객센터로 접수해 주세요."),
        style,
      ),
    );
  }

  if (kind === "care") {
    const careItems = [
      buildInfoLine("사이즈 안내", context?.sizeGuideText || ""),
      buildInfoLine("관리 방법", context?.careGuideText || ""),
      buildInfoLine("취급 주의사항", context?.noticeItems?.find((item) => item.label === "취급 주의사항")?.value || ""),
      buildInfoLine("품질보증 기준", context?.noticeItems?.find((item) => item.label === "품질보증 기준")?.value || ""),
    ].filter(Boolean);

    if (careItems.length > 0) blocks.push(buildInfoSection("사이즈/관리", `<ul>${careItems.join("")}</ul>`, style));
    if (careItems.length === 0) {
      blocks.push(
        buildInfoSection(
          "사이즈/관리",
          "<ul><li>상품 색상은 화면 환경에 따라 실제와 다르게 보일 수 있습니다.</li><li>구매 전 상세 옵션과 배송 정보를 확인해 주세요.</li></ul>",
          style,
        ),
      );
    }
  }

  const body = blocks.filter(Boolean).join(divider);
  return [
    '<div class="se-component se-text se-l-default __se-component amu-smartstore-info-block">',
    '<div class="se-component-content">',
    '<div class="se-section se-section-text se-l-default">',
    '<div class="se-module se-module-text">',
    `<h2>${escapeHtmlContent(headingByKind[kind])}</h2>`,
    body,
    "</div>",
    "</div>",
    "</div>",
    "</div>",
  ].join("");
}

export const SmartstoreDetailEditor = forwardRef<SmartstoreDetailEditorHandle, SmartstoreDetailEditorProps>(
  function SmartstoreDetailEditor(
    {
      value,
      onChange,
      detailImageUrls = [],
      imageCandidates = [],
      infoTemplateContext,
      onImageAiEdit,
      onImageUpload,
      onOpenImageStudio,
      className,
    },
    ref,
  ) {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const editorShellRef = useRef<HTMLDivElement | null>(null);
    const imageInsertPanelRef = useRef<HTMLDivElement | null>(null);
    const bodyImageUploadInputRef = useRef<HTMLInputElement | null>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const asyncInsertionBookmarkRef = useRef<Range | null>(null);
    const hasSavedEditorSelectionRef = useRef(false);
    const editorHasFocusRef = useRef(false);
    const skipNextFocusSelectionCaptureRef = useRef(false);
    const selectedImageRef = useRef<HTMLImageElement | null>(null);
    const [mode, setMode] = useState<SmartstoreDetailEditorMode>("write");
    const [infoTemplateStyle, setInfoTemplateStyle] = useState<SmartstoreDetailInfoTemplateStyle>("basic");
    const [selectedImageUrl, setSelectedImageUrl] = useState("");
    const [imageActionRect, setImageActionRect] = useState<{ top: number; left: number } | null>(null);
    const [insertToolbarRect, setInsertToolbarRect] = useState<{ top: number; left: number } | null>(null);
    const [imageInsertPanelOpen, setImageInsertPanelOpen] = useState(false);
    const [imageUrlInput, setImageUrlInput] = useState("");
    const [imageUploadPending, setImageUploadPending] = useState(false);
    const [imageInsertPending, setImageInsertPending] = useState(false);
    const [imageInsertFeedback, setImageInsertFeedback] = useState<SmartstoreImageFeedback | null>(null);
    const imageFeedbackId = useId();
    const imageActionPending = imageUploadPending || imageInsertPending;
    const validation = useMemo(() => validateSmartstoreDetailHtml(value), [value]);
    const safePreviewHtml = useMemo(() => sanitizeSmartstoreDetailHtml(value), [value]);
    const uniqueDetailImageUrls = useMemo(
      () => Array.from(new Set(detailImageUrls.map((url) => url.trim()).filter(Boolean))).slice(0, 9),
      [detailImageUrls],
    );
    const insertImageCandidates = useMemo(() => {
      const pushed = new Set<string>();
      return imageCandidates
        .map((candidate) => ({ ...candidate, url: candidate.url.trim() }))
        .filter((candidate) => {
          if (!candidate.url || pushed.has(candidate.url)) return false;
          pushed.add(candidate.url);
          return true;
        })
        .slice(0, 12);
    }, [imageCandidates]);

    // execCommand 기반 undo/redo를 대체하는 자체 편집 히스토리 (innerHTML 스냅샷 스택)
    const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 });
    const historySnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const captureHistorySnapshot = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const html = editor.innerHTML;
      const history = historyRef.current;
      if (history.stack[history.index] === html) return;
      history.stack = history.stack.slice(0, history.index + 1);
      history.stack.push(html);
      if (history.stack.length > MAX_EDITOR_HISTORY) history.stack.shift();
      history.index = history.stack.length - 1;
    }, []);

    const scheduleHistorySnapshot = useCallback(() => {
      if (historySnapshotTimerRef.current) clearTimeout(historySnapshotTimerRef.current);
      historySnapshotTimerRef.current = setTimeout(() => {
        historySnapshotTimerRef.current = null;
        captureHistorySnapshot();
      }, 400);
    }, [captureHistorySnapshot]);

    const flushHistorySnapshot = useCallback(() => {
      if (!historySnapshotTimerRef.current) return;
      clearTimeout(historySnapshotTimerRef.current);
      historySnapshotTimerRef.current = null;
      captureHistorySnapshot();
    }, [captureHistorySnapshot]);

    useEffect(function clearHistorySnapshotTimerOnUnmount() {
      return () => {
        if (historySnapshotTimerRef.current) clearTimeout(historySnapshotTimerRef.current);
      };
    }, []);

    const emitEditorChange = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) return;
      onChange(normalizeSmartstorePlainDivs(sanitizeSmartstoreDetailHtml(editor.innerHTML)));
      scheduleHistorySnapshot();
    }, [onChange, scheduleHistorySnapshot]);

    const updateInsertToolbarPosition = useCallback((range: Range | null) => {
      const shell = editorShellRef.current;
      const editor = editorRef.current;
      if (!shell || !editor || !range) {
        setInsertToolbarRect(null);
        return;
      }

      const rect = getRangeDisplayRect(range);
      const fallbackElement =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement;
      const displayRect = rect || fallbackElement?.getBoundingClientRect();
      if (!displayRect) {
        setInsertToolbarRect(null);
        return;
      }

      const shellRect = shell.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, displayRect.left - shellRect.left - 8),
        Math.max(8, editorRect.right - shellRect.left - 132),
      );
      const top = Math.max(8, displayRect.top - shellRect.top - 42);
      setInsertToolbarRect({ top, left });
    }, []);

    const saveEditorSelection = useCallback(() => {
      const editor = editorRef.current;
      if (!editor || typeof window === "undefined") return false;
      const activeElement = document.activeElement;
      if (!(activeElement === editor || editor.contains(activeElement))) return false;
      const selection = window.getSelection();
      if (!isSelectionInsideEditor(editor, selection)) return false;

      const range = selection!.getRangeAt(0);
      savedRangeRef.current = range.cloneRange();
      hasSavedEditorSelectionRef.current = true;
      updateInsertToolbarPosition(range);
      return true;
    }, [updateInsertToolbarPosition]);

    const captureAsyncInsertionBookmark = useCallback(() => {
      if (!saveEditorSelection()) return false;
      const range = savedRangeRef.current;
      if (!range) return false;
      asyncInsertionBookmarkRef.current = range.cloneRange();
      return true;
    }, [saveEditorSelection]);

    const clearAsyncInsertionBookmark = useCallback(() => {
      asyncInsertionBookmarkRef.current = null;
    }, []);

    const restoreEditorSelection = useCallback(
      (options?: {
        insertionMode?: SmartstoreInsertionMode;
        useCurrentSelection?: boolean;
      }) => {
        const editor = editorRef.current;
        if (!editor || typeof window === "undefined") return false;
        const selection = window.getSelection();
        const insertionMode = options?.insertionMode || "focused";
        const useCurrentSelection = Boolean(options?.useCurrentSelection);
        const currentRange = useCurrentSelection && isSelectionInsideEditor(editor, selection)
          ? selection!.getRangeAt(0).cloneRange()
          : null;
        const asyncBookmark = asyncInsertionBookmarkRef.current;
        const bookmark =
          insertionMode === "async" && asyncBookmark && isRangeInsideEditor(editor, asyncBookmark)
            ? asyncBookmark.cloneRange()
            : null;
        const range = currentRange || bookmark;

        editor.focus();
        if (range) {
          selection?.removeAllRanges();
          selection?.addRange(range);
          savedRangeRef.current = range.cloneRange();
          hasSavedEditorSelectionRef.current = true;
          updateInsertToolbarPosition(range);
          return true;
        }

        const fallbackRange = placeCaretAtEnd(editor);
        savedRangeRef.current = fallbackRange.cloneRange();
        hasSavedEditorSelectionRef.current = false;
        setInsertToolbarRect(null);
        return false;
      },
      [updateInsertToolbarPosition],
    );

    const insertHtmlAtSelection = useCallback(
      (html: string, options?: SmartstoreInsertOptions) => {
        const editor = editorRef.current;
        if (!editor || mode !== "write") return false;

        const insertionMode = options?.insertionMode || "focused";
        const activeElement = document.activeElement;
        const useCurrentSelection =
          editorHasFocusRef.current && (activeElement === editor || editor.contains(activeElement));
        const restored = restoreEditorSelection({ insertionMode, useCurrentSelection });

        const sanitized = sanitizeSmartstoreDetailHtml(html);
        if (!sanitized) return restored;

        if (!insertSmartstoreHtmlAtSelection(editor, sanitized)) return false;
        emitEditorChange();
        captureHistorySnapshot();
        const selectionSaved = saveEditorSelection();
        if (insertionMode === "async") {
          asyncInsertionBookmarkRef.current = selectionSaved && savedRangeRef.current
            ? savedRangeRef.current.cloneRange()
            : null;
        } else {
          clearAsyncInsertionBookmark();
        }
        return true;
      },
      [
        captureHistorySnapshot,
        clearAsyncInsertionBookmark,
        emitEditorChange,
        mode,
        restoreEditorSelection,
        saveEditorSelection,
      ],
    );

    const updateImageActionPosition = useCallback((image: HTMLImageElement | null) => {
      const shell = editorShellRef.current;
      if (!shell || !image) {
        setImageActionRect(null);
        return;
      }

      const imageRect = image.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      setImageActionRect({
        top: Math.max(8, imageRect.top - shellRect.top + 8),
        left: Math.max(8, imageRect.right - shellRect.left - 304),
      });
    }, []);

    const selectImage = useCallback(
      (image: HTMLImageElement | null) => {
        selectedImageRef.current = image;
        const src = getSmartstoreImageSrc(image);
        setSelectedImageUrl(src);
        if (src) setInsertToolbarRect(null);
        updateImageActionPosition(image);
      },
      [updateImageActionPosition],
    );

    useEffect(() => {
      if (mode !== "write") return;
      const editor = editorRef.current;
      if (!editor) return;
      if (document.activeElement === editor) return;
      const nextHtml = normalizeEditableHtml(value);
      if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
      captureHistorySnapshot();
      savedRangeRef.current = null;
      asyncInsertionBookmarkRef.current = null;
      hasSavedEditorSelectionRef.current = false;
      editorHasFocusRef.current = false;
      setInsertToolbarRect(null);
      selectImage(null);
    }, [captureHistorySnapshot, mode, selectImage, value]);

    useEffect(function trackEditorSelectionChanges() {
      if (mode !== "write") return;

      const handleSelectionChange = () => {
        const editor = editorRef.current;
        if (!editor || !editorHasFocusRef.current) return;
        const activeElement = document.activeElement;
        if (!(activeElement === editor || editor.contains(activeElement))) return;
        saveEditorSelection();
      };

      document.addEventListener("selectionchange", handleSelectionChange);
      return () => document.removeEventListener("selectionchange", handleSelectionChange);
    }, [mode, saveEditorSelection]);

    useEffect(function invalidateAsyncBookmarkOutsideEditorContext() {
      const handleFocusIn = (event: FocusEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        const editor = editorRef.current;
        const panel = imageInsertPanelRef.current;
        if (editor?.contains(target) || panel?.contains(target)) return;
        clearAsyncInsertionBookmark();
      };
      const handleWindowBlur = () => {
        editorHasFocusRef.current = false;
        savedRangeRef.current = null;
        hasSavedEditorSelectionRef.current = false;
        clearAsyncInsertionBookmark();
      };

      document.addEventListener("focusin", handleFocusIn);
      window.addEventListener("blur", handleWindowBlur);
      return () => {
        document.removeEventListener("focusin", handleFocusIn);
        window.removeEventListener("blur", handleWindowBlur);
      };
    }, [clearAsyncInsertionBookmark]);

    const focusEditor = useCallback(() => {
      setMode("write");
      requestAnimationFrame(() => {
        const editor = editorRef.current;
        if (!editor) {
          skipNextFocusSelectionCaptureRef.current = false;
          return;
        }
        const activeElement = document.activeElement;
        if (activeElement === editor || editor.contains(activeElement)) return;
        skipNextFocusSelectionCaptureRef.current = true;
        editor.focus();
      });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        insertImageUrl: (url: string) =>
          insertHtmlAtSelection(buildSmartstoreDetailImageHtml(url), { insertionMode: "external" }),
        insertHtml: (html: string) => insertHtmlAtSelection(html, { insertionMode: "external" }),
        focus: focusEditor,
      }),
      [focusEditor, insertHtmlAtSelection],
    );

    // 편집 명령 공통 러너: write 모드 전환/포커스 → selection 복원 → 명령 실행 → 변경 전파/스냅샷
    const runEditorCommand = useCallback(
      (command: (editor: HTMLElement) => boolean) => {
        const editor = editorRef.current;
        const activeElement = document.activeElement;
        const useCurrentSelection = Boolean(
          editor &&
            editorHasFocusRef.current &&
            (activeElement === editor || editor.contains(activeElement)) &&
            isSelectionInsideEditor(editor, window.getSelection()),
        );
        focusEditor();
        requestAnimationFrame(() => {
          const editor = editorRef.current;
          if (!editor) return;
          restoreEditorSelection({ insertionMode: "focused", useCurrentSelection });
          if (!command(editor)) return;
          emitEditorChange();
          captureHistorySnapshot();
          saveEditorSelection();
        });
      },
      [captureHistorySnapshot, emitEditorChange, focusEditor, restoreEditorSelection, saveEditorSelection],
    );

    const runBlockFormat = useCallback(
      (tag: SmartstoreBlockFormatTag) => runEditorCommand((editor) => applySmartstoreBlockFormat(editor, tag)),
      [runEditorCommand],
    );

    const runInlineFormat = useCallback(
      (tag: SmartstoreInlineFormatTag) => runEditorCommand((editor) => toggleSmartstoreInlineFormat(editor, tag)),
      [runEditorCommand],
    );

    const runListFormat = useCallback(
      (ordered: boolean) => runEditorCommand((editor) => toggleSmartstoreListFormat(editor, ordered)),
      [runEditorCommand],
    );

    const applyHistorySnapshot = useCallback(
      (html: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.innerHTML = html;
        const caret = placeCaretAtEnd(editor);
        savedRangeRef.current = caret.cloneRange();
        clearAsyncInsertionBookmark();
        hasSavedEditorSelectionRef.current = false;
        setInsertToolbarRect(null);
        selectImage(null);
        onChange(normalizeSmartstorePlainDivs(sanitizeSmartstoreDetailHtml(html)));
      },
      [clearAsyncInsertionBookmark, onChange, selectImage],
    );

    const undoEdit = useCallback(() => {
      focusEditor();
      requestAnimationFrame(() => {
        flushHistorySnapshot();
        const history = historyRef.current;
        if (history.index <= 0) return;
        history.index -= 1;
        applyHistorySnapshot(history.stack[history.index]);
      });
    }, [applyHistorySnapshot, flushHistorySnapshot, focusEditor]);

    const redoEdit = useCallback(() => {
      focusEditor();
      requestAnimationFrame(() => {
        const history = historyRef.current;
        if (history.index >= history.stack.length - 1) return;
        history.index += 1;
        applyHistorySnapshot(history.stack[history.index]);
      });
    }, [applyHistorySnapshot, focusEditor]);

    const insertHtml = useCallback(
      (html: string, insertionMode: SmartstoreInsertionMode = "focused") => {
        if (mode !== "write") {
          setMode("write");
          requestAnimationFrame(() => insertHtmlAtSelection(html, { insertionMode }));
          return true;
        }
        return insertHtmlAtSelection(html, { insertionMode });
      },
      [insertHtmlAtSelection, mode],
    );

    const insertImage = useCallback(
      async (url?: string, insertionMode: SmartstoreInsertionMode = "focused") => {
        let resolvedInsertionMode = insertionMode;
        if (!url) {
          captureAsyncInsertionBookmark();
          resolvedInsertionMode = "async";
        }
        const imageUrl =
          url ||
          (await dialog.prompt({
            message: lang({
              ko: "상세 설명에 삽입할 이미지 URL을 입력하세요.",
              en: "Enter the image URL to insert into the detail content.",
            }),
          })) ||
          "";
        const trimmed = imageUrl.trim();
        if (!trimmed) return false;
        const validationError = validateSmartstoreBodyImageUrl(trimmed);
        if (validationError) {
          setImageInsertFeedback(getSmartstoreImageFeedback(validationError));
          return false;
        }
        const inserted = insertHtml(buildSmartstoreDetailImageHtml(trimmed), resolvedInsertionMode);
        if (!inserted) setImageInsertFeedback(getSmartstoreImageFeedback("insertion_failed"));
        return inserted;
      },
      [captureAsyncInsertionBookmark, insertHtml],
    );

    const insertQuoteBlock = useCallback(() => {
      insertHtml(buildSmartstoreQuoteBlockHtml());
    }, [insertHtml]);

    const insertImageFromPanel = useCallback(
      async (url: string) => {
        const trimmed = url.trim();
        const validationError = validateSmartstoreBodyImageUrl(trimmed);
        if (validationError) {
          setImageInsertFeedback(getSmartstoreImageFeedback(validationError));
          return false;
        }

        setImageInsertFeedback(null);
        setImageInsertPending(true);
        try {
          const inserted = await insertImage(trimmed, "async");
          if (!inserted) return false;
          setImageInsertFeedback({
            kind: "status",
            message: { ko: "이미지를 본문에 삽입했습니다.", en: "Image inserted into the body." },
          });
          setImageUrlInput("");
          setImageInsertPanelOpen(false);
          clearAsyncInsertionBookmark();
          return true;
        } catch (error) {
          setImageInsertFeedback(getSmartstoreImageFeedback(extractApiErrorMessage(error, "insertion_failed")));
          return false;
        } finally {
          setImageInsertPending(false);
        }
      },
      [clearAsyncInsertionBookmark, insertImage],
    );

    const handleBodyImageUpload = useCallback(
      async (file: File | undefined) => {
        if (!file || !onImageUpload) return;
        const validationError = validateSmartstoreBodyImageFile(file);
        if (validationError) {
          setImageInsertFeedback(getSmartstoreImageFeedback(validationError));
          return;
        }
        setImageInsertFeedback(null);
        setImageUploadPending(true);
        try {
          const url = await onImageUpload(file);
          if (!url) throw new Error("upload_failed");
          await insertImageFromPanel(url);
        } catch (error) {
          setImageInsertFeedback(getSmartstoreImageFeedback(extractApiErrorMessage(error, "upload_failed")));
        } finally {
          setImageUploadPending(false);
        }
      },
      [insertImageFromPanel, onImageUpload],
    );

    const insertInfoTemplate = useCallback(
      (kind: SmartstoreDetailInfoTemplateKind) => {
        insertHtml(buildSmartstoreInfoTemplateHtml(kind, infoTemplateStyle, infoTemplateContext));
      },
      [infoTemplateContext, infoTemplateStyle, insertHtml],
    );

    const applyImageAlign = useCallback(
      (align: SmartstoreDetailImageAlign) => {
        const image = selectedImageRef.current;
        if (!image) return;

        const alignClass = getImageAlignClass(align);
        const section = image.closest(".se-section-image") as HTMLElement | null;

        if (section) {
          Array.from(section.classList)
            .filter((className) => className.startsWith("se-section-align-"))
            .forEach((className) => section.classList.remove(className));
          section.classList.add(alignClass);
        } else {
          const src = getSmartstoreImageSrc(image);
          if (!src) return;

          const template = document.createElement("template");
          template.innerHTML = buildSmartstoreDetailImageHtml(src, align);
          const next = template.content.firstElementChild;
          if (!next) return;

          const paragraph = image.closest("p");
          const replaceTarget =
            paragraph && paragraph.querySelectorAll("img").length === 1 && paragraph.textContent?.trim() === ""
              ? paragraph
              : image;
          replaceTarget.replaceWith(next);

          const nextImage = next.querySelector("img");
          if (nextImage) selectImage(nextImage);
        }

        emitEditorChange();
        requestAnimationFrame(() => updateImageActionPosition(selectedImageRef.current));
      },
      [emitEditorChange, selectImage, updateImageActionPosition],
    );

    const copySelectedImage = useCallback(async () => {
      const image = selectedImageRef.current;
      const src = getSmartstoreImageSrc(image);
      if (!src) return;
      const html = buildSmartstoreDetailImageHtml(src);
      try {
        await writeTextToClipboard(html);
      } catch {
        await dialog.prompt({ message: lang({ ko: "복사할 이미지 HTML입니다.", en: "Image HTML to copy." }) }, html);
      }
    }, []);

    const deleteSelectedImage = useCallback(() => {
      const target = getImageEditTarget(selectedImageRef.current);
      if (!target) return;
      target.remove();
      selectImage(null);
      emitEditorChange();
    }, [emitEditorChange, selectImage]);

    const cutSelectedImage = useCallback(async () => {
      await copySelectedImage();
      deleteSelectedImage();
    }, [copySelectedImage, deleteSelectedImage]);

    const pasteAfterSelectedImage = useCallback(async () => {
      const target = getImageEditTarget(selectedImageRef.current);
      if (!target) return;
      let text = "";
      try {
        text = (await navigator.clipboard?.readText()) || "";
      } catch {
        text =
          (await dialog.prompt({
            message: lang({
              ko: "붙여넣을 이미지 URL 또는 HTML을 입력하세요.",
              en: "Enter the image URL or HTML to paste.",
            }),
          })) || "";
      }
      const trimmed = text.trim();
      if (!trimmed) return;
      const html = /^https?:\/\//i.test(trimmed)
        ? buildSmartstoreDetailImageHtml(trimmed)
        : sanitizeSmartstoreDetailHtml(trimmed);
      if (!html) return;
      const template = document.createElement("template");
      template.innerHTML = html;
      target.after(template.content);
      emitEditorChange();
    }, [emitEditorChange]);

    const handlePaste = useCallback(
      (event: React.ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        const html = event.clipboardData.getData("text/html");
        const text = event.clipboardData.getData("text/plain");
        insertHtml(html ? sanitizeSmartstoreDetailHtml(html) : plainTextToSmartstoreHtml(text));
      },
      [insertHtml],
    );

    const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor) return;
      const nextTarget = event.relatedTarget;
      const focusRemainsInEditor = nextTarget instanceof Node && editor.contains(nextTarget);
      if (!focusRemainsInEditor) {
        editorHasFocusRef.current = false;
        savedRangeRef.current = null;
        hasSavedEditorSelectionRef.current = false;
        setInsertToolbarRect(null);
      }
      const nextHtml = normalizeEditableHtml(editor.innerHTML);
      editor.innerHTML = nextHtml;
      onChange(sanitizeSmartstoreDetailHtml(nextHtml));
    }, [onChange]);

    const handleEditorPointerUp = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        const image = target?.closest("img") as HTMLImageElement | null;
        selectImage(image);
        if (!image) requestAnimationFrame(saveEditorSelection);
      },
      [saveEditorSelection, selectImage],
    );

    const handleEditorKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        // 선택된 이미지는 Delete·Backspace 키로 삭제하고 undo 히스토리로 복구한다 (SSM-103)
        if (event.key === "Delete" || event.key === "Backspace") {
          if (selectedImageRef.current && editorHasFocusRef.current) {
            event.preventDefault();
            deleteSelectedImage();
          }
          return;
        }
        if (!(event.metaKey || event.ctrlKey)) return;
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) redoEdit();
          else undoEdit();
          return;
        }
        if (key === "y") {
          event.preventDefault();
          redoEdit();
          return;
        }
        if (key === "b" || key === "i" || key === "u") {
          event.preventDefault();
          runInlineFormat(key === "b" ? "strong" : key === "i" ? "em" : "u");
        }
      },
      [deleteSelectedImage, redoEdit, runInlineFormat, undoEdit],
    );

    const handleEditorInput = useCallback(() => {
      emitEditorChange();
      requestAnimationFrame(saveEditorSelection);
    }, [emitEditorChange, saveEditorSelection]);

    const handleEditorKeyUp = useCallback(() => {
      const selection = window.getSelection();
      const node = selection?.anchorNode;
      const element = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
      const image = element?.closest("img") as HTMLImageElement | null;
      if (image) selectImage(image);
      else {
        selectImage(null);
        saveEditorSelection();
      }
    }, [saveEditorSelection, selectImage]);

    const handleEditorFocus = useCallback(() => {
      editorHasFocusRef.current = true;
      if (skipNextFocusSelectionCaptureRef.current) {
        skipNextFocusSelectionCaptureRef.current = false;
        return;
      }
      requestAnimationFrame(saveEditorSelection);
    }, [saveEditorSelection]);

    const handleOpenImageAiEdit = useCallback(() => {
      if (!selectedImageUrl) return;
      onImageAiEdit?.(selectedImageUrl);
    }, [onImageAiEdit, selectedImageUrl]);

    return (
      <div className={cn("bg-background/70", className)}>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {imageUploadPending ? (
            <Lang text={{ ko: "이미지를 업로드하는 중입니다.", en: "Uploading the image." }} />
          ) : imageInsertPending ? (
            <Lang text={{ ko: "이미지를 본문에 삽입하는 중입니다.", en: "Inserting the image into the body." }} />
          ) : imageInsertFeedback?.kind === "status" ? (
            <Lang text={imageInsertFeedback.message} />
          ) : null}
        </div>
        <div className="flex flex-col gap-3 border-b border-border px-3 py-3">
          <div className="flex gap-1 overflow-x-auto pb-1">
            <ToolbarButton label={{ ko: "본문", en: "Paragraph" }} onClick={() => runBlockFormat("p")}>
              <Type className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label={{ ko: "섹션 제목", en: "Section Heading" }} onClick={() => runBlockFormat("h2")}>
              <span className="text-xs font-bold">H2</span>
            </ToolbarButton>
            <ToolbarButton label={{ ko: "소제목", en: "Subheading" }} onClick={() => runBlockFormat("h3")}>
              <span className="text-xs font-bold">H3</span>
            </ToolbarButton>
            <span className="mx-1 h-8 w-px shrink-0 bg-border" aria-hidden="true" />
            <ToolbarButton label={{ ko: "굵게", en: "Bold" }} onClick={() => runInlineFormat("strong")}>
              <Bold className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label={{ ko: "기울임", en: "Italic" }} onClick={() => runInlineFormat("em")}>
              <Italic className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label={{ ko: "밑줄", en: "Underline" }} onClick={() => runInlineFormat("u")}>
              <Underline className="h-4 w-4" />
            </ToolbarButton>
            <span className="mx-1 h-8 w-px shrink-0 bg-border" aria-hidden="true" />
            <ToolbarButton label={{ ko: "글머리 목록", en: "Bullet List" }} onClick={() => runListFormat(false)}>
              <List className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label={{ ko: "번호 목록", en: "Numbered List" }} onClick={() => runListFormat(true)}>
              <List className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label={{ ko: "구분선", en: "Divider" }} onClick={() => insertHtml("<hr>")}>
              <Minus className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              label={{ ko: "이미지 삽입", en: "Insert Image" }}
              onClick={() => {
                if (imageActionPending) return;
                setImageInsertFeedback(null);
                setMode("write");
                if (imageInsertPanelOpen) clearAsyncInsertionBookmark();
                else captureAsyncInsertionBookmark();
                setImageInsertPanelOpen((open) => !open);
              }}
              active={imageInsertPanelOpen}
            >
              <ImagePlus className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              label={{ ko: "이미지 왼쪽 정렬", en: "Align Image Left" }}
              onClick={() => applyImageAlign("left")}
              active={Boolean(selectedImageUrl)}
            >
              <AlignLeft className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              label={{ ko: "이미지 가운데 정렬", en: "Align Image Center" }}
              onClick={() => applyImageAlign("center")}
              active={Boolean(selectedImageUrl)}
            >
              <AlignCenter className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              label={{ ko: "이미지 오른쪽 정렬", en: "Align Image Right" }}
              onClick={() => applyImageAlign("right")}
              active={Boolean(selectedImageUrl)}
            >
              <AlignRight className="h-4 w-4" />
            </ToolbarButton>
            {onImageAiEdit ? (
              <ToolbarButton
                label={{ ko: "선택 이미지 AI 편집", en: "Edit Selected Image with AI" }}
                onClick={handleOpenImageAiEdit}
                active={Boolean(selectedImageUrl)}
              >
                <Wand className="h-4 w-4" />
              </ToolbarButton>
            ) : null}
            <span className="mx-1 h-8 w-px shrink-0 bg-border" aria-hidden="true" />
            <ToolbarButton label={{ ko: "실행 취소", en: "Undo" }} onClick={undoEdit}>
              <RotateCcw className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label={{ ko: "다시 실행", en: "Redo" }} onClick={redoEdit}>
              <RotateCw className="h-4 w-4" />
            </ToolbarButton>
          </div>

          {imageInsertPanelOpen ? (
            <div
              ref={imageInsertPanelRef}
              data-smartstore-insertion-surface="true"
              aria-busy={imageActionPending}
              className="rounded-[0.9rem] border border-border bg-surface/90 p-3"
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="min-w-0 space-y-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-primary-text">
                    <Link className="h-3.5 w-3.5 text-primary" />
                    <Lang text={{ ko: "이미지 URL", en: "Image URL" }} />
                  </span>
                  <input
                    value={imageUrlInput}
                    placeholder="https://..."
                    disabled={imageActionPending}
                    aria-invalid={imageInsertFeedback?.kind === "error"}
                    aria-describedby={imageInsertFeedback?.kind === "error" ? imageFeedbackId : undefined}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      setImageUrlInput(event.target.value);
                      if (imageInsertFeedback) setImageInsertFeedback(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void insertImageFromPanel(imageUrlInput);
                      }
                    }}
                  />
                </label>
                <Button
                  size="sm"
                  rounded="md"
                  disabled={imageActionPending}
                  onClick={() => void insertImageFromPanel(imageUrlInput)}
                >
                  <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                  <Lang text={{ ko: "삽입", en: "Insert" }} />
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {onImageUpload ? (
                  <Button
                    size="sm"
                    variant="outline"
                    rounded="md"
                    loading={imageUploadPending}
                    disabled={imageActionPending}
                    onClick={() => bodyImageUploadInputRef.current?.click()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    <Lang text={{ ko: "업로드", en: "Upload" }} />
                  </Button>
                ) : null}
                {onOpenImageStudio ? (
                  <Button
                    size="sm"
                    variant="outline"
                    rounded="md"
                    disabled={imageActionPending}
                    onClick={() => {
                      captureAsyncInsertionBookmark();
                      onOpenImageStudio();
                    }}
                  >
                    <Wand className="mr-1.5 h-3.5 w-3.5" />
                    <Lang text={{ ko: "Gen Studio 생성", en: "Create in Gen Studio" }} />
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  rounded="md"
                  disabled={imageActionPending}
                  onClick={() => {
                    clearAsyncInsertionBookmark();
                    setImageInsertFeedback(null);
                    setImageInsertPanelOpen(false);
                  }}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  <Lang text={{ ko: "닫기", en: "Close" }} />
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-secondary-text">
                <Lang
                  text={{
                    ko: `PNG · JPEG · WebP · GIF · ${formatBytes(MAX_BASE_FILE_BYTES)} 이하`,
                    en: `PNG · JPEG · WebP · GIF · ${formatBytes(MAX_BASE_FILE_BYTES)} or smaller`,
                  }}
                />
              </p>

              <input
                ref={bodyImageUploadInputRef}
                type="file"
                accept={SMARTSTORE_BODY_IMAGE_ACCEPT}
                className="hidden"
                disabled={imageActionPending}
                aria-label={lang({ ko: "본문 이미지 파일 선택", en: "Choose a body image file" })}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  void handleBodyImageUpload(file);
                  event.target.value = "";
                }}
              />

              <div className="mt-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary-text">
                  <Images className="h-3.5 w-3.5 text-primary" />
                  <Lang text={{ ko: "Gen Studio / 등록 이미지", en: "Gen Studio / Saved Images" }} />
                </div>
                {insertImageCandidates.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {insertImageCandidates.map((candidate, index) => (
                      <button
                        key={getImageCandidateKey(candidate, index)}
                        type="button"
                        className="group relative aspect-square overflow-hidden rounded-md border border-border bg-background transition hover:border-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                        disabled={imageActionPending}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void insertImageFromPanel(candidate.url)}
                        aria-label={lang({
                          ko: "선택한 이미지를 본문에 삽입",
                          en: "Insert selected image into body",
                        })}
                        title={candidate.description || candidate.url}
                      >
                        <Image src={candidate.url} alt="" fill unoptimized sizes="72px" className="object-cover" />
                        {candidate.label ? (
                          <span className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-background/90 px-1 text-[10px] font-semibold text-primary">
                            <Lang text={candidate.label} />
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs leading-5 text-secondary-text">
                    <Lang
                      text={{
                        ko: "선택할 이미지가 없습니다. 업로드하거나 Gen Studio에서 이미지를 생성하세요.",
                        en: "No images to choose. Upload one or create images in Gen Studio.",
                      }}
                    />
                  </p>
                )}
                {imageInsertFeedback?.kind === "error" ? (
                  <p id={imageFeedbackId} className="mt-2 text-xs leading-5 text-danger" role="alert" aria-live="assertive">
                    <Lang text={imageInsertFeedback.message} />
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div className="-mx-3">
              <ScrollArea dragOnScrollX={true} dragIgnoreInteractive={true}>
                <div className="flex gap-1 px-3">
                  <Button
                    variant={mode === "write" ? "primary" : "outline"}
                    size="sm"
                    rounded="full"
                    onClick={() => setMode("write")}
                  >
                    <Type className="icon-xs" />
                    <Lang text={{ ko: "작성", en: "Write" }} />
                  </Button>
                  <Button
                    variant={mode === "preview" ? "primary" : "outline"}
                    size="sm"
                    rounded="full"
                    onClick={() => setMode("preview")}
                  >
                    <Eye className="icon-xs" />
                    <Lang text={{ ko: "미리보기", en: "Preview" }} />
                  </Button>
                  <Button
                    variant={mode === "html" ? "primary" : "outline"}
                    size="sm"
                    rounded="full"
                    onClick={() => setMode("html")}
                  >
                    <FileText className="icon-xs" />
                    <Lang text={{ ko: "HTML", en: "HTML" }} />
                  </Button>
                </div>
              </ScrollArea>
            </div>
            <Badge
              size="sm"
              className={cn(validation.ready ? "bg-accent/10 text-accent" : "bg-amber-500/10 text-amber-700")}
            >
              <Shield className="icon-xs" />
              {validation.ready ? (
                <Lang text={{ ko: "호환성 통과", en: "Compatible" }} />
              ) : (
                <Lang text={{ ko: "확인 필요", en: "Needs Check" }} />
              )}
            </Badge>
          </div>

          {uniqueDetailImageUrls.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {uniqueDetailImageUrls.map((url, index) => (
                <Button
                  key={url}
                  variant="outline"
                  size="icon-md"
                  rounded="md"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertImage(url)}
                  aria-label={lang({
                    ko: `${index + 1}번 상세 이미지 삽입`,
                    en: `Insert detail image ${index + 1}`,
                  })}
                  title={imageUrlPreviewLabel(url, index)}
                  className="relative h-12 w-12 overflow-hidden p-0"
                >
                  <Image src={url} alt="" fill unoptimized sizes="48px" className="object-cover" />
                  <span className="absolute bottom-0 right-0 bg-background/90 px-1 text-[10px] font-semibold text-primary">
                    {index + 1}
                  </span>
                </Button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 rounded-[0.9rem] border border-dashed border-border bg-surface/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-xs text-secondary-text">
              <Info className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-semibold text-primary-text">
                <Lang text={{ ko: "상세 정보 블록", en: "Detail Info Block" }} />
              </span>
              <span className="hidden sm:inline">
                <Lang
                  text={{
                    ko: "이미지 대신 수정 가능한 HTML로 삽입",
                    en: "Insert editable HTML instead of image text.",
                  }}
                />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 w-full">
                <ScrollArea dragOnScrollX={true} dragIgnoreInteractive={true}>
                  <div className="flex gap-1">
                    {(
                      [
                        ["basic", { ko: "기본", en: "Basic" }],
                        ["compact", { ko: "간결", en: "Compact" }],
                        ["divider", { ko: "구분선", en: "Divider" }],
                      ] as const
                    ).map(([style, label]) => (
                      <Button
                        key={style}
                        variant={infoTemplateStyle === style ? "primary" : "outline"}
                        size="sm"
                        rounded="lg"
                        onClick={() => setInfoTemplateStyle(style)}
                      >
                        <Lang text={label} />
                      </Button>
                    ))}
                    <Button variant="outline" size="sm" rounded="lg" onClick={() => insertInfoTemplate("product")}>
                      <Clipboard className="icon-xs" />
                      <Lang text={{ ko: "상품 정보", en: "Product Info" }} />
                    </Button>
                    <Button variant="outline" size="sm" rounded="lg" onClick={() => insertInfoTemplate("shipping")}>
                      <Package className="icon-xs" />
                      <Lang text={{ ko: "배송/교환", en: "Shipping" }} />
                    </Button>
                    <Button variant="outline" size="sm" rounded="lg" onClick={() => insertInfoTemplate("care")}>
                      <Shield className="icon-xs" />
                      <Lang text={{ ko: "사이즈/관리", en: "Size / Care" }} />
                    </Button>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>

        {mode === "write" ? (
          <div ref={editorShellRef} className="relative">
            <div
              ref={editorRef}
              role="textbox"
              aria-multiline="true"
              tabIndex={0}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onPaste={handlePaste}
              onBlur={handleBlur}
              onFocus={handleEditorFocus}
              onPointerUp={handleEditorPointerUp}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={handleEditorKeyUp}
              className={cn(
                "min-h-[20rem] w-full min-w-0 max-w-full overflow-x-hidden break-words [overflow-wrap:anywhere] px-3 py-4 text-sm leading-7 text-primary-text outline-none sm:px-4",
                "focus:ring-2 focus:ring-primary/40",
                "[&_a]:underline [&_a]:underline-offset-2",
                "[&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-bold",
                "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold",
                "[&_hr]:my-5 [&_hr]:border-border",
                "[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:bg-primary/5 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:text-secondary-text",
                "[&_img]:my-3 [&_img]:h-auto [&_img]:!max-w-full [&_img]:!w-auto",
                "[&_table]:!w-full [&_table]:!max-w-full [&_table]:!table-fixed",
                "[&_*]:!max-w-full",
                "[&_.amu-smartstore-info-block]:my-5 [&_.amu-smartstore-info-block]:rounded-lg [&_.amu-smartstore-info-block]:border [&_.amu-smartstore-info-block]:border-border [&_.amu-smartstore-info-block]:bg-surface/80 [&_.amu-smartstore-info-block]:px-4 [&_.amu-smartstore-info-block]:py-4",
                "[&_.amu-smartstore-info-block_h2]:mt-0 [&_.amu-smartstore-info-block_h2]:text-center",
                "[&_.se-image-resource]:my-0 [&_.se-module-image]:inline-block [&_.se-module-image]:max-w-full",
                "[&_.se-section-image]:my-3 [&_.se-section-align-center]:text-center",
                "[&_.se-section-align-left]:text-left [&_.se-section-align-right]:text-right",
                "[&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
              )}
            />
            {!selectedImageUrl && insertToolbarRect ? (
              <div
                className="absolute z-20 flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm"
                style={{ top: insertToolbarRect.top, left: insertToolbarRect.left }}
                onMouseDown={(event) => event.preventDefault()}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "커서 위치에 이미지 삽입", en: "Insert image at cursor" })}
                  onClick={() => {
                    captureAsyncInsertionBookmark();
                    setImageInsertPanelOpen(true);
                  }}
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "커서 위치에 인용 블록 삽입", en: "Insert quote block at cursor" })}
                  onClick={insertQuoteBlock}
                >
                  <FileText className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "커서 위치에 구분선 삽입", en: "Insert divider at cursor" })}
                  onClick={() => insertHtml("<hr>")}
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            {selectedImageUrl && imageActionRect ? (
              <div
                className="absolute z-20 flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm"
                style={{ top: imageActionRect.top, left: imageActionRect.left }}
                onMouseDown={(event) => event.preventDefault()}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "이미지 복사", en: "Copy image" })}
                  onClick={copySelectedImage}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "이미지 잘라내기", en: "Cut image" })}
                  onClick={() => void cutSelectedImage()}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "이미지 뒤에 붙여넣기", en: "Paste after image" })}
                  onClick={() => void pasteAfterSelectedImage()}
                >
                  <Clipboard className="h-4 w-4" />
                </Button>
                <span className="h-5 w-px bg-border" aria-hidden="true" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "이미지 왼쪽 정렬", en: "Align image left" })}
                  onClick={() => applyImageAlign("left")}
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "이미지 가운데 정렬", en: "Align image center" })}
                  onClick={() => applyImageAlign("center")}
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "이미지 오른쪽 정렬", en: "Align image right" })}
                  onClick={() => applyImageAlign("right")}
                >
                  <AlignRight className="h-4 w-4" />
                </Button>
                {onImageAiEdit ? (
                  <Button
                    variant="primary"
                    size="icon-sm"
                    rounded="md"
                    aria-label={lang({ ko: "Gen Studio에서 이미지 편집", en: "Edit image in Gen Studio" })}
                    onClick={handleOpenImageAiEdit}
                  >
                    <Wand className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  rounded="md"
                  aria-label={lang({ ko: "이미지 삭제", en: "Delete image" })}
                  onClick={deleteSelectedImage}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "preview" ? (
          <div className="max-h-[60vh] min-h-[20rem] w-full min-w-0 max-w-full overflow-auto overflow-x-hidden break-words [overflow-wrap:anywhere] px-3 py-4 text-sm leading-7 text-primary-text sm:px-4">
            {safePreviewHtml ? (
              <RichTextRenderer content={safePreviewHtml} renderMode="html" compact />
            ) : (
              <p className="text-xs text-secondary-text">
                <Lang
                  text={{
                    ko: "상세 설명을 작성하면 미리보기가 표시됩니다.",
                    en: "Write detail content to preview it.",
                  }}
                />
              </p>
            )}
          </div>
        ) : null}

        {mode === "html" ? (
          <div className="p-3">
            <Textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={(event) => onChange(sanitizeSmartstoreDetailHtml(event.target.value))}
              rows={12}
              className="font-mono text-xs leading-6"
            />
          </div>
        ) : null}

        {validation.issues.length > 0 ? (
          <div className="space-y-1 border-t border-border px-4 py-3">
            {validation.issues.slice(0, 4).map((issue) => (
              <p
                key={issue.code}
                className={cn("text-xs leading-5", issue.severity === "error" ? "text-danger" : "text-amber-700")}
              >
                <Lang text={issue.message} />
                {issue.count > 1 ? ` (${issue.count})` : ""}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);
SmartstoreDetailEditor.displayName = "SmartstoreDetailEditor";

export default SmartstoreDetailEditor;
