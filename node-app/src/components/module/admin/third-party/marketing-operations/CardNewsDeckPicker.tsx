"use client";

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { RefreshCw } from "lucide-react";
import type { CardNewsDeck } from "types/card-news";
import { toSafeString } from "./MarketingOpsUtils";

type CardNewsDeckPickerProps = {
  decks: CardNewsDeck[];
  loaded: boolean;
  loading: boolean;
  disabled?: boolean;
  onLoad: () => Promise<void>;
  onSelect: (deckId: string) => Promise<void>;
};

export function CardNewsDeckPicker({
  decks,
  loaded,
  loading,
  disabled = false,
  onLoad,
  onSelect,
}: CardNewsDeckPickerProps) {
  const exportedCount = (deck: CardNewsDeck) =>
    deck.cards.filter((card) => toSafeString(card.exportedAssetId)).length;

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-primary-text">
            {lang({ ko: "Gen Studio 카드뉴스", en: "Gen Studio card news" })}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-text">
            {lang({
              ko: "공개 전환된 검수용 자산을 카드 순서대로 Instagram draft에 연결합니다.",
              en: "Attach public review assets to the Instagram draft in card order.",
            })}
          </p>
        </div>
        <Button
          variant="outline"
          size="xs"
          className="min-h-11 gap-1.5 sm:min-h-0"
          onClick={() => void onLoad()}
          disabled={disabled || loading}
        >
          <RefreshCw className={loading ? "icon-xxs animate-spin" : "icon-xxs"} aria-hidden />
          <span>{lang({ ko: loaded ? "덱 새로고침" : "덱 불러오기", en: loaded ? "Refresh decks" : "Load decks" })}</span>
        </Button>
      </div>

      {loaded && decks.length > 0 ? (
        <Select
          value=""
          onValueChange={(deckId) => {
            if (typeof deckId === "string") void onSelect(deckId);
          }}
          disabled={disabled || loading}
        >
          <SelectTrigger className="mt-3 min-h-11" aria-label={lang({ ko: "연결할 카드뉴스 덱", en: "Card news deck to attach" })}>
            <SelectValue placeholder={lang({ ko: "연결할 덱을 선택하세요", en: "Select a deck to attach" })} />
          </SelectTrigger>
          <SelectContent>
            {decks.map((deck) => (
              <SelectItem key={deck.deckId} value={deck.deckId}>
                {deck.title} · {exportedCount(deck)}/{deck.cards.length} {lang({ ko: "장 업로드", en: "uploaded" })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : loaded ? (
        <p className="mt-3 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-text">
          {lang({ ko: "연결할 카드뉴스 덱이 없습니다.", en: "No card news decks are available." })}
        </p>
      ) : null}
    </div>
  );
}
