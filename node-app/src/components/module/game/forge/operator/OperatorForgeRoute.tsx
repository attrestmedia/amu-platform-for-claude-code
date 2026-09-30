"use client";

import Link from "next/link";
import { Preloader } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { useForgeAudience } from "../model/useForgeAudience";
import { AssetsStudioProvider } from "./OperatorAssetsProvider";
import type { ReactNode } from "react";
import { useState } from "react";
import { FORGE_GLOSSARY } from "../model/forgeGlossary";

export function OperatorForgeRoute({ operator, playUser, fallback }: { operator: ReactNode; playUser?: ReactNode; fallback?: ReactNode }) {
  const audience = useForgeAudience();
  const [operatorToolsOpen, setOperatorToolsOpen] = useState(false);

  if (!audience.isReady) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  if (audience.audience === "operator") {
    if (!playUser) {
      return <div className="mx-auto block min-w-0 w-full max-w-6xl"><AssetsStudioProvider>{operator}</AssetsStudioProvider></div>;
    }

    return (
      <div className="mx-auto block min-w-0 w-full max-w-6xl">
        <div className="min-w-0 w-full max-w-full">{playUser}</div>
        <section className="mt-6 min-w-0 w-full max-w-full rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="forge-operator-tools-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 id="forge-operator-tools-title" className="text-base font-semibold text-primary-text sm:text-lg">
                <Lang text={{ ko: "운영자 도구", en: "Operator tools" }} />
              </h2>
              <p className="mt-1 text-sm leading-6 text-secondary-text">
                <Lang
                  text={{
                    ko: "공통 사용자 흐름은 유지됩니다. 관리자용 에셋 기능은 필요할 때 별도로 열어 사용하세요.",
                    en: "The shared user flow remains available. Open the admin asset tools separately when needed.",
                  }}
                />
              </p>
            </div>
            <button
              type="button"
              aria-expanded={operatorToolsOpen}
              aria-controls="forge-operator-tools-panel"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-primary-text hover:border-primary hover:text-primary focus-visible-ring"
              onClick={() => setOperatorToolsOpen((open) => !open)}
            >
              <Lang text={operatorToolsOpen ? { ko: "운영자 도구 닫기", en: "Close operator tools" } : { ko: "운영자 도구 열기", en: "Open operator tools" }} />
            </button>
          </div>
          {operatorToolsOpen ? (
            <div id="forge-operator-tools-panel" className="mt-4 min-w-0 w-full max-w-full">
              <AssetsStudioProvider>{operator}</AssetsStudioProvider>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return <div className="mx-auto block min-w-0 w-full max-w-6xl">{playUser ?? fallback ?? null}</div>;
}

export function OperatorOnlyFallback() {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" role="status">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-text"><Lang text={FORGE_GLOSSARY.service} /></p>
      <h1 className="mt-2 text-xl font-bold text-primary-text sm:text-2xl">
        <Lang text={{ ko: "운영자 전용 작업", en: "Operator-only workspace" }} />
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-text">
        <Lang
          text={{
            ko: "검수·적용 기능은 운영자 계정에서만 사용할 수 있습니다. 사용자 제작 흐름으로 돌아가려면 에셋 스튜디오를 여세요.",
            en: "Review and apply tools are available to operators only. Open Assets Studio to return to the user creation flow.",
          }}
        />
      </p>
      <Link href="/assets-studio" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible-ring">
        <Lang text={{ ko: "에셋 스튜디오로 돌아가기", en: "Back to Assets Studio" }} />
      </Link>
    </section>
  );
}
