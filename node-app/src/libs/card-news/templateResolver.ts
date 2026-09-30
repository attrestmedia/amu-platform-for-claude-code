/**
 * @docHint
 * @purpose versioned semantic CardContent를 deterministic CardDeck으로 변환
 * @process preset lookup → slot/evidence validation → CardDeck parser validation
 * @domain card-news
 * @scope template_resolver
 */

import {
  CARD_NEWS_ASPECT_RATIOS,
  CARD_NEWS_CANONICAL_UNIT,
  CARD_NEWS_FONT_FAMILIES,
  CARD_NEWS_FONT_WEIGHTS,
  CARD_NEWS_MAX_TEXT_LENGTH,
  CARD_NEWS_TEMPLATE_CONTRACT_VERSION,
  CARD_NEWS_BUILT_IN_TEMPLATE_ID,
  CARD_NEWS_BUILT_IN_TEMPLATE_LEGACY_VERSION,
  CARD_NEWS_BUILT_IN_TEMPLATE_VERSION,
  createCardNewsTemplateStarter,
  parseCardNewsDeckPayload,
  type CardNewsBox,
  type CardNewsDeckPayload,
  type CardNewsLayer,
  type CardNewsSemanticCard,
  type CardNewsSemanticCardContent,
  type CardNewsSemanticEvidence,
  type CardNewsTemplateLayout,
  type CardNewsTemplatePreset,
  type CardNewsTemplateCardRole,
  type CardNewsTemplateEvidenceSlot,
  type CardNewsTemplateSlot,
  type CardNewsTemplateTextSlot,
  type CardNewsTemplateStarterInput,
  type CardNewsTemplateRegistryEntry,
  CardNewsTemplateResolutionError,
} from "types/card-news";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PROXY_IMAGE_URL = /^\/api\/proxy\/image\?(?:[^#]*&)?url=/i;

const textStyle = (overrides: Partial<CardNewsTemplateTextSlot["style"]> = {}): CardNewsTemplateTextSlot["style"] => ({
  fontSize: 32,
  lineHeight: 44,
  fontWeight: 500,
  color: "#111827",
  align: "left",
  verticalAlign: "top",
  maxLines: 3,
  overflow: "clip",
  wordBreak: "keep-all",
  ...overrides,
});

const textSlot = (
  name: CardNewsTemplateTextSlot["name"],
  box: CardNewsBox,
  style: CardNewsTemplateTextSlot["style"],
  maxCharacters: number,
  required = false,
): CardNewsTemplateTextSlot => ({
  kind: "text",
  name,
  box,
  style,
  required,
  maxCharacters,
});

const evidenceSlot = (box: CardNewsBox, required = false): CardNewsTemplateSlot => ({
  kind: "evidence",
  name: "evidence",
  box,
  fit: "cover",
  radius: 24,
  required,
});

const BUILT_IN_PRESET_V1: CardNewsTemplatePreset = {
  contractVersion: CARD_NEWS_TEMPLATE_CONTRACT_VERSION,
  id: CARD_NEWS_BUILT_IN_TEMPLATE_ID,
  version: CARD_NEWS_BUILT_IN_TEMPLATE_LEGACY_VERSION,
  name: { ko: "AMU 에디토리얼", en: "AMU Editorial" },
  description: {
    ko: "표지·본문·마무리 흐름에 맞춰 핵심 메시지와 시각적 증거를 배치합니다.",
    en: "Place key messages and visual evidence across cover, body, and closing cards.",
  },
  fontFamily: "Noto Sans KR",
  supportedAspectRatios: ["1:1", "4:5"],
  layouts: {
    cover: {
      backgroundColor: "#0f172a",
      accentColor: "#e85d75",
      slots: [
        textSlot("eyebrow", { x: 0.08, y: 0.08, w: 0.84, h: 0.06 }, textStyle({ fontSize: 28, lineHeight: 38, fontWeight: 700, color: "#fda4af", maxLines: 1 }), 80),
        textSlot("headline", { x: 0.08, y: 0.18, w: 0.84, h: 0.28 }, textStyle({ fontSize: 82, lineHeight: 102, fontWeight: 700, color: "#ffffff", maxLines: 3 }), 180, true),
        textSlot("body", { x: 0.08, y: 0.5, w: 0.84, h: 0.12 }, textStyle({ fontSize: 32, lineHeight: 46, color: "#e2e8f0", maxLines: 3 }), 160),
        evidenceSlot({ x: 0.08, y: 0.66, w: 0.84, h: 0.25 }),
      ],
    },
    body: {
      backgroundColor: "#f8fafc",
      accentColor: "#e85d75",
      slots: [
        textSlot("eyebrow", { x: 0.08, y: 0.08, w: 0.44, h: 0.06 }, textStyle({ fontSize: 26, lineHeight: 36, fontWeight: 700, color: "#e85d75", maxLines: 1 }), 80),
        textSlot("headline", { x: 0.08, y: 0.18, w: 0.43, h: 0.27 }, textStyle({ fontSize: 54, lineHeight: 70, fontWeight: 700, color: "#111827", maxLines: 3 }), 180, true),
        textSlot("body", { x: 0.08, y: 0.49, w: 0.43, h: 0.25 }, textStyle({ fontSize: 30, lineHeight: 44, color: "#334155", maxLines: 4 }), 220),
        textSlot("cta", { x: 0.08, y: 0.8, w: 0.43, h: 0.08 }, textStyle({ fontSize: 24, lineHeight: 34, fontWeight: 700, color: "#e85d75", maxLines: 2 }), 80),
        evidenceSlot({ x: 0.56, y: 0.16, w: 0.36, h: 0.55 }),
      ],
    },
    closing: {
      backgroundColor: "#111827",
      accentColor: "#fda4af",
      slots: [
        textSlot("eyebrow", { x: 0.08, y: 0.1, w: 0.84, h: 0.06 }, textStyle({ fontSize: 28, lineHeight: 38, fontWeight: 700, color: "#fda4af", maxLines: 1 }), 80),
        textSlot("headline", { x: 0.08, y: 0.26, w: 0.84, h: 0.28 }, textStyle({ fontSize: 72, lineHeight: 92, fontWeight: 700, color: "#ffffff", maxLines: 3 }), 180, true),
        textSlot("body", { x: 0.08, y: 0.6, w: 0.84, h: 0.12 }, textStyle({ fontSize: 32, lineHeight: 46, color: "#e2e8f0", maxLines: 3, align: "center" }), 160),
        textSlot("cta", { x: 0.08, y: 0.8, w: 0.84, h: 0.08 }, textStyle({ fontSize: 26, lineHeight: 38, fontWeight: 700, color: "#fda4af", maxLines: 2, align: "center" }), 80),
      ],
    },
  },
  constraints: {
    minimumCards: 3,
    maximumCards: 10,
    minimumEvidenceCards: 1,
  },
  // built-in preset은 AMU 브랜드 표시를 기본 제공한다. 사용자가 편집기에서 끄거나
  // 카드별로 제외할 수 있으며, Canvas display/preview/export가 같은 설정을 소비한다.
  defaultWatermark: {
    enabled: true,
    text: "AMU",
    size: 24,
    opacity: 0.72,
    position: "bottom-right",
  },
};

const BUILT_IN_PRESET_V2: CardNewsTemplatePreset = {
  contractVersion: CARD_NEWS_TEMPLATE_CONTRACT_VERSION,
  id: CARD_NEWS_BUILT_IN_TEMPLATE_ID,
  version: CARD_NEWS_BUILT_IN_TEMPLATE_VERSION,
  name: { ko: "AMU 미니멀 에디토리얼", en: "AMU Minimal Editorial" },
  description: {
    ko: "검정 타이포와 파란 포인트, 얇은 구분선으로 메시지를 또렷하게 전달합니다.",
    en: "Make the message clear with bold type, blue accents, and fine dividers.",
  },
  fontFamily: "Noto Sans KR",
  supportedAspectRatios: ["1:1", "4:5"],
  layouts: {
    cover: {
      backgroundColor: "#f5f5f3",
      accentColor: "#4f6df5",
      accentBox: { x: 0.08, y: 0.72, w: 0.84, h: 0.004 },
      slots: [
        textSlot("eyebrow", { x: 0.08, y: 0.09, w: 0.84, h: 0.06 }, textStyle({ fontSize: 28, lineHeight: 38, fontWeight: 700, color: "#4f6df5", maxLines: 1 }), 80),
        textSlot("headline", { x: 0.08, y: 0.19, w: 0.84, h: 0.31 }, textStyle({ fontSize: 84, lineHeight: 104, fontWeight: 700, color: "#111111", maxLines: 3 }), 180, true),
        evidenceSlot({ x: 0.08, y: 0.52, w: 0.84, h: 0.18 }),
        textSlot("body", { x: 0.08, y: 0.76, w: 0.84, h: 0.11 }, textStyle({ fontSize: 30, lineHeight: 44, color: "#6b7280", maxLines: 3 }), 180),
      ],
    },
    body: {
      backgroundColor: "#f5f5f3",
      accentColor: "#4f6df5",
      accentBox: { x: 0.08, y: 0.22, w: 0.84, h: 0.004 },
      slots: [
        textSlot("eyebrow", { x: 0.08, y: 0.08, w: 0.84, h: 0.06 }, textStyle({ fontSize: 28, lineHeight: 38, fontWeight: 700, color: "#4f6df5", maxLines: 1 }), 80),
        textSlot("headline", { x: 0.08, y: 0.14, w: 0.84, h: 0.17 }, textStyle({ fontSize: 64, lineHeight: 80, fontWeight: 700, color: "#111111", maxLines: 2 }), 180, true),
        evidenceSlot({ x: 0.08, y: 0.3, w: 0.84, h: 0.38 }),
        textSlot("body", { x: 0.08, y: 0.73, w: 0.84, h: 0.16 }, textStyle({ fontSize: 30, lineHeight: 44, color: "#6b7280", maxLines: 4 }), 240),
        textSlot("cta", { x: 0.08, y: 0.91, w: 0.84, h: 0.05 }, textStyle({ fontSize: 24, lineHeight: 32, fontWeight: 700, color: "#4f6df5", maxLines: 1 }), 80),
      ],
    },
    closing: {
      backgroundColor: "#f5f5f3",
      accentColor: "#4f6df5",
      accentBox: { x: 0.08, y: 0.19, w: 0.84, h: 0.004 },
      slots: [
        textSlot("eyebrow", { x: 0.08, y: 0.1, w: 0.84, h: 0.06 }, textStyle({ fontSize: 28, lineHeight: 38, fontWeight: 700, color: "#4f6df5", maxLines: 1 }), 80),
        textSlot("headline", { x: 0.08, y: 0.27, w: 0.84, h: 0.22 }, textStyle({ fontSize: 72, lineHeight: 92, fontWeight: 700, color: "#111111", maxLines: 3 }), 180, true),
        textSlot("body", { x: 0.08, y: 0.56, w: 0.84, h: 0.15 }, textStyle({ fontSize: 32, lineHeight: 46, color: "#6b7280", maxLines: 3, align: "center" }), 160),
        textSlot("cta", { x: 0.08, y: 0.8, w: 0.84, h: 0.08 }, textStyle({ fontSize: 26, lineHeight: 38, fontWeight: 700, color: "#4f6df5", maxLines: 2, align: "center" }), 80),
      ],
    },
  },
  constraints: {
    minimumCards: 3,
    maximumCards: 10,
    minimumEvidenceCards: 1,
  },
  defaultWatermark: {
    enabled: true,
    text: "AMU",
    size: 24,
    opacity: 0.72,
    position: "bottom-right",
  },
};

const BUILT_IN_PRESETS = [BUILT_IN_PRESET_V2, BUILT_IN_PRESET_V1] as const;

const HEX_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function invalidPreset(path: string): never {
  throw new CardNewsTemplateResolutionError("INVALID_TEMPLATE_PRESET", path);
}

function requiredString(value: unknown, path: string, maxLength = 240) {
  if (typeof value !== "string") invalidPreset(path);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) invalidPreset(path);
  return normalized;
}

function finiteNumber(value: unknown, path: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) invalidPreset(path);
  return value;
}

