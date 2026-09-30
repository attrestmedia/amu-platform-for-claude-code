import "server-only";
import crypto from "crypto";
import { isExactOrigin, isValidMagazineEmbedAllowedProps, MAGAZINE_CAPABILITIES, MAGAZINE_DYNAMIC_MODULES, MAGAZINE_SERVICE_KEYS, type MagazineCapability, type MagazineContentRef, type MagazineDynamicModule, type MagazineEmbedAllowedProps, type MagazineServiceKey } from "./magazineEmbedContract";

/**
 * @docHint
 * @purpose Magazine embed launch token 발급·검증·one-time consume
 * @process HMAC 서명  300초 이하 TTL  Redis NX atomic replay 방지
 * @domain magazine-content-experience
 * @scope server-security
 */

const TOKEN_VERSION = "magazine-embed.v2";
const TOKEN_TTL_SECONDS = 300;
const TOKEN_KEY_PREFIX = "amu:magazine-embed:launch:";

export interface MagazineLaunchTokenClaims {
  v: typeof TOKEN_VERSION;
  integrationId: string;
  serviceKey: MagazineServiceKey;
  moduleType: MagazineDynamicModule;
  contentRef: MagazineContentRef;
  sectionId: string;
  experienceId: string;
  experienceLevel: string;
  returnSectionId: string;
  templateKey?: string;
  contextKey?: string;
  allowedProps?: MagazineEmbedAllowedProps;
  capabilities: MagazineCapability[];
  contextRevision: string;
  contextHash: string;
  parentOrigin: string;
  requestId: string;
  nonce: string;
  jti: string;
  iat: number;
  exp: number;
  returnUrl: string;
  articleContext?: {
    title: string;
    question: string;
    intent: string;
  };
}

export class MagazineLaunchTokenError extends Error {
  public readonly code: "not_configured" | "malformed" | "invalid_signature" | "expired" | "replayed" | "store_unavailable";

  constructor(code: "not_configured" | "malformed" | "invalid_signature" | "expired" | "replayed" | "store_unavailable") {
    super(code);
    this.name = "MagazineLaunchTokenError";
    this.code = code;
  }
}

function getSecret() {
  return String(process.env.MAGAZINE_EMBED_TOKEN_SECRET || "").trim();
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(input: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

function safeTokenPart(value: string) {
  return /^[A-Za-z0-9_-]{1,4096}$/.test(value);
}

function safeEqual(a: string, b: string) {
  if (!safeTokenPart(a) || !safeTokenPart(b)) return false;
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function isValidContentRefInClaims(value: unknown): value is MagazineContentRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = value as MagazineContentRef;
  if (ref.kind === "wp_post") return Number.isSafeInteger(ref.postId) && (ref.postId as number) > 0 && typeof ref.postSlug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref.postSlug);
  if (ref.kind === "app_content") return typeof ref.contentId === "string" && /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(ref.contentId) && typeof ref.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref.slug);
  return false;
}

export function issueMagazineLaunchToken(args: Omit<MagazineLaunchTokenClaims, "v" | "nonce" | "jti" | "iat" | "exp"> & { nowMs?: number; ttlSeconds?: number }) {
  const secret = getSecret();
  if (!secret) throw new MagazineLaunchTokenError("not_configured");
  const nowMs = args.nowMs ?? Date.now();
  const ttlSeconds = Math.max(1, Math.min(TOKEN_TTL_SECONDS, Math.floor(args.ttlSeconds ?? TOKEN_TTL_SECONDS)));
  const claims: MagazineLaunchTokenClaims = {
    ...args,
    v: TOKEN_VERSION,
    nonce: crypto.randomBytes(18).toString("base64url"),
    jti: crypto.randomBytes(24).toString("base64url"),
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const payload = encode(JSON.stringify(claims));
  return { token: `${payload}.${sign(payload, secret)}`, claims, expiresIn: ttlSeconds };
}

export function verifyMagazineLaunchToken(token: unknown, nowMs = Date.now()): MagazineLaunchTokenClaims {
  const secret = getSecret();
  if (!secret) throw new MagazineLaunchTokenError("not_configured");
  if (typeof token !== "string" || token.length > 12_000) throw new MagazineLaunchTokenError("malformed");
  const parts = token.split(".");
  if (parts.length !== 2 || !safeTokenPart(parts[0]) || !safeTokenPart(parts[1]) || !safeEqual(sign(parts[0], secret), parts[1])) throw new MagazineLaunchTokenError("invalid_signature");
  let claims: Partial<MagazineLaunchTokenClaims>;
  try {
    claims = JSON.parse(decode(parts[0])) as Partial<MagazineLaunchTokenClaims>;
  } catch {
    throw new MagazineLaunchTokenError("malformed");
  }
  if (claims.v !== TOKEN_VERSION || typeof claims.integrationId !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(claims.integrationId) || typeof claims.serviceKey !== "string" || !MAGAZINE_SERVICE_KEYS.includes(claims.serviceKey as MagazineServiceKey) || typeof claims.moduleType !== "string" || !MAGAZINE_DYNAMIC_MODULES.includes(claims.moduleType as MagazineDynamicModule) || ((claims.moduleType === "tutors_embed" && claims.serviceKey !== "tutors") || (claims.moduleType !== "tutors_embed" && claims.serviceKey !== "gen-studio")) || !isValidContentRefInClaims(claims.contentRef) || typeof claims.sectionId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(claims.sectionId) || typeof claims.returnSectionId !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(claims.returnSectionId) || typeof claims.parentOrigin !== "string" || !isExactOrigin(claims.parentOrigin) || typeof claims.contextRevision !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(claims.contextRevision) || typeof claims.contextHash !== "string" || !/^[a-f0-9]{64}$/.test(claims.contextHash) || typeof claims.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(claims.requestId) || typeof claims.nonce !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.nonce) || typeof claims.jti !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.jti) || typeof claims.iat !== "number" || typeof claims.exp !== "number" || !Array.isArray(claims.capabilities) || claims.capabilities.length > 3 || !claims.capabilities.every((value) => typeof value === "string" && MAGAZINE_CAPABILITIES.includes(value as MagazineCapability)) || (claims.allowedProps !== undefined && !isValidMagazineEmbedAllowedProps(claims.allowedProps)) || (claims.articleContext !== undefined && (!claims.articleContext || typeof claims.articleContext.title !== "string" || typeof claims.articleContext.question !== "string" || typeof claims.articleContext.intent !== "string" || claims.articleContext.title.length > 240 || claims.articleContext.question.length > 400 || claims.articleContext.intent.length > 80))) throw new MagazineLaunchTokenError("malformed");
  const nowSec = Math.floor(nowMs / 1000);
  if (claims.exp <= nowSec || claims.iat > nowSec + 30 || claims.exp - claims.iat > TOKEN_TTL_SECONDS) throw new MagazineLaunchTokenError("expired");
  return claims as MagazineLaunchTokenClaims;
}

export async function consumeMagazineLaunchToken(token: unknown, nowMs = Date.now()) {
  const claims = verifyMagazineLaunchToken(token, nowMs);
  const ttl = Math.max(1, claims.exp - Math.floor(nowMs / 1000));
  try {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    const result = await redis.set(`${TOKEN_KEY_PREFIX}${claims.jti}`, "1", "EX", ttl, "NX");
    if (result !== "OK") throw new MagazineLaunchTokenError("replayed");
    return claims;
  } catch (error) {
    if (error instanceof MagazineLaunchTokenError) throw error;
    throw new MagazineLaunchTokenError("store_unavailable");
  }
}
