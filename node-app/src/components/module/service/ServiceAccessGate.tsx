"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Preloader } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { SERVICE_DEFINITIONS, type ServiceKey } from "consts/system/serviceAvailability";
import { useServiceAvailability } from "./ServiceAvailabilityProvider";

export function ServiceAccessGate({ serviceKey, children }: { serviceKey: ServiceKey; children: React.ReactNode }) {
  const { isEnabled } = useServiceAvailability();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isLoading, error, isAdministrator } = useUserData();
  const service = SERVICE_DEFINITIONS.find((item) => item.key === serviceKey);

  if (isEnabled(serviceKey) || isAdministrator) return <>{children}</>;

  if (!hasHydrated || (isLoggedIn && (isLoading || (!userData && !error)))) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12 text-primary-text">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 text-center shadow-lg sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clock3 className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-semibold sm:text-2xl">
          <Lang text={{ ko: `${service?.label || "서비스"}를 준비하고 있습니다`, en: `${service?.label || "Service"} is being improved` }} />
        </h1>
        <p className="mt-3 text-sm leading-6 text-secondary-text">
          <Lang
            text={{
              ko: "더 안정적이고 완성도 높은 경험을 위해 잠시 사용자 접속을 제한하고 있습니다.",
              en: "Public access is temporarily limited while we improve stability and quality.",
            }}
          />
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Lang text={{ ko: "All My Universe 홈으로", en: "Back to All My Universe" }} />
        </Link>
      </section>
    </main>
  );
}
