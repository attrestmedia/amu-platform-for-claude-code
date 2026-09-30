export type PaymentStatusAccessDecision = "allow" | "require_universe_edit" | "deny";

const PAYMENT_ORDER_ID_PATTERN = /^[0-9A-Za-z._-]{6,64}$/;

function normalizeId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolvePaymentStatusOrderId(routeOrderId: unknown, queryOrderIds: readonly unknown[]) {
  const orderId = normalizeId(routeOrderId);
  if (!PAYMENT_ORDER_ID_PATTERN.test(orderId)) {
    return { ok: false as const, errorCode: "PAYMENT_ORDER_ID_INVALID" as const };
  }

  const queryValues = queryOrderIds.map(normalizeId).filter(Boolean);
  if (queryValues.some((value) => value !== orderId)) {
    return { ok: false as const, errorCode: "ROUTE_ORDER_ID_MISMATCH" as const };
  }

  return { ok: true as const, orderId };
}

export function resolvePaymentStatusAccess(input: {
  scope: unknown;
  userUid: unknown;
  paymentUid?: unknown;
  adminUid?: unknown;
  universeId?: unknown;
}): PaymentStatusAccessDecision {
  const userUid = normalizeId(input.userUid);
  if (!userUid) return "deny";

  if (input.scope === "user") {
    return normalizeId(input.paymentUid) === userUid ? "allow" : "deny";
  }

  if (input.scope === "universe") {
    if (normalizeId(input.adminUid) === userUid) return "allow";
    return normalizeId(input.universeId) ? "require_universe_edit" : "deny";
  }

  return "deny";
}
