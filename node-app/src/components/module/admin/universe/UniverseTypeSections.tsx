"use client";

import { Gamepad2, ShoppingBag } from "lucide-react";
import { Badge } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import type { IUniverse, UniverseType } from "types/game";
import { UniverseManager } from "./UniverseManager";

type UniverseTypeSectionProps = {
  type: UniverseType;
  universes: IUniverse[];
  onEdit: (universe: IUniverse) => void;
  onRefresh: () => void;
};

const SECTION_COPY = {
  game: {
    title: { ko: "게임 유니버스", en: "Game Universes" },
    description: {
      ko: "Play의 캐릭터, 스테이지와 런타임 월드를 관리합니다.",
      en: "Manage Play characters, stages, and runtime worlds.",
    },
    empty: { ko: "등록된 게임 유니버스가 없습니다.", en: "No game universes are registered." },
    icon: Gamepad2,
  },
  commerce: {
    title: { ko: "커머스 유니버스", en: "Commerce Universes" },
    description: {
      ko: "Store의 상품, 쇼룸과 커머스 운영 범위를 관리합니다.",
      en: "Manage Store products, showrooms, and commerce operations.",
    },
    empty: { ko: "등록된 커머스 유니버스가 없습니다.", en: "No commerce universes are registered." },
    icon: ShoppingBag,
  },
} as const;

function UniverseTypeSection({ type, universes, onEdit, onRefresh }: UniverseTypeSectionProps) {
  const copy = SECTION_COPY[type];
  const Icon = copy.icon;

  return (
    <section
      aria-labelledby={`${type}-universes-heading`}
      className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id={`${type}-universes-heading`} className="text-lg font-semibold text-primary-text">
              <Lang text={copy.title} />
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              <Lang text={copy.description} />
            </p>
          </div>
        </div>
        <Badge variant="outline" size="sm">
          {universes.length}
        </Badge>
      </div>

      {universes.length > 0 ? (
        <UniverseManager universes={universes} onEdit={onEdit} onRefresh={onRefresh} />
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          <Lang text={copy.empty} />
        </div>
      )}
    </section>
  );
}

export function UniverseTypeSections({ universes, onEdit, onRefresh }: Omit<UniverseTypeSectionProps, "type">) {
  const gameUniverses = universes.filter((universe) => universe.type === "game");
  const commerceUniverses = universes.filter((universe) => universe.type === "commerce");

  return (
    <div className="grid gap-5">
      <UniverseTypeSection type="game" universes={gameUniverses} onEdit={onEdit} onRefresh={onRefresh} />
      <UniverseTypeSection type="commerce" universes={commerceUniverses} onEdit={onEdit} onRefresh={onRefresh} />
    </div>
  );
}
