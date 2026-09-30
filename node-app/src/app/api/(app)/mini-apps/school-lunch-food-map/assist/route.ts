import type { SchoolLunchAssistRequestType, SchoolLunchAssistResponseType } from "types/app";
import { NextResponse } from "next/server";
import { CONTENT_STUDIO_NAMESPACE_KEY } from "consts/app/services";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { handleUserContentCustom } from "libs/server-utils/api/contentBasicHandler";
import { parseJsonSafe } from "utils/data";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose API 라우트((app) / mini-apps / school-lunch-food-map / assist) 기능 요청 처리
 * @process POST 요청 파싱  인증 검증  음식 설명 프롬프트 생성  텍스트 AI 생성  JSON 파싱  응답 반환
 * @domain mini-app.school-lunch
 * @scope server_route
 */

function safeText(value: unknown, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function extractFirstJsonObject(raw: string) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  const direct = parseJsonSafe(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const parsed = parseJsonSafe(fenced[1]);
    if (parsed) return parsed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return parseJsonSafe(trimmed.slice(start, end + 1));
  }

  return null;
}

function validateAssistBody(data: SchoolLunchAssistRequestType) {
  if (!safeText(data?.schoolName, 120)) return { valid: false, error: "schoolName_required" };
  if (!safeText(data?.mealDate, 20)) return { valid: false, error: "mealDate_required" };
  if (!safeText(data?.dishName, 120)) return { valid: false, error: "dishName_required" };
  if (!safeText(data?.dishRole, 40)) return { valid: false, error: "dishRole_required" };
  return { valid: true };
}

function buildAssistPrompt(data: SchoolLunchAssistRequestType) {
  const rawMenu = Array.isArray(data?.rawMenu) ? data.rawMenu.map((item) => safeText(item, 120)).filter(Boolean) : [];
  const allergyCodes = Array.isArray(data?.allergyCodes)
    ? data.allergyCodes.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [];

  return [
    "너는 초등학생과 중학생이 읽는 학교 급식 도우미다.",
    "설명은 쉽고 짧고 친절해야 한다.",
    "의학적 단정 표현은 금지하고, '도움을 줄 수 있어요' 같은 표현을 사용한다.",
    "반드시 JSON 한 개만 반환한다.",
    `학교명: ${safeText(data?.schoolName, 120)}`,
    `급식일: ${safeText(data?.mealDate, 20)}`,
    `음식명: ${safeText(data?.dishName, 120)}`,
    `음식 역할: ${safeText(data?.dishRole, 40)}`,
    rawMenu.length ? `전체 메뉴: ${rawMenu.join(", ")}` : "",
    allergyCodes.length ? `알레르기 코드: ${allergyCodes.join(", ")}` : "",
    "JSON schema:",
    '{"title":"","benefitTitle":"","benefitBody":"","whyEat":"","tasteNote":"","tryTip":"","caution":""}',
    "규칙:",
    "- benefitTitle은 16자 안팎의 짧은 문장",
    "- benefitBody, whyEat, tasteNote, tryTip, caution은 각 1~2문장",
    "- tryTip은 잘 못 먹는 아이도 시도할 수 있는 부드러운 제안",
    "- caution은 알레르기 또는 맵기/식감 주의가 있으면 짧게 설명",
  ]
    .filter(Boolean)
    .join("\n");
}

function fallbackAssist(data: SchoolLunchAssistRequestType, coinsUsed: number): SchoolLunchAssistResponseType {
  return {
    title: safeText(data?.dishName, 120),
    benefitTitle: "한 입씩 익숙해져도 좋아요",
    benefitBody: "급식 음식은 여러 재료를 조금씩 경험해보는 데 도움을 줄 수 있어요.",
    whyEat: "처음부터 많이보다 한 입씩 천천히 먹어보면 부담이 덜할 수 있어요.",
    tasteNote: "음식마다 식감과 향이 달라서 반찬과 함께 먹으면 더 편할 수 있어요.",
    tryTip: "밥이나 다른 반찬과 같이 먹으면서 맛을 천천히 익혀보세요.",
    caution: "알레르기나 강한 맛이 걱정되면 먼저 재료를 확인하는 것이 좋아요.",
    billing: {
      coinsUsed,
    },
  };
}

async function handlePOST(data: SchoolLunchAssistRequestType, user: unknown) {
  const result = await handleUserContentCustom(
    {
      prompt: buildAssistPrompt(data),
      generationMode: "custom",
      n: 1,
      modelName: safeText(data?.modelName, 120) || undefined,
      provider: data?.provider,
      maxOutputTokens: 400,
    },
    user,
    {
      routeMeta: "mini-apps/school-lunch-food-map/assist",
      appBillingKey: CONTENT_STUDIO_NAMESPACE_KEY,
    },
  );

  const resultRecord = toUnknownRecord(result);
  const resultData = toUnknownRecord(resultRecord.data);

  if (!resultRecord.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: String(resultRecord.error || "school_lunch_assist_failed"),
        errorCode: String(resultRecord.errorCode || ""),
      },
      { status: 500 },
    );
  }

  const contents = Array.isArray(resultData.contents) ? resultData.contents : [];
  const content = String(contents[0] || "").trim();
  const parsed = toUnknownRecord(extractFirstJsonObject(content));
  const coinsUsed = Number(resultData.coins || 0);

  const response: SchoolLunchAssistResponseType = {
    ...fallbackAssist(data, coinsUsed),
    title: safeText(parsed?.title || data?.dishName, 120),
    benefitTitle: safeText(parsed?.benefitTitle, 60) || "한 입씩 익숙해져도 좋아요",
    benefitBody:
      safeText(parsed?.benefitBody, 240) || "급식 음식은 여러 재료를 조금씩 경험해보는 데 도움을 줄 수 있어요.",
    whyEat: safeText(parsed?.whyEat, 240) || "처음부터 많이보다 한 입씩 천천히 먹어보면 부담이 덜할 수 있어요.",
    tasteNote:
      safeText(parsed?.tasteNote, 240) || "음식마다 식감과 향이 달라서 반찬과 함께 먹으면 더 편할 수 있어요.",
    tryTip: safeText(parsed?.tryTip, 240) || "밥이나 다른 반찬과 같이 먹으면서 맛을 천천히 익혀보세요.",
    caution: safeText(parsed?.caution, 240) || "알레르기나 강한 맛이 걱정되면 먼저 재료를 확인하는 것이 좋아요.",
    billing: {
      coinsUsed,
    },
  };

  return {
    ok: true,
    data: response,
  };
}

export const POST = withAuth(handlePOST, validateAssistBody, "mini-apps/school-lunch-food-map/assist", {
  bodyParser: "json",
});
