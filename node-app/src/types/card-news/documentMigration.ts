/**
 * @docHint
 * @purpose 저장된 CardNews raw document의 버전을 확인하고 현재 CardDeck 계약으로 읽기
 * @process raw documentVersion 확인 → 버전별 migration → current parser
 * @domain card-news
 * @scope shared
 */

import {
  CARD_NEWS_CANONICAL_UNIT,
  CARD_NEWS_DOCUMENT_VERSION,
  CARD_NEWS_LEGACY_DOCUMENT_VERSION,
  CARD_NEWS_SUPPORTED_DOCUMENT_VERSIONS,
  parseCardNewsDeckPayload,
  type CardNewsDeckIssue,
  type CardNewsDeckPayload,
} from "./cardDeck";

type UnknownRecord = Record<string, unknown>;

export type CardNewsDocumentMigrationSuccess = {
  success: true;
  data: CardNewsDeckPayload;
  currentVersion: typeof CARD_NEWS_DOCUMENT_VERSION;
  migratedFrom: (typeof CARD_NEWS_SUPPORTED_DOCUMENT_VERSIONS)[number];
  needsCurrentVersionWrite: boolean;
};

export type CardNewsDocumentMigrationFailure = {
  success: false;
  error: string;
  code: "DOCUMENT_VERSION_MISSING" | "DOCUMENT_VERSION_UNSUPPORTED" | "INVALID_DOCUMENT";
  issues: CardNewsDeckIssue[];
};

export type CardNewsDocumentMigrationResult =
  | CardNewsDocumentMigrationSuccess
  | CardNewsDocumentMigrationFailure;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function payloadFromRaw(raw: UnknownRecord): UnknownRecord {
  const payload: UnknownRecord = {};
  for (const key of ["title", "aspectRatio", "frameSize", "theme", "cards", "watermark", "template"] as const) {
    if (raw[key] !== undefined) payload[key] = raw[key];
  }
  return payload;
}

function migrateV1TextLayer(layer: UnknownRecord): UnknownRecord {
  const fontSize = isFiniteNumber(layer.fontSize) ? layer.fontSize : 16;
  const oldLineHeight = layer.lineHeight;
  const lineHeight = isFiniteNumber(oldLineHeight) && oldLineHeight <= 3
    ? Math.round(fontSize * oldLineHeight)
    : oldLineHeight;

  return {
    ...layer,
    lineHeight,
    unit: CARD_NEWS_CANONICAL_UNIT,
    overflow: "clip",
    verticalAlign: "top",
    locale: "ko-KR",
    wordBreak: "keep-all",
  };
}

function migrateV1ImageLayer(layer: UnknownRecord): UnknownRecord {
  return {
    ...layer,
    focalPoint: isRecord(layer.focalPoint) ? layer.focalPoint : { x: 0.5, y: 0.5 },
    opacity: isFiniteNumber(layer.opacity) ? layer.opacity : 1,
    radiusUnit: CARD_NEWS_CANONICAL_UNIT,
  };
}

function migrateV1Payload(raw: UnknownRecord): UnknownRecord {
  const payload = payloadFromRaw(raw);
  const cards = Array.isArray(payload.cards)
    ? payload.cards.map((card) => {
        const source = asRecord(card);
        const layers = Array.isArray(source.layers)
          ? source.layers.map((layer) => {
              const sourceLayer = asRecord(layer);
              if (sourceLayer.type === "text") return migrateV1TextLayer(sourceLayer);
              if (sourceLayer.type === "image") return migrateV1ImageLayer(sourceLayer);
              return sourceLayer;
            })
          : source.layers;
        const background = asRecord(source.background);
        return {
          ...source,
          ...(Array.isArray(source.layers) ? { layers } : {}),
          altText: typeof source.altText === "string" ? source.altText : "",
          ...(background.type === "image"
            ? {
                background: {
                  ...background,
                  focalPoint: isRecord(background.focalPoint) ? background.focalPoint : { x: 0.5, y: 0.5 },
                },
              }
            : {}),
        };
      })
    : payload.cards;

  return {
    ...payload,
    ...(Array.isArray(payload.cards) ? { cards } : {}),
  };
}

function issue(path: string, message: string): CardNewsDeckIssue {
  return { path, message };
}

function readDocumentVersion(raw: UnknownRecord) {
  return raw.documentVersion;
}

/**
 * Raw DB 문서 전용 진입점이다. payload 생성/patch 입력처럼 documentVersion이 없는
 * 요청은 기존 parseCardNewsDeckPayload를 직접 사용하고 이 함수를 거치지 않는다.
 */
export function migrateCardNewsDeckDocument(value: unknown): CardNewsDocumentMigrationResult {
  if (!isRecord(value)) {
    return {
      success: false,
      error: "CardNews raw document가 객체가 아닙니다.",
      code: "INVALID_DOCUMENT",
      issues: [issue("document", "CardNews raw document가 객체여야 합니다.")],
    };
  }

  const rawVersion = readDocumentVersion(value);
  if (!Number.isInteger(rawVersion)) {
    return {
      success: false,
      error: "CardNews documentVersion이 없습니다.",
      code: "DOCUMENT_VERSION_MISSING",
      issues: [issue("documentVersion", "저장 문서에는 정수 documentVersion이 필요합니다.")],
    };
  }

  if (!CARD_NEWS_SUPPORTED_DOCUMENT_VERSIONS.includes(rawVersion as never)) {
    return {
      success: false,
      error: `지원하지 않는 CardNews documentVersion입니다: ${String(rawVersion)}`,
      code: "DOCUMENT_VERSION_UNSUPPORTED",
      issues: [issue("documentVersion", `지원 버전은 ${CARD_NEWS_SUPPORTED_DOCUMENT_VERSIONS.join(", ")}입니다.`)],
    };
  }

  const payload = rawVersion === CARD_NEWS_LEGACY_DOCUMENT_VERSION
    ? migrateV1Payload(value)
    : payloadFromRaw(value);
  const parsed = parseCardNewsDeckPayload(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error,
      code: "INVALID_DOCUMENT",
      issues: parsed.issues,
    };
  }

  return {
    success: true,
    data: parsed.data,
    currentVersion: CARD_NEWS_DOCUMENT_VERSION,
    migratedFrom: rawVersion as CardNewsDocumentMigrationSuccess["migratedFrom"],
    needsCurrentVersionWrite: rawVersion !== CARD_NEWS_DOCUMENT_VERSION,
  };
}
