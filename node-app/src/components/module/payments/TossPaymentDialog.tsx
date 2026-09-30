"use client";

import { useEffect, useRef, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { logger } from "utils/log";
import { buildTossCustomerKey, getReturnToFromLocation } from "utils/payment";
import { toErrorMessage, toErrorLike, isUnknownRecord } from "utils/common/typeUtils";
import fetchClient from "libs/api/fetchClient";
import { toast } from "sonner";
import type { UserScopeType } from "types/ai";
import type { UserPurposeType } from "types/payment";
import { TOSS_WIDGET_CLIENT_KEY, TOSS_SUCCESS_PATH, TOSS_FAIL_PATH } from "consts/env/public";

type Toss = Awaited<ReturnType<typeof loadTossPayments>>;
type TossWidgets = ReturnType<Toss["widgets"]>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  uid?: string;
  scope?: UserScopeType;
  mode: UserPurposeType;
  stageCount?: number;
  packAmount?: number;
  customAmount?: number;
  universeId?: string; // universe scope일 때
  adminUid?: string; // universe scope일 때 결제자(어드민)
};

export default function TossPaymentDialog({
  open,
  onOpenChange,
  uid,
  scope = "user",
  mode,
  stageCount = 1,
  packAmount,
  customAmount,
  universeId,
  adminUid,
}: Props) {
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState(0);
  const [suppliedAmount, setSuppliedAmount] = useState(0);
  const [vat, setVat] = useState(0);
  const [creditedCoins, setCreditedCoins] = useState(0);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [ready, setReady] = useState(false);

  const clientKey = TOSS_WIDGET_CLIENT_KEY;
  const successPath = TOSS_SUCCESS_PATH;
  const failPath = TOSS_FAIL_PATH;

  // Toss SDK & Widgets 인스턴스 재사용
  const tossRef = useRef<Toss | null>(null);
  const widgetsRef = useRef<TossWidgets | null>(null);
  const lastAmountRef = useRef<number | null>(null);

  const prepareEndpoint = scope === "universe" ? "/commerce/payments/prepare" : "/payments/prepare";

  // 1) 결제 준비 (orderId/amount 확정)
  useEffect(() => {
    if (!open) return;
    if (scope === "universe" && !policyAccepted) return;
    if (orderId) return;
    if (!clientKey) {
      toast.error("Toss 공개 키가 설정되어 있지 않습니다. 환경변수를 확인해주세요.");
      onOpenChange(false);
      return;
    }
    (async () => {
      try {
        const payload =
          scope === "universe"
            ? { universeId, adminUid, purpose: mode, packAmount, policyAccepted: true }
            : { uid, purpose: mode, stageCount, packAmount, customAmount };
        const res = await fetchClient.post(prepareEndpoint, payload, { loading: "global" });
        setOrderId(res.data.orderId);
        setAmount(res.data.amount);
        setSuppliedAmount(Number(res.data.suppliedAmount ?? res.data.amount ?? 0));
        setVat(Number(res.data.vat ?? 0));
        setCreditedCoins(Number(res.data.creditedCoins ?? 0));
      } catch (e: unknown) {
        const err = toErrorLike(e);
        const responseData = isUnknownRecord(err.response) ? (err.response as { data?: unknown }).data : undefined;
        const responseError = isUnknownRecord(responseData) ? String(responseData.error || "") : "";
        toast.error(responseError || toErrorMessage(e, "결제 준비 실패"));
        onOpenChange(false);
      }
    })();
  }, [
    open,
    clientKey,
    onOpenChange,
    prepareEndpoint,
    scope,
    universeId,
    adminUid,
    uid,
    mode,
    stageCount,
    packAmount,
    customAmount,
    policyAccepted,
    orderId,
  ]);

  // 2) Toss 위젯 초기화 & 렌더 (한 번만) + 금액 세팅(변경시에만)
  useEffect(() => {
    if (!open || !orderId || !amount || !clientKey) return;

    let cancelled = false;

    (async () => {
      try {
        if (!tossRef.current) {
          tossRef.current = await loadTossPayments(clientKey);
        }

        // universe 결제는 adminUid(결제자) 기준
        const customerId = (scope === "universe" ? adminUid : uid) || uid;
        if (!customerId) throw new Error("결제자 식별 정보(uid)가 없습니다.");
        const customerKey = buildTossCustomerKey(customerId);

        if (!widgetsRef.current) {
          // 위젯 최초 생성 & 렌더
          widgetsRef.current = tossRef.current.widgets({ customerKey });
          await widgetsRef.current.setAmount({ currency: "KRW", value: amount });
          lastAmountRef.current = amount;
          await widgetsRef.current.renderPaymentMethods({ selector: "#payment-methods", variantKey: "DEFAULT" });
          await widgetsRef.current.renderAgreement({ selector: "#agreement" });
        } else if (lastAmountRef.current !== amount) {
          // 금액이 바뀐 경우에만 setAmount (선택 초기화 방지)
          await widgetsRef.current.setAmount({ currency: "KRW", value: amount });
          lastAmountRef.current = amount;
        }

        if (!cancelled) setReady(true);
      } catch (e) {
        logger.error("Toss widget init/render error:", e);
        if (!cancelled) toast.error("결제 UI 로딩 실패");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, orderId, amount, uid, clientKey, scope, adminUid]);

  // 3) 결제 요청 (항상 같은 widgets 인스턴스 사용!)
  const handlePay = async () => {
    try {
      if (!widgetsRef.current || !orderId) {
        toast.error("결제 UI가 아직 준비되지 않았습니다.");
        return;
      }
      setReady(false); // 중복 클릭 방지

      const origin = window.location.origin;
      const returnTo = getReturnToFromLocation(window.location, { fallback: "/" });
      const successParams = new URL(`${origin}${successPath}`);
      const failParams = new URL(`${origin}${failPath}`);

      if (scope === "universe" && universeId) successParams.searchParams.set("universeId", universeId);
      successParams.searchParams.set("scope", scope === "universe" ? "universe" : "user");
      successParams.searchParams.set("returnTo", returnTo);

      if (scope === "universe" && universeId) failParams.searchParams.set("universeId", universeId);
      failParams.searchParams.set("scope", scope === "universe" ? "universe" : "user");
      failParams.searchParams.set("returnTo", returnTo);

      await widgetsRef.current.requestPayment({
        orderId,
        orderName:
          scope === "universe"
            ? mode === "subscription"
              ? "AMU 유니버스 월 멤버십"
              : "AMU 유니버스 Charged 코인 충전"
            : mode === "subscription"
              ? `AMU 구독(${stageCount} 스테이지)`
              : `AMU 코인 충전(${amount.toLocaleString()}원)`,
        successUrl: successParams.toString(),
        failUrl: failParams.toString(),
      });
    } catch (e: unknown) {
      toast.error(toErrorMessage(e, "결제 요청 실패"));
      setReady(true);
    }
  };

  // 다이얼로그 닫힐 때 state 초기화 — adjusting state during render 패턴 (state만 갱신)
  const [trackedOpen, setTrackedOpen] = useState(open);
  if (trackedOpen !== open) {
    setTrackedOpen(open);
    if (!open) {
      setOrderId("");
      setAmount(0);
      setSuppliedAmount(0);
      setVat(0);
      setCreditedCoins(0);
      setPolicyAccepted(false);
      setReady(false);
    }
  }

  // ref 및 DOM 정리는 effect에서 수행 (render에서 ref 갱신 금지)
  useEffect(() => {
    if (open) return;
    widgetsRef.current = null;
    tossRef.current = null;
    lastAmountRef.current = null;
    document.getElementById("payment-methods")?.replaceChildren();
    document.getElementById("agreement")?.replaceChildren();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[200]"
        innerWrapClassName="min-w-[20rem] md:min-w-[30rem] max-h-[calc(100vh-1rem)] supports-[height:100dvh]:max-h-[calc(100dvh-1rem)] overflow-hidden [grid-template-rows:auto_minmax(0,1fr)] [&>button]:h-11 [&>button]:w-11"
        centered
      >
        <DialogHeader className="pr-12">
          <DialogTitle>
            <Lang
              text={scope === "universe"
                ? mode === "subscription"
                  ? { ko: "유니버스 멤버십 결제", en: "Universe Membership Payment" }
                  : { ko: "유니버스 코인 충전", en: "Universe Coin Top-up" }
                : mode === "subscription"
                  ? { ko: "월 구독 결제", en: "Monthly Subscription" }
                  : { ko: "코인 충전", en: "Coin Top-up" }}
            />
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 scrollbar-ghost">
          {scope === "universe" && (
            <div className="rounded-lg border border-border bg-surface/70 p-3 text-xs text-secondary-text space-y-1">
              <p><Lang text={{ ko: "Membership과 Charged 코인은 이 유니버스 안의 과금 대상 서비스에서만 사용되며 환전·양도·이전할 수 없습니다.", en: "Membership and Charged coins may only be used for billable services in this universe and cannot be cashed out, transferred, or assigned." }} /></p>
              {mode === "subscription" ? (
                <>
                  <p><Lang text={{ ko: "공급가 50,000원(VAT 별도), 5% 추가 지급으로 52,500코인이 지급됩니다.", en: "The supplied amount is KRW 50,000 plus VAT, and 52,500 coins are credited with the 5% bonus." }} /></p>
                  <p><Lang text={{ ko: "구독은 결제일 기준 한 달 anniversary 방식이며, 미사용 Membership 코인은 기간 종료 시 만료됩니다.", en: "The subscription renews monthly on the payment anniversary, and unused Membership coins expire at the end of the period." }} /></p>
                  <p><Lang text={{ ko: "서비스 적용·사용분은 전자상거래법, 콘텐츠 이용자보호지침과 약관에 따라 환불 금액에서 공제될 수 있습니다.", en: "Applied or consumed services may be deducted from refunds under applicable law, content-user guidelines, and the terms." }} /></p>
                </>
              ) : (
                <p><Lang text={{ ko: "Charged 코인은 Membership 다음 순서로 사용되며, 활성 Membership 코인이 있을 때만 충전할 수 있습니다.", en: "Charged coins are used after Membership coins and can only be topped up while active Membership coins remain." }} /></p>
              )}
              <label className="mt-2 flex cursor-pointer items-start gap-2 font-medium text-primary-text">
                <input
                  type="checkbox"
                  checked={policyAccepted}
                  onChange={(event) => setPolicyAccepted(event.target.checked)}
                  className="mt-0.5"
                />
                <Lang text={{ ko: "위 운영 자격, 지급 코인, 이용 기간, 만료 및 환불 조건을 확인하고 동의합니다.", en: "I have reviewed and agree to the eligibility, credited coins, term, expiration, and refund conditions above." }} />
              </label>
            </div>
          )}
          <div className="flex items-start justify-between gap-4 text-sm">
            {mode === "coin_pack" || scope === "universe" ? (
              <dl className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-600">
                    <Lang text={{ ko: "공급가액", en: "Supplied amount" }} />
                  </dt>
                  <dd>{suppliedAmount.toLocaleString()}원</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-600">
                    <Lang text={{ ko: "부가세(10%)", en: "VAT (10%)" }} />
                  </dt>
                  <dd>{vat.toLocaleString()}원</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-1">
                  <dt className="font-semibold">
                    <Lang text={{ ko: "총 결제금액", en: "Total payment" }} />
                  </dt>
                  <dd className="text-primary text-lg font-bold">{amount.toLocaleString()}원</dd>
                </div>
                {scope === "universe" && (
                  <div className="flex items-center justify-between gap-4">
                    <dt>지급 코인</dt><dd className="font-semibold">{creditedCoins.toLocaleString()}코인</dd>
                  </div>
                )}
              </dl>
            ) : (
              <div className="flex items-center gap-1">
                <span>
                  <Lang text={{ ko: "결제금액:", en: "Payment amount:" }} />
                </span>
                <b className="text-primary text-lg">{amount ? amount.toLocaleString() : 0}원</b>
              </div>
            )}
            <span className="shrink-0 font-light text-xs text-gray-500">
              {orderId ? orderId.slice(-10) : "-"}
            </span>
          </div>

          {/* 결제 모듈 로드 */}
          <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200">
            <div id="payment-methods" className="min-w-0 max-w-full" />
            <div id="agreement" className="min-w-0 max-w-full" />
          </div>

          <Button
            className="w-full h-11"
            onClick={handlePay}
            disabled={!ready || (scope === "universe" && !policyAccepted)}
            loading={!ready && (scope !== "universe" || policyAccepted)}
          >
            결제하기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
