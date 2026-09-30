import { NextRequest, NextResponse } from "next/server";
import { listImageAssets } from "libs/database/lab";
import { GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY } from "consts/app";
import type { PromptVisibilityExtendedType, StudioGenerationSourceServiceType } from "types/app";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { logger } from "utils/log";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";

import { extractCodedError } from "utils/common";
export const runtime = "nodejs";

const AGENT_LIST_ENDPOINT = "ai/agent/studio-images";

function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function toLimit(raw?: string | null) {
  const value = Number(raw || 10);
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function toBool(raw?: string | null) {
  const s = toSafeString(raw).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function toVisibility(raw?: string | null): PromptVisibilityExtendedType {
  const value = toSafeString(raw).toLowerCase();
  if (value === "public" || value === "private") return value;
  return "all";
}

function resolveAgentTemplateKey(raw?: string | null, allowEmpty = false) {
  const value = toSafeString(raw);
  if (value) return value;
  return allowEmpty ? "" : GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY;
}

function toOptionalDate(raw?: string | null): Date | null | undefined {
  const value = toSafeString(raw);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toSourceService(raw?: string | null): StudioGenerationSourceServiceType | null | undefined {
  const value = toSafeString(raw).toLowerCase();
  if (!value || value === "all") return undefined;
  if (
    value === "gen-studio" ||
    value === "tutors" ||
    value === "store" ||
    value === "play" ||
    value === "mini-app" ||
    value === "marketing" ||
    value === "admin" ||
    value === "agent" ||
    value === "upload" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:image:read" });
    if (!auth.valid) {
      return NextResponse.json(
        { ok: false, error: auth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_LIST_ENDPOINT,
      limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
      keyHash: auth.keyHash,
    });

    const searchParams = new URL(request.url).searchParams;
    const mode = toSafeString(searchParams.get("mode")).toLowerCase() === "recent" ? "recent" : "template";
    const templateKey = resolveAgentTemplateKey(searchParams.get("templateKey"), mode === "recent");
    const folder = toSafeString(searchParams.get("folder"));
    const limit = toLimit(searchParams.get("limit"));
    const includeMeta = searchParams.has("includeMeta") ? toBool(searchParams.get("includeMeta")) : true;
    const visibility = toVisibility(searchParams.get("visibility"));
    const requestedScope = toSafeString(searchParams.get("scope")).toLowerCase() === "universe" ? "universe" : "user";
    const universeId = toSafeString(searchParams.get("universeId"));
    const sourceService = toSourceService(searchParams.get("sourceService"));
    const createdFrom = toOptionalDate(searchParams.get("createdFrom"));
    const createdBefore = toOptionalDate(searchParams.get("createdBefore"));

    if (sourceService === null) {
      return NextResponse.json(
        { ok: false, error: "sourceService_invalid", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    if (
      createdFrom === null ||
      createdBefore === null ||
      (createdFrom && createdBefore && createdFrom.getTime() >= createdBefore.getTime())
    ) {
      return NextResponse.json(
        { ok: false, error: "date_range_invalid", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    if (requestedScope === "universe" && !universeId) {
      return NextResponse.json(
        { ok: false, error: "universeId_required", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const rows = await listImageAssets({
      scope: requestedScope,
      uid: auth.uid,
      universeId: requestedScope === "universe" ? universeId : undefined,
      templateKey,
      folder,
      state: "active",
      limit,
      visibility: requestedScope === "universe" ? "public" : visibility,
      sourceService,
      createdFrom,
      createdBefore,
    });

    logger.info("[agent-studio-images] list fetched", {
      endpoint: AGENT_LIST_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      mode,
      scope: requestedScope,
      universeId: requestedScope === "universe" ? universeId : "",
      templateKey,
      sourceService: sourceService || "all",
      createdFrom: createdFrom?.toISOString() || "",
      createdBefore: createdBefore?.toISOString() || "",
      folder,
      limit,
      includeMeta,
      visibility,
      rowCount: Array.isArray(rows) ? rows.length : 0,
    });

    if (includeMeta) {
      const data = await Promise.all(
        (rows || []).map(async (row) => {
          const display = await resolveImageAssetDisplayUrl(row);
          const ownerUid = String(row?.uid || "");
          const isOwner = Boolean(ownerUid && ownerUid === auth.uid);
          const assetScope = String(row?.scope || requestedScope);
          const promptSummary = isOwner ? String(row?.extraPrompt || "").replace(/\s+/g, " ").trim().slice(0, 240) : "";
          return {
            canEdit: isOwner,
            assetId: String(row?.assetId || ""),
            url: String(display.url || ""),
            urlKind: display.urlKind,
            urlExpiresAt: display.urlExpiresAt,
            refreshUrl: display.refreshUrl,
            templateKey: String(row?.templateKey || ""),
            visibility: String(row?.visibility || "private"),
            isOwner,
            scope: assetScope,
            uid: isOwner ? auth.uid : "",
            universeId: String(row?.universeId || ""),
            sourceService: String(row?.sourceService || "unknown"),
            sourceSurface: String(row?.sourceSurface || "unknown"),
            createdAt: row?.createdAt || null,
            provider: String(row?.provider || ""),
            modelName: String(row?.modelName || ""),
            generationMode: String(row?.generationMode || ""),
            promptSummary,
            extraPrompt: promptSummary,
            state: String(row?.state || ""),
            storage: {
              driver: String(row?.storage?.driver || ""),
              access: String(row?.storage?.access || ""),
              mimeType: String(row?.storage?.mimeType || ""),
              ext: String(row?.storage?.ext || ""),
              bytes: Number(row?.storage?.bytes || 0),
            },
          };
        }),
      );

      return NextResponse.json({ ok: true, data });
    }

    const displayUrls = await Promise.all((rows || []).map((row) => resolveImageAssetDisplayUrl(row)));
    const urls = Array.from(
      new Set(
        displayUrls
          .map((item) => String(item.url || ""))
          .map((url) => url.trim())
          .filter(Boolean),
      ),
    );

    return NextResponse.json({ ok: true, data: urls });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, {
      message: "Failed to list images",
    });
    logger.error("[agent-studio-images] list failed", {
      endpoint: AGENT_LIST_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
