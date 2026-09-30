"use client";

import {
  Brush,
  Eraser,
  Eye,
  Home,
  Layers,
  Lock,
  MousePointer2,
  Paintbrush,
  Play,
  Redo2,
  Settings,
  Square,
  Undo2,
} from "lucide-react";
import { Lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";
import type { ForgeSummary } from "libs/api/game/forgeSummaryClient";

const TOOLS = [MousePointer2, Brush, Eraser, Square, Paintbrush, Layers, Settings];
const TOOLBAR = [Undo2, Redo2, Home, Play];
const LAYERS = [
  { key: "ground", label: { ko: "지형", en: "Ground" } },
  { key: "object", label: { ko: "오브젝트", en: "Object" } },
  { key: "overlay", label: { ko: "장식", en: "Decor" } },
  { key: "boundary", label: { ko: "통행 불가", en: "Impassable" } },
];

/** STEP5 카드 미리보기 — 맵 에디터 축소 미리보기 + 레이어 패널. 권한 없으면 잠금 오버레이(D7). */
export function StepCardMap({ summary }: { summary: ForgeSummary | undefined }) {
  const { isAdministrator } = useUserData();
  const locked = !isAdministrator;
  const latestMap = summary?.maps.latest;

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[10px] bg-surface-2">
      {/* 중앙 맵 렌더 (없으면 샘플 플레이스홀더) */}
      <div className="flex h-full items-center justify-center text-muted-text">
        <span className="text-[11px]">
          {latestMap ? (
            latestMap.stageName
          ) : (
            <Lang text={{ ko: "맵 미리보기", en: "Map preview" }} />
          )}
        </span>
      </div>

      {/* 좌측 세로 툴 스트립 */}
      <div className="absolute left-1.5 top-1/2 flex w-[26px] -translate-y-1/2 flex-col items-center gap-1.5 rounded-lg bg-black/35 py-2">
        {TOOLS.map((Icon, index) => (
          <Icon key={index} className="h-3.5 w-3.5 text-white/80" aria-hidden />
        ))}
      </div>

      {/* 우상단 가로 툴바 */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-lg bg-black/35 px-1.5 py-1">
        {TOOLBAR.map((Icon, index) => (
          <Icon key={index} className="h-3.5 w-3.5 text-white/80" aria-hidden />
        ))}
      </div>

      {/* 하단 좌측 레이어 패널 */}
      <div className="absolute bottom-1.5 left-1.5 w-[45%] rounded-lg border border-border bg-black/60 p-2">
        <p className="text-[10px] font-bold text-white/70">
          <Lang text={{ ko: "레이어", en: "Layers" }} />
        </p>
        <div className="mt-1 flex flex-col gap-0.5">
          {LAYERS.map((layer) => (
            <span key={layer.key} className="flex items-center gap-1 text-[10px] text-white/85">
              <Layers className="h-3 w-3" aria-hidden />
              <Lang text={layer.label} />
              <Eye className="ml-auto h-3 w-3 opacity-70" aria-hidden />
            </span>
          ))}
        </div>
      </div>

      {/* 잠금 오버레이 (비관리자) */}
      {locked ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/60 text-center">
          <Lock className="h-5 w-5 text-secondary-text" aria-hidden />
          <p className="text-[11px] font-semibold text-primary-text">
            <Lang text={{ ko: "맵 편집 권한이 필요합니다", en: "Map editing permission is required" }} />
          </p>
        </div>
      ) : null}
    </div>
  );
}
