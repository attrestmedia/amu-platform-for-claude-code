import "server-only";
import { getFirebaseMessaging } from "./firebaseAdmin";

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const ALLOWED_PUSH_CHANNELS = new Set(["amu_default", "high_priority", "chat", "marketing"]);
const ALLOWED_PUSH_STYLES = new Set(["text", "big_text", "banner", "image"]);
const DEFAULT_ANDROID_CHANNEL_ID = String(process.env.FCM_DEFAULT_ANDROID_CHANNEL_ID || "").trim() || "amu_default";
const DEFAULT_TTL_SECONDS = Math.max(
  0,
  Math.min(2419200, Number(process.env.FCM_DEFAULT_TTL_SECONDS || "3600") || 3600),
);

function normalizeString(value: unknown, maxLength = 2000) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function normalizePushChannel(value: unknown) {
  const channel = normalizeString(value, 64).toLowerCase();
  if (!channel) return DEFAULT_ANDROID_CHANNEL_ID;
  return ALLOWED_PUSH_CHANNELS.has(channel) ? channel : DEFAULT_ANDROID_CHANNEL_ID;
}

function normalizePushStyle(value: unknown) {
  const style = normalizeString(value, 64).toLowerCase();
  if (!style) return "text";
  return ALLOWED_PUSH_STYLES.has(style) ? style : "text";
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function normalizeData(data?: Record<string, unknown>) {
  const out: Record<string, string> = {};
  if (!data) return out;

  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    out[key] = String(value);
  });

  return out;
}

export async function sendPushToTokens(args: {
  tokens: string[];
  title: string;
  body: string;
  url?: string;
  deeplink?: string;
  type?: string;
  style?: "text" | "big_text" | "banner" | "image" | string;
  channel?: "amu_default" | "high_priority" | "chat" | "marketing" | string;
  imageUrl?: string;
  data?: Record<string, unknown>;
}) {
  const tokens = Array.from(new Set((args.tokens || []).map((token) => String(token || "").trim()).filter(Boolean)));
  if (tokens.length === 0) {
    return {
      requested: 0,
      success: 0,
      failure: 0,
      invalidTokens: [] as string[],
    };
  }

  const messaging = getFirebaseMessaging();
  const invalidTokens: string[] = [];

  let success = 0;
  let failure = 0;

  const channelId = normalizePushChannel(args.channel);
  const style = normalizePushStyle(args.style);
  const type = normalizeString(args.type, 128) || "general";
  const url = normalizeString(args.url, 2000);
  const deeplink = normalizeString(args.deeplink, 2000);
  const targetUrl = url || deeplink;
  const imageUrl = normalizeString(args.imageUrl, 2000);

  const mergedData = normalizeData({
    ...(args.data || {}),
    ...(targetUrl ? { url: targetUrl } : {}),
    ...(deeplink ? { deeplink } : targetUrl ? { deeplink: targetUrl } : {}),
    type,
    style,
    channel: channelId,
  });

  const batches = chunkArray(tokens, 500);
  for (const batch of batches) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: {
        title: String(args.title || "").trim(),
        body: String(args.body || "").trim(),
        ...(imageUrl ? { imageUrl } : {}),
      },
      data: mergedData,
      android: {
        ttl: DEFAULT_TTL_SECONDS * 1000,
        priority: "high",
        notification: {
          channelId,
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            ...(imageUrl ? { "mutable-content": 1 } : {}),
          },
        },
      },
    });

    success += response.successCount;
    failure += response.failureCount;

    response.responses.forEach((item, index: number) => {
      if (item.success) return;
      const code = String(item.error?.code || "");
      if (INVALID_TOKEN_CODES.has(code)) {
        invalidTokens.push(batch[index]);
      }
    });
  }

  return {
    requested: tokens.length,
    success,
    failure,
    invalidTokens: Array.from(new Set(invalidTokens)),
  };
}
