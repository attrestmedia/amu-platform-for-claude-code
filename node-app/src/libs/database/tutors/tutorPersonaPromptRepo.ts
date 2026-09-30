import { resolveTutorPersonaReadAccess } from "libs/services/tutors/tutorGiftGrants";

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process get 작업  DB 조회/저장 수행
 * @domain tutors
 * @scope user-specific (사용자별 독립 컬렉션)
 */

// tutors 전용: "유저 tutors 컬렉션"에서 페르소나를 프롬프트 구성에 필요한 최소 필드로 로드
// - tutorsPolicy / tutorIntro / tutorsUi 포함
export async function getTutorPersonaForPrompt(user: unknown, pid: string) {
  const p = String(pid || "").trim();
  if (!p) return null;

  const resolved = await resolveTutorPersonaReadAccess(user, p);
  return resolved.persona || null;
}
