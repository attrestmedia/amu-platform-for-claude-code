import { logger } from "../log";
import { toast } from "sonner";
import { dialog } from "@amu-labs/ui";

/**
 * @docHint
 * @purpose copyClipboard 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain utils
 * @scope client-only
 */

export const copyClipboard = (msgText: string, returnMsg = "클립보드에 복사되었습니다!") => {
  void writeTextToClipboard(msgText).then(
    () => {
      if (returnMsg) {
        toast.success(returnMsg);
      }
    },
    (err) => {
      void dialog.alert({ variant: "danger", message: "클립보드 복사에 실패했습니다." });
      logger.error("Async: Could not copy text: ", err);
    },
  );
};

function writeTextWithSelectionFallback(text: string) {
  const textarea = document.createElement("textarea");
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  textarea.style.opacity = "0";
  textarea.style.fontSize = "16px";
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    if (!document.execCommand("copy")) throw new Error("clipboard_fallback_failed");
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}

export async function writeTextToClipboard(text: string) {
  const value = String(text || "").trim();
  if (!value) throw new Error("clipboard_text_required");
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("clipboard_browser_required");
  }

  if (window.isSecureContext && window.navigator.clipboard?.writeText) {
    try {
      await window.navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      logger.warn("Async Clipboard API failed; using selection fallback.", error);
    }
  }

  writeTextWithSelectionFallback(value);
}
