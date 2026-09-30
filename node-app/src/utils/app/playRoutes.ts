import type { IUniverse, UniverseBasePath } from "types/game";
import { sanitizeDescription } from "utils/common";
import { getCurrentLanguage } from "utils/language";

export const PLAY_ROUTE_ROOT = "/play" as const;
export const STORE_ROUTE_ROOT = "/store" as const;

const ROUTE_ROOTS: Record<UniverseBasePath, string> = {
  play: PLAY_ROUTE_ROOT,
  store: STORE_ROUTE_ROOT,
};

function normalizeBasePath(value?: string | null): UniverseBasePath | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "play" || raw === "store") return raw;
  return null;
}

function detectBasePathFromLocation(): UniverseBasePath {
  if (typeof window === "undefined") return "play";

  const pathname = String(window.location.pathname || "").trim();
  if (pathname === STORE_ROUTE_ROOT || pathname.indexOf(`${STORE_ROUTE_ROOT}/`) === 0) return "store";
  return "play";
}

function resolveBasePath(options?: {
  basePath?: UniverseBasePath | null;
  universe?: Pick<IUniverse, "type" | "typeSpecific"> | null;
}): UniverseBasePath {
  const direct = normalizeBasePath(options?.basePath);
  if (direct) return direct;

  const preferred = normalizeBasePath(options?.universe?.typeSpecific?.routing?.preferredBasePath);
  if (preferred && (options?.universe?.type === "commerce" || preferred === "play")) {
    return preferred;
  }

  return detectBasePathFromLocation();
}

function encodePathSegment(value: string) {
  return encodeURIComponent(String(value || "").trim());
}

export function getUniverseHomePath(
  universeId?: string | null,
  options?: {
    basePath?: UniverseBasePath | null;
    universe?: Pick<IUniverse, "type" | "typeSpecific"> | null;
  },
) {
  const id = String(universeId || "").trim();
  const root = ROUTE_ROOTS[resolveBasePath(options)];
  return id ? `${root}/${encodePathSegment(id)}` : root;
}

export function getPlayPath(
  universeId?: string | null,
  options?: {
    basePath?: UniverseBasePath | null;
    universe?: Pick<IUniverse, "type" | "typeSpecific"> | null;
  },
) {
  return getUniverseHomePath(universeId, options);
}

export function getStorePath(
  universeId?: string | null,
  options?: {
    universe?: Pick<IUniverse, "type" | "typeSpecific"> | null;
  },
) {
  return getUniverseHomePath(universeId, { ...options, basePath: "store" });
}

export function getPlaySelectCharacterPath(
  universeId?: string | null,
  options?: {
    basePath?: UniverseBasePath | null;
    universe?: Pick<IUniverse, "type" | "typeSpecific"> | null;
  },
) {
  return `${getPlayPath(universeId, options)}/select-character`;
}

export function getPlayStageMapPath(
  universeId?: string | null,
  stageId?: string | null,
  options?: {
    basePath?: UniverseBasePath | null;
    universe?: Pick<IUniverse, "type" | "typeSpecific"> | null;
  },
) {
  const sid = String(stageId || "").trim();
  return sid
    ? `${getPlayPath(universeId, options)}/stagemap/${encodePathSegment(sid)}`
    : `${getPlayPath(universeId, options)}/stagemap`;
}

export function isPlayPath(pathname?: string | null) {
  const path = String(pathname || "").trim();
  return path === PLAY_ROUTE_ROOT || path.indexOf(`${PLAY_ROUTE_ROOT}/`) === 0;
}

export function getLocalizedUniverseDescription(description?: { ko?: string; en?: string } | null) {
  if (!description) return "";
  const language = getCurrentLanguage();
  const content = description[language as keyof typeof description] || description.ko || description.en || "";
  return sanitizeDescription(content);
}

export function getPlatformAdminPath(isAdministrator: boolean, editableUniverses: IUniverse[]) {
  if (isAdministrator) return "/admin";
  const targetUniverseId = editableUniverses?.[0]?.id;
  return targetUniverseId ? `/admin/${targetUniverseId}` : "/admin";
}
