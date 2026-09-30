import { lang } from "components/module/i18n";
import { WP_HOME_URL } from "consts/env/public";
import { siteDomain } from "consts/env/runtime";
import { buildImageProxyUrl, decodeHtmlEntities, stripHtml } from "utils/common";
import { MARKETING_DEFAULT_CONTENT_CHANNELS } from "consts/marketing/queue";
import { normalizeMarketingTextSymbols } from "libs/marketing/format/textSymbols";
import { toErrorLike, toUnknownRecord } from "utils/common/typeUtils";
import { toast } from "sonner";
import {
  ARCHIVABLE_JOB_STATUS,
  CANCELABLE_JOB_STATUS,
  INITIAL_QUEUE_CATEGORY_COMPOSER,
  MARKETING_CONTENT_CHANNEL_OPTIONS,
  MARKETING_QUEUE_ENQUEUE_BATCH_MAX,
  MARKETING_SOCIAL_CONTENT_TEMPLATE_KEY,
  TEMPLATE_KEY_NONE,
  type MarketingContentChannelValue,
} from "./MarketingOpsConstants";
import type {
  ChannelEditorState,
  MarketingChannelAsset,
  MarketingChannelAssetContent,
  MarketingChannelSummary,
  MarketingCredentialStatusMap,
  MarketingJobDetail,
  MarketingJobListItem,
  MarketingQueueCategoryConfig,
  MarketingTemplateOption,
  QueueCategoryComposerState,
} from "./MarketingOpsTypes";

const LINKEDIN_FEED_URL = "https://www.linkedin.com/feed/";
const NAVER_BLOG_HOME_URL = "https://blog.naver.com/MyBlog.naver";
const THREADS_HOME_URL = "https://www.threads.com/";
const INSTAGRAM_HOME_URL = "https://www.instagram.com/";
const AMU_PUBLIC_SITE_URL = "https://allmyuniverse.com";
const AMU_APP_SITE_FALLBACK_DOMAIN = "app.allmyuniverse.com";
const NAVER_TEXT_PARAGRAPH_CLASS = "se-text-paragraph se-text-paragraph-align-left";
const NAVER_TEXT_LINK_SPAN_CLASS = "se-ff-nanumgothic se-fs15 se-link __se-node";
const NAVER_TEXT_SPAN_CLASS = "se-ff-nanumgothic se-fs15 __se-node";
const NAVER_BODY_TEXT_SPAN_CLASS = "se-ff-nanumgothic se-fs16 __se-node";
const MARKETING_CTA_COPY = {
  detail: { prefix: "더 자세한 내용은 ", suffix: "에서 확인하세요." },
  site: { prefix: "더 많은 콘텐츠를 ", suffix: "에서 만나보세요." },
} as const;

type MarketingCtaKind = keyof typeof MARKETING_CTA_COPY;

function buildMarketingCtaMessage(kind: MarketingCtaKind, reference: string) {
  const safeReference = toSafeString(reference);
  if (!safeReference) return "";

  const copy = MARKETING_CTA_COPY[kind];
  return `${copy.prefix}${safeReference}${copy.suffix}`;
}

export function toSafeString(value: unknown) {
  return String(value || "").trim();
}

export function toTextArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => toSafeString(item)).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getSelectedContentChannels(value: unknown) {
  const allowedChannels = new Set<string>(MARKETING_CONTENT_CHANNEL_OPTIONS.map((item) => item.value));
  const channels = toTextArray(value).filter((channel): channel is MarketingContentChannelValue =>
    allowedChannels.has(channel),
  );
  return channels.length > 0 ? channels : [...MARKETING_DEFAULT_CONTENT_CHANNELS];
}

export function joinTags(value: unknown) {
  return toTextArray(value).join(", ");
}

