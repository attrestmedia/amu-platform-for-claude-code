"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AmuLogo, AmuSimbol } from "@amu-labs/ui/icons/brand/amu";
import { Button } from "@amu-labs/ui";
import { MAGAZINE_HOME_URL, resolveMagazineReturnTo } from "utils/auth/magazineReturnTo";
import { Lang } from "src/components/module/i18n";
import { LoadingDots } from "src/components/module/loading";

export default function MagazineReturnPage() {
  const searchParams = useSearchParams();
  const [requestFailed, setRequestFailed] = useState(false);
  const silent = searchParams.get("silent") === "1";
  const returnTo = useMemo(() => resolveMagazineReturnTo(searchParams.get("returnTo")), [searchParams]);
  const error = !returnTo || requestFailed;

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/signup-intent", { method: "DELETE", credentials: "include" })
      .catch(() => undefined)
      .then(() => {
        if (!returnTo) throw new Error("returnTo unavailable");
        return fetch("/api/auth/sso/ticket", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ returnTo }),
        });
      })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { consumeUrl?: string } | null;
        if (!response.ok || !data?.consumeUrl) throw new Error("ticket unavailable");
        window.location.replace(data.consumeUrl);
      })
      .catch(() => {
        if (!active) return;
        // silent 모드(매거진 자동 동기화)에서는 실패를 화면으로 노출하지 않고 조용히 복귀한다.
        if (silent && !returnTo) {
          setRequestFailed(true);
          return;
        }
        if (silent) {
          window.location.replace(returnTo);
          return;
        }
        setRequestFailed(true);
      });
    return () => {
      active = false;
    };
  }, [returnTo, silent]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-primary-text">
      <section
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center"
        aria-live="polite"
      >
        <div className="mb-6 flex justify-center gap-3" aria-hidden="true">
          <AmuSimbol width={40} height={40} className="text-primary" />
          <AmuLogo width={100} className="relative top-[2px] text-primary" />
        </div>
        <h1 className="text-2xl font-bold">
          <Lang text={{ ko: "매거진으로 이동하는 중입니다", en: "Taking you to Magazine" }} />
          <LoadingDots />
        </h1>
        {!error ? (
          <p className="mt-3 text-secondary-text">
            <Lang
              text={{
                ko: "로그인 상태를 동기화 하고 있어요.",
                en: "Syncing your sign-in status...",
              }}
            />
          </p>
        ) : null}
        {error && (!silent || !returnTo) ? (
          <div className="mt-5 space-y-4" role="alert">
            <p>
              <Lang
                text={{
                  ko: "로그인 연결을 완료하지 못했습니다. 다시 시도해 주세요.",
                  en: "We couldn't complete the sign-in. Please try again.",
                }}
              />
            </p>
            <Button asChild size="lg" className="min-h-11 w-full">
              <Link href={returnTo || MAGAZINE_HOME_URL}>
                <Lang text={{ ko: "매거진으로 돌아가기", en: "Back to Magazine" }} />
              </Link>
            </Button>
          </div>
        ) : (
          <span
            className="mx-auto mt-6 block size-8 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
      </section>
    </main>
  );
}
