import { NextResponse } from "next/server";
import { reportAndWithdrawPersonalUniversePublicSnapshot } from "libs/database/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { PUBLIC_UNIVERSE_REPORT_REASON_VALUES, type PublicUniverseReportReason } from "types/game";
import type { NextRouteContext } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

export const POST = withAuth(
  async (body, user, _request, context: NextRouteContext) => {
    const params = await Promise.resolve(context?.params);
    const snapshotId = String(params?.snapshotId || "").trim();
    const reason = String(body?.reason || "").trim();
    const note = String(body?.note || "").trim();
    const uid = getAuthenticatedUid(user as AuthenticatedUserType);
    if (!snapshotId || !uid || !PUBLIC_UNIVERSE_REPORT_REASON_VALUES.includes(reason as PublicUniverseReportReason)) {
      return NextResponse.json({ ok: false, error: "PUBLIC_SNAPSHOT_REPORT_INPUT_INVALID" }, { status: 400 });
    }
    if (note.length > 500) return NextResponse.json({ ok: false, error: "PUBLIC_SNAPSHOT_REPORT_NOTE_TOO_LONG" }, { status: 400 });
    try {
      const result = await reportAndWithdrawPersonalUniversePublicSnapshot({
        snapshotId,
        reporterUid: uid,
        reason: reason as PublicUniverseReportReason,
        note,
      });
      return NextResponse.json({ ok: true, duplicate: !result.changed, data: { reportId: result.report.reportId, status: result.report.status, snapshotId } }, { status: result.changed ? 201 : 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const code = String((error as { message?: unknown })?.message || "PUBLIC_SNAPSHOT_REPORT_FAILED");
      const status = code.includes("NOT_FOUND") ? 404 : 500;
      return NextResponse.json({ ok: false, error: code }, { status, headers: { "Cache-Control": "no-store" } });
    }
  },
  undefined,
  "game/personal-universe/public-snapshot:report",
  { bodyParser: "json" },
);
