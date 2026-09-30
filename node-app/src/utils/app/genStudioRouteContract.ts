export const GEN_STUDIO_ROUTE_PATHS = {
  templateList: "/gen-studio/templates",
  imageTemplate: "/gen-studio/templates/image/[templateKey]",
  contentTemplate: "/gen-studio/templates/content/[templateKey]",
  // audio는 기존 목록에 자동 노출하지 않는 별도 mode다(G-EL-PILOT). thin route adapter로만 연결한다.
  audioTemplateList: "/gen-studio/templates/audio",
  audioTemplate: "/gen-studio/templates/audio/[templateKey]",
  customImage: "/gen-studio/create/image",
  customContent: "/gen-studio/create/content",
  customAudio: "/gen-studio/create/audio",
} as const;

export type GenStudioModeType = "image" | "content" | "video" | "audio";
export type GenStudioLegacyIntentType = "template" | "custom" | "list";

export const GEN_STUDIO_RETURN_URL_QUERY_KEY = "returnUrl";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

export function normalizeGenStudioTemplateKey(value: unknown) {
  const key = toSafeString(value);
  return key ? key : null;
}

export function buildGenStudioTemplatePath(mode: GenStudioModeType, templateKey: unknown) {
  if (mode === "video") return null;
  const key = normalizeGenStudioTemplateKey(templateKey);
  if (!key) return null;

  const basePath =
    mode === "content"
      ? "/gen-studio/templates/content"
      : mode === "audio"
        ? "/gen-studio/templates/audio"
        : "/gen-studio/templates/image";
  return `${basePath}/${encodeURIComponent(key)}`;
}

export function buildGenStudioCustomPath(mode: GenStudioModeType) {
  return mode === "content"
    ? "/gen-studio/create/content"
    : mode === "video"
      ? "/gen-studio/templates"
      : mode === "audio"
        ? "/gen-studio/create/audio"
        : "/gen-studio/create/image";
}

function buildDetailUrl(path: string | null, currentSearchParams?: string) {
  if (!path) return null;

  const searchParams = new URLSearchParams(currentSearchParams || "");
  searchParams.delete("mode");
  searchParams.delete("view");
  searchParams.delete("templateKey");
  searchParams.delete("template");
  searchParams.delete("detailMode");

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function buildGenStudioTemplateUrl(args: {
  mode: GenStudioModeType;
  templateKey: unknown;
  currentSearchParams?: string;
}) {
  return buildDetailUrl(buildGenStudioTemplatePath(args.mode, args.templateKey), args.currentSearchParams);
}

export function buildGenStudioCustomUrl(args: {
  mode: GenStudioModeType;
  currentSearchParams?: string;
}) {
  if (args.mode === "video") {
    return buildGenStudioListUrl({ mode: "video", currentSearchParams: args.currentSearchParams });
  }
  return buildDetailUrl(buildGenStudioCustomPath(args.mode), args.currentSearchParams);
}

export function resolveGenStudioLegacyIntent(args: {
  mode?: unknown;
  templateKey?: unknown;
  template?: unknown;
  detailMode?: unknown;
}) {
  const mode: GenStudioModeType =
    args.mode === "content"
      ? "content"
      : args.mode === "video"
        ? "video"
        : args.mode === "audio"
          ? "audio"
          : "image";
  if (toSafeString(args.detailMode) === "custom") {
    if (mode === "video") return { mode, intent: "list" as const, path: GEN_STUDIO_ROUTE_PATHS.templateList };
    return { mode, intent: "custom" as const, path: buildGenStudioCustomPath(mode) };
  }

  const templateKey = normalizeGenStudioTemplateKey(args.templateKey) || normalizeGenStudioTemplateKey(args.template);
  const templatePath = buildGenStudioTemplatePath(mode, templateKey);
  if (!templatePath) return { mode, intent: "list" as const, path: GEN_STUDIO_ROUTE_PATHS.templateList };

  return { mode, intent: "template" as const, path: templatePath };
}

export function buildGenStudioLegacyRedirectUrl(args: {
  mode?: unknown;
  templateKey?: unknown;
  template?: unknown;
  detailMode?: unknown;
  currentSearchParams?: string;
}) {
  const intent = resolveGenStudioLegacyIntent(args);
  if (intent.intent === "list") {
    return buildGenStudioListUrl({ mode: intent.mode, currentSearchParams: args.currentSearchParams });
  }

  return buildDetailUrl(intent.path, args.currentSearchParams) || buildGenStudioListUrl({ mode: intent.mode });
}

function toInternalPath(value: unknown) {
  const raw = toSafeString(value);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;

  try {
    const parsed = new URL(raw, "https://amu.invalid");
    if (parsed.origin !== "https://amu.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function resolveGenStudioReturnUrl(value: unknown, fallback: string) {
  return toInternalPath(value) || fallback;
}

export function buildGenStudioListUrl(args: {
  basePath?: string;
  mode: GenStudioModeType;
  currentSearchParams?: string;
}) {
  const basePath = toSafeString(args.basePath) || GEN_STUDIO_ROUTE_PATHS.templateList;
  const searchParams = new URLSearchParams(args.currentSearchParams || "");
  searchParams.set("mode", args.mode);
  searchParams.delete("view");
  searchParams.delete("templateKey");
  searchParams.delete("template");
  searchParams.delete("detailMode");
  searchParams.delete(GEN_STUDIO_RETURN_URL_QUERY_KEY);

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function resolveGenStudioCloseUrl(args: {
  basePath?: string;
  mode: GenStudioModeType;
  currentSearchParams?: string;
  returnUrl?: unknown;
}) {
  const fallback = buildGenStudioListUrl(args);
  return resolveGenStudioReturnUrl(args.returnUrl, fallback);
}