function integer(value: unknown, path: string, min: number, max: number) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) invalidPreset(path);
  return Number(value);
}

function normalizedBox(value: unknown, path: string): CardNewsBox {
  if (!isRecord(value)) invalidPreset(path);
  const x = finiteNumber(value.x, `${path}.x`, 0, 1);
  const y = finiteNumber(value.y, `${path}.y`, 0, 1);
  const w = finiteNumber(value.w, `${path}.w`, 0.001, 1);
  const h = finiteNumber(value.h, `${path}.h`, 0.001, 1);
  if (x + w > 1.000001 || y + h > 1.000001) invalidPreset(path);
  return { x, y, w, h };
}

function localizedText(value: unknown, path: string) {
  if (!isRecord(value)) invalidPreset(path);
  return {
    ko: requiredString(value.ko, `${path}.ko`),
    en: requiredString(value.en, `${path}.en`),
  };
}

function templateTextStyle(value: unknown, path: string, fontFamily: CardNewsTemplatePreset["fontFamily"]): CardNewsTemplateTextSlot["style"] {
  if (!isRecord(value)) invalidPreset(path);
  const align = value.align;
  const verticalAlign = value.verticalAlign;
  const overflow = value.overflow;
  const wordBreak = value.wordBreak;
  if (!(["left", "center", "right"] as const).includes(align as "left" | "center" | "right")) invalidPreset(`${path}.align`);
  if (!(["top", "middle", "bottom"] as const).includes(verticalAlign as "top" | "middle" | "bottom")) invalidPreset(`${path}.verticalAlign`);
  if (!( ["clip", "ellipsis"] as const).includes(overflow as "clip" | "ellipsis")) invalidPreset(`${path}.overflow`);
  if (!( ["normal", "break-word", "keep-all"] as const).includes(wordBreak as "normal" | "break-word" | "keep-all")) invalidPreset(`${path}.wordBreak`);
  const fontWeight = integer(value.fontWeight, `${path}.fontWeight`, 100, 900);
  if (!CARD_NEWS_FONT_WEIGHTS[fontFamily].includes(fontWeight)) invalidPreset(`${path}.fontWeight`);
  return {
    fontSize: finiteNumber(value.fontSize, `${path}.fontSize`, 8, 240),
    lineHeight: finiteNumber(value.lineHeight, `${path}.lineHeight`, 8, 720),
    fontWeight,
    color: (() => {
      const color = requiredString(value.color, `${path}.color`, 9);
      if (!HEX_COLOR.test(color)) invalidPreset(`${path}.color`);
      return color;
    })(),
    align: align as CardNewsTemplateTextSlot["style"]["align"],
    verticalAlign: verticalAlign as CardNewsTemplateTextSlot["style"]["verticalAlign"],
    maxLines: integer(value.maxLines, `${path}.maxLines`, 1, 12),
    overflow: overflow as CardNewsTemplateTextSlot["style"]["overflow"],
    wordBreak: wordBreak as CardNewsTemplateTextSlot["style"]["wordBreak"],
  };
}

