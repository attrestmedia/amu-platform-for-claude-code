import type { MarketingChannel, MarketingJobPriority } from "consts/marketing/queue";

export const MARKETING_QUEUE_CATEGORY_DEFAULT = "general";
export const MARKETING_QUEUE_CATEGORY_BATCH_SIZE_DEFAULT = 1;
export const MARKETING_QUEUE_CATEGORY_BATCH_SIZE_MAX = 50;

const MARKETING_PRIORITY_SET = new Set<string>(["low", "normal", "high", "urgent"]);
const MARKETING_CHANNEL_SET = new Set<string>([
  "threads",
  "instagram",
  "linkedin",
  "naver_blog",
  "naver_ads",
  "google_ads",
  "slack",
  "email",
]);

export function normalizeMarketingQueueCategory(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 120);

  return normalized || MARKETING_QUEUE_CATEGORY_DEFAULT;
}

export function normalizeMarketingQueueBatchSize(value: unknown, fallback = MARKETING_QUEUE_CATEGORY_BATCH_SIZE_DEFAULT) {
  const next = Number(value || fallback);
  return Math.max(
    1,
    Math.min(MARKETING_QUEUE_CATEGORY_BATCH_SIZE_MAX, Number.isFinite(next) ? Math.floor(next) : fallback),
  );
}

export function normalizeMarketingQueuePriority(value: unknown, fallback: MarketingJobPriority = "normal") {
  const next = String(value || "").trim();
  return (MARKETING_PRIORITY_SET.has(next) ? next : fallback) as MarketingJobPriority;
}

export function normalizeMarketingQueueChannels(values: unknown, fallback: MarketingChannel[] = ["naver_blog"]) {
  const rawValues = Array.isArray(values) ? values : String(values || "").split(",");
  const channels = Array.from(
    new Set(
      rawValues
        .map((value) => String(value || "").trim())
        .filter((value) => MARKETING_CHANNEL_SET.has(value)),
    ),
  ) as MarketingChannel[];

  return channels.length > 0 ? channels : fallback;
}
