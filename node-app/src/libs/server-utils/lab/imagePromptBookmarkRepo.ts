import "server-only";
import { getModel } from "libs/database/modelCache";
import { UserSchema, type IUserDocument } from "models/user";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { MONGODB_USERS_URL } from "consts/env/server";
import { toUnknownRecord } from "utils/common/typeUtils";

const MAX_BOOKMARK_COUNT = 200;
type PromptBookmarkFieldType = "imagePromptBookmarks" | "contentPromptBookmarks";

function toSafeUid(value: unknown) {
  return String(value || "")
    .trim()
    .slice(0, 128);
}

function toSafeEmail(value: unknown, uid: string) {
  const email = String(value || "").trim().toLowerCase();
  return email || `${uid}@amu.local`;
}

function normalizeBookmarkKeys(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values
        .map((value) =>
          String(value || "")
            .trim()
            .slice(0, 128),
        )
        .filter(Boolean),
    ),
  ).slice(0, MAX_BOOKMARK_COUNT);
}

async function getUserModel(uid: string) {
  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  return await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
}

function readBookmarks(doc: unknown, field: PromptBookmarkFieldType): string[] {
  const studioPreferences = toUnknownRecord(toUnknownRecord(doc).studioPreferences);
  return normalizeBookmarkKeys(studioPreferences[field]);
}

async function listUserPromptBookmarks(uid: string, field: PromptBookmarkFieldType): Promise<string[]> {
  const cleanUid = toSafeUid(uid);
  if (!cleanUid) return [];

  const UserModel = await getUserModel(cleanUid);
  const doc = await UserModel.findOne({ uid: cleanUid }).lean();
  return readBookmarks(doc, field);
}

async function setUserPromptBookmark(
  uid: string,
  userEmail: string,
  templateKey: string,
  bookmarked: boolean,
  field: PromptBookmarkFieldType,
): Promise<string[]> {
  const cleanUid = toSafeUid(uid);
  const cleanTemplateKey = String(templateKey || "")
    .trim()
    .slice(0, 128);
  if (!cleanUid || !cleanTemplateKey) return [];

  const safeEmail = toSafeEmail(userEmail, cleanUid);
  const bookmarkPath = `studioPreferences.${field}`;
  const UserModel = await getUserModel(cleanUid);
  const doc = await UserModel.findOneAndUpdate(
    { uid: cleanUid },
    bookmarked
      ? {
          $setOnInsert: {
            uid: cleanUid,
            userEmail: safeEmail,
            userEmailLower: safeEmail,
          },
          $addToSet: {
            [bookmarkPath]: cleanTemplateKey,
          },
        }
      : {
          $setOnInsert: {
            uid: cleanUid,
            userEmail: safeEmail,
            userEmailLower: safeEmail,
          },
          $pull: {
            [bookmarkPath]: cleanTemplateKey,
          },
        },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return readBookmarks(doc, field);
}

async function clearUserPromptBookmarks(
  uid: string,
  userEmail: string,
  field: PromptBookmarkFieldType,
): Promise<string[]> {
  const cleanUid = toSafeUid(uid);
  if (!cleanUid) return [];

  const safeEmail = toSafeEmail(userEmail, cleanUid);
  const bookmarkPath = `studioPreferences.${field}`;
  const UserModel = await getUserModel(cleanUid);
  const doc = await UserModel.findOneAndUpdate(
    { uid: cleanUid },
    {
      $setOnInsert: {
        uid: cleanUid,
        userEmail: safeEmail,
        userEmailLower: safeEmail,
      },
      $set: {
        [bookmarkPath]: [],
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return readBookmarks(doc, field);
}

export function listUserImagePromptBookmarks(uid: string) {
  return listUserPromptBookmarks(uid, "imagePromptBookmarks");
}

export function setUserImagePromptBookmark(uid: string, userEmail: string, templateKey: string, bookmarked: boolean) {
  return setUserPromptBookmark(uid, userEmail, templateKey, bookmarked, "imagePromptBookmarks");
}

export function clearUserImagePromptBookmarks(uid: string, userEmail: string) {
  return clearUserPromptBookmarks(uid, userEmail, "imagePromptBookmarks");
}

export function listUserContentPromptBookmarks(uid: string) {
  return listUserPromptBookmarks(uid, "contentPromptBookmarks");
}

export function setUserContentPromptBookmark(uid: string, userEmail: string, templateKey: string, bookmarked: boolean) {
  return setUserPromptBookmark(uid, userEmail, templateKey, bookmarked, "contentPromptBookmarks");
}

export function clearUserContentPromptBookmarks(uid: string, userEmail: string) {
  return clearUserPromptBookmarks(uid, userEmail, "contentPromptBookmarks");
}
