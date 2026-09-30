const MARKETING_EM_DASH_PATTERN = /\u2014/g;

export function normalizeMarketingTextSymbols(raw: unknown) {
  return String(raw || "").replace(MARKETING_EM_DASH_PATTERN, "-");
}
