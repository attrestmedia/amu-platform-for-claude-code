"use client";

import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { CardNewsCard } from "types/card-news";
import type { CardNewsPreparedScene } from "types/card-news/scene";
import { CardNewsThumbnail } from "./CardNewsThumbnail";

type CardNewsCardRailProps = {
  cards: readonly CardNewsCard[];
  activeCardId: string;
  thumbnailScenes: Record<string, CardNewsPreparedScene>;
  horizontal?: boolean;
  onSelect: (cardId: string) => void;
  onAdd: () => void;
  onDuplicate: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onReorder: (cardId: string, direction: -1 | 1) => void;
};

export function CardNewsCardRail({
  cards,
  activeCardId,
  thumbnailScenes,
  horizontal = false,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
}: CardNewsCardRailProps) {
  return (
    <section aria-labelledby="card-news-card-list-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id="card-news-card-list-title" className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "카드", en: "Cards" }} />
          </h2>
          <p className="mt-0.5 text-xs text-secondary-text">
            {cards.length}/10
          </p>
        </div>
        <Button
          variant="outline"
          size="icon-md"
          aria-label={lang({ ko: "카드 추가", en: "Add card" })}
          onClick={onAdd}
          disabled={cards.length >= 10}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>

      <div
        role="list"
        className={horizontal
          ? "flex gap-2 overflow-x-auto pb-2"
          : "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"}
      >
        {cards.map((card) => (
          <div key={card.cardId} role="listitem" className={horizontal ? "shrink-0" : "min-w-0"}>
            <CardNewsThumbnail
              card={card}
              scene={thumbnailScenes[card.cardId]}
              active={activeCardId === card.cardId}
              onClick={() => onSelect(card.cardId)}
            />
            <div className="mt-1 flex items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="icon-md"
                aria-label={lang({ ko: `카드 ${card.order + 1} 위로 이동`, en: `Move card ${card.order + 1} up` })}
                disabled={card.order === 0}
                onClick={() => onReorder(card.cardId, -1)}
              >
                <ChevronUp className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-md"
                aria-label={lang({ ko: `카드 ${card.order + 1} 아래로 이동`, en: `Move card ${card.order + 1} down` })}
                disabled={card.order === cards.length - 1}
                onClick={() => onReorder(card.cardId, 1)}
              >
                <ChevronDown className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-md"
                aria-label={lang({ ko: `카드 ${card.order + 1} 복제`, en: `Duplicate card ${card.order + 1}` })}
                disabled={cards.length >= 10}
                onClick={() => onDuplicate(card.cardId)}
              >
                <Copy className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-md"
                aria-label={lang({ ko: `카드 ${card.order + 1} 삭제`, en: `Delete card ${card.order + 1}` })}
                disabled={cards.length <= 1}
                onClick={() => onDelete(card.cardId)}
                className="text-danger hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
