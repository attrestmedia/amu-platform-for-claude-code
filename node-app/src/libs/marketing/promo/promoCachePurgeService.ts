import "server-only";

import crypto from "crypto";
import { toErrorMessage, toSafeString } from "utils/common/typeUtils";

export async function purgeWordPressPromoCache() {
  const secret = toSafeString(process.env.WP_BRIDGE_SECRET);
  const endpoint = toSafeString(process.env.WP_PROMO_CACHE_PURGE_URL);
  const site = toSafeString(process.env.WP_PROMO_SITE_HOST) || "allmyuniverse.com";
  if (!secret) return { ok: false as const, error: "wp_bridge_not_configured" };
  if (!endpoint) return { ok: false as const, error: "wp_promo_purge_endpoint_not_configured" };

  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ scope: "promo_slots" });
  const signature = crypto.createHmac("sha256", secret).update(`${ts}\n${site}\n${body}`).digest("hex");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-amu-wp-site": site,
        "x-amu-wp-ts": ts,
        "x-amu-wp-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || result.ok !== true) {
      return { ok: false as const, error: toSafeString(result.error) || `wp_promo_cache_purge_failed:${response.status}` };
    }
    return { ok: true as const, version: Number(result.version || 0) };
  } catch (error) {
    return { ok: false as const, error: toErrorMessage(error, "wp_promo_cache_purge_failed") };
  }
}
