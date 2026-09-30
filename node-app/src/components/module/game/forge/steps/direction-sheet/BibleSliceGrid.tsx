"use client";

import { useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { BIBLE_DIRECTION_ORDER, bibleSliceBackground } from "components/module/game/forge/model/bibleSlice";
import type { CharacterBibleDirectionType } from "types/game/asset-pipeline";

const SLICE_GROUPS = [
  {
    id: "front",
    label: { ko: "정면", en: "Front" },
    directions: ["down-right"] as CharacterBibleDirectionType[],
  },
  {
    id: "side",
    label: { ko: "측면", en: "Side" },
    directions: ["down", "left"] as CharacterBibleDirectionType[],
  },
  {
    id: "back",
    label: { ko: "후면", en: "Back" },
    directions: ["up-left", "up"] as CharacterBibleDirectionType[],
  },
] as const;

const DIRECTION_LABELS: Record<CharacterBibleDirectionType, { ko: string; en: string }> = {
  down: { ko: "좌하단", en: "Lower-left" },
  "down-right": { ko: "정면", en: "Front" },
  "up-left": { ko: "후면", en: "Back" },
  up: { ko: "우상단", en: "Upper-right" },
  left: { ko: "좌상단", en: "Upper-left" },
};

function Slice({
  direction,
  url,
  passed,
}: {
  direction: CharacterBibleDirectionType;
  url: string;
  passed: boolean;
}) {
  const index = BIBLE_DIRECTION_ORDER.indexOf(direction);

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-background">
      <span
        role="img"
        aria-label={lang(DIRECTION_LABELS[direction])}
        className="block aspect-[3/10] w-full bg-muted bg-no-repeat"
        style={bibleSliceBackground(index, url)}
      />
      <span className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="font-medium"><Lang text={DIRECTION_LABELS[direction]} /></span>
        <span className={passed ? "text-accent" : "text-danger"}>
          {passed ? (
            <>
              <Check className="size-4" aria-hidden />
              <span className="sr-only"><Lang text={{ ko: "확인됨", en: "Verified" }} /></span>
            </>
          ) : (
            <>
              <span aria-hidden>!</span>
              <span className="sr-only"><Lang text={{ ko: "확인 필요", en: "Needs review" }} /></span>
            </>
          )}
        </span>
      </span>
    </li>
  );
}

export function BibleSliceGrid({
  url,
  directions,
  passedDirections,
}: {
  url: string;
  directions: CharacterBibleDirectionType[];
  passedDirections: CharacterBibleDirectionType[];
}) {
  const available = new Set(directions);
  const passed = new Set(passedDirections);
  const [selectedGroupId, setSelectedGroupId] = useState("front");
  const selectGroupByIndex = (index: number) => {
    const nextIndex = (index + SLICE_GROUPS.length) % SLICE_GROUPS.length;
    setSelectedGroupId(SLICE_GROUPS[nextIndex].id);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectGroupByIndex(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectGroupByIndex(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectGroupByIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectGroupByIndex(SLICE_GROUPS.length - 1);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label={lang({ ko: "방향 선택", en: "View selection" })}>
        {SLICE_GROUPS.map((group, index) => (
          <button
            key={group.id}
            type="button"
            id={`direction-sheet-tab-${group.id}`}
            role="tab"
            aria-selected={selectedGroupId === group.id}
            aria-controls={`direction-sheet-panel-${group.id}`}
            tabIndex={selectedGroupId === group.id ? 0 : -1}
            className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              selectedGroupId === group.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"
            }`}
            onClick={() => setSelectedGroupId(group.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <Lang text={group.label} />
          </button>
        ))}
      </div>

      {SLICE_GROUPS.map((group) => (
        <div
          key={group.id}
          id={`direction-sheet-panel-${group.id}`}
          role="tabpanel"
          aria-label={lang(group.label)}
          aria-labelledby={`direction-sheet-tab-${group.id}`}
          hidden={selectedGroupId !== group.id}
          className="rounded-xl border border-border bg-background/60 p-3"
        >
          {group.directions.some((direction) => available.has(direction)) ? (
            <ul className={`grid gap-2 ${group.directions.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-32"}`}>
              {group.directions.map((direction) =>
                available.has(direction) ? (
                  <Slice key={direction} direction={direction} url={url} passed={passed.has(direction)} />
                ) : null,
              )}
            </ul>
          ) : (
            <p className="py-5 text-center text-sm text-secondary-text">
              <Lang text={{ ko: "이 방향 결과를 아직 받지 못했어요.", en: "This view is not available yet." }} />
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
