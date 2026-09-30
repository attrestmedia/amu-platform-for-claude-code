import { NextResponse } from "next/server";
import { initializeServer } from "libs/initialize";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트((global) / init) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain system
 * @scope internal-api
 */

// 서버 초기화 API 엔드포인트
export async function GET() {
  try {
    await initializeServer(); // 서버 초기화 함수 호출

    return NextResponse.json({ message: "서버 초기화가 성공적으로 완료되었습니다." }, { status: 200 });
  } catch (error) {
    logger.error("서버 초기화 오류:", error);

    return NextResponse.json({ message: toErrorMessage(error, "서버 초기화 중 오류가 발생했습니다.") }, { status: 500 });
  }
}
