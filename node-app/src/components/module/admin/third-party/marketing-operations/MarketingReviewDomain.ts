import { THREADS_POST_MEDIA_MAX_COUNT } from "consts/thirdparty/threads";
import type { UnknownRecord } from "utils/common/typeUtils";
import {
  REVIEW_FILTER_ALL_VALUE,
  REVIEW_STATUS_FILTER,
} from "./MarketingOpsConstants";
import type { ChannelEditorState, MarketingChannelSummary, MarketingUploadedImageAsset } from "./MarketingOpsTypes";
import {
  buildNaverBlogFormatContent,
  getChannelStepStatus,
  marketingMarkdownToNaverHtml,
  type NaverBlogCtaMode,
  toHashTagArray,
  toImageUrlValues,
  toSafeString,
  toSingleSelectValue,
  toTextArray,
} from "./MarketingOpsUtils";

export type ReviewJobFilters = {
  statusGroup: string;
  dateFrom: string;
  dateTo: string;
  priority: string;
  channel: string;
};

export type PublishScheduleState = {
  mode: "now" | "scheduled";
  publishAt: string;
  publishHour: string;
};

export type MarketingUploadResponse = {
  success?: boolean;
  data?: {
    asset?: MarketingUploadedImageAsset;
  };
};

export type MarketingUploadedImageListResponse = {
  success?: boolean;
  data?: {
    items?: MarketingUploadedImageAsset[];
    nextCursor?: string | null;
  };
};

export const MARKETING_CHANNEL_IMAGE_LIMITS: Record<string, number> = {
  instagram: 10,
  linkedin: 9,
  naver_blog: 10,
  threads: THREADS_POST_MEDIA_MAX_COUNT,
};

export const INITIAL_REVIEW_JOB_FILTERS: ReviewJobFilters = {
  statusGroup: "",
  dateFrom: "",
  dateTo: "",
  priority: "",
  channel: "",
};

export const REVIEW_JOB_STATUS_FILTER_OPTIONS = [
  {
    value: "",
    label: { ko: "전체 상태", en: "All statuses" },
    status: REVIEW_STATUS_FILTER,
    includeArchived: false,
  },
  {
    value: "pending",
    label: { ko: "발행 대기", en: "Pending publish" },
    status: "queued,ready,running,waiting_review,approved,partial,failed",
    includeArchived: false,
  },
  {
    value: "completed",
    label: { ko: "완료(숨김 포함)", en: "Completed incl. hidden" },
    status: "success",
    includeArchived: true,
  },
  {
    value: "canceled",
    label: { ko: "취소(숨김 포함)", en: "Canceled incl. hidden" },
    status: "canceled",
    includeArchived: true,
  },
] as const;

export const DEFAULT_PUBLISH_SCHEDULE_STATE: PublishScheduleState = {
  mode: "scheduled", // 즉시 발행 설정시 'now'로 변경
  publishAt: "",
  publishHour: "",
};

export const PUBLISH_SCHEDULE_MODE_OPTIONS = [
  { value: "now", label: { ko: "즉시", en: "Now" } },
  { value: "scheduled", label: { ko: "예약", en: "Schedule" } },
] satisfies { value: PublishScheduleState["mode"]; label: { ko: string; en: string } }[];

export const PUBLISH_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
export const REVIEW_CHANNEL_ACTION_BUTTON_CLASS = "min-h-11 w-full sm:min-h-0 sm:w-auto";

// 신규 네이버 블로그 전략: 동일 도메인 외부 링크는 2~3글당 1회만 허용 → 기본값은 링크 없는 유도 문구
export const NAVER_CTA_MODE_OPTIONS = [
  { value: "text", label: { ko: "문구만", en: "Text only" } },
  { value: "link", label: { ko: "링크 포함", en: "With link" } },
  { value: "none", label: { ko: "없음", en: "None" } },
] satisfies { value: NaverBlogCtaMode; label: { ko: string; en: string } }[];

export function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toReviewDateBoundary(value: string, boundary: "start" | "end") {
  const safeValue = toSafeString(value);
  if (!safeValue) return "";
  return `${safeValue}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}`;
}

export function fromReviewFilterSelectValue(value: string | string[]) {
  const next = toSingleSelectValue(value);
  return next === REVIEW_FILTER_ALL_VALUE ? "" : next;
}

