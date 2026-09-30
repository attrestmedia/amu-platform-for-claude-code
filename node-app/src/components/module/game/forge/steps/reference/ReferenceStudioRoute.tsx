"use client";

import { useSearchParams } from "next/navigation";
import { Lang } from "components/module/i18n";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import { ReferenceKitWorkspace } from "components/module/store/ReferenceKitWorkspace";

export function ReferenceStudioRoute() {
  const searchParams = useSearchParams();
  const universeId = searchParams.get("universeId")?.trim() || DEFAULT_PLAY_UNIVERSE;

  return (
    <div className="mx-auto flex min-w-0 w-full max-w-6xl flex-col gap-4">
      <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5" aria-labelledby="reference-studio-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          <Lang text={{ ko: "운영자 레퍼런스", en: "Operator references" }} />
        </p>
        <h1 id="reference-studio-heading" className="mt-1 text-xl font-bold text-primary-text sm:text-2xl">
          <Lang text={{ ko: "레퍼런스 킷", en: "Reference kits" }} />
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary-text">
          <Lang
            text={{
              ko: "캐릭터와 모델 생성에 함께 사용하는 레퍼런스 킷을 만들고 관리합니다.",
              en: "Create and manage reference kits shared by character and model generation.",
            }}
          />
        </p>
      </section>
      <ReferenceKitWorkspace universeId={universeId} />
    </div>
  );
}