export function validateCardNewsTemplatePreset(value: unknown): CardNewsTemplatePreset {
  if (!isRecord(value)) invalidPreset("preset");
  if (value.contractVersion !== CARD_NEWS_TEMPLATE_CONTRACT_VERSION) invalidPreset("preset.contractVersion");
  const id = requiredString(value.id, "preset.id", 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) invalidPreset("preset.id");
  const version = integer(value.version, "preset.version", 1, 100);
  const fontFamily = value.fontFamily;
  if (!CARD_NEWS_FONT_FAMILIES.includes(fontFamily as CardNewsTemplatePreset["fontFamily"])) invalidPreset("preset.fontFamily");
  const supportedAspectRatios = value.supportedAspectRatios;
  if (!Array.isArray(supportedAspectRatios) || supportedAspectRatios.length === 0) invalidPreset("preset.supportedAspectRatios");
  const aspects = supportedAspectRatios.map((aspect, index) => {
    if (!CARD_NEWS_ASPECT_RATIOS.includes(aspect as CardNewsTemplatePreset["supportedAspectRatios"][number])) {
      invalidPreset(`preset.supportedAspectRatios[${index}]`);
    }
    return aspect as CardNewsTemplatePreset["supportedAspectRatios"][number];
  });
  if (new Set(aspects).size !== aspects.length) invalidPreset("preset.supportedAspectRatios");

  if (!isRecord(value.layouts)) invalidPreset("preset.layouts");
  const layouts = {} as Record<CardNewsTemplateCardRole, CardNewsTemplateLayout>;
  for (const role of ["cover", "body", "closing"] as const) {
    const rawLayout = value.layouts[role];
    if (!isRecord(rawLayout) || !Array.isArray(rawLayout.slots) || rawLayout.slots.length === 0) invalidPreset(`preset.layouts.${role}`);
    const backgroundColor = requiredString(rawLayout.backgroundColor, `preset.layouts.${role}.backgroundColor`, 9);
    const accentColor = requiredString(rawLayout.accentColor, `preset.layouts.${role}.accentColor`, 9);
    if (!HEX_COLOR.test(backgroundColor)) invalidPreset(`preset.layouts.${role}.backgroundColor`);
    if (!HEX_COLOR.test(accentColor)) invalidPreset(`preset.layouts.${role}.accentColor`);
    const slots: CardNewsTemplateSlot[] = rawLayout.slots.map((rawSlot, index) => {
      const path = `preset.layouts.${role}.slots[${index}]`;
      if (!isRecord(rawSlot)) invalidPreset(path);
      const box = normalizedBox(rawSlot.box, `${path}.box`);
      if (rawSlot.kind === "text") {
        if (!( ["eyebrow", "headline", "body", "cta"] as const).includes(rawSlot.name as CardNewsTemplateTextSlot["name"])) invalidPreset(`${path}.name`);
        if (typeof rawSlot.required !== "boolean") invalidPreset(`${path}.required`);
        return {
          kind: "text",
          name: rawSlot.name as CardNewsTemplateTextSlot["name"],
          box,
          style: templateTextStyle(rawSlot.style, `${path}.style`, fontFamily as CardNewsTemplatePreset["fontFamily"]),
          required: rawSlot.required,
          maxCharacters: integer(rawSlot.maxCharacters, `${path}.maxCharacters`, 1, CARD_NEWS_MAX_TEXT_LENGTH),
        };
      }
      if (rawSlot.kind === "evidence") {
        if (rawSlot.name !== "evidence" || typeof rawSlot.required !== "boolean") invalidPreset(path);
        if (!( ["cover", "contain", "fill"] as const).includes(rawSlot.fit as "cover" | "contain" | "fill")) invalidPreset(`${path}.fit`);
        return {
          kind: "evidence",
          name: "evidence",
          box,
          fit: rawSlot.fit as CardNewsTemplateEvidenceSlot["fit"],
          radius: finiteNumber(rawSlot.radius, `${path}.radius`, 0, 240),
          required: rawSlot.required,
        };
      }
      invalidPreset(`${path}.kind`);
    });
    const headline = slots.find((slot) => slot.kind === "text" && slot.name === "headline");
    if (!headline || headline.kind !== "text" || !headline.required) invalidPreset(`preset.layouts.${role}.slots`);
    layouts[role] = {
      backgroundColor,
      accentColor,
      ...(rawLayout.accentBox === undefined ? {} : { accentBox: normalizedBox(rawLayout.accentBox, `preset.layouts.${role}.accentBox`) }),
      slots,
    };
  }

  if (!isRecord(value.constraints)) invalidPreset("preset.constraints");
  const minimumCards = integer(value.constraints.minimumCards, "preset.constraints.minimumCards", 3, 10);
  const maximumCards = integer(value.constraints.maximumCards, "preset.constraints.maximumCards", minimumCards, 10);
  const minimumEvidenceCards = integer(value.constraints.minimumEvidenceCards, "preset.constraints.minimumEvidenceCards", 1, maximumCards);
  if (!isRecord(value.defaultWatermark)) invalidPreset("preset.defaultWatermark");
  const watermarkPosition = value.defaultWatermark.position;
  if (!( ["top-left", "top-right", "bottom-left", "bottom-right"] as const).includes(watermarkPosition as CardNewsTemplatePreset["defaultWatermark"]["position"])) invalidPreset("preset.defaultWatermark.position");
  if (typeof value.defaultWatermark.enabled !== "boolean") invalidPreset("preset.defaultWatermark.enabled");
  return {
    contractVersion: CARD_NEWS_TEMPLATE_CONTRACT_VERSION,
    id,
    version,
    name: localizedText(value.name, "preset.name"),
    description: localizedText(value.description, "preset.description"),
    fontFamily: fontFamily as CardNewsTemplatePreset["fontFamily"],
    supportedAspectRatios: aspects,
    layouts,
    constraints: { minimumCards, maximumCards, minimumEvidenceCards },
    defaultWatermark: {
      enabled: value.defaultWatermark.enabled,
      text: typeof value.defaultWatermark.text === "string" ? value.defaultWatermark.text.trim().slice(0, 120) : "",
      size: finiteNumber(value.defaultWatermark.size, "preset.defaultWatermark.size", 8, 120),
      opacity: finiteNumber(value.defaultWatermark.opacity, "preset.defaultWatermark.opacity", 0, 1),
      position: watermarkPosition as CardNewsTemplatePreset["defaultWatermark"]["position"],
    },
  };
}

