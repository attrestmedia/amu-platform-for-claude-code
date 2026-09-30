import "server-only";
import { TUTORS_BLOCKED_KEYS } from "consts/app";
import { normalizeKey } from "utils/normalize";
import {
  IMAGE_STUDIO_USER_PROMPTS_KEY,
  CONTENT_STUDIO_USER_PROMPTS_KEY,
  SYSTEM_BACKGROUND_CONTENT_TEMPLATE_KEYS,
} from "consts/app";
import { getModel } from "libs/database/modelCache";
import {
  getContentPromptByKey,
  getContentPromptByKeyInternal,
  getImagePromptByKey,
  getImagePromptByKeyInternal,
} from "libs/database/lab";
import { SERVICE_INTERNAL_IMAGE_PROMPT_KEYS } from "consts/app/serviceInternalPrompts";
import {
  ImagePromptSchema,
  ContentPromptSchema,
  type IImagePromptDocument,
  type IContentPromptDocument,
} from "models/lab";
import type { IPersonaSprite, IPersonaSpriteResource, PersonaSpriteDirection, UiScopeType } from "types/ai";
import { MONGODB_AI_URL } from "consts/env/server";
import { toUnknownRecord, isUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process normalizeSprite 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain persona, security
 * @scope global
 */

type SafeProfileMap = { default: string[] } & Record<string, string[]>;
type SafeSpriteMap = IPersonaSprite | null;

export function normalizeString(raw: unknown) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFrames(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return arr
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeSpriteResource(raw: unknown): IPersonaSpriteResource | null {
  if (!isUnknownRecord(raw)) return null as SafeSpriteMap;

  const url = normalizeString(raw.url);
  const frameWidth = Number(raw.frameWidth || 0);
  const frameHeight = Number(raw.frameHeight || 0);
  const columns = Number(raw.columns || 0);
  const rows = Number(raw.rows || 0);
  const fps = Number(raw.fps || 8);
  const idleFps = Number(raw.idleFps || 0);
  const loop = raw.loop === undefined ? undefined : Boolean(raw.loop);

  if (!url || frameWidth <= 0 || frameHeight <= 0 || columns <= 0 || rows <= 0) {
    return null as SafeSpriteMap;
  }

  // base 4방향은 필수(레거시 fail-closed 유지), 대각 4방향은 유효 항목만 수용 (시트 계약 v2 §1.4 폴백 — 대각 누락 시 base 수렴)
  const directions: PersonaSpriteDirection[] = ["left", "right", "up", "down"];
  const diagonalDirections: PersonaSpriteDirection[] = ["down-left", "up-left", "up-right", "down-right"];
  const animations = Object.create(null) as IPersonaSprite["animations"];
  const animationsSource = toUnknownRecord(raw.animations);

  const readDirectionEntry = (direction: PersonaSpriteDirection) => {
    const directionEntry = toUnknownRecord(animationsSource[direction]);
    const row = Number(directionEntry.row);
    const frameList = Array.isArray(directionEntry.frames)
      ? (directionEntry.frames as unknown[])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0 && value < columns)
      : [];
    if (!Number.isInteger(row) || row < 0 || row >= rows || frameList.length === 0) return null;
    return { row, frames: frameList };
  };

  for (const direction of directions) {
    const entry = readDirectionEntry(direction);
    if (!entry) {
      return null as SafeSpriteMap;
    }
    animations[direction] = entry;
  }

  let diagonalCount = 0;
  for (const direction of diagonalDirections) {
    const entry = readDirectionEntry(direction);
    if (entry) {
      animations[direction] = entry;
      diagonalCount += 1;
    }
  }

  const idleDirection = String(raw.idleDirection || "").trim().toLowerCase();

  return {
    url,
    frameWidth,
    frameHeight,
    columns,
    rows,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 8,
    idleFps: Number.isFinite(idleFps) && idleFps >= 0 ? idleFps : 0,
    directionCount: diagonalCount === diagonalDirections.length ? 8 : 4,
    idleDirection: directions.includes(idleDirection as PersonaSpriteDirection)
      ? (idleDirection as PersonaSpriteDirection)
      : "down",
    animations,
    ...(loop === undefined ? {} : { loop }),
  };
}

export function normalizeSprite(raw: unknown): SafeSpriteMap {
  const base = normalizeSpriteResource(raw);
  if (!base || !isUnknownRecord(raw)) return null;

  const actionsSource = toUnknownRecord(raw.actions);
  const actions = Object.fromEntries(
    Object.entries(actionsSource)
      .map(([key, value]) => {
        const normalizedKey = String(key || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48);
        return [normalizedKey, normalizeSpriteResource(value)] as const;
      })
      .filter((entry): entry is [string, IPersonaSpriteResource] => Boolean(entry[0] && entry[1])),
  );

  return {
    ...base,
    ...(Object.keys(actions).length > 0 ? { actions } : {}),
  };
}

export function normalizeProfiles(raw: unknown): SafeProfileMap {
  const result: Record<string, string[]> = Object.create(null);
  if (isUnknownRecord(raw)) {
    for (const key of Object.keys(raw)) {
      if (TUTORS_BLOCKED_KEYS.has(key)) continue;
      const frames = normalizeFrames(raw[key]);
      if (key === "default") result.default = frames;
      else if (frames.length) result[key] = frames;
    }
  }
  if (!result.default) result.default = [];
  return result as SafeProfileMap;
}

export function safePolicyObj(raw: unknown, maxJsonChars = 20000) {
  if (!isUnknownRecord(raw)) return null;
  try {
    const s = JSON.stringify(raw);
    if (s.length > maxJsonChars) return null;
    return raw;
  } catch {
    return null;
  }
}

// override가 base를 덮어씀 (object는 재귀 병합 / array는 override로 교체)
export function deepMergeSafe(base: unknown, override: unknown, depth = 0): UnknownRecord {
  if (depth > 8) return isUnknownRecord(base) ? base : {}; // 과도한 depth 방지
  const b: UnknownRecord = isUnknownRecord(base) ? base : {};
  const o: UnknownRecord | null = isUnknownRecord(override) ? override : null;
  if (!o) return b;

  const out: UnknownRecord = Object.create(null);
  for (const k of Object.keys(b)) {
    if (TUTORS_BLOCKED_KEYS.has(k)) continue;
    out[k] = b[k];
  }

  for (const k of Object.keys(o)) {
    if (TUTORS_BLOCKED_KEYS.has(k)) continue;

    const ov = o[k];
    if (ov === undefined) continue;

    const bv = out[k];
    if (isUnknownRecord(bv) && isUnknownRecord(ov)) out[k] = deepMergeSafe(bv, ov, depth + 1);
    else out[k] = ov; // array/primitive는 override로 교체
  }
  return out;
}

export function getUserKeyOrThrow(user: unknown) {
  const u = toUnknownRecord(user);
  const raw = String(u.userKey || u.id || u.userId || u.userEmailLower || u.userEmail || "").trim();
  const k = normalizeKey(raw);
  if (!k) throw new Error("user_key_required");
  return k;
}

export async function getUserImageModel(userKey: string) {
  const col = `${IMAGE_STUDIO_USER_PROMPTS_KEY}_${userKey}`;
  return await getModel<IImagePromptDocument>(MONGODB_AI_URL, col, ImagePromptSchema, col);
}

export async function getUserContentModel(userKey: string) {
  const col = `${CONTENT_STUDIO_USER_PROMPTS_KEY}_${userKey}`;
  return await getModel<IContentPromptDocument>(MONGODB_AI_URL, col, ContentPromptSchema, col);
}

function normalizeTemplateScope(raw: unknown): UiScopeType | undefined {
  const scope = String(raw || "").trim().toLowerCase();
  if (scope === "user" || scope === "system") return scope;
  return undefined;
}

async function resolveSystemImagePromptDoc(key: string) {
  if ((SERVICE_INTERNAL_IMAGE_PROMPT_KEYS as readonly string[]).includes(key)) {
    return await getImagePromptByKeyInternal(key);
  }
  return await getImagePromptByKey(key);
}

export async function resolveUserImagePromptDoc(args: {
  templateKey: unknown;
  templateScope?: UiScopeType;
  user: unknown;
}) {
  const templateKey = normalizeString(args.templateKey);
  if (!templateKey) return null;

  const scope = normalizeTemplateScope(args.templateScope);
  if (scope === "system") return await resolveSystemImagePromptDoc(templateKey);

  const userKey = getUserKeyOrThrow(args.user);
  const userModel = await getUserImageModel(userKey);
  const userDoc = await userModel.findOne({ key: templateKey, enabled: true }).lean();
  if (scope === "user") return userDoc;

  return userDoc || (await resolveSystemImagePromptDoc(templateKey));
}

export async function resolveUserContentPromptDoc(args: {
  templateKey: unknown;
  templateScope?: UiScopeType;
  user: unknown;
}) {
  const templateKey = normalizeString(args.templateKey);
  if (!templateKey) return null;

  const scope = normalizeTemplateScope(args.templateScope);
  if (scope === "system") {
    // 백그라운드 system 서비스가 호출하는 admin 전용 템플릿(allowlist)만 internal(=public+admin) 조회를 허용한다.
    // 그 외 키는 기존대로 public 전용 조회로 admin 템플릿 노출을 차단한다.
    return SYSTEM_BACKGROUND_CONTENT_TEMPLATE_KEYS.has(templateKey)
      ? await getContentPromptByKeyInternal(templateKey)
      : await getContentPromptByKey(templateKey);
  }

  const userKey = getUserKeyOrThrow(args.user);
  const userModel = await getUserContentModel(userKey);
  const userDoc = await userModel.findOne({ key: templateKey, enabled: true }).lean();
  if (scope === "user") return userDoc;

  return userDoc || (await getContentPromptByKey(templateKey));
}
