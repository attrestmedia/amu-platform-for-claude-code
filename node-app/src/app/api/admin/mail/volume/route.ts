import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getMailVolumeReport } from "libs/server-utils/mail/mailVolumeService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function boundedDays(value: string | null) {
  const parsed = Number(value || 30);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(400, Math.floor(parsed))) : 30;
}

function validMonth(value: string | null) {
  return !value || /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export const GET = withAuth(
  async (_data, _user, request: NextRequest) => {
    const search = new URL(request.url).searchParams;
    const month = search.get("month");
    if (!validMonth(month)) {
      return NextResponse.json({ success: false, error: "mail_volume_month_invalid" }, { status: 400 });
    }
    const data = await getMailVolumeReport({ days: boundedDays(search.get("days")), month: month || undefined });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  },
  undefined,
  "admin_mail_volume_get",
  { requireAdmin: true, bodyParser: "none" },
);
