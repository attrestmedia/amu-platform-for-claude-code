import "server-only";

import { USER_ROLES } from "consts/auth";
import { MARKETING_FEATURE_ENABLED } from "consts/marketing/server";
import { canEditUniverse, getUserRole } from "libs/server-utils/auth/userRoleUtils";
import type { IUniverse } from "types/game";
import type { IUpdateUserData } from "types/user";

export const MARKETING_OPERATOR_ROUTE_PREFIX = "/api/marketing";
export const MARKETING_HOOK_ROUTE_PREFIX = "/api/marketing/hooks";
export const MARKETING_SYSTEM_ROUTE_PREFIX = "/api/marketing/system";

export function isMarketingFeatureEnabled() {
  return MARKETING_FEATURE_ENABLED;
}

export function assertMarketingFeatureEnabled() {
  if (MARKETING_FEATURE_ENABLED) return;

  const error = new Error("MARKETING_FEATURE_DISABLED") as Error & { errorCode?: string };
  error.errorCode = "MARKETING_FEATURE_DISABLED";
  throw error;
}

export function canOperateMarketing(user: IUpdateUserData, universe?: IUniverse) {
  const roles = getUserRole(user);

  if (roles.includes(USER_ROLES.ADMINISTRATOR)) {
    return true;
  }

  if (!universe) {
    return false;
  }

  return canEditUniverse(user, universe);
}
