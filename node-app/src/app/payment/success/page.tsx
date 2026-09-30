"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import fetchClient from "libs/api/fetchClient";
import { Preloader, Button } from "@amu-labs/ui";
import { toast } from "sonner";
import { dispatchCoinUpdated, persistCoinUpdated, resolveSafeReturnTo } from "utils/payment";
import { Lang, lang } from "components/module/i18n";
import { trackGaEvent } from "utils/analytics/ga4";

import { toErrorLike, toUnknownRecord } from "utils/common";

const REDIRECT_DELAY = 3000; // 3초

const GuideMessage = ({ isBack }: { isBack: boolean }) => (
  <>
    {isBack ? (
      <Lang text={{ ko: "잠시 후 이전 페이지로 이동합니다…", en: "Redirecting back shortly…" }} />
    ) : (
      <Lang text={{ ko: "잠시 후 홈으로 이동합니다…", en: "Redirecting to home shortly…" }} />
    )}
  </>
);

const MoveToButtonText = ({ isBack }: { isBack: boolean }) => (
  <>{isBack ? <Lang text={{ ko: "이전 페이지로", en: "Back" }} /> : <Lang text={{ ko: "홈으로", en: "Home" }} />}</>
);

export default function PaySuccessPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const [apiResult, setApiResult] = useState<boolean | null>(null);
  const calledRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 결제 컨텍스트는 URL search params에서 파생되므로 useMemo로 계산
  const paymentContext = useMemo(() => {
    const paymentKey = sp.get("paymentKey");
    const orderId = sp.get("orderId");
    const scope = sp.get("scope");
    const amount = sp.get("amount");
    const isCommerceBilling = scope === "universe" || !!orderId?.startsWith("amu_uni_");
    const targetUniverseId = sp.get("universeId");
    const returnTo =
      resolveSafeReturnTo(sp.get("returnTo"), {
        fallback: "",
        origin: typeof window !== "undefined" ? window.location.origin : "",
      }) || null;
    const hasRequiredParams = !!paymentKey && !!orderId && !!amount;
    return { paymentKey, orderId, scope, amount, isCommerceBilling, targetUniverseId, returnTo, hasRequiredParams };
  }, [sp]);

  // ok 상태는 (1) 필수 파라미터 검증 (2) API 결과 두 단계로 파생된다.
  const ok = paymentContext.hasRequiredParams ? apiResult : false;

  const fallbackTarget =
    paymentContext.isCommerceBilling && paymentContext.targetUniverseId
      ? `/admin/${paymentContext.targetUniverseId}`
      : "/";
  const redirectTarget = paymentContext.returnTo || fallbackTarget;
  const isBack = redirectTarget !== "/";

  useEffect(() => {
    const { paymentKey, orderId, scope, amount, isCommerceBilling, targetUniverseId, hasRequiredParams } = paymentContext;

    if (!hasRequiredParams) {
      toast.error(lang({ ko: "필수 파라미터가 누락되었습니다.", en: "Missing required parameters." }));
      return;
    }

    // 개발 StrictMode로 인한 이중 호출 방지
    if (calledRef.current) return;
    calledRef.current = true;

    (async () => {
      try {
        const endpoint = (() => {
          if (scope === "universe") return "/commerce/payments/confirm";
          if (scope === "user") return "/payments/confirm";
          return isCommerceBilling ? "/commerce/payments/confirm" : "/payments/confirm"; // 기존 주문번호 규칙으로 자동 판별
        })();

        const res = await fetchClient.post(endpoint, {
          paymentKey,
          orderId,
          amount: Number(amount),
        });

        if (res.data?.ok) {
          setApiResult(true);

          trackGaEvent("coin_recharge_complete", {
            scope: scope || (isCommerceBilling ? "universe" : "user"),
            value: Number(amount),
          });

          const creditedRaw = Number(res.data?.payment?.creditedCoins);
          const credited = Number.isFinite(creditedRaw) && creditedRaw > 0 ? creditedRaw : undefined;

          if (isCommerceBilling && targetUniverseId) {
            // 1) 라우트 전환 대비 임시 저장
            persistCoinUpdated({ scope: "universe", universeId: targetUniverseId, amount: credited });
            // 2) 즉시 수신 가능한 페이지를 위해 이벤트 발송
            dispatchCoinUpdated({ scope: "universe", universeId: targetUniverseId, amount: credited });
          } else {
            // 개인 지갑 충전
            persistCoinUpdated({ scope: "user", amount: credited });
            dispatchCoinUpdated({ scope: "user", amount: credited });
          }
        } else {
          setApiResult(false);
        }
      } catch (e) {
        const response = toUnknownRecord(toErrorLike(e).response);
        const data = toUnknownRecord(response.data);
        const message = typeof data.error === "string" ? data.error : "";
        toast.error(message || lang({ ko: "결제 승인에 실패했습니다.", en: "Payment confirmation failed." }));
        setApiResult(false);
      }
    })();
  }, [paymentContext]);

  // 결제 결과에 따라 3초 후 홈으로 이동
  useEffect(() => {
    if (ok === null) return;

    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);

    redirectTimerRef.current = setTimeout(() => {
      router.replace(redirectTarget);
    }, REDIRECT_DELAY);

    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [ok, router, redirectTarget]);

  if (ok === null) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return (
    <div className="p-6 flex flex-col items-center gap-4">
      {ok ? (
        <>
          <div className="text-green-600 font-semibold">
            <Lang text={{ ko: "결제가 완료되었습니다.", en: "Payment completed." }} />
          </div>
          <div className="text-gray-500 text-sm">
            <GuideMessage isBack={isBack} />
          </div>
          <Button variant="outline" onClick={() => router.replace(redirectTarget)}>
            <MoveToButtonText isBack={isBack} />
          </Button>
        </>
      ) : (
        <>
          <div className="text-red-600 font-semibold">
            <Lang text={{ ko: "결제 승인에 실패했습니다.", en: "Payment confirmation failed." }} />
          </div>
          <div className="text-gray-500 text-sm">
            <GuideMessage isBack={isBack} />
          </div>
          <Button onClick={() => router.replace(redirectTarget)}>
            <MoveToButtonText isBack={isBack} />
          </Button>
        </>
      )}
    </div>
  );
}
