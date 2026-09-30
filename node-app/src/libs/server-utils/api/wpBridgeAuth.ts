import "server-only";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { toSafeString } from "utils/common/typeUtils";

function toPositiveInt(raw: string, fallback: number) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseAllowedSites(csvRaw?: string) {
  const csv = toSafeString(csvRaw || process.env.WP_BRIDGE_ALLOWED_SITES || "allmyuniverse.com");
  const out = csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(out.length ? out : ["allmyuniverse.com"]);
}

function canonicalQuery(searchParams: URLSearchParams) {
  const pairs = Array.from(searchParams.entries());
  pairs.sort((a, b) => {
    if (a[0] === b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  const aa = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function verifyWpBridgeRequest(args: {
  request: NextRequest;
}): { ok: true; site: string } | { ok: false; status: number; error: string } {
  const request = args.request;
  const secret = toSafeString(process.env.WP_BRIDGE_SECRET);
  if (!secret) return { ok: false, status: 503, error: "wp_bridge_not_configured" };

  const site = toSafeString(request.headers.get("x-amu-wp-site")).toLowerCase();
  const tsRaw = toSafeString(request.headers.get("x-amu-wp-ts"));
  const signature = toSafeString(request.headers.get("x-amu-wp-signature")).toLowerCase();

  if (!site) return { ok: false, status: 401, error: "site_required" };
  if (!tsRaw || !signature) return { ok: false, status: 401, error: "signature_required" };

  const allowedSites = parseAllowedSites();
  if (!allowedSites.has(site)) return { ok: false, status: 403, error: "site_not_allowed" };

  const ts = toPositiveInt(tsRaw, -1);
  if (ts <= 0) return { ok: false, status: 401, error: "invalid_timestamp" };

  const maxSkewSec = toPositiveInt(String(process.env.WP_BRIDGE_MAX_SKEW_SEC || "300"), 300);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > maxSkewSec) {
    return { ok: false, status: 401, error: "timestamp_expired" };
  }

  const parsed = new URL(request.url);
  const payload = [
    request.method.toUpperCase(),
    parsed.pathname,
    canonicalQuery(parsed.searchParams),
    site,
    String(ts),
  ].join("\n");

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  if (!safeEqualHex(expected, signature)) {
    return { ok: false, status: 401, error: "signature_invalid" };
  }

  return { ok: true, site };
}

export function verifyWpBridgeJsonRequest(args: {
  request: NextRequest;
  bodyText: string;
}): { ok: true; site: string } | { ok: false; status: number; error: string } {
  const request = args.request;
  const secret = toSafeString(process.env.WP_BRIDGE_SECRET);
  if (!secret) return { ok: false, status: 503, error: "wp_bridge_not_configured" };

  const site = toSafeString(request.headers.get("x-amu-wp-site")).toLowerCase();
  const tsRaw = toSafeString(request.headers.get("x-amu-wp-ts"));
  const signature = toSafeString(request.headers.get("x-amu-wp-signature")).toLowerCase();
  const suppliedBodyHash = toSafeString(request.headers.get("x-amu-wp-content-sha256")).toLowerCase();
  if (!site || !tsRaw || !signature || !suppliedBodyHash) {
    return { ok: false, status: 401, error: "signature_required" };
  }
  if (!parseAllowedSites().has(site)) return { ok: false, status: 403, error: "site_not_allowed" };
  const ts = toPositiveInt(tsRaw, -1);
  const maxSkewSec = toPositiveInt(String(process.env.WP_BRIDGE_MAX_SKEW_SEC || "300"), 300);
  if (ts <= 0 || Math.abs(Math.floor(Date.now() / 1000) - ts) > maxSkewSec) {
    return { ok: false, status: 401, error: "timestamp_expired" };
  }
  const bodyHash = crypto.createHash("sha256").update(args.bodyText).digest("hex");
  if (!safeEqualHex(bodyHash, suppliedBodyHash)) {
    return { ok: false, status: 401, error: "body_hash_invalid" };
  }
  const parsed = new URL(request.url);
  const payload = [
    request.method.toUpperCase(),
    parsed.pathname,
    canonicalQuery(parsed.searchParams),
    site,
    String(ts),
    bodyHash,
  ].join("\n");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return safeEqualHex(expected, signature)
    ? { ok: true, site }
    : { ok: false, status: 401, error: "signature_invalid" };
}
