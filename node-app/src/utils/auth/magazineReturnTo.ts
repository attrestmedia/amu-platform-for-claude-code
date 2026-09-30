import { WP_HOME_URL } from "consts/env/public";

const configuredMagazineOrigin = (() => {
  try {
    return new URL(WP_HOME_URL).origin;
  } catch {
    return "";
  }
})();

export const MAGAZINE_HOME_URL = WP_HOME_URL;

export function resolveMagazineReturnTo(raw: string | null) {
  try {
    const value = new URL(raw || "");
    return value.origin === configuredMagazineOrigin ? value.toString() : "";
  } catch {
    return "";
  }
}