function getPresetRefKey(id: string, version: number) {
  return `${id}@${version}`;
}

function resolvePreset(reference: { id: string; version: number }, suppliedPreset?: CardNewsTemplatePreset) {
  if (suppliedPreset) {
    const preset = validateCardNewsTemplatePreset(suppliedPreset);
    if (preset.id !== reference.id || preset.version !== reference.version) {
      throw new CardNewsTemplateResolutionError("INVALID_TEMPLATE_PRESET", "preset.reference");
    }
    return preset;
  }
  const preset = BUILT_IN_PRESETS.find((candidate) => candidate.id === reference.id && candidate.version === reference.version);
  if (!preset && BUILT_IN_PRESETS.some((candidate) => candidate.id === reference.id)) {
    throw new CardNewsTemplateResolutionError("TEMPLATE_VERSION_UNSUPPORTED", getPresetRefKey(reference.id, reference.version));
  }
  if (!preset) throw new CardNewsTemplateResolutionError("TEMPLATE_NOT_FOUND", reference.id);
  return preset;
}

function requireText(value: unknown, path: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new CardNewsTemplateResolutionError("SLOT_REQUIRED", path);
  if (normalized.length > CARD_NEWS_MAX_TEXT_LENGTH) {
    throw new CardNewsTemplateResolutionError("SLOT_OVERFLOW", path);
  }
  return normalized;
}

