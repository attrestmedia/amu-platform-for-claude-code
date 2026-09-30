import "server-only";

import { USER_ROLES } from "consts/auth";
import { getUniverses, getUniverseById } from "libs/database/universe";
import { getCredentialStatus } from "libs/database/secure/credentials";
import { canOperateMarketing } from "libs/marketing/access";
import { getUserFromDB, getUserRole } from "libs/server-utils/auth/userRoleUtils";
import type { UserRoles } from "consts/auth";
import type { IUniverse } from "types/game";
import type { IUpdateUserData } from "types/user";

export type MarketingAgentAction =
  | "read"
  | "pattern_read"
  | "pattern_enqueue"
  | "experiment_read"
  | "experiment_write"
  | "ads_read"
  | "enqueue_content"
  | "newsletter_draft"
  | "poll_worker"
  | "channel_action"
  | "strategy_write"
  | "typo_dictionary";

type AgentAuthIdentity = {
  uid: string;
  keyHash: string;
};

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = toSafeString(value).toLowerCase();
  if (!text) return fallback;
  return ["1", "true", "yes", "y", "on", "enabled"].includes(text);
}

function toStringArray(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : String(value || "").split(","))
        .map((item: unknown) => toSafeString(item).toLowerCase())
        .filter(Boolean),
    ),
  );
}

function isActionAllowed(extras: Record<string, unknown>, action: MarketingAgentAction) {
  if (action === "pattern_enqueue") return toBool(extras.allowEnqueueContent, true);
  if (action === "pattern_read") return toBool(extras.allowIntelligenceRead, true);
  if (action === "experiment_write") return toBool(extras.allowIntelligenceWrite, false);
  if (action === "experiment_read") return toBool(extras.allowIntelligenceRead, true);
  if (action === "enqueue_content") return toBool(extras.allowEnqueueContent, true);
  if (action === "newsletter_draft") return toBool(extras.allowNewsletterDraft, true);
  if (action === "poll_worker") return toBool(extras.allowPollWorker, true);
  if (action === "channel_action") return toBool(extras.allowChannelAction, true);
  if (action === "strategy_write") return toBool(extras.allowStrategyWrite, true);
  if (action === "typo_dictionary") return toBool(extras.allowTypoDictionary, true);
  if (action === "ads_read") return toBool(extras.allowAdsRead, false);
  return true;
}

async function loadAgentUser(auth: AgentAuthIdentity) {
  const user = await getUserFromDB(auth.uid);
  if (!user) {
    return { ok: false as const, status: 403, error: "agent_user_not_found" };
  }

  const userWithToObject = user as IUpdateUserData & { toObject?: () => IUpdateUserData };
  const plainUser = (typeof userWithToObject.toObject === "function" ? userWithToObject.toObject() : user) as IUpdateUserData;
  return {
    ok: true as const,
    user: plainUser,
    roles: getUserRole(plainUser),
  };
}

async function evaluateUniverseAccess(args: {
  user: IUpdateUserData;
  roles: UserRoles[];
  universe: IUniverse;
  action: MarketingAgentAction;
}) {
  const universeId = toSafeString(args.universe.id);
  const credential = (await getCredentialStatus(universeId)).agent;
  const extras = (credential?.extras || {}) as Record<string, unknown>;

  if (!credential || !toBool(extras.enabled, false)) {
    return { ok: false as const, status: 403, error: "agent_marketing_not_enabled" };
  }

  const allowedRoles = toStringArray(extras.allowedRoles);
  const effectiveAllowedRoles = allowedRoles.length > 0 ? allowedRoles : [USER_ROLES.ADMINISTRATOR];
  const roleAllowed = args.roles.some((role) => effectiveAllowedRoles.includes(role));
  if (!roleAllowed) {
    return { ok: false as const, status: 403, error: "agent_role_not_allowed" };
  }

  if (!canOperateMarketing(args.user, args.universe)) {
    return { ok: false as const, status: 403, error: "agent_universe_role_forbidden" };
  }

  if (!isActionAllowed(extras, args.action)) {
    return { ok: false as const, status: 403, error: "agent_action_not_allowed" };
  }

  return { ok: true as const, universeId, extras };
}

export async function resolveMarketingAgentUniverseAccess(args: {
  auth: AgentAuthIdentity;
  universeId: string;
  action: MarketingAgentAction;
}) {
  const universeId = toSafeString(args.universeId);
  if (!universeId) {
    return { ok: false as const, status: 400, error: "universe_id_required" };
  }

  const userResult = await loadAgentUser(args.auth);
  if (!userResult.ok) return userResult;

  const universe = await getUniverseById(universeId);
  if (!universe) {
    return { ok: false as const, status: 404, error: "universe_not_found" };
  }

  const access = await evaluateUniverseAccess({
    user: userResult.user,
    roles: userResult.roles,
    universe,
    action: args.action,
  });

  if (!access.ok) return access;

  return {
    ok: true as const,
    universeId,
    universe,
    user: userResult.user,
    roles: userResult.roles,
    extras: access.extras,
  };
}

export async function listMarketingAgentUniverseIds(args: {
  auth: AgentAuthIdentity;
  action: MarketingAgentAction;
}) {
  const userResult = await loadAgentUser(args.auth);
  if (!userResult.ok) return userResult;

  const universes = await getUniverses({ enabledOnly: false, sortByOrder: true });
  const allowed: string[] = [];

  for (const universe of universes) {
    const access = await evaluateUniverseAccess({
      user: userResult.user,
      roles: userResult.roles,
      universe,
      action: args.action,
    });

    if (access.ok) allowed.push(access.universeId);
  }

  return {
    ok: true as const,
    universeIds: allowed,
    user: userResult.user,
    roles: userResult.roles,
  };
}
