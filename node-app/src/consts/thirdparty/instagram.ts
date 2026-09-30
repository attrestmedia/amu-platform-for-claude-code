export const INSTAGRAM_AUTH_MODES = ["instagram_login", "facebook_login"] as const;
export type InstagramAuthMode = (typeof INSTAGRAM_AUTH_MODES)[number];

export const INSTAGRAM_GRAPH_BASE = "https://graph.instagram.com/v23.0";
export const INSTAGRAM_FACEBOOK_GRAPH_BASE = "https://graph.facebook.com/v22.0";
export const INSTAGRAM_CAPTION_MAX_LEN = 2200;

export function resolveInstagramAuthMode(rawMode: unknown, legacyGraphBaseUrl?: unknown): InstagramAuthMode {
  const mode = String(rawMode || "").trim();
  if (mode === "facebook_login" || mode === "instagram_login") return mode;

  const legacyBaseUrl = String(legacyGraphBaseUrl || "").trim().toLowerCase();
  return legacyBaseUrl.includes("graph.facebook.com") ? "facebook_login" : "instagram_login";
}

export function getInstagramGraphBase(authMode: InstagramAuthMode) {
  return authMode === "facebook_login" ? INSTAGRAM_FACEBOOK_GRAPH_BASE : INSTAGRAM_GRAPH_BASE;
}
