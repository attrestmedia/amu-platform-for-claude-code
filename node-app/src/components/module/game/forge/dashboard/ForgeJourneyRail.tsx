"use client";

import { Fragment } from "react";
import { ChevronRight, Play } from "lucide-react";
import type { ForgeSummary } from "libs/api/game/forgeSummaryClient";
import type { ForgeLocalizedText } from "../model/forgeGlossary";
import { StepCardFrame } from "./cards/StepCardFrame";
import { StepCardCharacter } from "./cards/StepCardCharacter";
import { StepCardDirectionSheet } from "./cards/StepCardDirectionSheet";
import { StepCardSprite } from "./cards/StepCardSprite";
import { StepCardWorld } from "./cards/StepCardWorld";
import { StepCardMap } from "./cards/StepCardMap";

type StepDef = {
  step: number;
  title: ForgeLocalizedText;
  description: ForgeLocalizedText;
  cta: ForgeLocalizedText;
  href: string;
};

const STEPS: StepDef[] = [
  {
    step: 1,
    title: { ko: "캐릭터 등록", en: "Register character" },
    description: { ko: "기본 캐릭터를 선택하거나 새로 생성하여 등록하세요.", en: "Pick a base character or create a new one." },
    cta: { ko: "캐릭터 등록하기", en: "Register a character" },
    href: "/assets-studio/character",
  },
  {
    step: 2,
    title: { ko: "캐릭터 방향 시트", en: "Character direction sheet" },
    description: { ko: "기본 컷을 기반으로 일관된 캐릭터 에셋을 생성합니다.", en: "Lock a consistent look from the base cut." },
    cta: { ko: "방향 시트 생성", en: "Generate direction sheet" },
    href: "/assets-studio/direction-sheet",
  },
  {
    step: 3,
    title: { ko: "스프라이트 스튜디오", en: "Sprite studio" },
    description: { ko: "방향 시트를 활용해 움직이는 캐릭터 스프라이트를 생성합니다.", en: "Turn the direction sheet into animated sprites." },
    cta: { ko: "스프라이트 생성", en: "Generate sprites" },
    href: "/assets-studio/sprite",
  },
  {
    step: 4,
    title: { ko: "월드 에셋 라이브러리", en: "World asset library" },
    description: { ko: "게임에 필요한 다양한 월드 에셋을 생성하고 관리합니다.", en: "Create and manage the world assets your game needs." },
    cta: { ko: "에셋 생성하기", en: "Generate assets" },
    href: "/assets-studio/world",
  },
  {
    step: 5,
    title: { ko: "맵 스튜디오", en: "Map studio" },
    description: { ko: "드래그 앤 드롭으로 나만의 게임 맵을 만들고 요소를 배치하세요.", en: "Drag and drop to build your own map." },
    cta: { ko: "맵 저장 및 미리보기", en: "Save & preview map" },
    href: "/assets-studio/map",
  },
];

function renderPreview(step: number, summary: ForgeSummary | undefined) {
  switch (step) {
    case 1:
      return <StepCardCharacter summary={summary} />;
    case 2:
      return <StepCardDirectionSheet summary={summary} />;
    case 3:
      return <StepCardSprite summary={summary} />;
    case 4:
      return <StepCardWorld summary={summary} />;
    case 5:
      return <StepCardMap summary={summary} />;
    default:
      return null;
  }
}

/** 5단계 여정 레일 — 5카드 + (5열일 때만) 카드 사이 셰브론. */
export function ForgeJourneyRail({ summary }: { summary: ForgeSummary | undefined }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
      {STEPS.map((step, index) => (
        <Fragment key={step.step}>
          <StepCardFrame
            step={step.step}
            title={step.title}
            description={step.description}
            cta={step.cta}
            href={step.href}
            ctaGlyph={step.step === 5 ? <Play className="ml-1.5 h-3.5 w-3.5" aria-hidden /> : undefined}
          >
            {renderPreview(step.step, summary)}
          </StepCardFrame>
          {index < STEPS.length - 1 ? (
            <ChevronRight className="hidden h-[18px] w-2 self-center text-muted-text xl:block" aria-hidden />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
