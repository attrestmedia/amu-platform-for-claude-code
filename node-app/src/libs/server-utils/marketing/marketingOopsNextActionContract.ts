import "server-only";

import crypto from "crypto";
import type { MarketingChannel, MarketingJobPriority } from "consts/marketing/queue";
import type { PublicIntelligencePatternProjection } from "libs/server-utils/magazine/magazineIntelligencePatternRepo";

/**
 * @docHint
 * @purpose AIR-803 Pattern -> Marketing Oops Primary Next Action 계약
 * @process 공개 Pattern 검증 -> Problem Cluster/서비스 경계 확인 -> draft-only handoff 계획 생성
 * @domain marketing-ops-intelligence
 * @scope server-contract
 */

export const MARKETING_OOPS_NEXT_ACTION_CONTRACT_TYPE = "marketing-oops-next-action" as const;
export const MARKETING_OOPS_NEXT_ACTION_SCHEMA_VERSION = "marketing-oops-next-action.v1" as const;
export const MARKETING_OOPS_NEXT_ACTION_POLICY_VERSION = "marketing-oops-pattern-policy.v1" as const;
export const MARKETING_OOPS_PATTERN_SOURCE_KIND = "intelligence_pattern" as const;
export const MARKETING_OOPS_PATTERN_READ_CONSUMER = "marketing-oops-intelligence-pattern.v1" as const;

export const MARKETING_OOPS_PROBLEM_CLUSTERS = ["C1", "C2", "C3", "C4"] as const;
export type MarketingOopsProblemCluster = (typeof MARKETING_OOPS_PROBLEM_CLUSTERS)[number];

export const MARKETING_OOPS_CONTENT_TYPES = ["audience", "product_market"] as const;
export type MarketingOopsContentType = (typeof MARKETING_OOPS_CONTENT_TYPES)[number];

export const MARKETING_OOPS_SERVICES = [
  "gen_studio",
  "tutors",
  "play",
  "marketing_oops",
  "smartstore",
  "store",
] as const;
export type MarketingOopsService = (typeof MARKETING_OOPS_SERVICES)[number];

export const MARKETING_OOPS_SERVICE_MATURITIES = ["development", "pilot", "beta", "stable"] as const;
export type MarketingOopsServiceMaturity = (typeof MARKETING_OOPS_SERVICE_MATURITIES)[number];

export const MARKETING_OOPS_EXECUTION_MODES = ["story_only", "context_link", "service_surface"] as const;
export type MarketingOopsExecutionMode = (typeof MARKETING_OOPS_EXECUTION_MODES)[number];

export const MARKETING_OOPS_PRIMARY_CTAS = ["relationship", "context_link", "individual_inquiry"] as const;
export type MarketingOopsPrimaryCta = (typeof MARKETING_OOPS_PRIMARY_CTAS)[number];

export const MARKETING_OOPS_CHANNELS = ["threads", "instagram", "linkedin", "naver_blog"] as const;
export type MarketingOopsChannel = (typeof MARKETING_OOPS_CHANNELS)[number];

export const MARKETING_OOPS_REVIEW_WINDOWS = [7, 28] as const;
export type MarketingOopsReviewWindowDays = (typeof MARKETING_OOPS_REVIEW_WINDOWS)[number];

export type MarketingOopsPatternEvidence = {
  evidenceId: string;
  origin: "pattern_evidence" | "amu_article";
  sourceType: string;
  sourceRef: string;
  articleRevision: string | null;
  observedAt: string | null;
  claimStatus: string;
  supports: string;
  limitations: string[];
  /** Pattern/article evidence is never an AMU performance result. */
  performanceClaim: "not_amu_performance";
};

export type MarketingOopsProblemClusterPlan = {
  primaryCluster: MarketingOopsProblemCluster;
  contentType: MarketingOopsContentType;
  topic: string;
  primaryService: MarketingOopsService;
  primaryCta: MarketingOopsPrimaryCta;
  serviceMaturity: MarketingOopsServiceMaturity;
  executionMode: MarketingOopsExecutionMode;
  /** Current feature/route/credential gate result supplied by the operator. */
  executable: boolean;
  /** Current priority gate result supplied by the operator. */
  priorityAllowed: boolean;
};

