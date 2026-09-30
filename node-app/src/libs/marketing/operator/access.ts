import "server-only";

import { getMarketingJobByJobId } from "libs/database/marketing";
import { getUniverses, getUniverseById } from "libs/database/universe";
import { canOperateMarketing } from "libs/marketing/access";
import { toSafeString } from "utils/common/typeUtils";
import type { IUniverse } from "types/game";
import type { IUpdateUserData } from "types/user";

export async function listAccessibleMarketingUniverses(user: IUpdateUserData): Promise<IUniverse[]> {
  const universes = await getUniverses({ enabledOnly: false, sortByOrder: true });
  return universes.filter((universe) => canOperateMarketing(user, universe));
}

export async function listAccessibleMarketingUniverseIds(user: IUpdateUserData): Promise<string[]> {
  const universes = await listAccessibleMarketingUniverses(user);
  return universes.map((universe) => toSafeString(universe.id)).filter(Boolean);
}

export async function assertMarketingUniverseAccess(args: { user: IUpdateUserData; universeId: string }) {
  const universeId = toSafeString(args.universeId);
  if (!universeId) {
    return { ok: false as const, status: 400, error: "universe_id_required" };
  }

  const universe = await getUniverseById(universeId);
  if (!universe) {
    return { ok: false as const, status: 404, error: "universe_not_found" };
  }

  if (!canOperateMarketing(args.user, universe)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  return {
    ok: true as const,
    universeId,
    universe,
  };
}

export async function resolveMarketingJobAccess(args: { user: IUpdateUserData; jobId: string; universeId?: string }) {
  const jobId = toSafeString(args.jobId);
  if (!jobId) {
    return { ok: false as const, status: 400, error: "job_id_required" };
  }

  const job = await getMarketingJobByJobId(jobId);
  if (!job) {
    return { ok: false as const, status: 404, error: "job_not_found" };
  }

  const jobUniverseId = toSafeString(job.universeId);
  if (!jobUniverseId) {
    return { ok: false as const, status: 400, error: "job_universe_missing" };
  }

  const requestedUniverseId = toSafeString(args.universeId);
  if (requestedUniverseId && requestedUniverseId !== jobUniverseId) {
    return { ok: false as const, status: 403, error: "job_universe_mismatch" };
  }

  const access = await assertMarketingUniverseAccess({
    user: args.user,
    universeId: jobUniverseId,
  });

  if (!access.ok) {
    return access;
  }

  return {
    ok: true as const,
    job,
    universeId: jobUniverseId,
    universe: access.universe,
  };
}
