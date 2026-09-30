import { NextResponse } from "next/server";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import {
  createPersonalUniversePublicSnapshotDraft,
  getPersonalUniverseForOwner,
  listPublishedPersonalUniverseCanon,
  publishPersonalUniversePublicSnapshot,
  withdrawPersonalUniversePublicSnapshot,
} from "libs/database/game";
import { buildPublicUniverseSnapshotContent, moderatePublicUniverseSnapshot, toPublicUniverseSnapshotResponse } from "libs/server-utils/narrative/personalUniversePublicSnapshot";
import { getPersonalUniversePublicGate } from "libs/server-utils/narrative/personalUniversePublicPolicy";
import { resolveTrustedMinorStatus } from "libs/server-utils/narrative/narrativeLifecycle";
import type { PublicUniverseSnapshotVisibility } from "types/game";
import type { UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * @docHint
 * @purpose owner-only Public Universe Snapshot preview·publish·withdraw contract
 * @process auth  owner scope  allowlist projection  minor/moderation gate  flag-off rollback
 * @domain game.personal-universe.public-snapshot
 * @scope user-api
 */

function value(body: UnknownRecord, key: string, max = 180) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

async function ownerSnapshot(uid: string) {
  const universe = await getPersonalUniverseForOwner(uid, uid);
  if (!universe || universe.status !== "active") throw new Error("PERSONAL_UNIVERSE_NOT_FOUND_OR_FORBIDDEN");
  const canon = await listPublishedPersonalUniverseCanon(universe.personalUniverseId, uid);
  return { universe, content: buildPublicUniverseSnapshotContent(canon) };
}

export const POST = withAuth(
  async (body: UnknownRecord, user) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const action = value(body, "action") || "preview";
      if (!uid || !["preview", "publish", "withdraw"].includes(action)) {
        return NextResponse.json({ ok: false, error: "PUBLIC_SNAPSHOT_INPUT_INVALID" }, { status: 400 });
      }

      if (action === "withdraw") {
        const snapshotId = value(body, "snapshotId");
        if (!snapshotId) return NextResponse.json({ ok: false, error: "PUBLIC_SNAPSHOT_INPUT_INVALID" }, { status: 400 });
        const snapshot = await withdrawPersonalUniversePublicSnapshot({ snapshotId, ownerUid: uid });
        return NextResponse.json({ ok: true, data: { snapshotId: snapshot.snapshotId, visibility: snapshot.visibility, status: snapshot.status } }, { headers: { "Cache-Control": "no-store" } });
      }

      const { universe, content } = await ownerSnapshot(uid);
      const minor = await resolveTrustedMinorStatus(uid);
      const moderation = moderatePublicUniverseSnapshot(content, { isMinor: minor.isMinor });
      if (action === "preview") {
        return NextResponse.json({
          ok: true,
          data: {
            preview: toPublicUniverseSnapshotResponse({ snapshotId: "preview", visibility: "link", content }),
            moderation,
            publicGate: getPersonalUniversePublicGate(),
            minor: { isMinor: minor.isMinor, source: minor.minorSource },
            persisted: false,
            approvalRequired: true,
          },
        }, { headers: { "Cache-Control": "no-store" } });
      }

      const gate = getPersonalUniversePublicGate();
      if (!gate.exposureEnabled) return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_PUBLIC_DISABLED" }, { status: 404 });
      if (!gate.ready) return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_PUBLIC_POLICY_GATE" }, { status: 423 });
      if (minor.isMinor) return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_PUBLIC_MINOR_BLOCKED" }, { status: 403 });
      if (moderation.status !== "approved") return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_PUBLIC_MODERATION_REJECTED", issues: moderation.issues }, { status: 422 });
      if (body.confirmPublicExposure !== true) return NextResponse.json({ ok: false, error: "PUBLIC_SNAPSHOT_CONFIRMATION_REQUIRED" }, { status: 400 });
      const visibility = value(body, "visibility") as PublicUniverseSnapshotVisibility;
      if (visibility !== "link" && visibility !== "public") return NextResponse.json({ ok: false, error: "PUBLIC_SNAPSHOT_VISIBILITY_INVALID" }, { status: 400 });

      const draft = await createPersonalUniversePublicSnapshotDraft({
        ownerUid: uid,
        personalUniverseId: universe.personalUniverseId,
        visibility,
        moderationPolicyVersion: moderation.policyVersion,
        content,
      });
      const snapshot = await publishPersonalUniversePublicSnapshot({ snapshotId: draft.snapshotId, ownerUid: uid });
      return NextResponse.json({
        ok: true,
        data: {
          snapshot: toPublicUniverseSnapshotResponse({ snapshotId: snapshot.snapshotId, visibility: snapshot.visibility as "link" | "public", publishedAt: snapshot.publishedAt, content: snapshot.content }),
          persisted: true,
          approvalRequired: false,
        },
      }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const code = String((error as { message?: unknown })?.message || "PUBLIC_SNAPSHOT_FAILED");
      const status = code.includes("FORBIDDEN") ? 403 : code.includes("NOT_FOUND") ? 404 : code.includes("INPUT_INVALID") ? 400 : 500;
      return NextResponse.json({ ok: false, error: code }, { status, headers: { "Cache-Control": "no-store" } });
    }
  },
  undefined,
  "game/personal-universe/public-snapshot:write",
  { bodyParser: "json" },
);
