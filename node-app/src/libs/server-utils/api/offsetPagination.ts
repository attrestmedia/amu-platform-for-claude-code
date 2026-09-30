export type OffsetPageParams = {
  limit?: number;
  skip: number;
  requested: boolean;
};

export type OffsetPageInfo = {
  limit: number;
  skip: number;
  nextSkip: number | null;
  hasMore: boolean;
  total?: number;
};

function toBoundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function readOffsetPageParams(
  searchParams: URLSearchParams,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): OffsetPageParams {
  const requested = searchParams.has("limit") || searchParams.has("skip");
  const defaultLimit = opts.defaultLimit ?? 24;
  const maxLimit = opts.maxLimit ?? 100;
  const limit = requested ? toBoundedInt(searchParams.get("limit"), defaultLimit, 1, maxLimit) : undefined;
  const skip = requested ? toBoundedInt(searchParams.get("skip"), 0, 0, Number.MAX_SAFE_INTEGER) : 0;

  return { limit, skip, requested };
}

export function sliceOffsetPageRows<T>(rows: T[], page: OffsetPageParams, total?: number) {
  if (typeof page.limit !== "number") return { data: rows, pageInfo: undefined };

  const hasMore = rows.length > page.limit;
  const data = hasMore ? rows.slice(0, page.limit) : rows;
  const pageInfo: OffsetPageInfo = {
    limit: page.limit,
    skip: page.skip,
    nextSkip: hasMore ? page.skip + page.limit : null,
    hasMore,
    ...(typeof total === "number" ? { total } : {}),
  };

  return { data, pageInfo };
}
