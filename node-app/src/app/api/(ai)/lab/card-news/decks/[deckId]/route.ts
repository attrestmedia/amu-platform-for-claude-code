import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  getCardNewsDeck,
  softDeleteCardNewsDeck,
  updateCardNewsDeck,
} from "libs/database/lab/cardNewsDeckRepo";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose CardNews 사용자 덱 단건 조회·autosave·삭제 API
 * @process ownerUid 범위 확인  revision 충돌 방지  soft-delete 및 TTL 파기
 * @domain card-news
 * @scope api
 */

export const runtime = "nodejs";

function safeString(value: unknown) {
  return String(value || "").trim();
}

function uidOf(user: AuthenticatedUserType) {
  return safeString(user?.uid || user?.ID);
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deckIdOf(ctx: NextRouteContext) {
  return decodeURIComponent(safeString(ctx?.params?.deckId));
}

function revisionOf(data: UnknownRecord) {
  return data.revision;
}

const validateMutation = (data: UnknownRecord) => {
  if (!isRecord(data.patch)) return { valid: false, error: "card_news_patch_required" };
  if (!Number.isInteger(revisionOf(data)) || Number(revisionOf(data)) < 1) {
    return { valid: false, error: "card_news_revision_required" };
  }
  return { valid: true };
};

const validateDelete = (data: UnknownRecord) => {
  if (!Number.isInteger(revisionOf(data)) || Number(revisionOf(data)) < 1) {
    return { valid: false, error: "card_news_revision_required" };
  }
  return { valid: true };
};

function notFound() {
  return NextResponse.json({ ok: false, error: "card_news_deck_not_found" }, { status: 404 });
}

function forbidden() {
  return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
}

function conflict(currentRevision: number) {
  return NextResponse.json(
    { ok: false, error: "card_news_deck_revision_conflict", data: { currentRevision } },
    { status: 409 },
  );
}

async function getHandler(_data: UnknownRecord, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const uid = uidOf(user);
  const deckId = deckIdOf(ctx);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  if (!deckId) return NextResponse.json({ ok: false, error: "deckId_required" }, { status: 400 });
  const deck = await getCardNewsDeck({ ownerUid: uid, deckId });
  if (deck === "forbidden") return forbidden();
  return deck ? NextResponse.json({ ok: true, data: deck }) : notFound();
}

async function patchHandler(data: UnknownRecord, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const uid = uidOf(user);
  const deckId = deckIdOf(ctx);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  if (!deckId) return NextResponse.json({ ok: false, error: "deckId_required" }, { status: 400 });
  const result = await updateCardNewsDeck({
    ownerUid: uid,
    deckId,
    patch: data.patch,
    expectedRevision: Number(data.revision),
  });
  if (result.kind === "not_found") return notFound();
  if (result.kind === "forbidden") return forbidden();
  if (result.kind === "conflict") return conflict(result.current.revision);
  return NextResponse.json({ ok: true, data: result.deck });
}

async function deleteHandler(data: UnknownRecord, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const uid = uidOf(user);
  const deckId = deckIdOf(ctx);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  if (!deckId) return NextResponse.json({ ok: false, error: "deckId_required" }, { status: 400 });
  const result = await softDeleteCardNewsDeck({
    ownerUid: uid,
    deckId,
    expectedRevision: Number(data.revision),
  });
  if (result.kind === "not_found") return notFound();
  if (result.kind === "forbidden") return forbidden();
  if (result.kind === "conflict") return conflict(result.current.revision);
  return NextResponse.json({
    ok: true,
    data: {
      deckId: result.deck.deckId,
      state: result.deck.state,
      revision: result.deck.revision,
      deletedAt: result.deck.deletedAt || null,
    },
  });
}

export const GET = withAuth(getHandler, undefined, "lab/card-news/decks:get", { bodyParser: "none" });
export const PATCH = withAuth(patchHandler, validateMutation, "lab/card-news/decks:autosave", { bodyParser: "json" });
export const DELETE = withAuth(deleteHandler, validateDelete, "lab/card-news/decks:delete", { bodyParser: "json" });
