import NextAuth from "next-auth";
import { authOptions } from "src/auth"; // 루트의 auth.ts에서 옵션 가져오기

/**
 * @docHint
 * @purpose API 라우트(auth / [...nextauth]) 기능 요청 처리
 * @process 요청 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain auth
 * @scope api
 */

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
