import "server-only";
import crypto from "crypto";
import { Types } from "mongoose";
import { getModel } from "libs/database/modelCache";
import {
  ScrapeLinkSchema,
  ScrapeLinkCategorySchema,
  type IScrapeLinkDocument,
  type IScrapeLinkCategoryDocument,
  type ScrapeLinkSourceType,
} from "models/mini-app";
import { MONGODB_APPS_URL } from "consts/env/server";

/**
 * @docHint
 * @purpose Scrape Links 개인 링크 저장/중복 제거/Todo 상태 관리 (apps DB)
 * @process getModel 캐시 → insertMany(ordered:false) → E11000은 skipped 집계
 * @domain mini-app.scrape-links
 * @scope db_repo
 */

const COLLECTION = "scrape_link";
const CATEGORY_COLLECTION = "scrape_link_category";

export type ScrapeLinkCategoryPublic = {
  id: string;
  name: string;
  count: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export function hashUrlPerUser(uid: string, normalizedUrl: string) {
  return crypto.createHash("sha256").update(`${uid}:${normalizedUrl}`).digest("hex");
}

async function getScrapeLinkModel() {
  return await getModel<IScrapeLinkDocument>(MONGODB_APPS_URL, "ScrapeLink", ScrapeLinkSchema, COLLECTION);
}

async function getScrapeLinkCategoryModel() {
  return await getModel<IScrapeLinkCategoryDocument>(
    MONGODB_APPS_URL,
    "ScrapeLinkCategory",
    ScrapeLinkCategorySchema,
    CATEGORY_COLLECTION,
  );
}

function sanitizeCategoryName(raw: string) {
  return String(raw || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

function categoryNameKey(name: string) {
  return sanitizeCategoryName(name).toLowerCase();
}

type ScrapeLinkCategoryDocLike = {
  _id: unknown;
  name?: unknown;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  toObject?: () => ScrapeLinkCategoryDocLike;
};
function toCategoryPublic(doc: ScrapeLinkCategoryDocLike, count = 0): ScrapeLinkCategoryPublic {
  const d = typeof doc?.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(d._id),
    name: String(d.name || ""),
    count,
    createdAt: d.createdAt ? new Date(d.createdAt as Date | string).toISOString() : null,
    updatedAt: d.updatedAt ? new Date(d.updatedAt as Date | string).toISOString() : null,
  };
}

export type ScrapeLinkPublic = {
  id: string;
  url: string;
  normalizedUrl: string;
  domain: string;
  label: string;
  note: string;
  categoryId: string;
  categoryName: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogSiteName: string;
  ogStatus: string;
  ogFetchedAt: string | null;
  checked: boolean;
  checkedAt: string | null;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type ScrapeLinkDocLike = {
  _id: unknown;
  url?: unknown;
  normalizedUrl?: unknown;
  domain?: unknown;
  label?: unknown;
  note?: unknown;
  categoryId?: unknown;
  categoryName?: unknown;
  ogTitle?: unknown;
  ogDescription?: unknown;
  ogImage?: unknown;
  ogSiteName?: unknown;
  ogStatus?: unknown;
  ogFetchedAt?: Date | string | null;
  checked?: unknown;
  checkedAt?: Date | string | null;
  source?: unknown;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  toObject?: () => ScrapeLinkDocLike;
};
function toPublic(doc: ScrapeLinkDocLike): ScrapeLinkPublic {
  const d = typeof doc?.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(d._id),
    url: String(d.url || ""),
    normalizedUrl: String(d.normalizedUrl || ""),
    domain: String(d.domain || ""),
    label: String(d.label || ""),
    note: String(d.note || ""),
    categoryId: String(d.categoryId || ""),
    categoryName: String(d.categoryName || ""),
    ogTitle: String(d.ogTitle || ""),
    ogDescription: String(d.ogDescription || ""),
    ogImage: String(d.ogImage || ""),
    ogSiteName: String(d.ogSiteName || ""),
    ogStatus: String(d.ogStatus || "idle"),
    ogFetchedAt: d.ogFetchedAt ? new Date(d.ogFetchedAt as Date | string).toISOString() : null,
    checked: Boolean(d.checked),
    checkedAt: d.checkedAt ? new Date(d.checkedAt as Date | string).toISOString() : null,
    source: String(d.source || "paste"),
    createdAt: d.createdAt ? new Date(d.createdAt as Date | string).toISOString() : null,
    updatedAt: d.updatedAt ? new Date(d.updatedAt as Date | string).toISOString() : null,
  };
}

export async function insertScrapeLinksBulk(args: {
  uid: string;
  items: Array<{ url: string; normalizedUrl: string; domain: string }>;
  source: ScrapeLinkSourceType;
  categoryId?: string | null;
}) {
  const uid = String(args.uid || "");
  if (!uid || !args.items.length) return { created: [] as ScrapeLinkPublic[], skipped: 0 };

  const Model = await getScrapeLinkModel();
  const category = await resolveOwnedCategory(uid, args.categoryId);
  const docs = args.items.map((it) => ({
    uid,
    url: it.url,
    normalizedUrl: it.normalizedUrl,
    domain: it.domain,
    urlHash: hashUrlPerUser(uid, it.normalizedUrl),
    source: args.source,
    categoryId: category?.id || "",
    categoryName: category?.name || "",
  }));

  try {
    const inserted = await Model.insertMany(docs, { ordered: false });
    return { created: inserted.map((doc) => toPublic(doc as unknown as ScrapeLinkDocLike)), skipped: 0 };
  } catch (err: unknown) {
    type BulkInsertError = {
      insertedDocs?: unknown[];
      writeErrors?: Array<{ code?: number; err?: { code?: number } }>;
    };
    const bulkErr = (err && typeof err === "object" ? (err as BulkInsertError) : {}) as BulkInsertError;
    const inserted = Array.isArray(bulkErr.insertedDocs) ? bulkErr.insertedDocs : [];
    const writeErrors = Array.isArray(bulkErr.writeErrors) ? bulkErr.writeErrors : [];
    const duplicates = writeErrors.filter((e) => Number(e?.code) === 11000 || Number(e?.err?.code) === 11000).length;
    return {
      created: inserted.map((doc) => toPublic(doc as ScrapeLinkDocLike)),
      skipped: duplicates,
    };
  }
}

export async function listScrapeLinks(args: {
  uid: string;
  checked?: "all" | "done" | "todo";
  query?: string;
  categoryId?: string | null;
  limit?: number;
  cursor?: string | null;
}) {
  const uid = String(args.uid || "");
  if (!uid) return { items: [] as ScrapeLinkPublic[], nextCursor: null as string | null };

  const Model = await getScrapeLinkModel();
  const limit = Math.min(Math.max(Number(args.limit || 50), 1), 200);

  const filter: Record<string, unknown> = { uid };
  if (args.checked === "done") filter.checked = true;
  if (args.checked === "todo") filter.checked = false;
  if (args.categoryId === "uncategorized") filter.categoryId = "";
  else if (args.categoryId && args.categoryId !== "all") filter.categoryId = String(args.categoryId);

  if (args.query) {
    const q = String(args.query).trim();
    if (q) {
      const escaped = q.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(escaped, "i");
      filter.$or = [{ label: re }, { url: re }, { domain: re }, { ogTitle: re }, { categoryName: re }];
    }
  }
  if (args.cursor) {
    try {
      filter._id = { $lt: new Types.ObjectId(String(args.cursor)) };
    } catch {
      /* ignore bad cursor */
    }
  }

  const rows = await Model.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toPublic);
  const nextCursor = hasMore ? items[items.length - 1]?.id || null : null;
  return { items, nextCursor };
}

export async function getScrapeLinksByIds(args: { uid: string; ids: string[]; limit?: number }) {
  const uid = String(args.uid || "");
  if (!uid) return [] as ScrapeLinkPublic[];

  const objectIds = (args.ids || [])
    .slice(0, Math.max(1, Math.min(50, Number(args.limit || 50))))
    .map((id) => {
      try {
        return new Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Types.ObjectId[];

  if (!objectIds.length) return [] as ScrapeLinkPublic[];

  const Model = await getScrapeLinkModel();
  const rows = await Model.find({ _id: { $in: objectIds }, uid }).sort({ _id: -1 }).lean();
  return rows.map(toPublic);
}

export async function updateScrapeLink(args: {
  uid: string;
  id: string;
  patch: { label?: string; note?: string; checked?: boolean; categoryId?: string | null };
}) {
  const Model = await getScrapeLinkModel();
  const patch: Record<string, unknown> = {};
  if (typeof args.patch.label === "string") patch.label = args.patch.label.slice(0, 240);
  if (typeof args.patch.note === "string") patch.note = args.patch.note.slice(0, 600);
  if (typeof args.patch.categoryId === "string" || args.patch.categoryId === null) {
    const category = await resolveOwnedCategory(String(args.uid), args.patch.categoryId);
    patch.categoryId = category?.id || "";
    patch.categoryName = category?.name || "";
  }
  if (typeof args.patch.checked === "boolean") {
    patch.checked = args.patch.checked;
    patch.checkedAt = args.patch.checked ? new Date() : null;
  }
  if (!Object.keys(patch).length) return null;

  let oid: Types.ObjectId;
  try {
    oid = new Types.ObjectId(String(args.id));
  } catch {
    return null;
  }

  const row = await Model.findOneAndUpdate(
    { _id: oid, uid: String(args.uid) },
    { $set: patch },
    { new: true },
  ).lean();
  return row ? toPublic(row) : null;
}

async function resolveOwnedCategory(uid: string, categoryId?: string | null) {
  const id = String(categoryId || "").trim();
  if (!id || id === "uncategorized" || id === "all") return null;

  let oid: Types.ObjectId;
  try {
    oid = new Types.ObjectId(id);
  } catch {
    throw new Error("category_not_found");
  }

  const CategoryModel = await getScrapeLinkCategoryModel();
  const row = await CategoryModel.findOne({ _id: oid, uid }).lean();
  if (!row) throw new Error("category_not_found");
  return { id: String(row._id), name: String(row.name || "") };
}

export type ScrapeLinkCategoryListResult = {
  items: ScrapeLinkCategoryPublic[];
  total: number;
  uncategorized: number;
};

export async function listScrapeLinkCategories(args: {
  uid: string;
}): Promise<ScrapeLinkCategoryListResult> {
  const uid = String(args.uid || "");
  if (!uid) return { items: [], total: 0, uncategorized: 0 };

  const CategoryModel = await getScrapeLinkCategoryModel();
  const LinkModel = await getScrapeLinkModel();
  const [rows, counts, total] = await Promise.all([
    CategoryModel.find({ uid }).sort({ nameKey: 1 }).lean(),
    LinkModel.aggregate([
      { $match: { uid } },
      { $group: { _id: { $ifNull: ["$categoryId", ""] }, count: { $sum: 1 } } },
    ]),
    LinkModel.countDocuments({ uid }),
  ]);
  const countMap = new Map<string, number>(
    (counts as Array<{ _id?: unknown; count?: unknown }>).map((row) => [
      String(row._id || ""),
      Number(row.count || 0),
    ]),
  );
  const uncategorized = countMap.get("") || 0;
  const items = rows.map((row) =>
    toCategoryPublic(row as unknown as ScrapeLinkCategoryDocLike, countMap.get(String(row._id)) || 0),
  );
  return { items, total, uncategorized };
}

export async function createScrapeLinkCategory(args: { uid: string; name: string }) {
  const uid = String(args.uid || "");
  const name = sanitizeCategoryName(args.name);
  if (!uid || !name) return null;

  const CategoryModel = await getScrapeLinkCategoryModel();
  const row = await CategoryModel.create({ uid, name, nameKey: categoryNameKey(name) });
  return toCategoryPublic(row);
}

export async function updateScrapeLinkCategory(args: { uid: string; id: string; name: string }) {
  const uid = String(args.uid || "");
  const name = sanitizeCategoryName(args.name);
  if (!uid || !name) return null;

  let oid: Types.ObjectId;
  try {
    oid = new Types.ObjectId(String(args.id));
  } catch {
    return null;
  }

  const CategoryModel = await getScrapeLinkCategoryModel();
  const LinkModel = await getScrapeLinkModel();
  const row = await CategoryModel.findOneAndUpdate(
    { _id: oid, uid },
    { $set: { name, nameKey: categoryNameKey(name) } },
    { new: true },
  ).lean();
  if (!row) return null;

  await LinkModel.updateMany({ uid, categoryId: String(oid) }, { $set: { categoryName: name } });
  const count = await LinkModel.countDocuments({ uid, categoryId: String(oid) });
  return toCategoryPublic(row, count);
}

export async function deleteScrapeLinkCategory(args: { uid: string; id: string }) {
  const uid = String(args.uid || "");
  let oid: Types.ObjectId;
  try {
    oid = new Types.ObjectId(String(args.id));
  } catch {
    return false;
  }

  const CategoryModel = await getScrapeLinkCategoryModel();
  const LinkModel = await getScrapeLinkModel();
  const res = await CategoryModel.deleteOne({ _id: oid, uid });
  if (!res?.deletedCount) return false;
  await LinkModel.updateMany({ uid, categoryId: String(oid) }, { $set: { categoryId: "", categoryName: "" } });
  return true;
}

export async function deleteScrapeLink(args: { uid: string; id: string }) {
  const Model = await getScrapeLinkModel();
  let oid: Types.ObjectId;
  try {
    oid = new Types.ObjectId(String(args.id));
  } catch {
    return false;
  }
  const res = await Model.deleteOne({ _id: oid, uid: String(args.uid) });
  return Boolean(res?.deletedCount);
}

export async function getOwnedLinksByIds(args: { uid: string; ids: string[] }) {
  const Model = await getScrapeLinkModel();
  const oids = args.ids
    .map((id) => {
      try {
        return new Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Types.ObjectId[];
  if (!oids.length) return [];
  const rows = await Model.find({ _id: { $in: oids }, uid: String(args.uid) }).lean();
  return rows.map(toPublic);
}

export async function markOgPayload(args: {
  uid: string;
  id: string;
  payload: {
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogSiteName?: string;
    status: "success" | "failed";
  };
}) {
  const Model = await getScrapeLinkModel();
  let oid: Types.ObjectId;
  try {
    oid = new Types.ObjectId(String(args.id));
  } catch {
    return;
  }
  await Model.updateOne(
    { _id: oid, uid: String(args.uid) },
    {
      $set: {
        ogTitle: String(args.payload.ogTitle || ""),
        ogDescription: String(args.payload.ogDescription || ""),
        ogImage: String(args.payload.ogImage || ""),
        ogSiteName: String(args.payload.ogSiteName || ""),
        ogStatus: args.payload.status,
        ogFetchedAt: new Date(),
      },
    },
  );
}
