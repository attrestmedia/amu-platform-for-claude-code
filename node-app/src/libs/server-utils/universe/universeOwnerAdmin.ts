import "server-only";

import { MONGODB_USERS_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { UserIndexSchema, type IUserIndexDocument } from "models/user";

/**
 * @docHint
 * @purpose administrator 전용 game Universe owner 배정에 필요한 계정 UID를 조회
 * @process UserIndex의 정규화 이메일과 UID를 읽어 미해결 계정 수 또는 이메일 표시값을 반환
 * @domain universe
 * @scope server
 */

async function getUserIndexModel() {
  return getModel<IUserIndexDocument>(MONGODB_USERS_URL, "UserIndex", UserIndexSchema, "users_index");
}

export async function resolveUidsByEmails(emails: readonly string[]) {
  const normalizedEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!normalizedEmails.length) return { uids: [], unresolvedCount: 0 };

  const UserIndexModel = await getUserIndexModel();
  const rows = await UserIndexModel.find({ userEmailLower: { $in: normalizedEmails } })
    .select({ _id: 0, uid: 1, userEmailLower: 1 })
    .lean();
  const uidByEmail = new Map<string, string>();

  for (const row of rows) {
    const email = String(row.userEmailLower || "").trim().toLowerCase();
    const uid = String(row.uid || "").trim();
    if (email && uid) uidByEmail.set(email, uid);
  }

  const uids = normalizedEmails.flatMap((email) => {
    const uid = uidByEmail.get(email);
    return uid ? [uid] : [];
  });
  const unresolvedCount = normalizedEmails.filter((email) => !uidByEmail.has(email)).length;
  return { uids, unresolvedCount };
}

export async function resolveEmailsByUids(uids: readonly string[]) {
  const normalizedUids = [...new Set(uids.map((uid) => uid.trim()).filter(Boolean))];
  if (!normalizedUids.length) return new Map<string, string>();

  const UserIndexModel = await getUserIndexModel();
  const rows = await UserIndexModel.find({ uid: { $in: normalizedUids } })
    .select({ _id: 0, uid: 1, userEmail: 1, userEmailLower: 1 })
    .lean();
  const emailByUid = new Map<string, string>();

  for (const row of rows) {
    const uid = String(row.uid || "").trim();
    const email = String(row.userEmail || row.userEmailLower || "").trim();
    if (uid && email && !emailByUid.has(uid)) emailByUid.set(uid, email);
  }

  return emailByUid;
}
