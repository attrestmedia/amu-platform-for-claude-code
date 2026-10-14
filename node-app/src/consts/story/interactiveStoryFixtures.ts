import { validateNarrativeOutcome } from "libs/server-utils/narrative/narrativeReducerCore";
import type {
  InteractiveStory,
  InteractiveStoryChoiceView,
  InteractiveStoryView,
  StoryNarrativeEffect,
} from "types/story/interactiveStory";

/**
 * @docHint
 * @purpose 서버 소유 개발 검증용 Interactive Story fixture와 registry 검증
 * @process 고정 Story 버전 관리  Narrative effect allowlist 검증  공개 view에서 effect 제거
 * @domain interactive-story
 * @scope server-content
 */

export const INTERACTIVE_STORY_FIXTURES: readonly InteractiveStory[] = Object.freeze([
  {
    storyId: "a-small-promise",
    storyVersion: 1,
    universeId: "the-universe",
    title: {
      ko: "문이 닫히기 전",
      en: "Before the Door Closes",
    },
    summary: {
      ko: "오래된 관측소에 남은 기록 하나가 누군가의 다음 선택을 기다립니다.",
      en: "One record remains at the old observatory, waiting for someone's next choice.",
    },
    publicationStatus: "draft",
    beats: [
      {
        beatId: "closing-light",
        prompt: {
          ko: "기록관은 희미해지는 관측소의 불빛을 바라봅니다. 마지막 기록을 함께 살펴볼 시간이 아직 남아 있습니다.",
          en: "The scholar watches the observatory light begin to fade. There is still time to look at the final record together.",
        },
        choices: [
          {
            choiceId: "read-together",
            label: {
              ko: "기록을 함께 읽는다",
              en: "Read the record together",
            },
            result: {
              ko: "기록관은 놓친 문장을 발견하고, 다음 기록도 함께 읽자고 말합니다.",
              en: "The scholar spots a missing line and asks to read the next record together, too.",
            },
            narrativeEffects: [
              { transition: "relation.affinity.adjust", payload: { targetCharacterId: "tu-scholar", delta: 2 } },
              { transition: "world.flag.set", payload: { key: "story.a-small-promise.response", value: "listen" } },
            ],
          },
          {
            choiceId: "check-the-hall",
            label: {
              ko: "먼저 복도를 살핀다",
              en: "Check the hallway first",
            },
            result: {
              ko: "복도에는 아무도 없었습니다. 기록관은 당신의 신중함을 기억합니다.",
              en: "The hallway is empty. The scholar remembers how carefully you checked first.",
            },
            narrativeEffects: [
              { transition: "relation.affinity.adjust", payload: { targetCharacterId: "tu-scholar", delta: 1 } },
              { transition: "world.flag.set", payload: { key: "story.a-small-promise.response", value: "observe" } },
            ],
          },
        ],
      },
    ],
  },
]);

const STORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STORY_EFFECT_FLAG_PREFIX = "story.";

function isLocaleText(value: unknown): value is { ko: string; en: string } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["ko", "en"].every((locale) => typeof item[locale] === "string" && String(item[locale]).trim().length > 0);
}

function isAllowedChoiceEffect(storyId: string, beatIds: ReadonlySet<string>, effect: StoryNarrativeEffect) {
  if (!effect || typeof effect !== "object" || !effect.payload || typeof effect.payload !== "object") return false;

  if (effect.transition === "story.beat.activate" || effect.transition === "story.beat.complete") {
    if (typeof effect.payload.beatId !== "string" || !beatIds.has(effect.payload.beatId)) return false;
  } else if (effect.transition === "relation.affinity.adjust") {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(effect.payload.targetCharacterId)) return false;
    if (!Number.isInteger(effect.payload.delta) || Math.abs(effect.payload.delta) > 10) return false;
  } else if (effect.transition === "world.flag.set") {
    const { key, value } = effect.payload;
    if (typeof key !== "string" || !key.startsWith(`${STORY_EFFECT_FLAG_PREFIX}${storyId}.`) || key.length > 120) return false;
    if (!(typeof value === "string" || typeof value === "number" || typeof value === "boolean")) return false;
  } else {
    return false;
  }

  return validateNarrativeOutcome({
    source: "user_action",
    transition: effect.transition,
    payload: effect.payload,
    resolverVersion: 1,
  });
}