export type MarketingOopsNextAction = {
  contractType: typeof MARKETING_OOPS_NEXT_ACTION_CONTRACT_TYPE;
  schemaVersion: typeof MARKETING_OOPS_NEXT_ACTION_SCHEMA_VERSION;
  policyVersion: typeof MARKETING_OOPS_NEXT_ACTION_POLICY_VERSION;
  pattern: {
    patternId: string;
    articleRevision: string | null;
    articleRevisions: string[];
    updatedAt: string;
    reviewDueAt: string;
  };
  problemCluster: MarketingOopsProblemClusterPlan;
  action: string;
  evidence: MarketingOopsPatternEvidence[];
  expectedMechanism: string;
  metric: string;
  reviewWindow: {
    days: MarketingOopsReviewWindowDays;
    label: "7d" | "28d";
  };
  doNotChange: string;
  priority: MarketingJobPriority;
  channels: MarketingOopsChannel[];
  handoff: {
    mode: "draft_only";
    approvalRequired: true;
    publishPolicy: "human_approval_only";
  };
  retryPolicy: {
    maxAttempts: 3;
    backoffSeconds: [60, 300, 900];
    reuseIdempotencyKey: true;
    duplicateDraftPolicy: "reuse_existing_job";
  };
  idempotencyKey: string;
  dedupeKey: string;
  createdAt: string;
};

export type MarketingOopsActionBuildInput = {
  pattern: PublicIntelligencePatternProjection;
  problemCluster: MarketingOopsProblemClusterPlan;
  action: string;
  metric: string;
  reviewWindowDays: MarketingOopsReviewWindowDays;
  doNotChange: string;
  priority: MarketingJobPriority;
  channels: MarketingChannel[];
  now?: Date;
};

export type MarketingOopsActionBuildResult =
  | { ok: true; data: MarketingOopsNextAction }
  | {
      ok: false;
      code:
        | "PATTERN_NOT_ELIGIBLE"
        | "PATTERN_EVIDENCE_MISSING"
        | "PROBLEM_CLUSTER_INVALID"
        | "SERVICE_CONFLICT"
        | "PRIORITY_CONFLICT"
        | "FEATURE_NOT_EXECUTABLE"
        | "ACTION_INPUT_INVALID";
      message: string;
      field?: string;
    };

const SERVICES_BY_CLUSTER: Record<MarketingOopsProblemCluster, readonly MarketingOopsService[]> = {
  C1: ["gen_studio", "smartstore", "marketing_oops"],
  C2: ["gen_studio", "marketing_oops"],
  C3: ["tutors", "play"],
  C4: ["tutors", "marketing_oops"],
};

const MARKETING_OOPS_PRIORITY_VALUES = new Set<MarketingJobPriority>(["low", "normal", "high", "urgent"]);
const MARKETING_OOPS_CHANNEL_SET = new Set<MarketingChannel>(MARKETING_OOPS_CHANNELS);
const MARKETING_OOPS_CLUSTER_SET = new Set<string>(MARKETING_OOPS_PROBLEM_CLUSTERS);
const MARKETING_OOPS_SERVICE_SET = new Set<string>(MARKETING_OOPS_SERVICES);
const MARKETING_OOPS_MATURITY_SET = new Set<string>(MARKETING_OOPS_SERVICE_MATURITIES);
const MARKETING_OOPS_MODE_SET = new Set<string>(MARKETING_OOPS_EXECUTION_MODES);
const MARKETING_OOPS_CTA_SET = new Set<string>(MARKETING_OOPS_PRIMARY_CTAS);

