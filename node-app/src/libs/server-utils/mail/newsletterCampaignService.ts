import "server-only";

import crypto from "node:crypto";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  NewsletterCampaignSchema,
  type INewsletterCampaignDocument,
} from "models/mail";
import { enqueueMail } from "./mailQueue";
import {
  assertNewsletterTestRecipient,
  buildNewsletterTestMail,
  issueNewsletterToken,
  newsletterUnsubscribeUrl,
  NewsletterSubscriptionError,
} from "./newsletterSubscriberService";
import {
  buildNewsletterCurationDraft,
  toNewsletterIssueData,
  type NewsletterClaimCheck,
  type NewsletterCurationDraft,
  type NewsletterCurationStory,
} from "./newsletterCampaignContract";

const CAMPAIGN_MODEL = "NewsletterCampaign";

export class NewsletterCampaignError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.name = "NewsletterCampaignError";
    this.code = code;
    this.status = status;
  }
}

function campaignModel() {
  return getModel<INewsletterCampaignDocument>(
    MONGODB_AMU_URL,
    CAMPAIGN_MODEL,
    NewsletterCampaignSchema,
    "newsletter_campaigns",
  );
}

function toPlain(value: unknown) {
  if (value && typeof value === "object" && "toObject" in value && typeof value.toObject === "function") {
    return value.toObject();
  }
  return value;
}

function asDraft(value: unknown): NewsletterCurationDraft {
  const draft = (toPlain(value) || {}) as Partial<NewsletterCurationDraft>;
  return {
    issueId: String(draft.issueId || ""),
    issueTitle: String(draft.issueTitle || ""),
    intro: String(draft.intro || ""),
    stories: Array.isArray(draft.stories) ? (draft.stories as NewsletterCurationStory[]) : [],
    topic: {
      title: String(draft.topic?.title || ""),
      summary: String(draft.topic?.summary || ""),
      url: String(draft.topic?.url || ""),
    },
    claims: Array.isArray(draft.claims) ? (draft.claims as NewsletterClaimCheck[]) : [],
  };
}