function getSemanticText(card: CardNewsSemanticCard, name: CardNewsTemplateTextSlot["name"]) {
  return card[name];
}

function validateEvidence(evidence: CardNewsSemanticEvidence, path: string) {
  const hasAssetId = typeof evidence.assetId === "string" && evidence.assetId.trim().length > 0;
  const hasProxyUrl = typeof evidence.proxyUrl === "string" && evidence.proxyUrl.trim().length > 0;
  if (hasAssetId === hasProxyUrl) throw new CardNewsTemplateResolutionError("EVIDENCE_REFERENCE_INVALID", path);
  if (hasAssetId && !SAFE_ID.test(evidence.assetId!.trim())) {
    throw new CardNewsTemplateResolutionError("EVIDENCE_REFERENCE_INVALID", `${path}.assetId`);
  }
  if (hasProxyUrl && !PROXY_IMAGE_URL.test(evidence.proxyUrl!.trim())) {
    throw new CardNewsTemplateResolutionError("EVIDENCE_REFERENCE_INVALID", `${path}.proxyUrl`);
  }
  return {
    value: (hasAssetId ? evidence.assetId : evidence.proxyUrl)!.trim(),
    valueKind: hasAssetId ? "assetId" as const : "proxyUrl" as const,
    fit: evidence.fit || "cover",
    focalPoint: evidence.focalPoint || { x: 0.5, y: 0.5 },
  };
}

