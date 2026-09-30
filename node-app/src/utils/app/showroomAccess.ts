import type { ICommerceShowroomConfig, IUniverse } from "types/game";

function normalizeIsoDateTime(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function toMillis(value?: string | null) {
  const normalized = normalizeIsoDateTime(value);
  if (!normalized) return null;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : null;
}

function normalizeEmail(value?: string | null) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  return raw || null;
}

export function getCommerceShowroomConfig(
  universe?: Pick<IUniverse, "type" | "typeSpecific"> | null,
): ICommerceShowroomConfig | null {
  if (!universe || universe.type !== "commerce") return null;

  const raw = universe.typeSpecific?.showroom as ICommerceShowroomConfig | undefined;
  if (!raw || typeof raw !== "object") return null;

  return {
    enabled: raw.enabled === true,
    opensAt: normalizeIsoDateTime(raw.opensAt),
    closesAt: normalizeIsoDateTime(raw.closesAt),
  };
}

export function isCommerceShowroomPublicOpen(
  universe?: Pick<IUniverse, "type" | "typeSpecific"> | null,
  now = Date.now(),
) {
  const showroom = getCommerceShowroomConfig(universe);
  if (!showroom?.enabled) return false;

  const opensAt = toMillis(showroom.opensAt);
  const closesAt = toMillis(showroom.closesAt);

  if (opensAt != null && now < opensAt) return false;
  if (closesAt != null && now > closesAt) return false;
  return true;
}

export function isCommerceShowroomAccessible(
  universe?: Pick<IUniverse, "type" | "typeSpecific" | "commerceAdmins"> | null,
  options?: { isAdministrator?: boolean; userEmail?: string | null; now?: number },
) {
  if (!universe || universe.type !== "commerce") return true;
  if (options?.isAdministrator) return true;

  const viewerEmail = normalizeEmail(options?.userEmail);
  const allowedAdmins = Array.isArray(universe.commerceAdmins)
    ? universe.commerceAdmins.map((item) => normalizeEmail(item)).filter(Boolean)
    : [];

  if (viewerEmail && allowedAdmins.includes(viewerEmail)) return true;
  return isCommerceShowroomPublicOpen(universe, options?.now);
}
