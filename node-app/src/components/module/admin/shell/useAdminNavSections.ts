"use client";

import { usePathname } from "next/navigation";
import { useUserData } from "hooks/auth";
import { useAdminUniverseLinks } from "hooks/admin";
import { useAuthStore } from "store/auth";
import { buildAdminNavSections } from "./adminNavModel";

export function useAdminNavSections() {
  const pathname = usePathname() || "";
  const { userData } = useUserData();
  const userId = useAuthStore((state) => state.user?.id);
  const { adminUniverses } = useAdminUniverseLinks(userId);

  return buildAdminNavSections({
    isAdministrator: userData?.roles?.includes("administrator") === true,
    adminUniverses,
    pathname,
  });
}
