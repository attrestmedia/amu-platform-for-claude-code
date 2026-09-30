"use client";

import { Lang } from "components/module/i18n";
import type { ForgeSummary } from "libs/api/game/forgeSummaryClient";
import { cn } from "utils/common";

const TABS = [
  { key: "front", label: "FRONT" },
  { key: "side", label: "SIDE" },
  { key: "back", label: "BACK" },
] as const;

/**
 * STEP2 카드 미리보기 — FRONT/SIDE/BACK 탭 + 캐릭터 슬라이스 + POSES 슬라이스.
 * 실제 바이블 슬라이스는 bibleSliceBackground로 잘라내지만, 대시보드 요약에는 바이블 URL이 없으므로
 * 데이터가 있기 전까지는 플레이스홀더로 렌더한다(표정 시트는 파이프라인에 없어 EXPRESSIONS 행 없음).
 */
export function StepCardDirectionSheet({ summary }: { summary: ForgeSummary | undefined }) {
  const hasCharacter = (summary?.characters.total || 0) > 0;

  return (
    <div className="rounded-[10px] bg-surface-2 p-3">
      {/* FRONT / SIDE / BACK 탭 칩 (미리보기에서는 조작 불가) */}
      <div className="flex gap-1.5" aria-hidden>
        {TABS.map((tab, index) => (
          <span
            key={tab.key}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
              index === 0 ? "bg-surface text-primary-text" : "text-muted-text",
            )}
          >
            {tab.label}
          </span>
        ))}
      </div>

      {/* 캐릭터 슬라이스 3장 */}
      <div className="mt-2 flex gap-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="flex aspect-[1/1.3] flex-1 items-center justify-center rounded-lg bg-surface text-muted-text"
          >
            {hasCharacter ? null : <span className="text-[10px]">—</span>}
          </span>
        ))}
      </div>

      {/* POSES 슬라이스 4장 */}
      <p className="mt-2.5 text-[9px] font-bold uppercase tracking-wide text-muted-text">POSES</p>
      <div className="mt-1.5 flex gap-1.5">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="flex aspect-[1/1.3] flex-1 items-center justify-center rounded-lg bg-surface text-muted-text"
          >
            {hasCharacter ? null : <span className="text-[10px]">—</span>}
          </span>
        ))}
      </div>

      {!hasCharacter ? (
        <p className="mt-2.5 text-center text-[11px] text-muted-text">
          <Lang text={{ ko: "방향 시트가 아직 없어요", en: "No direction sheet yet" }} />
        </p>
      ) : null}
    </div>
  );
}