export function assertInteractiveStoryRegistry() {
  const storyIds = new Set<string>();

  for (const story of INTERACTIVE_STORY_FIXTURES) {
    if (!STORY_ID_PATTERN.test(story.storyId) || story.storyId.length > 32 || storyIds.has(story.storyId)) {
      throw new Error("STORY_REGISTRY_INVALID");
    }
    storyIds.add(story.storyId);

    if (!Number.isInteger(story.storyVersion) || story.storyVersion < 1 || story.storyVersion > 9999) {
      throw new Error("STORY_REGISTRY_INVALID");
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(story.universeId) || !isLocaleText(story.title) || !isLocaleText(story.summary)) {
      throw new Error("STORY_REGISTRY_INVALID");
    }
    if (!["draft", "review", "published"].includes(story.publicationStatus)) {
      throw new Error("STORY_REGISTRY_INVALID");
    }
    if (!Array.isArray(story.beats) || story.beats.length < 1 || story.beats.length > 20) {
      throw new Error("STORY_REGISTRY_INVALID");
    }

    const beatIds = new Set<string>();
    for (const beat of story.beats) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(beat.beatId) || beat.beatId.length > 24 || beatIds.has(beat.beatId)) {
        throw new Error("STORY_REGISTRY_INVALID");
      }
      beatIds.add(beat.beatId);
    }

    for (const beat of story.beats) {
      if (!isLocaleText(beat.prompt) || !Array.isArray(beat.choices) || beat.choices.length < 2 || beat.choices.length > 3) {
        throw new Error("STORY_REGISTRY_INVALID");
      }

      const choiceIds = new Set<string>();
      for (const choice of beat.choices) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(choice.choiceId) || choice.choiceId.length > 40 || choiceIds.has(choice.choiceId)) {
          throw new Error("STORY_REGISTRY_INVALID");
        }
        choiceIds.add(choice.choiceId);
        if (!isLocaleText(choice.label) || !isLocaleText(choice.result) || !Array.isArray(choice.narrativeEffects) || choice.narrativeEffects.length > 5) {
          throw new Error("STORY_REGISTRY_INVALID");
        }
        if (!choice.narrativeEffects.every((effect) => isAllowedChoiceEffect(story.storyId, beatIds, effect))) {
          throw new Error("STORY_REGISTRY_INVALID");
        }
      }
    }

    const sourceRefs: unknown = story.sourceRefs;
    if (sourceRefs !== undefined) {
      if (!Array.isArray(sourceRefs) || sourceRefs.some((item) => {
        if (!item || typeof item !== "object") return true;
        const ref = item as Record<string, unknown>;
        return ref.kind !== "magazine_intelligence" || typeof ref.ref !== "string" || !ref.ref.trim()
          || (ref.note !== undefined && typeof ref.note !== "string");
      })) {
        throw new Error("STORY_REGISTRY_INVALID");
      }
    }
  }

  return true;
}

export function getInteractiveStoryById(storyId: string) {
  assertInteractiveStoryRegistry();
  return INTERACTIVE_STORY_FIXTURES.find((story) => story.storyId === storyId) ?? null;
}

export function toInteractiveStoryView(story: InteractiveStory): InteractiveStoryView {
  return {
    storyId: story.storyId,
    storyVersion: story.storyVersion,
    universeId: story.universeId,
    ...(story.sourceRefs ? { sourceRefs: story.sourceRefs.map((ref) => ({ ...ref })) } : {}),
    title: { ...story.title },
    summary: { ...story.summary },
    publicationStatus: story.publicationStatus,
    beats: story.beats.map((beat) => ({
      beatId: beat.beatId,
      prompt: { ...beat.prompt },
      choices: beat.choices.map(({ narrativeEffects: _effects, ...choice }): InteractiveStoryChoiceView => ({
        ...choice,
        label: { ...choice.label },
        result: { ...choice.result },
      })),
    })),
  };
}
