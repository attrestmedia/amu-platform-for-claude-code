"use client";

import { type ReactNode, useEffect } from "react";

const SERVICE_THEME_ATTR = "data-service-theme";

export type ServiceThemeName = "gen-studio" | "tutors" | "marketing-oops" | "shopping-mall" | "play-forge";

export function ServiceThemeScope({ service, children }: { service: ServiceThemeName; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute(SERVICE_THEME_ATTR);

    root.setAttribute(SERVICE_THEME_ATTR, service);

    return () => {
      if (root.getAttribute(SERVICE_THEME_ATTR) !== service) return;
      if (previous) root.setAttribute(SERVICE_THEME_ATTR, previous);
      else root.removeAttribute(SERVICE_THEME_ATTR);
    };
  }, [service]);

  return <div data-service-theme={service} data-theme={service === "play-forge" ? "dark" : undefined}>{children}</div>;
}