function makeLayerId(cardIndex: number, slotName: string, preset: CardNewsTemplatePreset) {
  return `template-${preset.id}-v${preset.version}-${String(cardIndex).padStart(2, "0")}-${slotName}`;
}

function makeAccentLayer(cardIndex: number, layout: CardNewsTemplateLayout, preset: CardNewsTemplatePreset): CardNewsLayer {
  return {
    id: makeLayerId(cardIndex, "accent", preset),
    type: "solid",
    box: layout.accentBox || { x: 0.08, y: 0.08, w: 0.014, h: 0.08 },
    color: layout.accentColor,
    opacity: 1,
    radius: 0,
  };
}

function makeTextLayer(
  cardIndex: number,
  slot: CardNewsTemplateTextSlot,
  value: string,
  fontFamily: CardNewsTemplatePreset["fontFamily"],
  preset: CardNewsTemplatePreset,
): CardNewsLayer {
  if (!CARD_NEWS_FONT_WEIGHTS[fontFamily].includes(slot.style.fontWeight)) {
    throw new CardNewsTemplateResolutionError("INVALID_RESOLVED_CARD_DECK", `${slot.name}.fontWeight`);
  }
  return {
    id: makeLayerId(cardIndex, slot.name, preset),
    type: "text",
    text: value,
    fontFamily,
    fontSize: slot.style.fontSize,
    fontWeight: slot.style.fontWeight,
    lineHeight: slot.style.lineHeight,
    letterSpacing: 0,
    unit: CARD_NEWS_CANONICAL_UNIT,
    maxLines: slot.style.maxLines,
    overflow: slot.style.overflow,
    verticalAlign: slot.style.verticalAlign,
    locale: "ko-KR",
    wordBreak: slot.style.wordBreak,
    color: slot.style.color,
    align: slot.style.align,
    box: slot.box,
  };
}

