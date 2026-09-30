import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { NEWSLETTER_CAMPAIGN_ENABLED } from "consts/env/server";
import { approveNewsletterCampaign, NewsletterCampaignError } from "libs/server-utils/mail/newsletterCampaignService";
import { toSafeString, toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

export const POST = withAuth(
  async (data, user, _request, { params }: { params: Promise<{ campaignId: string }> }) => {
    if (!NEWSLETTER_CAMPAIGN_ENABLED) {
      return NextResponse.json({ success: false, error: "newsletter_campaign_disabled" }, { status: 404 });
    }
    try {
      const record = toUnknownRecord(data);
      const checklist = toUnknownRecord(record.checklist);
      const result = await approveNewsletterCampaign({
        campaignId: toSafeString((await params).campaignId),
        approvedBy: toSafeString(user?.userEmail || user?.userEmailLower || user?.uid),
        checklist: {
          copy: checklist.copy === true,
          links: checklist.links === true,
          claims: checklist.claims === true,
          consentGate: checklist.consentGate === true,
        },
      });
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof NewsletterCampaignError) {
        return NextResponse.json({ success: false, error: error.code }, { status: error.status });
      }
      throw error;
    }
  },
  (data) => ({ valid: Boolean(data), error: "review_checklist_required" }),
  "newsletter_campaign_approve",
  { requireAdmin: true },
);
