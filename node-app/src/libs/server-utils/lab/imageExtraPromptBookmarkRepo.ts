import "server-only";
import { randomUUID } from "crypto";
import { getModel } from "libs/database/modelCache";
import { UserSchema, type IUserDocument } from "models/user";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { MONGODB_USERS_URL } from "consts/env/server";
import type { ImageExtraPromptBookmarkType } from "types/app";
import { toUnknownRecord, toTimestamp } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose Gen Studio 사용자 입력 extraPrompt 저장소 관리
 * @process 사용자 문서 조회  templateKey/text 검증  항목 추가/삭제/전체 정리  정규화 목록 반환
 * @domain lab
 * @scope server
 */

const MAX_EXTRA_PROMPT_BOOKMARK_COUNT = 300;
const MAX_EXTRA_PROMPT_BOOKMARKS_PER_TEMPLATE = 50;
const MAX_TEMPLATE_KEY_CHARS = 128;
const MAX_EXTRA_PROMPT_CHARS = 2000;

function toSafeUid(value: unknown) {
  return String(value || "")
    .trim()
    .slice(0, 128);
}

function toSafeEmail(value: unknown, uid: string) {
  const email = String(value || "").trim().toLowerCase();
  return email || `${uid}@amu.local`;
}

function toSafeTemplateKey(value: unknown) {
  return String(value || "")
    .trim()
    .slice(0, MAX_TEMPLATE_KEY_CHARS);
}

function toSafeExtraPrompt(value: unknown) {
  return String(value || "")
    .trim()
    .slice(0, MAX_EXTRA_PROMPT_CHARS);
}

function toIsoDate(value: unknown) {
  const time = toTimestamp(value);
  return time > 0 ? new Date(time).toISOString() : new Date().toISOString();
}

function getPromptKey(templateKey: string, text: string) {
  return `${templateKey}\n${text.replace(/\s+/g, " ").trim()}`;
}

async function getUserModel(uid: string) {
  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  return await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
}

function normalizeExtraPromptBookmarks(raw: unknown): ImageExtraPromptBookmarkType[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  return raw
    .map((itemRaw: unknown, index) => {
      const item = toUnknownRecord(itemRaw);
      const templateKey = toSafeTemplateKey(item.templateKey);
      const text = toSafeExtraPrompt(item.text);
      if (!templateKey || !text) return null;

      const key = getPromptKey(templateKey, text);
      if (seen.has(key)) return null;
      seen.add(key);

      const createdAt = toIsoDate(item.createdAt);
      const updatedAt = toIsoDate(item.updatedAt || createdAt);
      return {
        id: String(item.id || `extra-prompt-${index}`).trim().slice(0, 96),
        templateKey,
        text,
        createdAt,
        updatedAt,
      } satisfies ImageExtraPromptBookmarkType;
    })
    .filter((item): item is ImageExtraPromptBookmarkType => item !== null)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_EXTRA_PROMPT_BOOKMARK_COUNT);
}

function enforceBookmarkLimits(items: ImageExtraPromptBookmarkType[]) {
  const countsByTemplate = new Map<string, number>();
  const next: ImageExtraPromptBookmarkType[] = [];

  for (const item of items) {
    const count = countsByTemplate.get(item.templateKey) || 0;
    if (count >= MAX_EXTRA_PROMPT_BOOKMARKS_PER_TEMPLATE) continue;
    countsByTemplate.set(item.templateKey, count + 1);
    next.push(item);
    if (next.length >= MAX_EXTRA_PROMPT_BOOKMARK_COUNT) break;
  }

  return next;
}

function readExtraPromptBookmarks(doc: unknown) {
  const studioPreferences = toUnknownRecord(toUnknownRecord(doc).studioPreferences);
  return normalizeExtraPromptBookmarks(studioPreferences.imageExtraPromptBookmarks);
}

async function readUserExtraPromptBookmarks(uid: string) {
  const UserModel = await getUserModel(uid);
  const doc = await UserModel.findOne({ uid }).lean();
  return { items: readExtraPromptBookmarks(doc) };
}

async function writeUserExtraPromptBookmarks(uid: string, userEmail: string, items: ImageExtraPromptBookmarkType[]) {
  const safeEmail = toSafeEmail(userEmail, uid);
  const UserModel = await getUserModel(uid);
  const doc = await UserModel.findOneAndUpdate(
    { uid },
    {
      $setOnInsert: {
        uid,
        userEmail: safeEmail,
        userEmailLower: safeEmail,
      },
      $set: {
        "studioPreferences.imageExtraPromptBookmarks": enforceBookmarkLimits(items),
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return readExtraPromptBookmarks(doc);
}

export async function listUserImageExtraPromptBookmarks(uid: string, templateKey?: string) {
  const cleanUid = toSafeUid(uid);
  if (!cleanUid) return [];

  const { items } = await readUserExtraPromptBookmarks(cleanUid);
  const safeTemplateKey = toSafeTemplateKey(templateKey);
  return safeTemplateKey ? items.filter((item) => item.templateKey === safeTemplateKey) : items;
}

export async function addUserImageExtraPromptBookmark(args: {
  uid: string;
  userEmail: string;
  templateKey: string;
  text: string;
}) {
  const cleanUid = toSafeUid(args.uid);
  const templateKey = toSafeTemplateKey(args.templateKey);
  const text = toSafeExtraPrompt(args.text);
  if (!cleanUid || !templateKey || !text) return [];

  const { items } = await readUserExtraPromptBookmarks(cleanUid);
  const now = new Date().toISOString();
  const promptKey = getPromptKey(templateKey, text);
  const existing = items.find((item) => getPromptKey(item.templateKey, item.text) === promptKey);
  const nextItem: ImageExtraPromptBookmarkType = existing
    ? { ...existing, updatedAt: now }
    : {
        id: randomUUID(),
        templateKey,
        text,
        createdAt: now,
        updatedAt: now,
      };
  const nextItems = [nextItem, ...items.filter((item) => getPromptKey(item.templateKey, item.text) !== promptKey)];

  return await writeUserExtraPromptBookmarks(cleanUid, args.userEmail, nextItems);
}

export async function removeUserImageExtraPromptBookmark(uid: string, userEmail: string, id: string) {
  const cleanUid = toSafeUid(uid);
  const safeId = String(id || "").trim();
  if (!cleanUid || !safeId) return [];

  const { items } = await readUserExtraPromptBookmarks(cleanUid);
  return await writeUserExtraPromptBookmarks(
    cleanUid,
    userEmail,
    items.filter((item) => item.id !== safeId),
  );
}

export async function clearUserImageExtraPromptBookmarks(uid: string, userEmail: string, templateKey?: string) {
  const cleanUid = toSafeUid(uid);
  if (!cleanUid) return [];

  const safeTemplateKey = toSafeTemplateKey(templateKey);
  const { items } = await readUserExtraPromptBookmarks(cleanUid);
  const nextItems = safeTemplateKey ? items.filter((item) => item.templateKey !== safeTemplateKey) : [];
  return await writeUserExtraPromptBookmarks(cleanUid, userEmail, nextItems);
}