function dto(value: unknown) {
  const row = toPlain(value) as Record<string, unknown>;
  return {
    campaignId: String(row.campaignId || ""),
    universeId: String(row.universeId || ""),
    issueId: String(row.issueId || ""),
    status: String(row.status || "waiting_review"),
    draft: row.draft || {},
    requestedBy: String(row.requestedBy || ""),
    reviewedBy: String(row.reviewedBy || ""),
    approvedBy: String(row.approvedBy || ""),
    approvalId: String(row.approvalId || ""),
    reviewChecklist: row.reviewChecklist || {},
    testMessageId: String(row.testMessageId || ""),
    scheduledAt: row.scheduledAt || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

export async function createNewsletterCampaignDraft(input: {
  universeId: string;
  requestedBy: string;
  campaignId?: string;
  issueId: string;
  issueTitle: string;
  intro: string;
  topArticles: readonly NewsletterCurationStory[];
  relatedBehaviorArticles: readonly NewsletterCurationStory[];
  topic: NewsletterCurationDraft["topic"];
  claims: readonly NewsletterClaimCheck[];
}) {
  const built = buildNewsletterCurationDraft(input);
  if (!built.validation.valid) {
    throw new NewsletterCampaignError(`NEWSLETTER_DRAFT_INVALID:${built.validation.issues.join(",")}`, 400);
  }
  const campaignId = String(input.campaignId || `newsletter:${built.draft.issueId}`).trim();
  if (!campaignId || campaignId.length > 200) throw new NewsletterCampaignError("NEWSLETTER_CAMPAIGN_ID_REQUIRED", 400);

  const Model = await campaignModel();
  try {
    const row = await Model.create({
      campaignId,
      universeId: input.universeId.trim(),
      issueId: built.draft.issueId,
      status: "waiting_review",
      draft: built.draft,
      requestedBy: input.requestedBy.trim(),
    });
    return dto(row);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      throw new NewsletterCampaignError("NEWSLETTER_CAMPAIGN_ALREADY_EXISTS", 409);
    }
    throw error;
  }
}

export async function getNewsletterCampaign(campaignId: string) {
  const Model = await campaignModel();
  const row = await Model.findOne({ campaignId: campaignId.trim() }).lean();
  return row ? dto(row) : null;
}

export async function listNewsletterCampaigns(input: { universeId?: string; limit?: number }) {
  const Model = await campaignModel();
  const limit = Math.max(1, Math.min(100, input.limit || 30));
  const rows = await Model.find(input.universeId ? { universeId: input.universeId.trim() } : {})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return rows.map(dto);
}

export async function approveNewsletterCampaign(input: {
  campaignId: string;
  approvedBy: string;
  checklist: { copy: boolean; links: boolean; claims: boolean; consentGate: boolean };
}) {
  if (!Object.values(input.checklist).every(Boolean)) {
    throw new NewsletterCampaignError("NEWSLETTER_REVIEW_CHECKLIST_INCOMPLETE", 409);
  }
  const Model = await campaignModel();
  const approvalId = `newsletter-approval:${crypto.randomUUID()}`;
  const row = await Model.findOneAndUpdate(
    { campaignId: input.campaignId.trim(), status: "waiting_review" },
    {
      $set: {
        status: "approved",
        reviewedBy: input.approvedBy.trim(),
        approvedBy: input.approvedBy.trim(),
        approvalId,
        reviewChecklist: input.checklist,
      },
    },
    { new: true },
  ).lean();
  if (!row) throw new NewsletterCampaignError("NEWSLETTER_CAMPAIGN_NOT_WAITING_REVIEW", 409);
  return dto(row);
}

export async function enqueueNewsletterCampaignTest(input: { campaignId: string; recipientEmail: string }) {
  const Model = await campaignModel();
  const row = await Model.findOne({ campaignId: input.campaignId.trim() }).lean();
  if (!row) throw new NewsletterCampaignError("NEWSLETTER_CAMPAIGN_NOT_FOUND", 404);
  if (row.status !== "approved" && row.status !== "test_sent") {
    throw new NewsletterCampaignError("NEWSLETTER_CAMPAIGN_NOT_APPROVED", 409);
  }

  let recipientEmail: string;
  try {
    recipientEmail = assertNewsletterTestRecipient(input.recipientEmail);
  } catch (error) {
    if (error instanceof NewsletterSubscriptionError) {
      throw new NewsletterCampaignError(error.code, error.status);
    }
    throw error;
  }
  const draft = asDraft(row.draft);
  const issue = toNewsletterIssueData(draft);
  const mail = buildNewsletterTestMail({
    recipientEmail,
    issueId: draft.issueId,
    issueTitle: issue.issueTitle,
    intro: issue.intro,
    stories: issue.stories,
    topic: issue.topic,
    unsubscribeUrl: newsletterUnsubscribeUrl(issueNewsletterToken()),
  });
  const queued = await enqueueMail(mail);
  await Model.updateOne(
    { campaignId: row.campaignId, status: { $in: ["approved", "test_sent"] } },
    { $set: { status: "test_sent", testMessageId: queued.messageId } },
  );
  return { campaignId: row.campaignId, messageId: queued.messageId, status: queued.status };
}

/** queue worker가 capability의 문자열만으로 승인된 campaign을 가장하지 못하도록 DB 상태와 대조한다. */
export async function isNewsletterCampaignDispatchAuthorized(input: {
  campaignId: string;
  approvedBy: string;
  approvalId: string;
}) {
  const Model = await campaignModel();
  const row = await Model.findOne({
    campaignId: input.campaignId.trim(),
    status: { $in: ["approved", "test_sent"] },
    approvedBy: input.approvedBy.trim(),
    approvalId: input.approvalId.trim(),
  })
    .select("_id")
    .lean();
  return Boolean(row);
}

/** 실발송 구현(SES-540 delivery/token contract)은 승인 capability가 있을 때만 연결한다. */
export function buildNewsletterProductionDispatchAuthorization(input: {
  campaignId: string;
  status: string;
  approvedBy: string;
  approvalId: string;
}) {
  if (!["approved", "test_sent"].includes(input.status) || !input.approvedBy.trim() || !input.approvalId.trim()) {
    throw new NewsletterCampaignError("NEWSLETTER_PRODUCTION_APPROVAL_REQUIRED", 409);
  }
  return {
    mode: "production" as const,
    campaignId: input.campaignId.trim(),
    approvedBy: input.approvedBy.trim(),
    approvalId: input.approvalId.trim(),
  };
}