function makeEvidenceLayer(
  cardIndex: number,
  slot: Extract<CardNewsTemplateSlot, { kind: "evidence" }>,
  evidence: CardNewsSemanticEvidence,
  preset: CardNewsTemplatePreset,
): CardNewsLayer {
  const reference = validateEvidence(evidence, `cards[${cardIndex}].evidence`);
  return {
    id: makeLayerId(cardIndex, slot.name, preset),
    type: "image",
    src: reference.value,
    srcKind: reference.valueKind,
    box: slot.box,
    fit: reference.fit,
    focalPoint: reference.focalPoint,
    opacity: 1,
    radius: slot.radius,
    radiusUnit: CARD_NEWS_CANONICAL_UNIT,
  };
}

function validateCardRoles(cards: readonly CardNewsSemanticCard[]) {
  if (cards[0]?.role !== "cover" || cards[cards.length - 1]?.role !== "closing" || cards.slice(1, -1).some((card) => card.role !== "body")) {
    throw new CardNewsTemplateResolutionError("CARD_ROLE_INVALID", "cards");
  }
}

function resolveCard(
  card: CardNewsSemanticCard,
  index: number,
  preset: CardNewsTemplatePreset,
): CardNewsPayloadCard {
  const layout = preset.layouts[card.role];
  const layers: CardNewsLayer[] = [makeAccentLayer(index, layout, preset)];
  for (const slot of layout.slots) {
    if (slot.kind === "evidence") {
      if (card.evidence) {
        layers.push(makeEvidenceLayer(index, slot, card.evidence, preset));
      } else if (slot.required) {
        throw new CardNewsTemplateResolutionError("EVIDENCE_REQUIRED", `cards[${index}].evidence`);
      }
      continue;
    }

    const rawText = getSemanticText(card, slot.name);
    if (rawText === undefined || rawText.trim() === "") {
      if (slot.required) throw new CardNewsTemplateResolutionError("SLOT_REQUIRED", `cards[${index}].${slot.name}`);
      continue;
    }
    const value = requireText(rawText, `cards[${index}].${slot.name}`);
    if (value.length > slot.maxCharacters) {
      throw new CardNewsTemplateResolutionError("SLOT_OVERFLOW", `cards[${index}].${slot.name}`);
    }
    layers.push(makeTextLayer(index, slot, value, preset.fontFamily, preset));
  }

  return {
    cardId: `template-${preset.id}-v${preset.version}-card-${String(index).padStart(2, "0")}`,
    order: index,
    background: { type: "color", value: layout.backgroundColor, opacity: 1 },
    layers,
    altText: (card.altText || card.headline).trim().slice(0, 500),
  };
}

