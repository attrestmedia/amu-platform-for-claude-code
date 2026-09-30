import "server-only";

import type {
  IPersonaAuthorProfile,
  PersonaEditPolicyType,
  PersonaForkPolicyType,
  PersonaStatusType,
  PersonaVisibilityType,
} from "types/ai";
import { toUnknownRecord } from "utils/common/typeUtils";

export function getPersonaActorId(user: unknown) {
  const u = toUnknownRecord(user);
  return String(u.uid || u.ID || u.id || u.userEmailLower || u.userEmail || "").trim();
}

export function normalizePersonaVisibility(raw: unknown, fallback: PersonaVisibilityType = "private"): PersonaVisibilityType {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "public" || value === "unlisted" || value === "private") {
    return value;
  }
  return fallback;
}

export function normalizePersonaEditPolicy(raw: unknown, fallback: PersonaEditPolicyType = "owner-only"): PersonaEditPolicyType {
  return String(raw || "").trim().toLowerCase() === "admin-only" ? "admin-only" : fallback;
}

export function normalizePersonaForkPolicy(_raw: unknown, fallback: PersonaForkPolicyType = "fork-on-use"): PersonaForkPolicyType {
  return fallback;
}

export function normalizePersonaStatus(raw: unknown, fallback: PersonaStatusType = "active"): PersonaStatusType {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "archived" || value === "blocked" || value === "active") {
    return value;
  }
  return fallback;
}

export function getPersonaAuthorProfile(user: unknown, fallback?: IPersonaAuthorProfile | null): IPersonaAuthorProfile | null {
  const u = toUnknownRecord(user);
  const userInfo = toUnknownRecord(u.userInfo);
  const displayName = String(userInfo.name || u.name || "").trim().slice(0, 48);
  if (displayName) {
    return { displayName };
  }

  const nextFallback = String(fallback?.displayName || "").trim().slice(0, 48);
  return nextFallback ? { displayName: nextFallback } : null;
}

export function escapeMongoRegex(raw: string) {
  return String(raw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
