import "server-only";
import crypto from "crypto";
import { wpApiUri } from "consts/env/runtime";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import { buildWordPressRequestHeaders } from "libs/server-utils/wordpressRequestHeaders";

export type WpUser = { id: number; email?: string; name?: string; username?: string; roles?: string[] };
export type WordPressSignupContext = { userId: number; signupCompletedAt: string; registrationSource: string };

function apiOrigin() {
  return new URL(wpApiUri()).origin;
}

async function wpRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { payload } = await resolvePlatformCredential("integration.wordpress.rest");
  const username = String(payload.username || "").trim();
  const applicationPassword = String(payload.applicationPassword || "").trim();
  if (!username || !applicationPassword) {
    throw Object.assign(new Error("WordPress 통합 계정 자격증명이 준비되지 않았습니다."), {
      errorCode: "PLATFORM_CREDENTIAL_UNAVAILABLE",
      status: 503,
    });
  }

  const url = `${apiOrigin()}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: buildWordPressRequestHeaders(url, {
      authorization: `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString("base64")}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...Object.fromEntries(new Headers(init.headers).entries()),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // WordPress 오류 본문을 그대로 보존한다.
  }
  if (!response.ok) {
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    throw Object.assign(new Error(String(record.message || "WordPress 통합 계정 요청에 실패했습니다.")), {
      errorCode: String(record.code || "WORDPRESS_ACCOUNT_ERROR"),
      status: response.status,
    });
  }
  return data as T;
}

export async function findWordPressUserByEmail(email: string): Promise<WpUser | null> {
  const rows = await wpRequest<WpUser[]>(
    `/wp-json/wp/v2/users?context=edit&search=${encodeURIComponent(email.trim().toLowerCase())}&per_page=20`,
  );
  return rows.find((row) => String(row.email || "").toLowerCase() === email.trim().toLowerCase()) || null;
}

export async function getWordPressUserById(userId: number): Promise<WpUser | null> {
  try {
    return await wpRequest<WpUser>(`/wp-json/wp/v2/users/${userId}?context=edit`);
  } catch (error) {
    if (Number((error as { status?: unknown }).status) === 404) return null;
    throw error;
  }
}

function buildUsername(email: string) {
  const local = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 28) || "amu";
  return `${local}-${crypto.randomBytes(4).toString("hex")}`;
}

export async function createWordPressAccount(args: {
  email: string;
  name?: string;
  password?: string;
}): Promise<WpUser> {
  return wpRequest<WpUser>("/wp-json/wp/v2/users", {
    method: "POST",
    body: JSON.stringify({
      username: buildUsername(args.email),
      email: args.email.trim().toLowerCase(),
      name: args.name?.trim() || args.email.split("@")[0],
      password: args.password || crypto.randomBytes(32).toString("base64url"),
      roles: ["customer"],
    }),
  });
}

export async function ensureWordPressAccount(args: { email: string; name?: string }) {
  return (await findWordPressUserByEmail(args.email)) || createWordPressAccount(args);
}

export async function saveWordPressPolicyConsents(userId: number, consents: unknown[]) {
  await wpRequest("/wp-json/amu/v1/account/consent", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, consents }),
  });
}

export async function saveWordPressEmailVerification(
  userId: number,
  input: { email: string; method: string; verifiedAt: Date },
) {
  await wpRequest("/wp-json/amu/v1/account/email-verification", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      email: input.email.trim().toLowerCase(),
      method: input.method,
      verified_at: input.verifiedAt.toISOString(),
    }),
  });
}

export async function getWordPressSignupContext(userId: number) {
  return wpRequest<WordPressSignupContext>(`/wp-json/amu/v1/account/signup-context?user_id=${userId}`);
}

export async function suspendWordPressAccount(userId: number) {
  await wpRequest("/wp-json/amu/v1/account/status", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, status: "deletion_pending" }),
  });
}

export async function deleteWordPressAccount(userId: number) {
  const administrator = await wpRequest<WpUser>("/wp-json/wp/v2/users/me?context=edit");
  if (administrator.id === userId) {
    throw Object.assign(new Error("운영 관리자 계정은 자동 탈퇴할 수 없습니다."), {
      errorCode: "ADMIN_ACCOUNT_DELETION_FORBIDDEN",
      status: 403,
    });
  }
  return wpRequest(`/wp-json/wp/v2/users/${userId}?force=true&reassign=${administrator.id}`, { method: "DELETE" });
}
