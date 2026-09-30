import "server-only";
import { logger } from "utils/log";
import { toUnknownRecord, isUnknownRecord, type UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "./middlewareTypes";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process mergeAuthAndDbUser 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain auth
 * @scope global
 */

function cleanStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cleaned = v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);

  if (!cleaned.length) return undefined;

  // 중복 제거(대소문자 보존은 하되 비교는 lower로)
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const r of cleaned) {
    const k = r.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(r);
  }
  return uniq;
}

function normalizeId(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

// authUser: 인증/정체성의 권위 (ID/uid 등)
// dbUser: 프로젝트 정책/권한의 권위 (roles/accountType/userInfo 등)**
// - 소셜 로그인 사용자라도 프로젝트 DB에 같은 ID로 저장된 권한(예: 관리자)이 있으면 그 권한을 반영할 수 있어야 함
export function mergeAuthAndDbUser(authUser: unknown, dbUser: unknown | null): AuthenticatedUserType {
  const a = toUnknownRecord(authUser);
  const d: UnknownRecord | null = isUnknownRecord(dbUser) ? dbUser : null;

  // 1) 기본은 auth를 권위로 두고, 표시/프로필성 데이터만 db를 섞는 형태로 시작
  //    (일단 db -> auth 순으로 깔고, 이후 "권한/정책"은 db 우선으로 덮어씀)
  const merged: UnknownRecord = { ...(d || {}), ...a };

  // 2) 정체성은 auth 고정(혹시 db가 이상한 값으로 들어와도 방어)
  if (a.ID != null) merged.ID = a.ID;
  if (a.uid != null) merged.uid = a.uid;

  // 3) auth/db ID가 다르면(원래는 getUserFromDB(authId)라 거의 없겠지만) 권한 승격은 보수적으로
  const authId = normalizeId(a.ID || a.uid);
  const dbId = normalizeId(d?.ID || d?.uid);
  const idMismatch = Boolean(authId && dbId && authId !== dbId);

  if (idMismatch) {
    logger.warn("mergeAuthAndDbUser: auth/db id mismatch - privileged merge skipped", { authId, dbId });
  }

  // 4) 권한/정책 필드: 목적상 DB 우선
  if (!idMismatch && d) {
    const dbRoles = cleanStringArray(d.roles);
    if (dbRoles) merged.roles = dbRoles;

    const dbAccountType = typeof d.accountType === "string" ? d.accountType.trim() : "";
    if (dbAccountType) merged.accountType = dbAccountType;

    // userInfo는 프로젝트 설정값이 섞이는 영역이라 db 우선 + auth 일부 유지(필요시)
    const authInfo = isUnknownRecord(a.userInfo) ? a.userInfo : {};
    const dbInfo = isUnknownRecord(d.userInfo) ? d.userInfo : null;
    if (dbInfo) merged.userInfo = { ...authInfo, ...dbInfo };
  }

  // 5) userEmail 보강 (auth/db 어느쪽이든 있는 걸 채움)
  if (!merged.userEmail) {
    merged.userEmail = d?.userEmail ?? merged.email ?? null;
  }

  // 6) userEmailLower 보강
  if (!merged.userEmailLower && merged.userEmail) {
    merged.userEmailLower = String(merged.userEmail).toLowerCase();
  }

  return merged as AuthenticatedUserType;
}
