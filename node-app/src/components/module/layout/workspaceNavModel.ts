import type { LucideIcon } from "lucide-react";

export type WorkspaceLocalizedText = { ko: string; en: string };

export type WorkspaceNavItem = {
  id: string;
  label: WorkspaceLocalizedText | string;
  href: string;
  icon?: LucideIcon;
  exactMatch?: boolean;
  badge?: { value: number; label: WorkspaceLocalizedText };
};

export type WorkspaceNavSection = {
  id: string;
  label?: WorkspaceLocalizedText;
  items: WorkspaceNavItem[];
};

export function isWorkspaceNavItemActive(
  pathname: string,
  item: Pick<WorkspaceNavItem, "href" | "exactMatch">,
): boolean {
  const hrefPath = item.href.split(/[?#]/)[0];
  if (item.exactMatch) return pathname === hrefPath;
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}
