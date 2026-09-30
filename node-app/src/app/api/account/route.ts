import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getAccountLifecycle, requestAccountDeletion } from "libs/server-utils/auth/accountLifecycleService";
import {
  ACCOUNT_DELETION_INGRESS_HOLD_ERROR,
  ACCOUNT_DELETION_INGRESS_HOLD_MESSAGE,
  ACCOUNT_DELETION_SUPPORT_EMAIL,
  isIntegratedAccountDeletionIngress,
} from "libs/server-utils/auth/accountDeletionState";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

function accountIdentity(user: unknown) {
  const record = toUnknownRecord(user);
  return {
    uid: String(record.uid || record.ID || ""),
    email: String(record.userEmail || record.user_email || "").trim().toLowerCase(),
  };
}

async function handleGET(_data: unknown, user: unknown) {
  const identity = accountIdentity(user);
  return NextResponse.json({ ok: true, account: await getAccountLifecycle(identity.uid, identity.email) });
}

type DeleteBody = { confirmation?: string; acknowledged?: boolean };

function deletionErrorMessage(errorCode: string) {
  if (errorCode === "REFUND_REVIEW_REQUIRED") return "잔여 코인 또는 이용 중인 구독이 있어 환불·정산 검토가 필요합니다. 고객지원으로 문의해 주세요.";
  if (errorCode === "ADMIN_ACCOUNT_DELETION_FORBIDDEN") return "관리자 계정은 자동 탈퇴할 수 없습니다.";
  if (errorCode === ACCOUNT_DELETION_INGRESS_HOLD_ERROR) return ACCOUNT_DELETION_INGRESS_HOLD_MESSAGE;
  return `요청은 유지되며 고객지원에서 수동 검토합니다. 문의: ${ACCOUNT_DELETION_SUPPORT_EMAIL}`;
}

async function handlePOST(data: DeleteBody, user: unknown) {
  if (!isIntegratedAccountDeletionIngress()) {
    return NextResponse.json(
      { ok: false, errorCode: ACCOUNT_DELETION_INGRESS_HOLD_ERROR, error: ACCOUNT_DELETION_INGRESS_HOLD_MESSAGE, requestId: null, retryable: true },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }
  if (data.confirmation !== "회원탈퇴" || data.acknowledged !== true) {
    return NextResponse.json(
      { ok: false, error: "확인 문구와 탈퇴 유의사항 확인이 필요합니다.", errorCode: "DELETION_CONFIRMATION_REQUIRED" },
      { status: 400 },
    );
  }
  const identity = accountIdentity(user);
  const result = await requestAccountDeletion({ ...identity, source: "platform" });
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: deletionErrorMessage(result.errorCode),
        errorCode: result.errorCode,
        requestId: "requestId" in result ? result.requestId : undefined,
        retryable: result.retryable,
        account: result.snapshot,
      },
      { status: result.status },
    );
  }
  return NextResponse.json(result, { status: 202 });
}

export const GET = withAuth(handleGET, undefined, "account:get", {
  bodyParser: "none",
  allowStalePolicyConsent: true,
});
export const POST = withAuth<DeleteBody>(handlePOST, undefined, "account:delete", {
  bodyParser: "json",
  allowStalePolicyConsent: true,
});