export function getReviewJobStatusFilter(value: string) {
  return (
    REVIEW_JOB_STATUS_FILTER_OPTIONS.find((option) => option.value === toSafeString(value)) ||
    REVIEW_JOB_STATUS_FILTER_OPTIONS[0]
  );
}

export function getChannelScheduledPublishAt(channel: MarketingChannelSummary) {
  const step = channel.channel === "linkedin" || channel.channel === "naver_blog" ? channel.reviewStep : channel.publishStep;
  const meta = (step?.meta || {}) as UnknownRecord;
  return toSafeString(meta.scheduledPublishAt);
}

export function getChannelImageLimit(channel: string) {
  return MARKETING_CHANNEL_IMAGE_LIMITS[toSafeString(channel)] || 1;
}

export function limitChannelImageUrls(channel: string, urls: string[]) {
  return Array.from(new Set(urls.map(toSafeString).filter(Boolean))).slice(0, getChannelImageLimit(channel));
}

export function getEditorImageUrls(editor: ChannelEditorState) {
  const urls = toImageUrlValues(editor.imageUrls, editor.imageUrl);
  return urls.length ? urls : toImageUrlValues(editor.imageUrl);
}

export function buildChannelDraftPayload(args: {
  channel: string;
  editor: ChannelEditorState;
  imageUrls: string[];
  siteUrl: string;
  sourceTitle: string;
}) {
  const { channel, editor, imageUrls } = args;
  if (channel === "threads") {
    return {
      title: editor.title,
      text: editor.body,
      body: editor.body,
      cta: editor.commentLink ? editor.cta : "",
      linkUrl: editor.commentLink,
      imageUrl: imageUrls[0] || "",
      imageUrls,
      hashtags: toHashTagArray(editor.hashtags),
    };
  }
  if (channel === "instagram") {
    return {
      title: editor.title,
      caption: editor.body,
      body: editor.body,
      cta: editor.commentLink ? editor.cta : "",
      imageUrl: imageUrls[0] || "",
      imageUrls,
      linkUrl: editor.commentLink,
      hashtags: toTextArray(editor.hashtags),
    };
  }
  if (channel === "linkedin") {
    return {
      title: editor.title,
      headline: editor.headline,
      text: editor.body,
      body: editor.body,
      summary: editor.summary,
      imageUrl: imageUrls[0] || "",
      imageUrls,
      hashtags: toTextArray(editor.hashtags),
      cta: editor.cta,
      commentLink: editor.commentLink,
    };
  }
  return {
    title: editor.title,
    summary: editor.summary,
    body: editor.body,
    html: marketingMarkdownToNaverHtml(
      buildNaverBlogFormatContent(
        editor.summary,
        editor.body,
        editor.tags,
        args.siteUrl,
        args.sourceTitle,
        editor.commentLink,
      ),
    ),
    plainText: editor.body,
    imageUrl: imageUrls[0] || "",
    imageUrls,
    cta: editor.cta,
    linkUrl: editor.commentLink,
    tags: toHashTagArray(editor.tags),
  };
}

export function getChannelPreviewUrls(channel?: MarketingChannelSummary | null) {
  return toImageUrlValues((channel?.imagePreviews || []).map((image) => image.url));
}

export function mergeChannelImageUrls(channel: string, currentUrls: string[], incomingUrls: string[]) {
  return limitChannelImageUrls(channel, [...currentUrls, ...incomingUrls]);
}

export const REVIEW_CHANNEL_COLLAPSED_STATUSES = new Set(["approved", "success", "published", "skipped"]);

export function isReviewChannelCollapsedByStatus(channel: MarketingChannelSummary) {
  const stepStatus = getChannelStepStatus(channel);
  const publishStatus = toSafeString(channel.latestPublishLog?.status);
  return REVIEW_CHANNEL_COLLAPSED_STATUSES.has(stepStatus) || REVIEW_CHANNEL_COLLAPSED_STATUSES.has(publishStatus);
}

export function getDefaultOpenReviewChannels(channels?: MarketingChannelSummary[]) {
  return (channels || [])
    .filter((channel) => !isReviewChannelCollapsedByStatus(channel))
    .map((channel) => toSafeString(channel.channel))
    .filter(Boolean);
}
