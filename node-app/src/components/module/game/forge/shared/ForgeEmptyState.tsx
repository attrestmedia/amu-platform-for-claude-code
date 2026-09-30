"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import type { ForgeLocalizedText } from "../model/forgeGlossary";

export function ForgeEmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  title: ForgeLocalizedText;
  description: ForgeLocalizedText;
  actionHref: string;
  actionLabel: ForgeLocalizedText;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center sm:p-12">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-secondary-text">
        <Icon className="size-7" aria-hidden />
      </div>
      <h2 className="mt-4 text-base font-semibold text-primary-text">
        <Lang text={title} />
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-secondary-text">
        <Lang text={description} />
      </p>
      <Button asChild className="mt-5 min-h-11">
        <Link href={actionHref} className="cursor-pointer">
          <Lang text={actionLabel} />
          <ArrowRight className="ml-2 size-4" aria-hidden />
        </Link>
      </Button>
    </section>
  );
}
