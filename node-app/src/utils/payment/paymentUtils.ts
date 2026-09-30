/**
 * @docHint
 * @purpose paymentUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain payment
 * @scope client-only
 */

type SafeReturnToOptions = {
  fallback?: string;
  origin?: string;
  blockPrefixes?: string[];
};

// D4에서 /play/forge 계열의 canonical 경로 매핑만 채운다.
const CANONICAL_RETURN_PATH_MAPPINGS: readonly { from: string; to: string }[] = [
  { from: "/play/forge", to: "/assets-studio" },
];

function normalizeCanonicalReturnPath(path: string) {
  const mapping = CANONICAL_RETURN_PATH_MAPPINGS.find(({ from }) => {
    const suffix = path.slice(from.length);
    return (
      path.startsWith(from) &&
      (path === from || suffix.startsWith("/") || suffix.startsWith("?") || suffix.startsWith("#"))
    );
  });

  if (!mapping) return path;
  return `${mapping.to}${path.slice(mapping.from.length)}`;
}

export function resolveSafeReturnTo(
  raw: string | null | undefined,
  opts?: SafeReturnToOptions
) {
  const fallback = opts?.fallback ?? "/";
  const origin = opts?.origin ?? "";
  const blockPrefixes = opts?.blockPrefixes ?? ["/payment/success", "/payment/fail"];

  if (!raw) return fallback;

  let v = String(raw).trim();
  if (!v) return fallback;

  // URLSearchParams로 이미 디코딩되어 들어올 수 있어 1회만 시도
  try {
    v = decodeURIComponent(v);
  } catch {
    // ignore
  }

  // protocol-relative 방지
  if (v.startsWith("//")) return fallback;

  // 절대 URL이면 같은 origin만 허용 (origin 없으면 무조건 차단)
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (!origin || u.origin !== origin) return fallback;
      v = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return fallback;
    }
  }

  // 내부 라우트만 허용
  if (!v.startsWith("/")) return fallback;

  // LoginModule의 기존 오픈 리다이렉트 방어를 공유 계약에 유지
  if (v.includes("://")) return fallback;

  // 루프 방지
  if (blockPrefixes.some((p) => v.startsWith(p))) return fallback;

  // 개행 문자 등 방지
  if (/[\r\n]/.test(v)) return fallback;

  return normalizeCanonicalReturnPath(v);
}

// 현재 location에서 returnTo 뽑아내기
// - URL에 returnTo= 가 있으면 그 값을 우선하고, 없으면 pathname + search + hash
export function getReturnToFromLocation(loc: Location, opts?: { fallback?: string }) {
  const url = new URL(loc.href);
  const explicit = url.searchParams.get("returnTo");
  const candidate = explicit ?? `${url.pathname}${url.search}${url.hash}`;
  return resolveSafeReturnTo(candidate, { fallback: opts?.fallback ?? "/", origin: url.origin });
}
