import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  createCardNewsDeck,
  listCardNewsDecks,
} from "libs/database/lab/cardNewsDeckRepo";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import type { UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose CardNews 사용자 덱 생성·목록 API
 * @process 인증 사용자 ownerUid 고정  덱 생성  정렬·페이지 목록 조회
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

function createPayload(data: UnknownRecord) {
  if (data.deck === undefined) return data;
  return isRecord(data.deck) ? data.deck : null;
}

const validateCreate = (data: UnknownRecord) => {
  if (!isRecord(data)) return { valid: false, error: "invalid_card_news_deck_request" };
  if (data.deck !== undefined && !isRecord(data.deck)) return { valid: false, error: "invalid_card_news_deck_payload" };
  return { valid: true };
};

async function createHandler(data: UnknownRecord, user: AuthenticatedUserType, _req: NextRequest, _ctx: NextRouteContext) {
  const uid = uidOf(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const payload = createPayload(data);
  if (payload === null) return NextResponse.json({ ok: false, error: "invalid_card_news_deck_payload" }, { status: 400 });
  const deck = await createCardNewsDeck({ ownerUid: uid, payload });
  return NextResponse.json({ ok: true, data: deck }, { status: 201 });
}

async function listHandler(_data: UnknownRecord, user: AuthenticatedUserType, req: NextRequest, _ctx: NextRouteContext) {
  const uid = uidOf(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const sortValue = req.nextUrl.searchParams.get("sort");
  const orderValue = req.nextUrl.searchParams.get("order");
  const sort = sortValue === "createdAt" || sortValue === "title" ? sortValue : "updatedAt";
  const order = orderValue === "asc" ? "asc" : "desc";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 20);
  const skip = Number(req.nextUrl.searchParams.get("skip") || 0);
  const data = await listCardNewsDecks({ ownerUid: uid, sort, order, limit, skip });
  return NextResponse.json({ ok: true, data });
}

export const POST = withAuth(createHandler, validateCreate, "lab/card-news/decks:create", { bodyParser: "json" });
export const GET = withAuth(listHandler, undefined, "lab/card-news/decks:list", { bodyParser: "none" });
