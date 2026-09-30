import "server-only";

import { NEXTAUTH_URL } from "consts/env/server";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function resolveOriginFromEnv() {
  const raw = toSafeString(NEXTAUTH_URL).replace(/\/+$/, "");
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function buildLinkedInMemberAuthUrl(path: string, request?: Request | null) {
  const origin = resolveOriginFromEnv() || (request ? new URL(request.url).origin : "");
  return new URL(path, origin).toString();
}
