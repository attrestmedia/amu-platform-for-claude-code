import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  listUserPushTokens,
  removeUserPushTokens,
  upsertUserPushToken,
} from "libs/server-utils/notification/userPushTokenRepo";
import { toUnknownRecord, type UnknownRecord } from "utils/common";

function toUid(user: unknown) {
  const record = toUnknownRecord(user);
  return String(record.uid || record.ID || "").trim();
}

function validatePost(data: unknown) {
  const token = String(toUnknownRecord(data).token || "").trim();
  if (!token) return { valid: false, error: "token이 필요합니다." };
  if (token.length < 20 || token.length > 4096) return { valid: false, error: "token 형식이 올바르지 않습니다." };
  return { valid: true };
}

function validateDelete(data: unknown) {
  const token = String(toUnknownRecord(data).token || "").trim();
  if (!token) return { valid: false, error: "삭제할 token이 필요합니다." };
  return { valid: true };
}

export const POST = withAuth<UnknownRecord>(
  async (data, user) => {
    const uid = toUid(user);
    if (!uid) return { success: false, error: "unauthorized" };

    const result = await upsertUserPushToken(uid, {
      token: String(data?.token || ""),
      platform: String(data?.platform || "unknown"),
      appVersion: String(data?.appVersion || ""),
      locale: String(data?.locale || ""),
      timezone: String(data?.timezone || ""),
    });

    return {
      success: true,
      data: result,
    };
  },
  validatePost,
  "user/devices/push-token:post",
);

export const DELETE = withAuth<UnknownRecord>(
  async (data, user) => {
    const uid = toUid(user);
    if (!uid) return { success: false, error: "unauthorized" };

    const token = String(data?.token || "").trim();
    const result = await removeUserPushTokens(uid, token ? [token] : []);

    return {
      success: true,
      data: result,
    };
  },
  validateDelete,
  "user/devices/push-token:delete",
);

export const GET = withAuth(
  async (_data, user) => {
    const uid = toUid(user);
    if (!uid) return { success: false, error: "unauthorized" };

    const tokens = await listUserPushTokens(uid);
    return {
      success: true,
      data: {
        tokenCount: tokens.length,
      },
    };
  },
  undefined,
  "user/devices/push-token:get",
);