export function toHashTagArray(value: unknown) {
  return toTextArray(value)
    .map((item) => {
      const tag = toSafeString(item).replace(/^#+/, "");
      return tag ? `#${tag}` : "";
    })
    .filter(Boolean);
}

export function joinHashTags(value: unknown) {
  return toHashTagArray(value).join(", ");
}

export function toLineValues(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toUrlValues(value: string) {
  return toLineValues(value).filter((item) => /^https?:\/\//i.test(item));
}

function getMarketingAppOrigin() {
  try {
    const domain = toSafeString(siteDomain())
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
    return `https://${domain || AMU_APP_SITE_FALLBACK_DOMAIN}`;
  } catch {
    return `https://${AMU_APP_SITE_FALLBACK_DOMAIN}`;
  }
}

function getMarketingWpOrigin() {
  try {
    return new URL(WP_HOME_URL).origin;
  } catch {
    return AMU_PUBLIC_SITE_URL;
  }
}

function isWpResourcePath(pathname: string) {
  return /^\/wp-resource(?:\/|$)/i.test(pathname);
}

function toAbsoluteMarketingImageUrl(value: unknown) {
  const raw = toSafeString(value);
  if (!raw) return "";

  try {
    const parsed = new URL(raw, getMarketingWpOrigin());
    if (isWpResourcePath(parsed.pathname)) {
      const origin = getMarketingWpOrigin();
      return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Preserve the existing value handling for non-URL input.
  }

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw.startsWith("/") ? `${getMarketingAppOrigin()}${raw}` : raw;
}

function toImageUrlCandidateValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => toImageUrlCandidateValues(item));
  }

  if (typeof value === "object" && value !== null) {
    return [(value as { url?: unknown }).url, (value as { imageUrl?: unknown }).imageUrl]
      .map(toSafeString)
      .filter(Boolean);
  }

  return toSafeString(value)
    .split(/[\r\n,]+/)
    .map(toSafeString)
    .filter(Boolean);
}

export function toImageUrlValues(value: unknown, fallback?: unknown) {
  return Array.from(
    new Set(
      [...toImageUrlCandidateValues(value), ...toImageUrlCandidateValues(fallback)]
        .map(toAbsoluteMarketingImageUrl)
        .filter(Boolean),
    ),
  );
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(toSafeString(value));
}

function isLinkedInUrl(value: string) {
  try {
    const url = new URL(toSafeString(value));
    return url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

function isNaverBlogPostUrl(value: string) {
  try {
    const url = new URL(toSafeString(value));
    const host = url.hostname.toLowerCase();
    if (host !== "blog.naver.com" && host !== "m.blog.naver.com") return false;

    const pathSegments = url.pathname.split("/").map(toSafeString).filter(Boolean);
    if (pathSegments.length >= 2) return true;

    return Boolean(url.searchParams.get("blogId") && url.searchParams.get("logNo"));
  } catch {
    return false;
  }
}

function getNaverBlogSourcePostUrl(job?: MarketingJobListItem | null) {
  const sourceRef = toUnknownRecord(job?.sourceRef);
  const sourceSnapshot = toUnknownRecord(sourceRef.sourceSnapshot);
  const candidates = [
    sourceSnapshot.url,
    sourceRef.url,
    sourceRef.sourceUrl,
    sourceSnapshot.canonicalUrl,
    sourceRef.canonicalUrl,
  ]
    .map((value) => toSafeString(value))
    .filter(Boolean);

  return candidates.find(isNaverBlogPostUrl) || "";
}

export function toBatchSize(value: string, fallback = 5) {
  const next = Number(value || fallback);
  return Math.max(1, Math.min(MARKETING_QUEUE_ENQUEUE_BATCH_MAX, Number.isFinite(next) ? Math.floor(next) : fallback));
}

export function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  const safeSize = Math.max(1, Math.min(MARKETING_QUEUE_ENQUEUE_BATCH_MAX, Math.floor(Number(size || 1))));
  for (let index = 0; index < values.length; index += safeSize) {
    chunks.push(values.slice(index, index + safeSize));
  }
  return chunks;
}

export function getTemplateLabel(item: MarketingTemplateOption) {
  const key = toSafeString(item.key);
  const title = toSafeString(item.title);
  return title && title !== key ? `${title} (${key})` : key;
}

export function getTemplatePreviewText(item?: MarketingTemplateOption | null) {
  if (!item) return "";
  return [
    toSafeString(item.templateText),
    toSafeString(item.sceneTemplate) ? `\n--- sceneTemplate ---\n${toSafeString(item.sceneTemplate)}` : "",
    toSafeString(item.usageTip) ? `\n--- usageTip ---\n${toSafeString(item.usageTip)}` : "",
    item.defaultParams ? `\n--- defaultParams ---\n${JSON.stringify(item.defaultParams, null, 2)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function toSingleSelectValue(value: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value;
}

export function fromOptionalSelectValue(value: string | string[]) {
  const next = toSingleSelectValue(value);
  return next === TEMPLATE_KEY_NONE ? "" : next;
}

export function getCategoryPolicyLabel(item: MarketingQueueCategoryConfig) {
  const category = toSafeString(item.queueCategory);
  const label = toSafeString(item.label);
  const batchSize = Number(item.defaultBatchSize || 1);
  const channels = getSelectedContentChannels(item.allowedChannels).map(getChannelLabel).join(", ");
  return `${label || category} (${category} / ${batchSize} / ${channels})`;
}

export function getQueueCategoryComposerFromConfig(
  item?: MarketingQueueCategoryConfig | null,
): QueueCategoryComposerState {
  if (!item) return INITIAL_QUEUE_CATEGORY_COMPOSER;
  return {
    queueCategory: toSafeString(item.queueCategory) || "general",
    label: toSafeString(item.label),
    defaultBatchSize: String(Math.max(1, Math.min(50, Number(item.defaultBatchSize || 1)))),
    defaultPriority: toSafeString(item.defaultPriority) || "normal",
    defaultContentTemplateKey: toSafeString(item.defaultContentTemplateKey) || MARKETING_SOCIAL_CONTENT_TEMPLATE_KEY,
    defaultImageTemplateKey: toSafeString(item.defaultImageTemplateKey),
    defaultReviewMode: toSafeString(item.defaultReviewMode) || "review_required",
    enabled: item.enabled !== false,
  };
}

export function formatDate(value?: string) {
  if (!value) return "-";

  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return "-";

  return next.toLocaleString("ko-KR");
}

export function getChannelLabel(channel: string) {
  if (channel === "threads") return "Threads";
  if (channel === "instagram") return "Instagram";
  if (channel === "linkedin") return "LinkedIn";
  if (channel === "naver_blog") return "Naver";
  return channel;
}

const UPLOAD_TOPIC_CLASS_LABELS: Record<string, { ko: string; en: string }> = {
  b2b_professional: { ko: "B2B·실무", en: "B2B / professional" },
  tech_dev: { ko: "기술·개발", en: "Tech / dev" },
  howto_guide: { ko: "하우투·가이드", en: "How-to / guide" },
  commerce_promo: { ko: "커머스·프로모션", en: "Commerce / promo" },
  trend_news: { ko: "트렌드·뉴스", en: "Trend / news" },
  lifestyle: { ko: "라이프스타일", en: "Lifestyle" },
  general: { ko: "일반", en: "General" },
};

/** 추천 시간대가 어떤 근거로 정해졌는지 설명한다(고정 배정이므로 사후에 바뀌지 않는다). */
export function getUploadHourSourceLabel(source?: string, topicClass?: string) {
  const topic = lang(UPLOAD_TOPIC_CLASS_LABELS[toSafeString(topicClass) || "general"] || UPLOAD_TOPIC_CLASS_LABELS.general);
  if (source === "topic_performance") {
    return lang({ ko: `${topic} 주제의 실측 성과 기준`, en: `Based on measured performance for ${topic}` });
  }
  if (source === "channel_performance") {
    return lang({ ko: `채널 실측 성과 기준 (주제: ${topic})`, en: `Based on measured channel performance (topic: ${topic})` });
  }
  return lang({ ko: `${topic} 채널 벤치마크 기준 (실측 표본 부족)`, en: `Based on ${topic} channel benchmark (insufficient samples)` });
}

function toUrlPathSegment(value: unknown) {
  return toSafeString(value)
    .replace(/^@+/, "")
    .replace(/^\/+|\/+$/g, "");
}

function getCredentialExtraValue(
  credentialStatus: MarketingCredentialStatusMap | undefined,
  provider: string,
  key: string,
) {
  return toSafeString(toUnknownRecord(credentialStatus?.[provider]?.extras)[key]);
}

function getLinkedInPlatformUrl(credentialStatus?: MarketingCredentialStatusMap) {
  const profileSlug = toUrlPathSegment(getCredentialExtraValue(credentialStatus, "linkedin", "profileSlug"));
  if (profileSlug) return `https://www.linkedin.com/in/${encodeURIComponent(profileSlug)}/`;

  const companySlug = toUrlPathSegment(getCredentialExtraValue(credentialStatus, "linkedin", "companySlug"));
  if (companySlug) return `https://www.linkedin.com/company/${encodeURIComponent(companySlug)}/`;

  return LINKEDIN_FEED_URL;
}

export function getChannelPlatformUrl(
  channel: string,
  job?: MarketingJobListItem | null,
  credentialStatus?: MarketingCredentialStatusMap,
) {
  const safeChannel = toSafeString(channel);

  if (safeChannel === "threads") {
    const username = toUrlPathSegment(getCredentialExtraValue(credentialStatus, "threads", "username"));
    return username ? `https://www.threads.com/@${encodeURIComponent(username)}` : THREADS_HOME_URL;
  }

  if (safeChannel === "instagram") {
    const username = toUrlPathSegment(getCredentialExtraValue(credentialStatus, "instagram", "username"));
    return username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : INSTAGRAM_HOME_URL;
  }

  if (safeChannel === "linkedin") return getLinkedInPlatformUrl(credentialStatus);

  if (safeChannel === "naver_blog") {
    const blogId = toUrlPathSegment(getCredentialExtraValue(credentialStatus, "naver_blog", "blogId"));
    return blogId
      ? `https://blog.naver.com/${encodeURIComponent(blogId)}`
      : getNaverBlogSourcePostUrl(job) || NAVER_BLOG_HOME_URL;
  }

  return "";
}

export function getStatusLabel(status: string, channel?: string) {
  const safeStatus = toSafeString(status);
  const safeChannel = toSafeString(channel);

  if (safeStatus === "waiting_review") return lang({ ko: "검토 대기", en: "Waiting review" });
  if (safeStatus === "partial") return lang({ ko: "부분 완료", en: "Partial" });
  if (safeStatus === "failed") return lang({ ko: "실패", en: "Failed" });
  if (safeStatus === "success") return lang({ ko: "완료", en: "Success" });
  if (safeStatus === "queued") return lang({ ko: "대기열", en: "Queued" });
  if (safeStatus === "running") return lang({ ko: "진행 중", en: "Running" });
  if (safeStatus === "approved") return lang({ ko: "승인됨", en: "Approved" });
  if (safeStatus === "canceled") return lang({ ko: "취소됨", en: "Canceled" });
  if (safeStatus === "validated") return lang({ ko: "검증 완료", en: "Validated" });
  if (safeStatus === "published") {
    // 네이버 블로그는 운영자가 채널에서 직접 예약을 걸어야 하므로 "발행 완료"가 아닌 "예약 발행 완료"로 표기한다.
    return safeChannel === "naver_blog"
      ? lang({ ko: "예약 발행 완료", en: "Scheduled publish complete" })
      : lang({ ko: "발행 완료", en: "Published" });
  }
  if (safeStatus === "skipped") return lang({ ko: "건너뜀", en: "Skipped" });

  return safeStatus || "-";
}

export function getMarketingStepLabel(stepKey: string) {
  const safeStepKey = toSafeString(stepKey).toLowerCase();

  if (safeStepKey === "normalize_target") return lang({ ko: "콘텐츠 준비", en: "Preparing content" });
  if (safeStepKey === "load_wp_content") return lang({ ko: "원문 불러오기", en: "Loading source" });
  if (safeStepKey === "generate_channel_copy") return lang({ ko: "채널 콘텐츠 생성", en: "Generating channel content" });
  if (safeStepKey === "validate_output") return lang({ ko: "콘텐츠 검증", en: "Validating content" });
  if (safeStepKey === "publish_threads") return lang({ ko: "Threads 발행 준비", en: "Preparing Threads publish" });
  if (safeStepKey === "publish_instagram") return lang({ ko: "Instagram 발행 준비", en: "Preparing Instagram publish" });
  if (safeStepKey === "prepare_linkedin_draft") return lang({ ko: "LinkedIn 발행 준비", en: "Preparing LinkedIn publish" });
  if (safeStepKey === "prepare_naver_draft") return lang({ ko: "Naver Blog 발행 준비", en: "Preparing Naver Blog publish" });

  return safeStepKey ? lang({ ko: "콘텐츠 처리 중", en: "Processing content" }) : "-";
}

function getKnownMarketingValidationIssueLabel(issue: unknown) {
  const safeIssue = toSafeString(issue).toLowerCase();
  const [issueCode, issueDetail] = safeIssue.split(":", 2);

  if (issueCode === "topic_hard_gate_failed") {
    return lang({
      ko: "콘텐츠 주제가 현재 발행 기준을 충족하지 못했습니다. 주제나 내용을 수정한 뒤 다시 검사해주세요.",
      en: "The topic does not meet the publishing criteria. Update the topic or content, then check again.",
    });
  }
  if (issueCode === "blocking_issue_code") {
    return lang({
      ko: "발행을 막는 검수 항목이 발견되었습니다. 내용을 수정한 뒤 다시 검사해주세요.",
      en: "A blocking review issue was found. Update the content, then check again.",
    });
  }
  if (issueCode === "strategy_not_fit_excluded") {
    return lang({
      ko: "채널 운영 전략과 맞지 않아 발행 대상에서 제외되었습니다.",
      en: "This content was excluded because it does not fit the channel strategy.",
    });
  }
  if (issueCode === "independent_proofread_required") {
    return lang({ ko: "발행 전에 AI 오탈자 검수를 완료해주세요.", en: "Complete the AI proofreading before publishing." });
  }
  if (issueCode === "source_coverage_required") {
    return lang({ ko: "원문에서 활용한 근거 정보를 확인해주세요.", en: "Review the source evidence used in the content." });
  }
  if (issueCode === "source_evidence_trace_required") {
    return lang({ ko: "작성 내용과 원문 근거의 연결 정보를 확인해주세요.", en: "Review how the content is linked to its source evidence." });
  }
  if (issueCode === "source_terms_not_reported") {
    return lang({ ko: "원문의 핵심 용어가 콘텐츠에 충분히 반영되었는지 확인해주세요.", en: "Check whether the source's key terms are reflected in the content." });
  }
  if (issueCode === "unsupported_claims_present") {
    return lang({ ko: "원문에서 확인되지 않는 표현이 포함되어 있습니다.", en: "The content includes claims that are not supported by the source." });
  }
  if (issueCode.endsWith("_title_required")) {
    return lang({ ko: "제목을 입력해주세요.", en: "Add a title." });
  }
  if (issueCode.endsWith("_text_required") || issueCode.endsWith("_body_required")) {
    return lang({ ko: "본문을 입력해주세요.", en: "Add the main content." });
  }
  if (issueCode === "instagram_caption_required") {
    return lang({ ko: "Instagram 설명을 입력해주세요.", en: "Add an Instagram caption." });
  }
  if (issueCode === "instagram_caption_too_long") {
    return lang({
      ko: `Instagram 설명을 ${issueDetail || "2,200"}자 이하로 줄여주세요.`,
      en: `Shorten the Instagram caption to ${issueDetail || "2,200"} characters or fewer.`,
    });
  }
  if (issueCode.endsWith("_image_url_required")) {
    return lang({ ko: "발행할 이미지를 선택해주세요.", en: "Select an image to publish." });
  }
  if (issueCode.endsWith("_headline_required")) {
    return lang({ ko: "헤드라인을 입력해주세요.", en: "Add a headline." });
  }
  if (issueCode.endsWith("_summary_required")) {
    return lang({ ko: "요약을 입력해주세요.", en: "Add a summary." });
  }
  if (issueCode.endsWith("_html_required")) {
    return lang({ ko: "발행용 본문 형식을 다시 생성해주세요.", en: "Regenerate the publish-ready content format." });
  }
  if (issueCode.endsWith("_comment_link_required") || issueCode.endsWith("_link_url_missing")) {
    return lang({ ko: "연결할 링크를 확인해주세요.", en: "Check the link for this content." });
  }
  if (issueCode.endsWith("_hashtags_missing") || issueCode.endsWith("_tags_missing")) {
    return lang({ ko: "검색과 노출에 사용할 태그를 추가해주세요.", en: "Add tags to improve discovery." });
  }
  if (issueCode.endsWith("_cta_missing")) {
    return lang({ ko: "사용자 행동을 안내하는 문구를 추가해주세요.", en: "Add a clear call to action." });
  }
  if (issueCode === "threads_text_will_publish_as_thread") {
    return lang({
      ko: "Threads 본문이 길어 여러 게시물로 나뉘어 발행됩니다.",
      en: "The Threads content is long and will be published as multiple posts.",
    });
  }

  return "";
}

export function getMarketingValidationIssueLabel(issue: unknown) {
  return (
    getKnownMarketingValidationIssueLabel(issue) ||
    lang({
      ko: "콘텐츠 검증에서 보완이 필요한 항목이 있습니다. 내용을 확인한 뒤 다시 검사해주세요.",
      en: "Content validation found an item that needs attention. Review the content, then check again.",
    })
  );
}

/**
 * 상태 배지(면 + 텍스트). 면 위 텍스트 대비 4.5:1 이상을 만족하는 조합만 사용한다.
 *
 * 조합 규칙 — marketing-oops 테마와 base 테마 양쪽에서 렌더되므로 두 테마 모두를 기준으로 고른다.
 *  - 완료/발행 : accent 면 + --accent-text 잉크. accent는 "면 전용" 토큰이라 흰 글자를 올리면
 *                marketing-oops 라임(#c9ec2d)에서 1.35:1로 사실상 읽히지 않는다(13.32:1로 교정).
 *  - 승인/검증 : primary 면 + button-text(8.49:1). secondary(코랄 #b8351f)는 danger(#c73e3a)와
 *                색상각이 7도 차이라 "승인"에 쓰면 실패로 읽히므로 상태 의미로 쓰지 않는다.
 *  - 대기/진행 : muted 면 + 잉크(10.10:1). muted-text는 muted 위에서 2.23:1이라 쓰지 않는다.
 *  - 보류/취소 : muted-foreground 면 + button-text(6.77:1). 기존 `bg-gray`는 대응 토큰이 없는
 *                죽은 클래스여서 면이 아예 칠해지지 않았다.
 *  - 실패      : destructive 면 + destructive-foreground(5.03:1).
 */
export function getStatusClass(status: string) {
  const safeStatus = toSafeString(status);

  if (["success", "published"].includes(safeStatus)) return "bg-accent text-accent-text";
  if (["waiting_review", "queued", "running"].includes(safeStatus)) return "bg-muted text-primary-text";
  if (["validated", "approved"].includes(safeStatus)) return "bg-primary text-button-text";
  if (["partial", "skipped"].includes(safeStatus) || safeStatus === "canceled")
    return "bg-muted-foreground text-button-text";
  if (["failed", "validation_failed"].includes(safeStatus)) return "bg-destructive text-destructive-foreground";
  return "bg-muted text-primary-text";
}

/**
 * 채널 상태 점(6px). 텍스트가 아니므로 카드 면(흰색) 대비 3:1을 기준으로 한다.
 *
 * 배지와 분리한 이유: 배지는 "면 위 글자 대비", 점은 "면 자체의 배경 대비"가 기준이라
 * 같은 클래스를 재사용하면 한쪽이 반드시 깨진다. 라임 accent(1.35:1)와 tan muted(1.79:1)처럼
 * 면만으로 3:1에 미달하는 색은 잉크 링으로 경계를 세운다(링 3.40:1).
 */
export function getStatusDotClass(status: string) {
  const safeStatus = toSafeString(status);

  if (["success", "published"].includes(safeStatus)) return "bg-accent ring-1 ring-primary-text/50";
  if (["waiting_review", "queued", "running"].includes(safeStatus)) return "bg-muted ring-1 ring-primary-text/50";
  if (["validated", "approved"].includes(safeStatus)) return "bg-primary";
  if (["partial", "skipped"].includes(safeStatus) || safeStatus === "canceled") return "bg-muted-foreground";
  if (["failed", "validation_failed"].includes(safeStatus)) return "bg-destructive";
  return "bg-muted ring-1 ring-primary-text/50";
}

const MARKETING_REVIEW_BLOCKING_CHANNEL_STATUSES = new Set([
  "queued",
  "running",
  "waiting_input",
  "waiting_review",
  "failed",
  "validation_failed",
]);
const MARKETING_REVIEW_RESOLVED_CHANNEL_STATUSES = new Set(["approved", "success", "published", "skipped"]);

export function getMarketingJobDisplayStatus(job: MarketingJobListItem) {
  const jobStatus = toSafeString(job.status);
  const channelStatuses = (job.channelStatuses || []).map((item) => toSafeString(item.status)).filter(Boolean);
  if (jobStatus !== "waiting_review" || channelStatuses.length === 0) return jobStatus;

  const hasBlockingChannel = channelStatuses.some((status) => MARKETING_REVIEW_BLOCKING_CHANNEL_STATUSES.has(status));
  const hasApprovedChannel = channelStatuses.some((status) => status === "approved");
  const allChannelsResolved = channelStatuses.every((status) => MARKETING_REVIEW_RESOLVED_CHANNEL_STATUSES.has(status));

  return !hasBlockingChannel && hasApprovedChannel && allChannelsResolved ? "approved" : jobStatus;
}

export function getChannelStepStatus(channel: MarketingChannelSummary) {
  if (channel.channel === "threads" || channel.channel === "instagram") {
    return toSafeString(channel.publishStep?.status || channel.validateStep?.status || channel.generateStep?.status);
  }

  return toSafeString(channel.reviewStep?.status || channel.validateStep?.status || channel.generateStep?.status);
}

function hasDraftDisplayFields(record: Record<string, unknown>) {
  return [
    "title",
    "headline",
    "summary",
    "body",
    "caption",
    "text",
    "plainText",
    "html",
    "linkUrl",
    "commentLink",
  ].some((key) => toSafeString(record[key]));
}

export function getMarketingDraftContent(asset?: MarketingChannelAsset | null): MarketingChannelAssetContent {
  const content = toUnknownRecord(asset?.content) as MarketingChannelAssetContent;
  const nestedCandidates = [
    content.draft,
    content.payload,
    content.data,
    content.result,
    toUnknownRecord(content.result).draft,
    toUnknownRecord(content.data).draft,
  ].map((item) => toUnknownRecord(item));
  const nested = nestedCandidates.find(hasDraftDisplayFields);

  return {
    ...content,
    ...(nested || {}),
  } as MarketingChannelAssetContent;
}

export function getInitialEditor(
  channel: MarketingChannelSummary,
  job?: MarketingJobListItem | null,
): ChannelEditorState {
  const draft = getMarketingDraftContent(channel.draftAsset);
  const htmlText = toSafeString(stripHtml(toSafeString(draft.html)));
  const draftImageUrls = toImageUrlValues(
    draft.imageUrls || draft.images,
    draft.imageUrl || draft.image_url || draft.thumbnailUrl || draft.thumbnail_url,
  );
  const sourceUrl = channel.channel === "naver_blog" ? getMarketingJobSourceUrl(job) : "";

  return {
    title: toSafeString(
      draft.title || (channel.channel === "threads" || channel.channel === "instagram" ? draft.headline : ""),
    ),
    headline: toSafeString(draft.headline || (channel.channel === "linkedin" ? draft.title : "")),
    summary: toSafeString(draft.summary || draft.description || draft.excerpt),
    body: toSafeString(draft.body || draft.caption || draft.text || draft.plainText || htmlText),
    imageUrl: draftImageUrls[0] || "",
    imageUrls: draftImageUrls.join("\n"),
    hashtags: channel.channel === "threads" ? joinHashTags(draft.hashtags) : joinTags(draft.hashtags),
    tags: channel.channel === "naver_blog" ? joinHashTags(draft.tags) : joinTags(draft.tags),
    cta: toSafeString(draft.cta),
    commentLink: toSafeString(draft.commentLink || draft.linkUrl || sourceUrl),
    publishedUrl:
      toSafeString(channel.receiptAsset?.content?.publishedUrl) ||
      toSafeString(channel.latestPublishLog?.targetRef?.externalUrl),
    note: "",
  };
}

export function buildEditorMap(detail: MarketingJobDetail | null) {
  return (detail?.channels || []).reduce<Record<string, ChannelEditorState>>((acc, channel) => {
    acc[channel.channel] = getInitialEditor(channel, detail?.job);
    return acc;
  }, {});
}

export function getExternalUrl(channel: MarketingChannelSummary, editor?: ChannelEditorState) {
  if (channel.channel === "threads") {
    return (
      toSafeString(channel.latestPublishLog?.targetRef?.finalUrl) ||
      toSafeString(channel.receiptAsset?.content?.request?.finalUrl) ||
      toSafeString(channel.receiptAsset?.content?.publishedUrl)
    );
  }

  if (channel.channel === "instagram") {
    return (
      toSafeString(channel.latestPublishLog?.targetRef?.finalUrl) ||
      toSafeString(channel.receiptAsset?.content?.request?.finalUrl) ||
      toSafeString(channel.receiptAsset?.content?.publishedUrl)
    );
  }

  if (channel.channel === "linkedin") {
    const linkedInUrl = [
      editor?.publishedUrl,
      channel.latestPublishLog?.targetRef?.externalUrl,
      channel.receiptAsset?.content?.publishedUrl,
      editor?.commentLink,
    ]
      .map((value) => toSafeString(value))
      .find(isLinkedInUrl);

    return linkedInUrl || LINKEDIN_FEED_URL;
  }

  return (
    toSafeString(editor?.publishedUrl) ||
    toSafeString(channel.latestPublishLog?.targetRef?.externalUrl) ||
    NAVER_BLOG_HOME_URL
  );
}

function getSourceSnapshot(job?: MarketingJobListItem | null) {
  return toUnknownRecord(job?.sourceRef?.sourceSnapshot);
}

export function getMarketingJobSourceLabel(job: MarketingJobListItem) {
  const sourceRef = toUnknownRecord(job.sourceRef);
  const sourceSnapshot = getSourceSnapshot(job);
  return decodeHtmlEntities(
    toSafeString(sourceSnapshot.title) ||
      toSafeString(sourceRef.title) ||
      toSafeString(sourceSnapshot.slug) ||
      toSafeString(sourceRef.slug) ||
      toSafeString(sourceRef.sourceId) ||
      toSafeString(sourceSnapshot.url) ||
      toSafeString(sourceRef.url) ||
      job.jobId,
  );
}

export function getMarketingJobSourceUrl(job?: MarketingJobListItem | null) {
  const sourceRef = toUnknownRecord(job?.sourceRef);
  const sourceSnapshot = getSourceSnapshot(job);
  return (
    toSafeString(sourceSnapshot.url) ||
    toSafeString(sourceSnapshot.canonicalUrl) ||
    toSafeString(sourceRef.url) ||
    toSafeString(sourceRef.sourceUrl) ||
    toSafeString(sourceRef.canonicalUrl)
  );
}

export function getMarketingJobStoreManagerUrl(job?: MarketingJobListItem | null) {
  const sourceSnapshot = getSourceSnapshot(job);
  const sourceRef = toUnknownRecord(job?.sourceRef);
  const value = toSafeString(sourceSnapshot.storeManagerUrl || sourceRef.storeManagerUrl);
  return value.startsWith("/store/") ? value : "";
}

export function getMarketingJobPerformanceUrl(job?: MarketingJobListItem | null) {
  const sourceSnapshot = getSourceSnapshot(job);
  if (toSafeString(sourceSnapshot.sourceKind) !== "commerce_product") return "";
  const universeId = toSafeString(sourceSnapshot.universeId || job?.universeId);
  const campaignId = toSafeString(sourceSnapshot.campaignId);
  if (!universeId || !campaignId) return "";
  return `/marketing-oops/workspace?universeId=${encodeURIComponent(universeId)}&tab=performance&campaignId=${encodeURIComponent(campaignId)}`;
}

export function getMarketingJobSourceKind(job?: MarketingJobListItem | null) {
  const sourceSnapshot = getSourceSnapshot(job);
  const sourceRef = toUnknownRecord(job?.sourceRef);
  return toSafeString(sourceSnapshot.sourceKind || sourceRef.sourceKind);
}

export function getMarketingJobSourceRevision(job?: MarketingJobListItem | null) {
  const sourceSnapshot = getSourceSnapshot(job);
  const revision = Number(sourceSnapshot.draftRevision);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
}

export function getMarketingJobSourceTitle(job: MarketingJobListItem) {
  const sourceRef = toUnknownRecord(job.sourceRef);
  const sourceSnapshot = getSourceSnapshot(job);
  return decodeHtmlEntities(
    toSafeString(sourceSnapshot.title) ||
      toSafeString(sourceRef.title) ||
      toSafeString(sourceSnapshot.slug) ||
      toSafeString(sourceRef.slug),
  );
}

export function getMarketingJobSourceSearchQuery(job: MarketingJobListItem) {
  const sourceRef = toUnknownRecord(job.sourceRef);
  const sourceSnapshot = getSourceSnapshot(job);
  return (
    toSafeString(sourceSnapshot.title) ||
    toSafeString(sourceSnapshot.slug) ||
    toSafeString(sourceRef.title) ||
    toSafeString(sourceRef.slug) ||
    getMarketingJobSourceLabel(job)
  );
}

export async function copyText(text: string, successMessage: string) {
  const safeText = normalizeMarketingTextSymbols(toSafeString(text));
  if (!safeText) {
    toast.error(lang({ ko: "복사할 내용이 없습니다.", en: "Nothing to copy." }));
    return;
  }

  await navigator.clipboard.writeText(safeText);
  toast.success(successMessage);
}

export async function copyHtml(html: string, successMessage: string) {
  const safeHtml = normalizeMarketingTextSymbols(toSafeString(html));
  if (!safeHtml) {
    toast.error(lang({ ko: "복사할 내용이 없습니다.", en: "Nothing to copy." }));
    return;
  }

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([safeHtml], { type: "text/html" }),
        "text/plain": new Blob([htmlToClipboardPlainText(safeHtml)], { type: "text/plain" }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(safeHtml);
  }
  toast.success(successMessage);
}

const MAX_CLIPBOARD_IMAGE_BYTES = 10 * 1024 * 1024;

async function convertImageBlobToPng(blob: Blob) {
  if (blob.type === "image/png") return blob;
  if (typeof createImageBitmap !== "function") {
    throw new Error("image_bitmap_unsupported");
  }

  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_context_unavailable");
    context.drawImage(bitmap, 0, 0);
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) throw new Error("image_png_conversion_failed");
    return pngBlob;
  } finally {
    bitmap.close();
  }
}

export async function copyImageToClipboard(url: string, label?: string) {
  const safeUrl = toSafeString(url);
  if (!safeUrl) {
    toast.error(lang({ ko: "복사할 이미지가 없습니다.", en: "No image to copy." }));
    return;
  }
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    toast.error(
      lang({
        ko: "이 브라우저는 이미지 클립보드 복사를 지원하지 않습니다.",
        en: "This browser does not support image clipboard copy.",
      }),
    );
    return;
  }

  try {
    const targetUrl = new URL(safeUrl, window.location.origin);
    const requestUrl =
      targetUrl.origin === window.location.origin ? targetUrl.toString() : buildImageProxyUrl(targetUrl.toString());
    const response = await fetch(requestUrl, {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`image_fetch_failed:${response.status}`);
    const sourceBlob = await response.blob();
    if (!sourceBlob.type.startsWith("image/")) throw new Error("clipboard_source_is_not_image");
    if (sourceBlob.size > MAX_CLIPBOARD_IMAGE_BYTES) throw new Error("clipboard_image_too_large");
    const pngBlob = await convertImageBlobToPng(sourceBlob);
    if (pngBlob.size > MAX_CLIPBOARD_IMAGE_BYTES) throw new Error("clipboard_image_too_large");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
    toast.success(
      lang({
        ko: `${toSafeString(label) || "이미지"} 사본을 클립보드에 복사했습니다. 네이버 본문 편집 위치에 붙여넣으세요.`,
        en: `${toSafeString(label) || "Image"} copied. Paste it at the desired Naver body position.`,
      }),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "image_copy_failed";
    toast.error(
      code === "clipboard_image_too_large"
        ? lang({
            ko: "이미지는 10MB 이하만 클립보드에 복사할 수 있습니다.",
            en: "Clipboard images must be 10MB or smaller.",
          })
        : lang({
            ko: "이미지 사본을 복사하지 못했습니다. 이미지 URL의 접근/CORS 설정을 확인해주세요.",
            en: "Could not copy the image. Check image URL access and CORS settings.",
          }),
    );
  }
}

export function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlToClipboardPlainText(html: string) {
  return stripHtml(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h[1-6]|li|div|ul|ol)>/gi, "\n"),
  )
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveMarketingMarkdownHref(rawHref: string) {
  const href = normalizeMarketingTextSymbols(rawHref).trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${AMU_PUBLIC_SITE_URL}${href}`;
  return href;
}

export function renderMarketingInlineHtml(raw: string, options?: { naver?: boolean }) {
  const escaped = escapeHtml(normalizeMarketingTextSymbols(raw));
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g, (_match, label: string, href: string) => {
      const safeHref = resolveMarketingMarkdownHref(href);
      if (options?.naver) {
        return `<span class="${NAVER_TEXT_LINK_SPAN_CLASS}"><a href="${safeHref}" class="se-link __se_link" data-linktype="text" target="_blank">${label}</a></span>`;
      }
      return `<a href="${safeHref}">${label}</a>`;
    });
}

type MarketingMarkdownRenderer = {
  divider: () => string;
  heading: (level: number, text: string) => string;
  image: (alt: string, src: string) => string;
  orderedList: (items: string[]) => string;
  paragraph: (lines: string[]) => string;
  quote: (lines: string[]) => string;
  table: (rows: string[][]) => string;
  unorderedList: (items: string[]) => string;
};

function readMarkdownImage(line: string) {
  const match = line.match(/^!\[([^\]]*)\]\((.+)\)$/);
  if (!match) return null;
  const alt = normalizeMarketingTextSymbols(match[1]).trim();
  const src = normalizeMarketingTextSymbols(match[2]).trim();
  const supportedDataUrl = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(src);
  const supportedUrl = /^(?:https?:\/\/|\/)[^\s]+$/i.test(src);
  return supportedDataUrl || supportedUrl ? { alt, src } : null;
}

type MarkdownTableReadResult = {
  nextIndex: number;
  rows: string[][];
};

function splitMarkdownTableRow(line: string) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) return null;

  const withoutLeadingPipe = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutBoundaryPipes = withoutLeadingPipe.endsWith("|") ? withoutLeadingPipe.slice(0, -1) : withoutLeadingPipe;
  const cells = withoutBoundaryPipes.split("|").map((cell) => cell.trim());

  return cells.length >= 2 ? cells : null;
}

function isMarkdownTableDivider(line: string) {
  const cells = splitMarkdownTableRow(line);
  return Boolean(cells?.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, ""))));
}

function normalizeMarkdownTableRow(row: string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => row[index] || "");
}

function readMarkdownTable(lines: string[], startIndex: number): MarkdownTableReadResult | null {
  const header = splitMarkdownTableRow(lines[startIndex]);
  if (!header || startIndex + 1 >= lines.length || !isMarkdownTableDivider(lines[startIndex + 1])) return null;

  const rows = [header];
  let nextIndex = startIndex + 2;

  while (nextIndex < lines.length) {
    const row = splitMarkdownTableRow(lines[nextIndex]);
    if (!row || isMarkdownTableDivider(lines[nextIndex])) break;
    rows.push(row);
    nextIndex += 1;
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  if (columnCount < 2) return null;

  return {
    nextIndex,
    rows: rows.map((row) => normalizeMarkdownTableRow(row, columnCount)),
  };
}

function renderMarketingMarkdownLines(lines: string[], renderer: MarketingMarkdownRenderer, joiner = "\n") {
  const output: string[] = [];
  const paragraphLines: string[] = [];
  let listType: "ordered" | "unordered" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    output.push(renderer.paragraph([...paragraphLines]));
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    output.push(listType === "ordered" ? renderer.orderedList([...listItems]) : renderer.unorderedList([...listItems]));
    listType = null;
    listItems = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line) continue;

    const image = readMarkdownImage(line);
    if (image) {
      flushParagraph();
      flushList();
      output.push(renderer.image(image.alt, image.src));
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      const quoteLines = [quote[1]];
      flushParagraph();
      flushList();
      while (index + 1 < lines.length) {
        const nextQuote = lines[index + 1].trim().match(/^>\s?(.+)$/);
        if (!nextQuote) break;
        quoteLines.push(nextQuote[1]);
        index += 1;
      }
      output.push(renderer.quote(quoteLines));
      continue;
    }

    const table = readMarkdownTable(lines, index);
    if (table) {
      flushParagraph();
      flushList();
      output.push(renderer.table(table.rows));
      index = table.nextIndex - 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      output.push(renderer.heading(Math.min(6, heading[1].length), heading[2]));
      continue;
    }

    if (/^-{3,}$/.test(line)) {
      flushParagraph();
      flushList();
      output.push(renderer.divider());
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType === "ordered") flushList();
      listType = "unordered";
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType === "unordered") flushList();
      listType = "ordered";
      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return output.join(joiner);
}

function renderMarketingMarkdown(content: string, renderer: MarketingMarkdownRenderer, joiner = "\n") {
  const blocks = String(content || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) return "";
      return renderMarketingMarkdownLines(lines, renderer, joiner);
    })
    .filter(Boolean)
    .join(joiner);
}

export function marketingMarkdownToHtml(content: string) {
  return renderMarketingMarkdown(content, {
    divider: () => "<hr />",
    heading: (level, text) => `<h${level}>${renderMarketingInlineHtml(text)}</h${level}>`,
    image: (alt, src) =>
      `<figure><img src="${escapeHtml(resolveMarketingMarkdownHref(src))}" alt="${escapeHtml(alt)}" /></figure>`,
    orderedList: (items) => `<ol>${items.map((item) => `<li>${renderMarketingInlineHtml(item)}</li>`).join("")}</ol>`,
    paragraph: (lines) => `<p>${lines.map((line) => renderMarketingInlineHtml(line)).join("<br />")}</p>`,
    quote: (lines) =>
      `<blockquote><p>${lines.map((line) => renderMarketingInlineHtml(line)).join("<br />")}</p></blockquote>`,
    table: (rows) =>
      `<table><tbody>${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderMarketingInlineHtml(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`,
    unorderedList: (items) => `<ul>${items.map((item) => `<li>${renderMarketingInlineHtml(item)}</li>`).join("")}</ul>`,
  });
}

function renderNaverParagraph(
  lines: string[],
  style = "font-size:16px;color:#000000;",
  spanClass = NAVER_BODY_TEXT_SPAN_CLASS,
) {
  return `<p class="${NAVER_TEXT_PARAGRAPH_CLASS}" style="line-height:1.8;"><span class="${spanClass}" style="${style}">${lines.map((line) => renderMarketingInlineHtml(line, { naver: true })).join("<br />")}</span></p>`;
}

function renderNaverSpacer() {
  return `<p class="${NAVER_TEXT_PARAGRAPH_CLASS}" style="line-height:1.8;"><span class="${NAVER_BODY_TEXT_SPAN_CLASS}" style="font-size:16px;color:#000000;">&ZeroWidthSpace;</span></p>`;
}

function renderNaverList(items: string[], tag: "ol" | "ul") {
  const listClass =
    tag === "ul" ? "se-text-list se-text-list-type-bullet-disc" : "se-text-list se-text-list-type-number";
  return `<${tag} class="${listClass}">${items
    .map((item) => `<li class="se-text-list-item">${renderNaverParagraph([item])}</li>`)
    .join("")}</${tag}>`;
}

function renderNaverTextComponent(content: string) {
  return `<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text">${content}</div></div></div></div>`;
}

function renderNaverImageComponent(alt: string, src: string) {
  const imageSrc = escapeHtml(resolveMarketingMarkdownHref(src));
  const imageAlt = escapeHtml(alt);
  return `<div class="se-component se-image se-l-default"><div class="se-component-content"><div class="se-section se-section-image se-l-default se-section-align-center"><div class="se-module se-module-image"><img src="${imageSrc}" alt="${imageAlt}" class="se-image-resource" /></div></div></div></div>`;
}

function renderNaverQuote(lines: string[]) {
  const paragraphId = createNaverSeId();
  const content = lines.map((line) => renderMarketingInlineHtml(line, { naver: true })).join("<br />");
  return `<div class="se-component se-quotation se-l-default"><div class="se-component-content"><div class="se-section se-section-quotation se-l-default"><blockquote class="se-quotation-container"><div class="se-module se-module-text se-quote"><p class="${NAVER_TEXT_PARAGRAPH_CLASS} " id="${paragraphId}"><span class="${NAVER_TEXT_LINK_SPAN_CLASS}">${content}</span></p></div></blockquote></div></div></div>`;
}

function renderNaverSummaryQuote(summary: string) {
  const content = renderMarketingInlineHtml(summary, { naver: true });
  if (!content) return "";

  return `<div class="se-component se-quotation se-l-quotation_bubble"><div class="se-component-content"><div class="se-section se-section-quotation se-l-quotation_bubble se-section-align-left"><div class="se-quotation-container"><div class="se-module se-module-text se-quote"><p class="se-text-paragraph se-text-paragraph-align-center" style="line-height:1.8;"><span class="se-ff-nanummyeongjo se-fs15 __se-node" style="color:#000000;"><b>${content}</b></span></p></div></div></div></div></div><br />`;
}

function renderNaverHorizontalLine() {
  return `<div class="se-component se-horizontalLine se-l-default"><div class="se-component-content"><div class="se-section se-section-horizontalLine se-l-default se-section-align-center"><div class="se-module se-module-horizontalLine"><span class="se-hr-invisible"></span><hr class="se-hr" /></div></div></div></div>`;
}

function renderNaverLinkedCta(kind: MarketingCtaKind, label: string, href: string) {
  const safeHref = escapeHtml(resolveMarketingMarkdownHref(href));
  if (!safeHref) return "";

  const safeLabel = escapeHtml(toSafeString(label) || href);
  const copy = MARKETING_CTA_COPY[kind];

  return renderNaverTextComponent(
    `<p class="se-text-paragraph se-text-paragraph-align-center" style="line-height:1.8;"><span class="${NAVER_TEXT_SPAN_CLASS}" style="color:#000000;">${copy.prefix}‘</span><span class="${NAVER_TEXT_LINK_SPAN_CLASS}" data-href="${safeHref}" style="color:#000000;"><a href="${safeHref}" class="se-link __se_link" data-linktype="text" target="_blank">${safeLabel}</a></span><span class="${NAVER_TEXT_SPAN_CLASS}" style="color:#000000;">’${copy.suffix}</span></p>`,
  );
}

export type NaverBlogCtaMode = "link" | "text" | "none";

function toNaverPlainSiteLabel(value: string) {
  const safeValue = toSafeString(value);
  if (!safeValue) return "";

  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(safeValue) ? safeValue : `https://${safeValue}`;
  try {
    return new URL(normalized).hostname.replace(/^www\./i, "");
  } catch {
    return safeValue
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0];
  }
}

function buildNaverTextOnlyCtaMessage(sourceTitle: string, sourceUrl: string, siteUrl: string) {
  const siteLabel = toNaverPlainSiteLabel(siteUrl) || toNaverPlainSiteLabel(sourceUrl);
  if (!siteLabel) return "";

  const safeTitle = decodeHtmlEntities(toSafeString(sourceTitle));
  return buildMarketingCtaMessage(
    safeTitle ? "detail" : "site",
    safeTitle ? `**${siteLabel}**의 ‘**${safeTitle}**’ 글` : `‘**${siteLabel}**’`,
  );
}

function renderNaverTextOnlyCta(message: string) {
  const safeMessage = renderMarketingInlineHtml(toSafeString(message), { naver: true });
  if (!safeMessage) return "";

  return renderNaverTextComponent(
    `<p class="se-text-paragraph se-text-paragraph-align-center" style="line-height:1.8;"><span class="${NAVER_TEXT_SPAN_CLASS}" style="color:#000000;">${safeMessage}</span></p>`,
  );
}

function renderNaverSpacerComponent() {
  return renderNaverTextComponent(renderNaverSpacer());
}

function createNaverSeId() {
  const randomId =
    globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `SE-${randomId}`;
}

function renderNaverTableCell(cell: string, width: string) {
  return `<td class="se-cell" colspan="1" rowspan="1" style="width: ${width}; height: 43.0px; "><div class="se-module se-module-text"><p class="${NAVER_TEXT_PARAGRAPH_CLASS} " style="" id="${createNaverSeId()}"><span style="font-size:16px;color:#000000;" class="${NAVER_BODY_TEXT_SPAN_CLASS}" id="${createNaverSeId()}">${renderMarketingInlineHtml(cell, { naver: true }) || "&nbsp;"}</span></p></div></td>`;
}

function renderNaverTable(rows: string[][]) {
  const columnCount = Math.max(...rows.map((row) => row.length), 0);
  if (columnCount <= 0) return "";

  const componentId = createNaverSeId();
  const columnCountText = String(columnCount);
  const moduleData = escapeHtml(
    JSON.stringify({ type: "v2_table", id: componentId, data: { columnCount: columnCountText } }),
  );
  const moduleDataV2 = escapeHtml(
    JSON.stringify({ type: "v2_table", id: componentId, data: { ctype: "table", columnCount: columnCountText } }),
  );
  const width = `${(100 / columnCount).toFixed(2)}%`;
  const tableRows = rows
    .map(
      (row) =>
        `<tr class="se-tr">${normalizeMarkdownTableRow(row, columnCount)
          .map((cell) => renderNaverTableCell(cell, width))
          .join("")}</tr>`,
    )
    .join("");

  return `<div class="se-section se-section-table se-l-table_layout1"><div class="se-component se-table se-l-default __se-component" id="${componentId}"><div class="se-component-content"><div class="se-section se-section-table se-l-default se-section-align-" style="width: 100.0%;"><div class="se-table-container"><table class="se-table-content" style=""><tbody>${tableRows}</tbody></table></div></div></div><script type="text/data" class="__se_module_data" data-module="${moduleData}" data-module-v2="${moduleDataV2}"></script></div></div>`;
}

function renderNaverMarkdownComponents(content: string) {
  const body = renderMarketingMarkdown(
    content,
    {
      divider: () => renderNaverTextComponent('<hr style="border:0;border-top:1px solid #e5e5e5;margin:28px 0;" />'),
      heading: (level, text) => {
        const fontSize = level <= 1 ? 28 : level === 2 ? 24 : level === 3 ? 20 : 17;
        return renderNaverTextComponent(
          renderNaverParagraph(
            [text],
            `font-size:${fontSize}px;color:#000000;font-weight:700;`,
            `se-ff-nanumgothic se-fs${fontSize} __se-node`,
          ),
        );
      },
      image: (alt, src) => renderNaverImageComponent(alt, src),
      orderedList: (items) => renderNaverTextComponent(renderNaverList(items, "ol")),
      paragraph: (lines) => renderNaverTextComponent(renderNaverParagraph(lines)),
      quote: (lines) => renderNaverQuote(lines),
      table: (rows) => renderNaverTable(rows),
      unorderedList: (items) => renderNaverTextComponent(renderNaverList(items, "ul")),
    },
    renderNaverSpacerComponent(),
  );

  return body;
}

export function marketingMarkdownToNaverHtml(content: string) {
  const body = renderNaverMarkdownComponents(content);
  return `<div class="se-main-container">${body}</div>`;
}

export function buildNaverBlogFormatContent(
  summary: string,
  body: string,
  tags?: string,
  siteUrl?: string,
  sourceTitle?: string,
  sourceUrl?: string,
  ctaMode: NaverBlogCtaMode = "link",
) {
  const targetSite = toSafeString(siteUrl);
  const targetSourceUrl = toSafeString(sourceUrl);
  const targetSourceTitle = decodeHtmlEntities(toSafeString(sourceTitle));
  const targetSourceReference = targetSourceTitle ? `${targetSourceTitle} (${targetSourceUrl})` : targetSourceUrl;
  const marketingMsg =
    ctaMode === "none"
      ? ""
      : ctaMode === "text"
        ? buildNaverTextOnlyCtaMessage(targetSourceTitle, targetSourceUrl, targetSite)
        : targetSourceUrl
          ? buildMarketingCtaMessage("detail", `‘${targetSourceReference}’`)
          : targetSite
            ? buildMarketingCtaMessage("site", `‘${targetSite}’`)
            : "";
  const bodyContent = [body, joinHashTags(tags)].map(toSafeString).filter(Boolean).join("\n\n");
  return [summary, bodyContent, marketingMsg].map(toSafeString).filter(Boolean).join("\n---\n");
}

export function buildNaverBlogClipboardHtml(
  summary: string,
  body: string,
  tags?: string,
  siteUrl?: string,
  sourceTitle?: string,
  sourceUrl?: string,
  ctaMode: NaverBlogCtaMode = "link",
) {
  const targetSummary = toSafeString(summary);
  const targetSourceUrl = toSafeString(sourceUrl);
  const targetSiteUrl = toSafeString(siteUrl);
  const bodyContent = [body, joinHashTags(tags)].map(toSafeString).filter(Boolean).join("\n\n");
  const content = [renderNaverSummaryQuote(targetSummary), renderNaverMarkdownComponents(bodyContent)].filter(Boolean);
  const cta =
    ctaMode === "none"
      ? ""
      : ctaMode === "text"
        ? renderNaverTextOnlyCta(
            buildNaverTextOnlyCtaMessage(decodeHtmlEntities(toSafeString(sourceTitle)), targetSourceUrl, targetSiteUrl),
          )
        : targetSourceUrl
          ? renderNaverLinkedCta("detail", decodeHtmlEntities(toSafeString(sourceTitle)) || targetSourceUrl, targetSourceUrl)
          : targetSiteUrl
            ? renderNaverLinkedCta("site", targetSiteUrl, targetSiteUrl)
            : "";

  if (cta) {
    content.push(renderNaverHorizontalLine(), cta);
  }

  return `<div class="se-main-container">${content.join("")}</div>`;
}

export function buildScopeParams(universeId?: string) {
  const safeUniverseId = toSafeString(universeId);
  return safeUniverseId ? { universeId: safeUniverseId } : {};
}

export function isCancelableJobStatus(status: string) {
  return CANCELABLE_JOB_STATUS.includes(toSafeString(status));
}

export function isArchivableJobStatus(status: string) {
  return ARCHIVABLE_JOB_STATUS.includes(toSafeString(status));
}

export function isMarketingFailureStatus(status: string) {
  return ["failed", "validation_failed", "partial"].includes(toSafeString(status).toLowerCase());
}

function getMarketingFailureRecords(source: unknown) {
  const root = toUnknownRecord(source);
  const meta = toUnknownRecord(root.meta);
  const response = toUnknownRecord(root.response);
  const responseRaw = toUnknownRecord(response.raw);
  const content = toUnknownRecord(root.content);
  const contentResponse = toUnknownRecord(content.response);

  return [
    toUnknownRecord(root.lastError),
    toUnknownRecord(root.error),
    toUnknownRecord(meta.error),
    toUnknownRecord(response.error),
    toUnknownRecord(responseRaw.error),
    toUnknownRecord(content.error),
    toUnknownRecord(contentResponse.error),
    toUnknownRecord(toUnknownRecord(contentResponse.raw).error),
    root,
  ].filter((record) => Object.keys(record).length > 0);
}

export function getMarketingFailureDetails(...sources: unknown[]) {
  const candidates = sources.flatMap(getMarketingFailureRecords);
  const failure =
    candidates.find((record) => toSafeString(record.message) || toSafeString(record.code)) || {};
  const rawMessage = toSafeString(failure.message);
  const message = getMarketingOperatorErrorMessage(
    { message: rawMessage },
    lang({
      ko: "저장된 실패 원인이 없습니다. 서버 로그와 플랫폼 발행 로그를 확인해주세요.",
      en: "No failure reason was stored. Check the server and platform publish logs.",
    }),
  );
  const fields = [
    [lang({ ko: "오류 코드", en: "Error code" }), failure.code],
    [lang({ ko: "처리 단계", en: "Phase" }), failure.phase],
    ["HTTP", failure.httpStatus],
    ["Graph code", failure.graphCode],
    ["Graph subcode", failure.graphSubcode],
    ["Graph type", failure.graphType],
    [lang({ ko: "컨테이너 상태", en: "Container status" }), failure.containerStatus],
    [lang({ ko: "컨테이너 메시지", en: "Container message" }), failure.containerMessage],
    [lang({ ko: "컨테이너 ID", en: "Container ID" }), failure.containerId],
    ["Graph trace ID", failure.graphTraceId],
  ] as const;

  return {
    message,
    detailLines: fields
      .map(([label, value]) => {
        const safeValue = toSafeString(value);
        return safeValue ? `${label}: ${safeValue}` : "";
      })
      .filter(Boolean),
  };
}

export function toScheduledAtPayload(value: string) {
  const safeValue = toSafeString(value);
  if (!safeValue) return undefined;

  const next = new Date(safeValue);
  if (Number.isNaN(next.getTime())) {
    return undefined;
  }

  return next.toISOString();
}

export function getMarketingOperatorErrorMessage(error: unknown, fallback: string) {
  const err = toErrorLike(error);
  const responseRecord = toUnknownRecord(err.response);
  const responseStatus = Number(responseRecord.status || err.status || 0);
  const dataRecord = toUnknownRecord(responseRecord.data);
  const rawMessage = [dataRecord.message, dataRecord.error, err.message]
    .map((value) => toSafeString(value))
    .find(Boolean);

  if (!rawMessage) return fallback;

  const validationIssueMessage = getKnownMarketingValidationIssueLabel(rawMessage);
  if (validationIssueMessage) return validationIssueMessage;

  if (rawMessage === "duplicate_typo_rule") {
    return lang({
      ko: "같은 유니버스와 감지 방식에 동일한 오탈자 항목이 이미 등록되어 있습니다.",
      en: "An equivalent typo rule already exists for this universe and match type.",
    });
  }

  if (/^<!doctype html/i.test(rawMessage) || /^<html/i.test(rawMessage)) {
    if (responseStatus === 401 || responseStatus === 403) {
      return lang({
        ko: "로그인 세션이 만료되었거나 작업 권한이 없습니다. 다시 로그인한 뒤 시도해주세요.",
        en: "Your session expired or you do not have permission. Sign in again and retry.",
      });
    }
    if (responseStatus === 404) {
      return lang({
        ko: "운영 서버에서 Marketing Ops API 라우트를 찾지 못했습니다. 배포 버전을 확인해주세요.",
        en: "The Marketing Ops API route is missing on the server. Check the deployed version.",
      });
    }
    if ([502, 503, 504].includes(responseStatus)) {
      return lang({
        ko: "운영 게이트웨이가 발행 요청을 완료하지 못했습니다. 작업 상태를 새로고침한 뒤 재시도해주세요.",
        en: "The gateway could not complete the publish request. Refresh the job status before retrying.",
      });
    }
    return `${fallback} ${lang({
      ko: "API가 JSON 대신 HTML을 반환했습니다. 운영 서버 라우팅 상태를 확인해주세요.",
      en: "The API returned HTML instead of JSON. Check server routing.",
    })}`;
  }

  if (rawMessage === "forbidden") {
    return lang({ ko: "이 작업을 수행할 권한이 없습니다.", en: "You do not have permission for this action." });
  }
  if (rawMessage === "universe_not_found") {
    return lang({ ko: "선택한 유니버스를 찾을 수 없습니다.", en: "The selected universe was not found." });
  }
  if (rawMessage === "universe_id_required") {
    return lang({ ko: "대상 유니버스가 필요합니다.", en: "A target universe is required." });
  }
  if (rawMessage === "job_not_found") {
    return lang({ ko: "선택한 job을 찾을 수 없습니다.", en: "The selected job was not found." });
  }
  if (rawMessage === "marketing_image_protected" || rawMessage === "marketing_image_active_reference") {
    return lang({
      ko: "이 이미지는 현재 검수·예약 또는 발행 보호 중이라 삭제할 수 없습니다.",
      en: "This image cannot be deleted while it is protected by review, scheduling, or publishing.",
    });
  }
  if (rawMessage === "marketing_image_delete_conflict") {
    return lang({
      ko: "이미지 상태가 변경되었습니다. 목록을 새로고침한 뒤 다시 시도해주세요.",
      en: "The image state changed. Refresh the list and try again.",
    });
  }
  if (rawMessage === "bridge_json_invalid" || rawMessage === "strategy_fit_response_incomplete") {
    return lang({
      ko: "AI가 적합도 검사 결과를 완전한 형식으로 반환하지 못했습니다. 코인은 차감되지 않았습니다. 잠시 후 다시 시도해주세요.",
      en: "The AI returned an incomplete fit-check result. No coins were charged. Please retry shortly.",
    });
  }
  if (rawMessage === "job_not_cancelable") {
    return lang({ ko: "이 상태의 job은 취소할 수 없습니다.", en: "This job status cannot be canceled." });
  }
  if (rawMessage === "job_not_archivable") {
    return lang({ ko: "완료/실패/취소된 job만 숨김 처리할 수 있습니다.", en: "Only terminal jobs can be archived." });
  }
  if (rawMessage === "invalid_action") {
    return lang({ ko: "지원하지 않는 job 작업입니다.", en: "Unsupported job action." });
  }
  if (rawMessage.startsWith("active_typo_rule_blocked:")) {
    const patterns = rawMessage.slice("active_typo_rule_blocked:".length);
    return lang({
      ko: `활성 오탈자 차단 규칙이 감지되어 발행을 중단했습니다.${patterns ? ` 확인 항목: ${patterns}` : ""}`,
      en: `Publishing was blocked by active typo rules.${patterns ? ` Review: ${patterns}` : ""}`,
    });
  }
  if (rawMessage === "recommendation_stale" || rawMessage === "publish_hour_not_allowed") {
    return lang({
      ko: "추천 일정 또는 허용 시간이 변경되었습니다. 목록을 새로고침한 뒤 다시 선택해주세요.",
      en: "The recommendation or allowed hours changed. Refresh the list and select again.",
    });
  }
  if (rawMessage === "batch_limit_exceeded") {
    return lang({
      ko: `한 번에 ${MARKETING_QUEUE_ENQUEUE_BATCH_MAX}건 이하만 등록할 수 있습니다. URL 목록은 자동 분할 등록을 사용해주세요.`,
      en: `Only ${MARKETING_QUEUE_ENQUEUE_BATCH_MAX} items can be submitted at once. Use chunked URL submission.`,
    });
  }
  if (rawMessage === "job_universe_mismatch") {
    return lang({
      ko: "선택한 job과 유니버스 범위가 일치하지 않습니다.",
      en: "The selected job does not match the current universe scope.",
    });
  }
  if (rawMessage === "linkedin_member_token_missing") {
    return lang({ ko: "LinkedIn 개인 프로필 연결이 필요합니다.", en: "Connect a LinkedIn member profile first." });
  }
  if (rawMessage === "linkedin_member_token_expired") {
    return lang({
      ko: "LinkedIn 개인 프로필 토큰이 만료되었습니다. 다시 연결해주세요.",
      en: "The LinkedIn member token expired. Reconnect it.",
    });
  }
  if (
    rawMessage === "threads_publish_dry_run" ||
    rawMessage === "instagram_publish_dry_run" ||
    rawMessage === "linkedin_publish_dry_run"
  ) {
    return lang({
      ko: "dry-run 상태로 처리되어 실제 플랫폼에는 발행되지 않았습니다.",
      en: "The action ran in dry-run mode and was not published to the platform.",
    });
  }
  if (rawMessage === "threads_publish_disabled") {
    return lang({
      ko: "이전 채널별 발행 비활성 설정으로 처리된 로그입니다. 현재 실제 발행 안전장치는 MARKETING_DRY_RUN을 사용합니다.",
      en: "This log was processed by the previous channel-level publish gate. Publishing is now controlled by MARKETING_DRY_RUN.",
    });
  }
  if (rawMessage === "threads_publish_credential_missing") {
    return lang({
      ko: "Threads 발행 자격증명의 User ID 또는 Access Token이 없습니다.",
      en: "Threads publishing credentials are missing a User ID or Access Token.",
    });
  }
  if (rawMessage === "instagram_publish_credential_missing") {
    return lang({
      ko: "Instagram 발행 자격증명의 계정 ID 또는 Access Token이 없습니다.",
      en: "Instagram publishing credentials are missing an account ID or Access Token.",
    });
  }
  if (rawMessage === "instagram_container_timeout") {
    return lang({
      ko: "Instagram 이미지 처리가 제한 시간 안에 완료되지 않았습니다. 잠시 후 다시 시도해주세요.",
      en: "Instagram did not finish processing the media in time. Please retry shortly.",
    });
  }
  if (rawMessage === "instagram_container_failed") {
    return lang({
      ko: "Instagram이 이미지 컨테이너 처리에 실패했습니다. 아래 컨테이너 상태와 메시지를 확인해주세요.",
      en: "Instagram failed to process the media container. Review the container status and message below.",
    });
  }
  if (rawMessage === "instagram_container_id_missing") {
    return lang({
      ko: "Instagram이 이미지 컨테이너 ID를 반환하지 않았습니다. Graph API 응답과 계정 권한을 확인해주세요.",
      en: "Instagram did not return a media container ID. Check the Graph API response and account permissions.",
    });
  }
  if (rawMessage.startsWith("instagram_image_fetch_failed")) {
    return lang({
      ko: "발행할 이미지를 서버에서 가져오지 못했습니다. 이미지 URL의 공개 접근 상태를 확인해주세요.",
      en: "The server could not fetch the publishing image. Check that the image URL is publicly accessible.",
    });
  }
  if (rawMessage === "instagram_image_invalid_content_type") {
    return lang({
      ko: "이미지 URL이 이미지 형식의 응답을 반환하지 않았습니다.",
      en: "The image URL did not return an image content type.",
    });
  }
  if (rawMessage === "instagram_image_source_too_large" || rawMessage === "instagram_image_too_large") {
    return lang({
      ko: "Instagram 발행용 이미지의 파일 크기가 허용 범위를 초과했습니다.",
      en: "The Instagram publishing image exceeds the allowed file size.",
    });
  }
  if (rawMessage === "linkedin_publish_token_missing") {
    return lang({
      ko: "LinkedIn 개인 프로필 연결이 필요합니다. 자격증명 슬롯과 별도로 개인 프로필 연결을 완료해주세요.",
      en: "Connect a LinkedIn member profile. This is separate from the credential slot.",
    });
  }
  if (rawMessage === "linkedin_publish_token_expired") {
    return lang({
      ko: "LinkedIn 개인 프로필 토큰이 만료되었습니다. 다시 연결해주세요.",
      en: "The LinkedIn member token expired. Reconnect it.",
    });
  }
  if (rawMessage === "wp_post_not_found") {
    return lang({
      ko: "WordPress 글을 찾지 못했습니다. slug 또는 URL을 다시 확인해주세요.",
      en: "The WordPress post was not found. Check the slug or URL.",
    });
  }
  if (rawMessage === "wp_source_ref_required") {
    return lang({
      ko: "새로고침할 WordPress 원문 정보가 없습니다.",
      en: "No WordPress source reference is available to refresh.",
    });
  }
  if (rawMessage === "image_url_required") {
    return lang({ ko: "연결할 이미지 URL이 없습니다.", en: "No image URL is available to attach." });
  }

  return rawMessage;
}
