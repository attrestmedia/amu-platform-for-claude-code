import "server-only";
import { randomUUID } from "node:crypto";
import { getRedisClient } from "libs/cache/redisClient";
import { magazineContentRefId } from "./magazineEmbedContract";
import type { MagazineLaunchTokenClaims } from "./magazineEmbedToken";

/**
 * @docHint
 * @purpose Magazine embed에서 browser가 보낸 article context를 서버 권위로 재검증
 * @process bootstrap 시 제한된 context 저장  단기 opaque id 발급  chat/generation 요청에서 재조회
 * @domain magazine-content-experience
 * @scope server-session
 */

const SESSION_TTL_SECONDS = 300;
const SESSION_KEY_PREFIX = "amu:magazine-embed:session:";

export type MagazineEmbedSession = {
  integrationId: string;
  serviceKey: MagazineLaunchTokenClaims["serviceKey"];
  moduleType: MagazineLaunchTokenClaims["moduleType"];
  contentRef: MagazineLaunchTokenClaims["contentRef"];
  contentRefKey: string;
  sectionId: string;
  experienceId: string;
  experienceLevel: string;
  returnSectionId: string;
  templateKey?: string;
  contextKey?: string;
  contextRevision: string;
  contextHash: string;
  parentOrigin: string;
  allowedProps?: MagazineLaunchTokenClaims["allowedProps"];
  articleContext?: {
    title: string;
    question: string;
    intent: string;
  };
};

function sessionKey(id: string) {
  return `${SESSION_KEY_PREFIX}${id}`;
}

function isSafeSessionId(value: unknown): value is string {
  return typeof value === "string" && /^mes_[a-zA-Z0-9_-]{20,120}$/.test(value);
}

export async function createMagazineEmbedSession(claims: MagazineLaunchTokenClaims) {
  const id = `mes_${randomUUID().replaceAll("-", "")}`;
  const session: MagazineEmbedSession = {
    integrationId: claims.integrationId,
    serviceKey: claims.serviceKey,
    moduleType: claims.moduleType,
    contentRef: claims.contentRef,
    contentRefKey: magazineContentRefId(claims.contentRef),
    sectionId: claims.sectionId,
    experienceId: claims.experienceId,
    experienceLevel: claims.experienceLevel,
    returnSectionId: claims.returnSectionId,
    ...(claims.templateKey ? { templateKey: claims.templateKey } : {}),
    ...(claims.contextKey ? { contextKey: claims.contextKey } : {}),
    contextRevision: claims.contextRevision,
    contextHash: claims.contextHash,
    parentOrigin: claims.parentOrigin,
    ...(claims.allowedProps ? { allowedProps: claims.allowedProps } : {}),
    ...(claims.articleContext ? { articleContext: claims.articleContext } : {}),
  };
  const redis = await getRedisClient();
  const result = await redis.set(sessionKey(id), JSON.stringify(session), "EX", SESSION_TTL_SECONDS, "NX");
  if (result !== "OK") throw new Error("magazine_embed_session_store_failed");
  return { id, session };
}

export async function getMagazineEmbedSession(id: unknown): Promise<MagazineEmbedSession | null> {
  if (!isSafeSessionId(id)) return null;
  const redis = await getRedisClient();
  const raw = await redis.get(sessionKey(id));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as MagazineEmbedSession;
    if (!value || (value.moduleType === "tutors_embed" ? value.serviceKey !== "tutors" : value.moduleType === "image_embed" || value.moduleType === "content_embed" ? value.serviceKey !== "gen-studio" : true)) return null;
    if (!value.contentRef || !value.contentRefKey || !value.contextRevision || !value.contextHash) return null;
    return value;
  } catch {
    return null;
  }
}
