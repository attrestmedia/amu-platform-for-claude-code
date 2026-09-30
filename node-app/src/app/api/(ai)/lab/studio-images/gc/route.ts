import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { runSoftDeleteGc } from "libs/database/lab";
import type { UnknownRecord } from "utils/common";

export const runtime = "nodejs";

const validate = (data: UnknownRecord) => {
  const olderThanDays = Number(data?.olderThanDays ?? 7);
  const limit = Number(data?.limit ?? 100);
  if (!Number.isFinite(olderThanDays) || olderThanDays < 1 || olderThanDays > 3650) {
    return { valid: false, error: "invalid_olderThanDays" };
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return { valid: false, error: "invalid_limit" };
  }
  return { valid: true };
};

async function postHandler(data: UnknownRecord) {
  const olderThanDays = Number(data?.olderThanDays ?? 7);
  const limit = Number(data?.limit ?? 100);
  const dryRun = Boolean(data?.dryRun);

  const out = await runSoftDeleteGc({ olderThanDays, limit, dryRun });
  return NextResponse.json({ ok: true, data: out });
}

export const POST = withAuth(postHandler, validate, "lab/studio-images:gc", { requireAdmin: true });
