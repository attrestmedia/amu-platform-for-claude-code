import type { Metadata } from "next";

// 서비스별 파비콘
export const GEN_STUDIO_ICON_ICO = "/assets/service-icons/gen-studio.ico" as const;
export const TUTORS_ICON_ICO = "/assets/service-icons/tutors.ico" as const;
export const MARKETING_OOPS_ICON_SVG = "/assets/service-icons/marketing-oops.ico" as const;

export function withSharedIcon(metadata: Metadata, iconHref: string): Metadata {
  const href = String(iconHref || "").trim();
  if (!href) return metadata;

  return {
    ...metadata,
    icons: {
      icon: href,
      shortcut: href,
      apple: href,
    },
  };
}
