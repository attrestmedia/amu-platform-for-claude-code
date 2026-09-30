import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { validateTutorsStateSettings } from "libs/services/tutors/tutorsState";
import { getTutorsState, updateTutorsState } from "libs/services/tutors/tutorsStateHandlers";

/**
 * @docHint
 * @purpose API 라우트((app) / tutors / state) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain tutors
 * @scope api
 */

export const GET = withAuth(
  async (_data, user) => withApiTimeout(() => getTutorsState(user), 15000),
  undefined,
  "tutors/state_get"
);

export const POST = withAuth(
  async (data, user) => {
    const validation = validateTutorsStateSettings(data);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: `${validation.field} 값이 유효하지 않습니다.`,
          errorCode: validation.errorCode,
          field: validation.field,
        },
        { status: 400 },
      );
    }
    return withApiTimeout(() => updateTutorsState(data, user), 15000);
  },
  undefined,
  "tutors/state_post"
);
