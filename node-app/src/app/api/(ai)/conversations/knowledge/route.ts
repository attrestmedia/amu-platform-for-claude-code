import { NextResponse } from "next/server";
import { getConversationKnowledgeModel } from "libs/database/conversations";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getCachedPostDetail } from "libs/api/wp";
import { stripHtmlToText } from "libs/server-utils/api/convertHtmlUtils";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

type KnowledgeRequestPayload = {
  userPersonaId: string;
  personaId: string;
  universeId: string;
  action: string;
  postId?: string | number;
  postIds?: Array<string | number>;
};

/**
 * @docHint
 * @purpose API 라우트((ai) / conversations / knowledge) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain conversations
 * @scope global
 */

function normalizePostId(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.length > 32) return null; // 방어적으로 너무 긴 값은 차단 (키로만 사용)
  return s;
}

function toWpPostIdArg(pid: string): number | string {
  const n = Number.parseInt(pid, 10);
  return Number.isFinite(n) ? n : pid;
}

// Mongodb에 캐릭터의 지식을 저장하는 API
async function handleKnowledgeRequest(data: KnowledgeRequestPayload, user?: AuthenticatedUserType) {
  const serverUserId = String(user?.ID || "");
  if (!serverUserId || serverUserId.startsWith("guest:")) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { userPersonaId, personaId, universeId, action, postId, postIds } = data;
  const KnowledgeModel = await getConversationKnowledgeModel(serverUserId);

  switch (action) {
    case "get":
      // 특정 캐릭터의 지식 목록 조회
      const knowledge = await KnowledgeModel.findOne({
        userPersonaId,
        personaId,
        universeId,
      });
      return NextResponse.json({ knowledge });

    case "add":
      // 새 지식 추가
      const pid = normalizePostId(postId);
      if (!pid) {
        return NextResponse.json({ error: "유효하지 않은 postId 입니다" }, { status: 400 });
      }

      const postDetail = await getCachedPostDetail({ postId: toWpPostIdArg(pid) });
      if (!postDetail) {
        return NextResponse.json({ error: "포스트를 찾을 수 없습니다" }, { status: 404 });
      }

      const now = new Date();
      const knowledgeItem = {
        postId: String(postDetail.id), // postId는 기존 number 데이터도 비교는 toString으로 처리
        title: stripHtmlToText(postDetail.title?.rendered),
        content: stripHtmlToText(postDetail.content?.rendered),
        excerpt: stripHtmlToText(postDetail.excerpt?.rendered),
        categories: postDetail.categories || [],
        tags: postDetail.tags || [],
        dateAdded: now,
        dateUsed: now,
        usageCount: 1,
        effectiveness: 5,
      };

      // postId 기준으로 있으면 업데이트(+1), 없으면 추가(+stats)
      const updated = await KnowledgeModel.findOneAndUpdate(
        { userPersonaId, personaId, universeId },
        [
          // upsert 시에도 키 필드 보장
          {
            $set: {
              userPersonaId,
              personaId,
              universeId,
              knowledgeItems: { $ifNull: ["$knowledgeItems", []] },
              stats: { $ifNull: ["$stats", {}] },
            },
          },
          // postId 존재 여부(기존 number/postId도 문자열 비교로 흡수)
          {
            $set: {
              __has: {
                $in: [
                  String(knowledgeItem.postId),
                  {
                    $map: {
                      input: "$knowledgeItems",
                      as: "it",
                      in: { $toString: "$$it.postId" },
                    },
                  },
                ],
              },
            },
          },
          {
            $set: {
              knowledgeItems: {
                $cond: [
                  "$__has",
                  // exists -> 해당 항목 업데이트(usageCount +1, dateUsed 갱신, 본문/메타 갱신)
                  {
                    $map: {
                      input: "$knowledgeItems",
                      as: "it",
                      in: {
                        $cond: [
                          { $eq: [{ $toString: "$$it.postId" }, String(knowledgeItem.postId)] },
                          {
                            $mergeObjects: [
                              "$$it",
                              {
                                title: knowledgeItem.title,
                                content: knowledgeItem.content,
                                excerpt: knowledgeItem.excerpt,
                                categories: knowledgeItem.categories,
                                tags: knowledgeItem.tags,
                                dateUsed: now,
                                // dateAdded는 보존
                                usageCount: { $add: [{ $ifNull: ["$$it.usageCount", 0] }, 1] },
                              },
                            ],
                          },
                          "$$it",
                        ],
                      },
                    },
                  },
                  // not exists -> append
                  { $concatArrays: ["$knowledgeItems", [knowledgeItem]] },
                ],
              },
              "stats.totalKnowledgeAdded": {
                $add: [{ $ifNull: ["$stats.totalKnowledgeAdded", 0] }, { $cond: ["$__has", 0, 1] }],
              },
              "stats.lastUpdated": now,
            },
          },
          { $unset: "__has" },
        ],
        { upsert: true, new: true }
      );

      return NextResponse.json({ success: true, knowledge: updated });

    case "activate":
      // 활성 지식 설정
      const raw = Array.isArray(postIds) && postIds.length ? postIds : postId != null ? [postId] : [];
      const activeIds = Array.from(new Set(raw.map((v) => normalizePostId(v)).filter(Boolean) as string[])).slice(0, 5);

      if (activeIds.length === 0) {
        return NextResponse.json({ error: "activate 액션에는 postId 또는 postIds가 필요합니다" }, { status: 400 });
      }
      await KnowledgeModel.findOneAndUpdate(
        { userPersonaId, personaId, universeId },
        { $set: { activeKnowledge: activeIds, "stats.lastUpdated": new Date() } },
        { upsert: true }
      );

      return NextResponse.json({ success: true });

    case "remove":
      if (!postId) return NextResponse.json({ error: "remove 액션에는 postId가 필요합니다" }, { status: 400 });
      const rid = normalizePostId(postId);
      if (!rid) return NextResponse.json({ error: "유효하지 않은 postId 입니다" }, { status: 400 });
      const ridNum = Number.parseInt(rid, 10);
      const ridCandidates = Number.isFinite(ridNum) ? [rid, ridNum] : [rid];
      await KnowledgeModel.findOneAndUpdate(
        { userPersonaId, personaId, universeId },
        {
          $pull: {
            knowledgeItems: { postId: { $in: ridCandidates as unknown[] } },
            activeKnowledge: { $in: ridCandidates as unknown[] },
          },
          $set: { "stats.lastUpdated": new Date() },
        }
      );
      return NextResponse.json({ success: true });

    case "list":
      const doc = await KnowledgeModel.findOne({ userPersonaId, personaId, universeId }).lean();
      return NextResponse.json({ knowledge: doc || null });

    default:
      return NextResponse.json({ error: "지원하지 않는 액션입니다" }, { status: 400 });
  }
}

