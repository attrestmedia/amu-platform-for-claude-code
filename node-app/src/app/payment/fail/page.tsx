"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@amu-labs/ui";
import { resolveSafeReturnTo } from "utils/payment";
import { Lang, lang } from "components/module/i18n";

export default function PayFailPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const msg =
    sp.get("message") || lang({ ko: "결제가 취소되었거나 실패했습니다.", en: "Payment was cancelled or failed." });
  const returnTo = resolveSafeReturnTo(sp.get("returnTo"), {
    fallback: "",
    origin: typeof window !== "undefined" ? window.location.origin : "",
  });
  const isBack = returnTo !== "/";

  return (
    <div className="flex-col-center gap-4 p-6">
      <div className="text-red-600 font-semibold">{msg}</div>
      <Button variant="outline" onClick={() => router.replace(returnTo)}>
        {isBack ? <Lang text={{ ko: "이전 페이지로", en: "Back" }} /> : <Lang text={{ ko: "홈으로", en: "Home" }} />}
      </Button>
    </div>
  );
}
