import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { NEWSLETTER_CAMPAIGN_ENABLED } from "consts/env/server";
import {
  enqueueNewsletterCampaignTest,
  NewsletterCampaignError,
} from "libs/server-utils/mail/newsletterCampaignService";
import { toSafeString, toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

export const POST = withAuth(
  async (data, _user, _request, { params }: { params: Promise<{ campaignId: string }> }) => {
    if (!NEWSLETTER_CAMPAIGN_ENABLED) {
      return NextResponse.json({ success: false, error: "newsletter_campaign_disabled" }, { status: 404 });
    }
    try {
      const record = toUnknownRecord(data);
      const result = await enqueueNewsletterCampaignTest({
        campaignId: toSafeString((await params).campaignId),
        recipientEmail: toSafeString(record.recipientEmail),
      });
      return NextResponse.json({ success: true, data: result }, { status: 202 });
    } catch (error) {
      if (error instanceof NewsletterCampaignError) {
        return NextResponse.json({ success: false, error: error.code }, { status: error.status });
      }
      throw error;
    }
  },
  (data) => ({ valid: Boolean(data), error: "test_recipient_required" }),
  "newsletter_campaign_test_send",
  { requireAdmin: true },
);
