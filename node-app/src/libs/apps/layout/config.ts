export type MiniAppShellConfig = {
  showShell: boolean;
  showFooter?: boolean;
  redirectPath?: string;
};

const ROOT_CONFIG: MiniAppShellConfig = {
  showShell: false,
};

const DEFAULT_CONFIG: MiniAppShellConfig = {
  showShell: true,
  showFooter: true,
};

export function extractMiniAppSlug(pathname: string) {
  const parts = String(pathname || "")
    .split("/")
    .filter(Boolean);
  const appsIdx = parts.indexOf("apps");
  return appsIdx >= 0 ? parts[appsIdx + 1] || "" : "";
}

export function resolveMiniAppShellConfig(pathname: string): MiniAppShellConfig {
  const slug = extractMiniAppSlug(pathname);
  if (!slug) return ROOT_CONFIG;
  return DEFAULT_CONFIG;
}
