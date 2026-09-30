import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { NEWSLETTER_CAMPAIGN_ENABLED } from "consts/env/server";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import {
  createNewsletterCampaignDraft,
  listNewsletterCampaigns,
  NewsletterCampaignError,
} from "libs/server-utils/mail/newsletterCampaignService";
import { toSafeString, toUnknownRecord } from "utils/common";
import type {
  NewsletterClaimCheck,
  NewsletterCurationDraft,
  NewsletterCurationStory,
} from "libs/server-utils/mail/newsletterCampaignContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function arrayOf<T>(value: unknown) {
  return (Array.isArray(value) ? value : []) as T[];
}

export const GET = withAuth(
  async (_data, _user, request: NextRequest) => {
    if (!NEWSLETTER_CAMPAIGN_ENABLED) {
      return NextResponse.json({ success: false, error: "newsletter_campaign_disabled" }, { status: 404 });
    }
    const search = new URL(request.url).searchParams;
    const items = await listNewsletterCampaigns({
      universeId: toSafeString(search.get("universeId")) || undefined,
      limit: Number(search.get("limit") || 30),
    });
    return NextResponse.json({ success: true, data: { items } });
  },
  undefined,
  "newsletter_campaign_list",
  { requireAdmin: true, bodyParser: "none" },
);

export const POST = withAuth(
  async (data, user) => {
    if (!NEWSLETTER_CAMPAIGN_ENABLED) {
      return NextResponse.json({ success: false, error: "newsletter_campaign_disabled" }, { status: 404 });
    }
    try {
      const record = toUnknownRecord(data);
      const requestedUniverseId = toSafeString(record.universeId);
      if (!requestedUniverseId) {
        return NextResponse.json({ success: false, error: "universe_id_required" }, { status: 400 });
      }
      const access = await assertMarketingUniverseAccess({ user, universeId: requestedUniverseId });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }
      const result = await createNewsletterCampaignDraft({
        universeId: access.universeId,
        requestedBy: toSafeString(user?.userEmail || user?.userEmailLower || user?.uid),
        campaignId: toSafeString(record.campaignId) || undefined,
        issueId: toSafeString(record.issueId),
        issueTitle: toSafeString(record.issueTitle),
        intro: toSafeString(record.intro),
        topArticles: arrayOf<NewsletterCurationStory>(record.topArticles),
        relatedBehaviorArticles: arrayOf<NewsletterCurationStory>(record.relatedBehaviorArticles),
        topic: toUnknownRecord(record.topic) as NewsletterCurationDraft["topic"],
        claims: arrayOf<NewsletterClaimCheck>(record.claims),
      });
      return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (error) {
      if (error instanceof NewsletterCampaignError) {
        return NextResponse.json({ success: false, error: error.code }, { status: error.status });
      }
      throw error;
    }
  },
  (data) => ({ valid: Boolean(data), error: "request_body_required" }),
  "newsletter_campaign_create",
);
