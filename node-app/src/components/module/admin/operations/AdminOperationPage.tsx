"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Preloader } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";

type LocalizedText = {
  ko: string;
  en: string;
};

type AdminOperationPageProps = {
  title: LocalizedText;
  description?: LocalizedText;
  children: ReactNode;
};

export function AdminOperationPage({ title, description, children }: AdminOperationPageProps) {
  const router = useRouter();
  const { userData, isAdministrator } = useUserData();

  useEffect(
    function redirectNonAdministrator() {
      if (userData && isAdministrator !== true) {
        router.replace("/");
      }
    },
    [userData, isAdministrator, router],
  );

  if (!userData || isAdministrator !== true) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return (
    <section className="mx-auto w-full max-w-7xl" aria-labelledby="admin-operation-title">
      <header className="mb-6">
        <h1 id="admin-operation-title" className="text-xl font-bold text-primary">
          <Lang text={title} />
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-secondary-text">
            <Lang text={description} />
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
