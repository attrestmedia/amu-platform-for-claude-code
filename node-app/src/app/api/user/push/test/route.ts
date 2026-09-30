import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { sendPushToTokens } from "libs/server-utils/notification/pushSender";
import { listUserPushTokens, removeUserPushTokens } from "libs/server-utils/notification/userPushTokenRepo";
import { toErrorMessage, toUnknownRecord } from "utils/common";

const ALLOWED_CHANNELS = new Set(["amu_default", "high_priority", "chat", "marketing"]);
const ALLOWED_STYLES = new Set(["text", "big_text", "banner", "image"]);

function toUid(user: unknown) {
  const record = toUnknownRecord(user);
  return String(record.uid || record.ID || "").trim();
}

export const POST = withAuth(
  async (data, user) => {
    const uid = toUid(user);
    if (!uid) return { success: false, error: "unauthorized" };

    const tokens = await listUserPushTokens(uid);
    if (tokens.length === 0) {
      return {
        success: false,
        error: "no_registered_push_token",
      };
    }

    const title = String(data?.title || "AMU 테스트 알림").trim() || "AMU 테스트 알림";
    const body = String(data?.body || "푸시 연동 테스트 메시지입니다.").trim() || "푸시 연동 테스트 메시지입니다.";
    const deeplink = String(data?.deeplink || "").trim();
    const url = String(data?.url || data?.route || deeplink || "").trim();
    const type = String(data?.type || "user.push.test").trim() || "user.push.test";
    const imageUrl = String(data?.imageUrl || "").trim();

    const styleRaw = String(data?.style || "text")
      .trim()
      .toLowerCase();
    const style = ALLOWED_STYLES.has(styleRaw) ? styleRaw : "text";

    const channelRaw = String(data?.channel || "amu_default")
      .trim()
      .toLowerCase();
    const channel = ALLOWED_CHANNELS.has(channelRaw) ? channelRaw : "amu_default";

    let result;
    try {
      result = await sendPushToTokens({
        tokens,
        title,
        body,
        url: url || undefined,
        deeplink: deeplink || undefined,
        type,
        style,
        channel,
        imageUrl: imageUrl || undefined,
        data: {
          requestedBy: "user.push.test",
        },
      });
    } catch (error) {
      if (toErrorMessage(error) === "fcm_disabled") {
        return NextResponse.json(
          {
            success: false,
            error: "push_service_disabled",
            errorCode: "FCM_DISABLED",
          },
          { status: 503 },
        );
      }
      throw error;
    }

    if (result.invalidTokens.length > 0) {
      await removeUserPushTokens(uid, result.invalidTokens);
    }

    return {
      success: true,
      data: {
        requested: result.requested,
        success: result.success,
        failure: result.failure,
        droppedInvalidTokenCount: result.invalidTokens.length,
        channel,
        style,
        type,
      },
    };
  },
  undefined,
  "user/push/test:post",
);
