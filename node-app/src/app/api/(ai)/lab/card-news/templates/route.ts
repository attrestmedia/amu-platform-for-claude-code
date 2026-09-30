import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { listCardNewsTemplateRegistry } from "libs/database/lab";
import {
  CARD_NEWS_BUILT_IN_TEMPLATE_VERSION,
  type CardNewsTemplateRegistryEntry,
} from "types/card-news";
import {
  listCardNewsTemplatePresets,
  toBuiltInCardNewsTemplateRegistryEntry,
} from "libs/card-news/templateResolver";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 인증 사용자가 선택할 수 있는 활성 CardNews 템플릿 목록
 * @process DB status override·built-in fallback·inactive template 차단
 * @domain card-news
 * @scope api
 */

function refKey(id: string, version: number) {
  return `${id}@${version}`;
}

async function getHandler(_data: unknown, _user: AuthenticatedUserType) {
  const stored = await listCardNewsTemplateRegistry();
  const storedByRef = new Map(stored.map((entry) => [refKey(entry.id, entry.version), entry]));
  const builtIns = listCardNewsTemplatePresets()
    .filter((preset) => preset.version === CARD_NEWS_BUILT_IN_TEMPLATE_VERSION)
    .map((preset) => {
      const storedEntry = storedByRef.get(refKey(preset.id, preset.version));
      return storedEntry || toBuiltInCardNewsTemplateRegistryEntry(preset);
    })
    .filter((entry) => entry.status === "active");
  const builtInRefs = new Set(builtIns.map((entry) => refKey(entry.id, entry.version)));
  const customEntries = stored.filter((entry) => entry.status === "active" && !builtInRefs.has(refKey(entry.id, entry.version)));
  const entries = [...builtIns, ...customEntries];
  return NextResponse.json({
    ok: true,
    data: entries.map((entry: CardNewsTemplateRegistryEntry) => entry.preset),
  }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withAuth(getHandler, undefined, "lab/card-news/templates:list", { bodyParser: "none" });