function safeText(value: unknown, max = 400) {
  const text = String(value || "").normalize("NFKC").trim();
  if ([...text].some((char) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(char))) return "";
  return text.slice(0, max);
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function buildIdempotencyKey(input: {
  patternId: string;
  updatedAt: string;
  articleRevision: string | null;
  cluster: MarketingOopsProblemClusterPlan;
  action: string;
  metric: string;
  reviewWindowDays: MarketingOopsReviewWindowDays;
  doNotChange: string;
  priority: MarketingJobPriority;
  channels: MarketingOopsChannel[];
}) {
  const canonical = JSON.stringify({
    patternId: input.patternId,
    updatedAt: input.updatedAt,
    articleRevision: input.articleRevision,
    cluster: {
      primaryCluster: input.cluster.primaryCluster,
      contentType: input.cluster.contentType,
      topic: input.cluster.topic,
      primaryService: input.cluster.primaryService,
      primaryCta: input.cluster.primaryCta,
      serviceMaturity: input.cluster.serviceMaturity,
      executionMode: input.cluster.executionMode,
      executable: input.cluster.executable,
      priorityAllowed: input.cluster.priorityAllowed,
    },
    action: input.action,
    metric: input.metric,
    reviewWindowDays: input.reviewWindowDays,
    doNotChange: input.doNotChange,
    priority: input.priority,
    channels: input.channels,
  });
  return `mops-pattern:v1:${sha256(canonical)}`;
}

function validateClusterPlan(plan: MarketingOopsProblemClusterPlan): MarketingOopsActionBuildResult | null {
  if (!MARKETING_OOPS_CLUSTER_SET.has(plan.primaryCluster)) {
    return { ok: false, code: "PROBLEM_CLUSTER_INVALID", message: "Primary Problem Cluster가 유효하지 않습니다.", field: "primaryCluster" };
  }
  if (!safeText(plan.topic, 240)) {
    return { ok: false, code: "PROBLEM_CLUSTER_INVALID", message: "Problem Cluster 주제가 필요합니다.", field: "topic" };
  }
  if (!MARKETING_OOPS_SERVICE_SET.has(plan.primaryService)) {
    return { ok: false, code: "PROBLEM_CLUSTER_INVALID", message: "연결 서비스가 유효하지 않습니다.", field: "primaryService" };
  }
  if (!SERVICES_BY_CLUSTER[plan.primaryCluster].includes(plan.primaryService)) {
    return { ok: false, code: "PROBLEM_CLUSTER_INVALID", message: "Pattern과 Problem Cluster의 서비스 연결이 일치하지 않습니다.", field: "primaryService" };
  }
  if (!MARKETING_OOPS_MATURITY_SET.has(plan.serviceMaturity)) {
    return { ok: false, code: "SERVICE_CONFLICT", message: "서비스 성숙도 값이 유효하지 않습니다.", field: "serviceMaturity" };
  }
  if (!MARKETING_OOPS_MODE_SET.has(plan.executionMode)) {
    return { ok: false, code: "SERVICE_CONFLICT", message: "서비스 실행 모드가 유효하지 않습니다.", field: "executionMode" };
  }
  if (!MARKETING_OOPS_CTA_SET.has(plan.primaryCta)) {
    return { ok: false, code: "SERVICE_CONFLICT", message: "Primary CTA가 유효하지 않습니다.", field: "primaryCta" };
  }

  const restrictedMaturity = plan.serviceMaturity === "development" || plan.serviceMaturity === "pilot";
  if (restrictedMaturity && plan.executionMode !== "story_only") {
    return {
      ok: false,
      code: "SERVICE_CONFLICT",
      message: "개발·파일럿 서비스는 story-only로만 Marketing Oops 콘텐츠에 연결할 수 있습니다.",
      field: "executionMode",
    };
  }
  if (plan.executionMode === "story_only" && plan.primaryCta === "context_link") {
    return { ok: false, code: "SERVICE_CONFLICT", message: "story-only 콘텐츠는 context-link CTA를 열 수 없습니다.", field: "primaryCta" };
  }
  if (plan.primaryService === "marketing_oops" && plan.executionMode !== "story_only") {
    return { ok: false, code: "SERVICE_CONFLICT", message: "Marketing Oops는 내부 운영 우선 서비스라 story-only만 허용됩니다.", field: "executionMode" };
  }
  if (!plan.executable) {
    return { ok: false, code: "FEATURE_NOT_EXECUTABLE", message: "현재 기능·권한·자격 증명 상태에서 실행할 수 없습니다." };
  }
  if (!plan.priorityAllowed) {
    return { ok: false, code: "PRIORITY_CONFLICT", message: "현재 우선순위와 충돌해 추천을 만들 수 없습니다.", field: "priorityAllowed" };
  }
  return null;
}

function evidenceFromPattern(projection: PublicIntelligencePatternProjection): MarketingOopsPatternEvidence[] {
  const pattern = projection.pattern;
  const evidence = pattern.evidence
    .filter((item) => item.claimStatus !== "prohibited" && safeText(item.sourceRef, 2000) && safeText(item.supports))
    .slice(0, 8)
    .map((item) => ({
      evidenceId: item.evidenceId,
      origin: "pattern_evidence" as const,
      sourceType: safeText(item.sourceType, 120),
      sourceRef: safeText(item.sourceRef, 2000),
      articleRevision: null,
      observedAt: safeText(item.observedAt, 80) || null,
      claimStatus: safeText(item.claimStatus, 40),
      supports: safeText(item.supports),
      limitations: item.limitations.map((value) => safeText(value)).filter(Boolean).slice(0, 12),
      performanceClaim: "not_amu_performance" as const,
    }));

  const articleEvidence = pattern.articleLinks.slice(0, 8).map((link) => ({
    evidenceId: `article:${link.contentId}:${link.articleRevision}`,
    origin: "amu_article" as const,
    sourceType: "amu_knowledge_article",
    sourceRef: safeText(link.contentId, 200),
    articleRevision: safeText(link.articleRevision, 200) || null,
    observedAt: null,
    claimStatus: "sourced",
    supports: "승인된 Pattern이 연결된 현재 Article revision",
    limitations: [],
    performanceClaim: "not_amu_performance" as const,
  }));

  return [...evidence, ...articleEvidence].slice(0, 16);
}

export function buildMarketingOopsNextAction(input: MarketingOopsActionBuildInput): MarketingOopsActionBuildResult {
  const now = input.now ?? new Date();
  const pattern = input.pattern.pattern;
  const action = safeText(input.action);
  const metric = safeText(input.metric);
  const doNotChange = safeText(input.doNotChange);
  const topic = safeText(input.problemCluster.topic, 240);
  const evidence = evidenceFromPattern(input.pattern);
  const reviewDueAt = new Date(pattern.reviewDueAt);
  const updatedAt = new Date(input.pattern.updatedAt);
  const articleRevisions = Array.from(new Set(pattern.articleLinks.map((link) => safeText(link.articleRevision, 200)).filter(Boolean)));
  const channels = Array.from(new Set(input.channels.filter((channel): channel is MarketingOopsChannel => MARKETING_OOPS_CHANNEL_SET.has(channel))));

  if (
    pattern.maturity !== "active" ||
    pattern.healthStatus !== "current" ||
    Number.isNaN(reviewDueAt.getTime()) ||
    reviewDueAt.getTime() < now.getTime() ||
    Number.isNaN(updatedAt.getTime()) ||
    !pattern.patternId ||
    !articleRevisions.length
  ) {
    return { ok: false, code: "PATTERN_NOT_ELIGIBLE", message: "Pattern이 active/current이고 현재 article revision을 가진 상태가 아닙니다.", field: "pattern" };
  }
  if (!evidence.length) {
    return { ok: false, code: "PATTERN_EVIDENCE_MISSING", message: "공개 Evidence 또는 연결된 현재 Article이 없어 추천을 만들 수 없습니다.", field: "evidence" };
  }
  if (input.pattern.articleRevision && !articleRevisions.includes(input.pattern.articleRevision)) {
    return { ok: false, code: "PATTERN_NOT_ELIGIBLE", message: "read envelope의 articleRevision이 Pattern link와 일치하지 않습니다.", field: "articleRevision" };
  }
  const clusterError = validateClusterPlan({ ...input.problemCluster, topic });
  if (clusterError) return clusterError;
  if (!MARKETING_OOPS_PRIORITY_VALUES.has(input.priority)) {
    return { ok: false, code: "ACTION_INPUT_INVALID", message: "우선순위가 유효하지 않습니다.", field: "priority" };
  }
  if (!action) return { ok: false, code: "ACTION_INPUT_INVALID", message: "Primary Action이 필요합니다.", field: "action" };
  if (!metric) return { ok: false, code: "ACTION_INPUT_INVALID", message: "Metric이 필요합니다.", field: "metric" };
  if (!doNotChange) return { ok: false, code: "ACTION_INPUT_INVALID", message: "Do Not Change 제약이 필요합니다.", field: "doNotChange" };
  if (!MARKETING_OOPS_REVIEW_WINDOWS.includes(input.reviewWindowDays)) {
    return { ok: false, code: "ACTION_INPUT_INVALID", message: "Review Window는 7일 또는 28일이어야 합니다.", field: "reviewWindowDays" };
  }
  if (!channels.length) return { ok: false, code: "ACTION_INPUT_INVALID", message: "초안을 만들 채널이 필요합니다.", field: "channels" };
  if (channels.length !== input.channels.length) {
    return { ok: false, code: "ACTION_INPUT_INVALID", message: "지원하지 않는 콘텐츠 채널이 포함되어 있습니다.", field: "channels" };
  }

  const idempotencyKey = buildIdempotencyKey({
    patternId: pattern.patternId,
    updatedAt: input.pattern.updatedAt,
    articleRevision: input.pattern.articleRevision,
    cluster: { ...input.problemCluster, topic },
    action,
    metric,
    reviewWindowDays: input.reviewWindowDays,
    doNotChange,
    priority: input.priority,
    channels,
  });

  return {
    ok: true,
    data: {
      contractType: MARKETING_OOPS_NEXT_ACTION_CONTRACT_TYPE,
      schemaVersion: MARKETING_OOPS_NEXT_ACTION_SCHEMA_VERSION,
      policyVersion: MARKETING_OOPS_NEXT_ACTION_POLICY_VERSION,
      pattern: {
        patternId: pattern.patternId,
        articleRevision: input.pattern.articleRevision,
        articleRevisions,
        updatedAt: input.pattern.updatedAt,
        reviewDueAt: pattern.reviewDueAt,
      },
      problemCluster: { ...input.problemCluster, topic },
      action,
      evidence,
      expectedMechanism: safeText(pattern.mechanism),
      metric,
      reviewWindow: {
        days: input.reviewWindowDays,
        label: input.reviewWindowDays === 7 ? "7d" : "28d",
      },
      doNotChange,
      priority: input.priority,
      channels,
      handoff: {
        mode: "draft_only",
        approvalRequired: true,
        publishPolicy: "human_approval_only",
      },
      retryPolicy: {
        maxAttempts: 3,
        backoffSeconds: [60, 300, 900],
        reuseIdempotencyKey: true,
        duplicateDraftPolicy: "reuse_existing_job",
      },
      idempotencyKey,
      dedupeKey: `marketing-oops:pattern:${pattern.patternId}:${idempotencyKey.slice(-16)}`,
      createdAt: now.toISOString(),
    },
  };
}

export function toMarketingOopsPatternSourceSnapshot(action: MarketingOopsNextAction) {
  const articleEvidence = action.evidence
    .map((item) => `- ${item.sourceType}: ${item.sourceRef} — ${item.supports} (AMU 성과 아님)`)
    .join("\n");
  const contentText = [
    `Problem Cluster: ${action.problemCluster.primaryCluster} / ${action.problemCluster.topic}`,
    `Content type: ${action.problemCluster.contentType}`,
    `Primary Action: ${action.action}`,
    `Expected Mechanism: ${action.expectedMechanism}`,
    `Metric: ${action.metric}`,
    `Review Window: ${action.reviewWindow.label}`,
    `Do Not Change: ${action.doNotChange}`,
    "Evidence (Pattern/article context only; not AMU performance):",
    articleEvidence,
    `Service state: ${action.problemCluster.serviceMaturity} / ${action.problemCluster.executionMode}`,
    "Handoff: draft-only; human approval is required before publish.",
  ].join("\n");
  const encodedPatternId = encodeURIComponent(action.pattern.patternId);
  const url = `https://app.allmyuniverse.com/api/magazine/intelligence/v1?consumer=${MARKETING_OOPS_PATTERN_READ_CONSUMER}&patternId=${encodedPatternId}`;
  const slug = `intelligence-pattern-${action.pattern.patternId.replace(/^amu:intelligence-pattern:/, "").replace(/[^a-z0-9-]/gi, "-")}`.slice(0, 120);

  return {
    sourceKind: MARKETING_OOPS_PATTERN_SOURCE_KIND,
    sourceId: action.pattern.patternId,
    sourceVersion: 1,
    slug,
    url,
    canonicalUrl: url,
    title: `Pattern 기반 Next Action — ${action.problemCluster.primaryCluster}`,
    summary: action.action,
    excerptText: contentText.slice(0, 1200),
    contentText,
    categories: [action.problemCluster.primaryCluster],
    tags: ["intelligence-pattern", action.problemCluster.contentType],
    modified: action.pattern.updatedAt,
    allowedClaims: [
      "Pattern은 승인된 현재 상태의 공개 Evidence와 Article 연결을 바탕으로 한 추천 입력이다.",
      "Pattern Evidence는 AMU 자체 성과를 의미하지 않는다.",
    ],
  };
}
