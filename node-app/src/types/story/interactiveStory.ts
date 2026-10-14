/**
 * @docHint
 * @purpose Interactive Story의 버전 고정 콘텐츠와 Narrative effect 계약
 * @process 서버 소유 Story 정의  클라이언트 공개 view 분리  allowlisted effect 타입
 * @domain interactive-story
 * @scope shared-contract
 */

export type StoryLocaleText = {
  ko: string;
  en: string;
};

export type StoryNarrativeEffect =
  | {
      transition: "story.beat.activate";
      payload: { beatId: string };
    }
  | {
      transition: "story.beat.complete";
      payload: { beatId: string };
    }
  | {
      transition: "relation.affinity.adjust";
      payload: { targetCharacterId: string; delta: number };
    }
  | {
      transition: "world.flag.set";
      payload: { key: string; value: string | number | boolean };
    };

export type StoryChoice = {
  choiceId: string;
  label: StoryLocaleText;
  result: StoryLocaleText;
  narrativeEffects: StoryNarrativeEffect[];
};

export type StoryBeat = {
  beatId: string;
  prompt: StoryLocaleText;
  choices: StoryChoice[];
};

export type InteractiveStorySourceRef = {
  kind: "magazine_intelligence";
  ref: string;
  note?: string;
};

export type InteractiveStory = {
  storyId: string;
  storyVersion: number;
  universeId: string;
  sourceRefs?: InteractiveStorySourceRef[];
  title: StoryLocaleText;
  summary: StoryLocaleText;
  beats: StoryBeat[];
  publicationStatus: "draft" | "review" | "published";
};

export type InteractiveStoryChoiceView = Omit<StoryChoice, "narrativeEffects">;
export type InteractiveStoryBeatView = Omit<StoryBeat, "choices"> & {
  choices: InteractiveStoryChoiceView[];
};
export type InteractiveStoryView = Omit<InteractiveStory, "beats"> & {
  beats: InteractiveStoryBeatView[];
};

export type InteractiveStoryProgress = {
  status: "not_started" | "in_progress" | "resolved";
  storyVersion: number;
  storyRunId?: string;
  beatId?: string;
  selectedChoiceId?: string;
  /** false means start must be retried before the beat can accept a choice. */
  ready: boolean;
};

export type InteractiveStoryRuntimeView = {
  story: InteractiveStoryView;
  progress: InteractiveStoryProgress;
  selectedChoice?: InteractiveStoryChoiceView;
};
