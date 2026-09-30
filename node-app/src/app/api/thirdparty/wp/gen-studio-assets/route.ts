import { NextRequest, NextResponse } from "next/server";
import {
  listAssetIdsByJobIds,
  listImageAssets,
  listImageGenJobsByJobIds,
  getImagePromptByKeyRaw,
} from "libs/database/lab";
import { verifyWpBridgeRequest } from "libs/server-utils/api/wpBridgeAuth";
import { logger } from "utils/log";
import { toErrorMessage, toSafeString, toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toBool(raw?: string | null, fallback = false) {
  const s = toSafeString(raw).toLowerCase();
  if (!s) return fallback;
  return s === "1" || s === "true" || s === "yes";
}

function toLimit(raw?: string | null, max = 50, fallback = 12) {
  const n = Number(raw || fallback);
  const safe = Number.isFinite(n) ? n : fallback;
  return Math.max(1, Math.min(max, safe));
}

function toIdList(searchParams: URLSearchParams, singleKey: string, multiKey: string, max = 200) {
  const single = toSafeString(searchParams.get(singleKey));
  const multi = searchParams.getAll(multiKey).flatMap((chunk) => String(chunk || "").split(","));
  return Array.from(new Set([single, ...multi].map((v) => toSafeString(v)).filter(Boolean))).slice(0, max);
}

function toAbsoluteUrl(raw: string) {
  const url = toSafeString(raw);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;

  const siteDomain = toSafeString(process.env.SITE_DOMAIN)
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!siteDomain) return url;

  return `https://${siteDomain}${url.startsWith("/") ? url : `/${url}`}`;
}

function toPrompt(raw: unknown, max = 4000) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function GET(request: NextRequest) {
  const auth = verifyWpBridgeRequest({ request });
  if (!auth.ok) {
    logger.warn("[thirdparty/wp/gen-studio-assets] auth failed", { error: auth.error });
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);

    const templateKey = toSafeString(searchParams.get("templateKey"));
    const modelName = toSafeString(searchParams.get("modelName"));
    const assetIds = toIdList(searchParams, "assetId", "assetIds", 200);
    const jobIds = toIdList(searchParams, "jobId", "jobIds", 200);
    const hasIdFilter = assetIds.length > 0 || jobIds.length > 0;

    const limitRaw = searchParams.get("limit");
    const limit = hasIdFilter
      ? toLimit(limitRaw, 200, assetIds.length ? assetIds.length : 200)
      : toLimit(limitRaw, 50, 12);
    const includePrompt = toBool(searchParams.get("includePrompt"), true);

    if (!hasIdFilter && !templateKey && !modelName) {
      return NextResponse.json({ ok: false, error: "templateKey_or_modelName_required" }, { status: 400 });
    }

    const assets = await listImageAssets({
      scope: "all",
      visibility: "public",
      state: "active",
      templateKey: hasIdFilter ? "" : templateKey,
      modelName: hasIdFilter ? "" : modelName,
      assetIds,
      jobIds,
      limit,
    });

    const assetIdsByJob = jobIds.length
      ? await listAssetIdsByJobIds({
          jobIds,
          visibility: "public",
          state: "active",
          limit: 2000,
        })
      : {};

    const jobs = includePrompt && jobIds.length ? await listImageGenJobsByJobIds(jobIds) : [];
    const jobMap = new Map(
      (jobs || []).map((job) => {
        const record = toUnknownRecord(job);
        return [toSafeString(record.jobId), record] as const;
      }),
    );

    const templateKeys = Array.from(
      new Set((assets || []).map((asset) => toSafeString(toUnknownRecord(asset).templateKey)).filter(Boolean)),
    );

    const templateTitleByKey = new Map<string, string>();
    await Promise.all(
      templateKeys.map(async (key) => {
        try {
          const doc = toUnknownRecord(await getImagePromptByKeyRaw(key));
          const title = toSafeString(doc.title);
          if (title) templateTitleByKey.set(key, title);
        } catch {}
      }),
    );

    const data = (assets || []).map((asset) => {
      const record = toUnknownRecord(asset);
      const job = jobMap.get(toSafeString(record.jobId));
      const req = toUnknownRecord(job?.request);
      const storage = toUnknownRecord(record.storage);
      const resolvedTemplateKey = toSafeString(record.templateKey || req.templateKey);
      const resolvedTemplateTitle = toSafeString(templateTitleByKey.get(resolvedTemplateKey) || "");

      return {
        assetId: toSafeString(record.assetId),
        jobId: toSafeString(record.jobId),
        url: toAbsoluteUrl(toSafeString(storage.url)),
        extraPrompt: toPrompt(record.extraPrompt),
        prompt: includePrompt ? toPrompt(record.extraPrompt || req.extraPrompt) : "",
        provider: toSafeString(record.provider),
        modelName: toSafeString(record.modelName),
        templateKey: resolvedTemplateKey,
        templateTitle: resolvedTemplateTitle,
        generationMode: toSafeString(record.generationMode || req.generationMode),
        visibility: toSafeString(record.visibility || "private"),
        tags: Array.isArray(record.tags) ? record.tags : [],
        categories: Array.isArray(record.categories) ? record.categories : [],
        meta: {
          mimeType: toSafeString(storage.mimeType),
          ext: toSafeString(storage.ext),
          bytes: Number(storage.bytes || 0),
          aspectRatio: toSafeString(req.aspectRatio),
          size: toSafeString(req.size),
          outputCount: Number(job?.outputCount || 0),
        },
        createdAt: record.createdAt || null,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        site: auth.site,
        count: data.length,
        assetIdsByJob,
        data,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    logger.error("[thirdparty/wp/gen-studio-assets] failed", {
      message: toErrorMessage(error, "unknown"),
    });
    return NextResponse.json({ ok: false, error: "internal_server_error" }, { status: 500 });
  }
}
