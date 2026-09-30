import "server-only";
import { toUnknownRecord, toSafeString } from "utils/common/typeUtils";

export const TUTORS_SHARED_TEMPLATE_COLLECTION = "tutors_shared_personas";

export function safeKey(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getUserKey(user: unknown) {
  const u = toUnknownRecord(user);
  const id = toSafeString(u.ID ?? u.id);
  if (id) return safeKey(id);
  const email = toSafeString(u.userEmailLower ?? u.userEmail);
  if (email) return safeKey(email);
  return "";
}

export function getTutorsCollectionName(user: unknown) {
  const k = getUserKey(user);
  if (!k) throw new Error("UNAUTHORIZED_USER_KEY");
  return `tutors_${k}`;
}

export function isSafeTutorsCollectionName(value: unknown) {
  const name = String(value || "").trim();
  return /^tutors_[a-z0-9_]+$/.test(name) || name === TUTORS_SHARED_TEMPLATE_COLLECTION;
}
