import "server-only";
import { NextRequest } from "next/server";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process 입력 검증  비즈니스 로직 수행  결과 포맷팅
 * @domain api-middleware
 * @scope global
 */

// 미들웨어가 핸들러에 전달하는 사용자 객체
// auth 검증 + DB 병합으로 동적으로 채워지는 필드를 포함하기 위해 any 사용 (handler 측 호환 유지)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuthenticatedUserType = any;

// Next 라우트 컨텍스트 — params shape은 라우트별로 달라지므로 핸들러가 자체 선언하는 타입을 따른다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NextRouteContext = { params: any };

export type RequestValidator<T> = (data: T) => { valid: boolean; error?: string };
// 라우트 핸들러 시그니처 — data/result는 핸들러가 자체 선언하는 타입을 따른다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiHandler<T = any, R = any> = (
  data: T,
  user: AuthenticatedUserType,
  request: NextRequest,
  context: NextRouteContext,
) => Promise<R>;
export type BodyParserMode = "auto" | "json" | "none";
