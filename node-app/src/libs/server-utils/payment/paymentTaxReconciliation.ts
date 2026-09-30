import "server-only";

export const PAYMENT_TAX_RECONCILIATION_FAILURE_CODE = "PAYMENT_TAX_RECONCILIATION_FAILED" as const;
export const PAYMENT_CONFIRM_RESPONSE_INVALID_CODE = "PAYMENT_CONFIRM_RESPONSE_INVALID" as const;

export type PaymentTaxSnapshot = {
  totalAmount?: unknown;
  suppliedAmount?: unknown;
  vat?: unknown;
  taxFreeAmount?: unknown;
};

export type TossPaymentTaxResponse = PaymentTaxSnapshot & {
  status?: unknown;
  method?: unknown;
};

type ValidMoneySnapshot = {
  totalAmount: number;
  suppliedAmount: number;
  vat: number;
  taxFreeAmount: number;
};

export type PaymentTaxReconciliationResult =
  | {
      ok: true;
      expected: ValidMoneySnapshot;
      actual: ValidMoneySnapshot;
      status: string;
      method?: string;
    }
  | {
      ok: false;
      code: typeof PAYMENT_TAX_RECONCILIATION_FAILURE_CODE | typeof PAYMENT_CONFIRM_RESPONSE_INVALID_CODE;
      reason: string;
      field?: keyof PaymentTaxSnapshot;
      expected?: number;
      actual?: number;
    };

function readMoney(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readSnapshot(input: PaymentTaxSnapshot): ValidMoneySnapshot | null {
  const totalAmount = readMoney(input.totalAmount);
  const suppliedAmount = readMoney(input.suppliedAmount);
  const vat = readMoney(input.vat);
  const taxFreeAmount = readMoney(input.taxFreeAmount);
  if (totalAmount === null || suppliedAmount === null || vat === null || taxFreeAmount === null) return null;
  return { totalAmount, suppliedAmount, vat, taxFreeAmount };
}

function mismatch(
  field: keyof PaymentTaxSnapshot,
  expected: number,
  actual: number,
): PaymentTaxReconciliationResult {
  return {
    ok: false,
    code: PAYMENT_TAX_RECONCILIATION_FAILURE_CODE,
    reason: `${field} 불일치`,
    field,
    expected,
    actual,
  };
}

/**
 * 주문 스냅샷과 Toss 승인 응답을 원 단위 exact로 비교한다.
 * 입력 누락/null/소수/음수/합계 불일치는 모두 fail-closed다.
 */
export function reconcilePaymentTax(
  expectedInput: PaymentTaxSnapshot,
  actualInput: TossPaymentTaxResponse,
): PaymentTaxReconciliationResult {
  if (actualInput.status !== "DONE") {
    return {
      ok: false,
      code: PAYMENT_CONFIRM_RESPONSE_INVALID_CODE,
      reason: "Toss 승인 응답 status가 DONE이 아닙니다.",
    };
  }

  const expected = readSnapshot(expectedInput);
  const actual = readSnapshot(actualInput);
  if (!expected || !actual) {
    return {
      ok: false,
      code: PAYMENT_TAX_RECONCILIATION_FAILURE_CODE,
      reason: "주문 또는 Toss 응답의 세액 필드가 누락·null·비정수·음수입니다.",
    };
  }

  if (expected.taxFreeAmount !== 0 || actual.taxFreeAmount !== 0) {
    return mismatch("taxFreeAmount", expected.taxFreeAmount, actual.taxFreeAmount);
  }

  const fields: (keyof PaymentTaxSnapshot)[] = ["totalAmount", "suppliedAmount", "vat", "taxFreeAmount"];
  for (const field of fields) {
    if (expected[field] !== actual[field]) return mismatch(field, expected[field], actual[field]);
  }

  if (actual.totalAmount !== actual.suppliedAmount + actual.vat + actual.taxFreeAmount) {
    return {
      ok: false,
      code: PAYMENT_TAX_RECONCILIATION_FAILURE_CODE,
      reason: "Toss 응답 totalAmount 합계가 suppliedAmount + vat + taxFreeAmount와 다릅니다.",
    };
  }

  return {
    ok: true,
    expected,
    actual,
    status: "DONE",
    method: typeof actualInput.method === "string" ? actualInput.method : undefined,
  };
}

export function buildPaymentTaxSnapshot(payment: PaymentTaxSnapshot & { amount?: unknown }): PaymentTaxSnapshot {
  return {
    totalAmount: payment.totalAmount ?? payment.amount,
    suppliedAmount: payment.suppliedAmount,
    vat: payment.vat,
    taxFreeAmount: payment.taxFreeAmount,
  };
}
