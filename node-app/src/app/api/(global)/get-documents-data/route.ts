import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { dbConnect } from "libs/database/mongoose";
import {
  MONGODB_AI_URL,
  MONGODB_AMU_URL,
  MONGODB_BILLING_URL,
  MONGODB_CATALOG_URL,
  MONGODB_CONVERSATIONS_URL,
  MONGODB_GAME_URL,
  MONGODB_LOGS_URL,
  MONGODB_PERSONA_URL,
  MONGODB_SECRETS_URL,
  MONGODB_USERS_URL,
  MONGODB_URL,
} from "consts/env/server";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

/**
 * @docHint
 * @purpose API 라우트((global) / get-documents-data) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain admin
 * @scope internal-api
 */

const DOCUMENT_DB_POLICIES = {
  default: { uri: MONGODB_URL, collections: ["app_settings"] },
  ai: {
    uri: MONGODB_AI_URL,
    collections: [
      "content_assets",
      "content_gen_jobs",
      "content_prompts",
      "image_assets",
      "image_gen_jobs",
      "image_prompts",
      "marketing_assets",
      "marketing_jobs",
      "system_personas",
    ],
  },
  amu: { uri: MONGODB_AMU_URL, collections: ["profiles", "universe_details", "universes", "wp_caches"] },
  billing: { uri: MONGODB_BILLING_URL, collections: ["coin_usages", "payments"] },
  catalog: { uri: MONGODB_CATALOG_URL, collections: ["products"] },
  conversations: {
    uri: MONGODB_CONVERSATIONS_URL,
    collections: ["npc_usages"],
    prefixes: ["conversation_", "knowledge_", "message_"],
  },
  game: { uri: MONGODB_GAME_URL, collections: ["stages"] },
  logs: { uri: MONGODB_LOGS_URL, collections: ["login_logs"] },
  persona: { uri: MONGODB_PERSONA_URL, collections: ["system_personas"], prefixes: ["personas_", "user_personas_"] },
  secrets: { uri: MONGODB_SECRETS_URL, collections: ["credentials"] },
  users: { uri: MONGODB_USERS_URL, collections: ["rate_limits"], prefixes: ["user_"] },
} as const;

const SAFE_COLLECTION_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const SAFE_FILTER_KEYS = new Set([
  "_id",
  "id",
  "uid",
  "pid",
  "name",
  "slug",
  "key",
  "universeId",
  "userId",
  "category",
  "status",
  "type",
  "stageId",
  "stageName",
]);

function normalizeDbPolicyKey(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^mongodb_/, "")
    .replace(/_url$/, "");
}

function isCollectionAllowed(policy: (typeof DOCUMENT_DB_POLICIES)[keyof typeof DOCUMENT_DB_POLICIES], collectionName: string) {
  if (!SAFE_COLLECTION_RE.test(collectionName)) return false;
  if ((policy.collections as readonly string[]).includes(collectionName)) return true;
  return (policy as { prefixes?: readonly string[] }).prefixes?.some((prefix) => collectionName.startsWith(prefix)) || false;
}

function isSafeFilterValue(value: unknown) {
  if (value == null) return false;
  return ["string", "number", "boolean"].includes(typeof value);
}

function assignSafeQueryFilter(query: Record<string, unknown>, filterRaw: string | null) {
  if (!filterRaw) return true;

  try {
    const filterObj: unknown = JSON.parse(filterRaw);
    if (!filterObj || typeof filterObj !== "object" || Array.isArray(filterObj)) return false;

    for (const [key, value] of Object.entries(filterObj as Record<string, unknown>)) {
      if (!SAFE_FILTER_KEYS.has(key) || !isSafeFilterValue(value)) return false;
      query[key] = value;
    }
    return true;
  } catch (error) {
    logger.error("filter 파라미터 JSON 파싱 오류:", error);
    return false;
  }
}

async function handleGET(_data: unknown, _user: AuthenticatedUserType, request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // ** 사용할 데이터베이스 이름 (필수)
    const dbName = normalizeDbPolicyKey(searchParams.get("db") || "");
    const dbPolicy = DOCUMENT_DB_POLICIES[dbName as keyof typeof DOCUMENT_DB_POLICIES];
    if (!dbPolicy) {
      return NextResponse.json({ error: "데이터베이스 이름(db) 파라미터를 제공해주세요." }, { status: 400 });
    }

    // ** 컬렉션 이름 (필수)
    const collectionName = searchParams.get("collection");
    if (!collectionName) {
      return NextResponse.json({ error: "컬렉션 이름(collection) 파라미터를 제공해주세요." }, { status: 400 });
    }
    if (!isCollectionAllowed(dbPolicy, collectionName)) {
      return NextResponse.json({ error: "허용되지 않은 컬렉션입니다." }, { status: 403 });
    }

    // 쿼리 조건 생성 - 기본적으로 id, uid, pid, name을 지원
    const query: Record<string, unknown> = {};
    if (searchParams.get("id")) query._id = searchParams.get("id");
    if (searchParams.get("uid")) query.uid = searchParams.get("uid");
    if (searchParams.get("pid")) query.pid = searchParams.get("pid");
    if (searchParams.get("name")) query.name = searchParams.get("name");

    // 추가로 JSON 형식의 filter 파라미터를 받아 조건에 병합할 수 있습니다.
    if (!assignSafeQueryFilter(query, searchParams.get("filter"))) {
      return NextResponse.json({ error: "filter 파라미터 형식이 올바르지 않습니다." }, { status: 400 });
    }

    if (!dbPolicy.uri) {
      return NextResponse.json({ error: "MongoDB URI가 제공되지 않았습니다." }, { status: 500 });
    }

    try {
      // dbConnect 함수를 사용하여 해당 데이터베이스에 연결
      const dbConn = await dbConnect(dbPolicy.uri);

      if (!dbConn.db) {
        return NextResponse.json({ error: "데이터베이스 연결에 실패했습니다." }, { status: 500 });
      }

      // 컬렉션 존재 확인 (런타임 비용이 큰 작업으로 최적화함)
      const collections = await dbConn.db.listCollections({ name: collectionName }).toArray();

      if (collections.length === 0) {
        logger.warn(`컬렉션 '${collectionName}'이 데이터베이스 '${dbName}'에 존재하지 않습니다.`);
        return NextResponse.json({ data: [] }, { status: 200 });
      }

      // 컬렉션에 쿼리 실행
      const documents = await dbConn.db.collection(collectionName).find(query).toArray();
      return NextResponse.json({ data: documents }, { status: 200 });
    } catch (dbError) {
      logger.error(`데이터베이스 작업 중 오류: ${dbError}`);
      return NextResponse.json({ error: "데이터베이스 작업 중 오류가 발생했습니다." }, { status: 500 });
    }
  } catch (error) {
    logger.error("데이터 조회 중 오류 발생:", error);
    return NextResponse.json({ error: toErrorMessage(error, "internal_error") }, { status: 500 });
  }
}

export const GET = withAuth(handleGET, undefined, "admin/get-documents-data", {
  requireAdmin: true,
  bodyParser: "none",
});