type CardNewsPayloadCard = CardNewsDeckPayload["cards"][number];

export function listCardNewsTemplatePresets() {
  return BUILT_IN_PRESETS.map((preset) => ({ ...preset, layouts: { ...preset.layouts } }));
}

export function getCardNewsTemplatePreset(reference: { id: string; version: number }) {
  return resolvePreset(reference);
}

export function toBuiltInCardNewsTemplateRegistryEntry(
  preset: CardNewsTemplatePreset,
  status: CardNewsTemplateRegistryEntry["status"] = "active",
): CardNewsTemplateRegistryEntry {
  return {
    id: preset.id,
    version: preset.version,
    status,
    source: "builtin",
    preset,
  };
}

export function resolveCardNewsTemplate(
  content: CardNewsSemanticCardContent,
  suppliedPreset?: CardNewsTemplatePreset,
): CardNewsDeckPayload {
  const preset = resolvePreset(content.template, suppliedPreset);
  if (!preset.supportedAspectRatios.includes(content.aspectRatio)) {
    throw new CardNewsTemplateResolutionError("ASPECT_RATIO_UNSUPPORTED", content.aspectRatio);
  }
  const title = typeof content.title === "string" ? content.title.trim() : "";
  if (!title || title.length > 120) throw new CardNewsTemplateResolutionError("SLOT_REQUIRED", "title");
  if (content.cards.length < preset.constraints.minimumCards || content.cards.length > preset.constraints.maximumCards) {
    throw new CardNewsTemplateResolutionError("CARD_COUNT_INVALID", "cards");
  }
  validateCardRoles(content.cards);

  const cards = content.cards.map((card, index) => resolveCard(card, index, preset));
  const evidenceCount = cards.filter((card) => card.layers.some((layer) => layer.type === "image")).length;
  if (evidenceCount < preset.constraints.minimumEvidenceCards) {
    throw new CardNewsTemplateResolutionError("EVIDENCE_REQUIRED", "cards.evidence");
  }

  const candidate: CardNewsDeckPayload = {
    title,
    aspectRatio: content.aspectRatio,
    frameSize: content.aspectRatio === "4:5" ? { w: 1_080, h: 1_350 } : { w: 1_080, h: 1_080 },
    theme: {
      backgroundColor: preset.layouts.cover.backgroundColor,
      fontFamily: preset.fontFamily,
      palette: [preset.layouts.cover.backgroundColor, preset.layouts.body.backgroundColor, preset.layouts.cover.accentColor],
    },
    cards,
    watermark: { ...preset.defaultWatermark },
    template: { id: preset.id, version: preset.version },
  };
  const parsed = parseCardNewsDeckPayload(candidate);
  if (!parsed.success) throw new CardNewsTemplateResolutionError("INVALID_RESOLVED_CARD_DECK", parsed.issues[0]?.path);
  return parsed.data;
}

export function resolveCardNewsTemplateStarter(input: CardNewsTemplateStarterInput, suppliedPreset?: CardNewsTemplatePreset) {
  // Starter 생성도 동일한 resolver를 거치므로 편집기와 agent가 다른 경로를 갖지 않는다.
  return resolveCardNewsTemplate(createCardNewsTemplateStarter(input), suppliedPreset);
}