function validateKnowledgeRequest(data: KnowledgeRequestPayload): { valid: boolean; error?: string } {
  const { userPersonaId, personaId, universeId, action } = data;

  if (!userPersonaId || !personaId || !universeId || !action) {
    return {
      valid: false,
      error: "필수 파라미터가 누락되었습니다 (userPersonaId, personaId, universeId, action)",
    };
  }

  // action 타입 검증
  const validActions = ["get", "add", "activate", "remove", "list"];
  if (!validActions.includes(action)) {
    return {
      valid: false,
      error: `지원하지 않는 액션입니다. 유효한 액션: ${validActions.join(", ")}`,
    };
  }

  // add 액션일 때 postId 검증
  if (action === "add" && !data.postId) {
    return {
      valid: false,
      error: "add 액션에는 postId가 필요합니다",
    };
  }

  // activate 액션일 때 postId 또는 postIds 검증
  if (action === "activate" && !data.postId && !data.postIds) {
    return {
      valid: false,
      error: "activate 액션에는 postId 또는 postIds가 필요합니다",
    };
  }

  if (action === "remove" && !data.postId) {
    return { valid: false, error: "remove 액션에는 postId가 필요합니다" };
  }

  return { valid: true };
}

export const POST = withAuth<KnowledgeRequestPayload>(handleKnowledgeRequest, validateKnowledgeRequest, "conversations/knowledge");
