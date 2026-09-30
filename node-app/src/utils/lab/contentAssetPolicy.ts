import { truncateContentAssetPreview } from "./contentAssetPreview";

type ContentAssetPreviewPolicyArgs = {
  templateKeys: string[];
  scope?: "user" | "universe" | "all";
  uid?: string;
  universeId?: string;
  visibility?: "public" | "private" | "all";
};

type PublicContentAssetSource = {
  assetId?: unknown;
  scope?: unknown;
  templateKey?: unknown;
  provider?: unknown;
  modelName?: unknown;
  generationMode?: unknown;
  extraPrompt?: unknown;
  state?: unknown;
  outputIndex?: unknown;
  content?: {
    text?: unknown;
    chars?: unknown;
    bytes?: unknown;
  };
  createdAt?: unknown;
};

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

export function buildContentAssetPreviewMatch(args: ContentAssetPreviewPolicyArgs) {
  const match: Record<string, unknown> = {
    templateKey: { $in: args.templateKeys },
    state: "active",
  };
  const scope = toSafeString(args.scope || "all");
  if (scope === "user") {
    match.scope = "user";
  } else if (scope === "universe") {
    match.scope = "universe";
    match.universeId = toSafeString(args.universeId);
  }

  const uid = toSafeString(args.uid);
  if (uid) match.uid = uid;

  const visibility = toSafeString(args.visibility || "all");
  if (visibility === "public" || visibility === "private") match.visibility = visibility;
  return match;
}

export function toPublicContentAssetMeta(source: PublicContentAssetSource) {
  const text = String(source.content?.text || "");
  return {
    canEdit: false,
    isOwner: false,
    assetId: String(source.assetId || ""),
    textPreview: truncateContentAssetPreview(text),
    templateKey: String(source.templateKey || ""),
    visibility: "public" as const,
    scope: String(source.scope || "user"),
    createdAt: source.createdAt || null,
    provider: String(source.provider || ""),
    modelName: String(source.modelName || ""),
    generationMode: String(source.generationMode || ""),
    extraPrompt: String(source.extraPrompt || ""),
    state: String(source.state || ""),
    outputIndex: Number(source.outputIndex || 0),
    content: {
      chars: Number(source.content?.chars || 0),
      bytes: Number(source.content?.bytes || 0),
    },
  };
}
