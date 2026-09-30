import type { TextLayoutPresetKey, TextLayoutTypographyPreset } from "types/ui";

export const TEXT_LAYOUT_DEFAULT_FONT_FAMILY = '"Pretendard", "Outfit", Arial, Helvetica, sans-serif';

export const TEXT_LAYOUT_PRESETS: Record<TextLayoutPresetKey, TextLayoutTypographyPreset> = {
  "body-sm": {
    fontSizePx: 14,
    lineHeightPx: 20,
    fontWeight: 400,
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
  "body-md": {
    fontSizePx: 16,
    lineHeightPx: 24,
    fontWeight: 400,
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
  "chat-bubble": {
    fontSizePx: 14,
    lineHeightPx: 20,
    fontWeight: 400,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  "canvas-comment": {
    fontSizePx: 12,
    lineHeightPx: 16,
    fontWeight: 400,
    whiteSpace: "pre-wrap",
    wordBreak: "keep-all",
  },
  "canvas-label": {
    fontSizePx: 20,
    lineHeightPx: 24,
    fontWeight: 700,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  "card-caption": {
    fontSizePx: 12,
    lineHeightPx: 18,
    fontWeight: 500,
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
};

