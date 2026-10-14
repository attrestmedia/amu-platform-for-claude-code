import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  getNarrativeEventByIdempotency,
  getUserStoryState,
} from "libs/database/game";
import { applyNarrativeOutcome } from "libs/server-utils/narrative/narrativeReducer";
import { assertNarrativeCollectionAllowed } from "libs/server-utils/narrative/narrativeLifecycle";
import {
  getInteractiveStoryById,
  toInteractiveStoryView,
} from "consts/story/interactiveStoryFixtures";
import {
  withStoryRuntimeLease,
  type StoryRuntimeLeaseGuard,
} from "libs/server-utils/story/storyRuntimeLease";
import type { NarrativeOutcome } from "types/game";
import type {
  InteractiveStory,
  InteractiveStoryChoiceView,
  InteractiveStoryProgress,
  InteractiveStoryRuntimeView,
  StoryNarrativeEffect,
} from "types/story/interactiveStory";

/**
 * @docHint
 * @purpose 서버 소유 Interactive Story를 Narrative Runtime에 연결
 * @process Admin route gate 이후 동의 확인  run 고정  lease 직렬화  allowlisted outcome 적용
 * @domain interactive-story
 * @scope server
 */

export const STORY_NARRATIVE_PROFILE_ID = "story-runtime" as const;
const STORY_CANON_REVISION = 1;
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/;
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RuntimeState = {
  flags?: Record<string, unknown>;
  activeBeatIds?: string[];
  relationAffinity?: Record<string, number>;
};

type RuntimeEvent = { status: string } | null;
type NarrativeIdentity = { uid: string; universeId: string; narrativeProfileId: string };
type ApplyOutcomeInput = {
  uid: string;
  universeId: string;
  narrativeProfileId: typeof STORY_NARRATIVE_PROFILE_ID;
  canonRevision: number;
  idempotencyKey: string;
  outcome: NarrativeOutcome;
};
type WithLease = <T>(
  input: { uid: string; universeId: string },
  work: (assertOwned: StoryRuntimeLeaseGuard) => Promise<T>,
) => Promise<T>;

export type InteractiveStoryRuntimeDependencies = {
  assertConsent(uid: string): Promise<unknown>;
  getState(identity: NarrativeIdentity): Promise<RuntimeState | null>;
  getEvent(input: NarrativeIdentity & { idempotencyKey: string }): Promise<RuntimeEvent>;
  applyOutcome(input: ApplyOutcomeInput): Promise<{ state: RuntimeState; event: RuntimeEvent; duplicate: boolean }>;
  withLease: WithLease;
};

const DEFAULT_DEPENDENCIES: InteractiveStoryRuntimeDependencies = {
  assertConsent: assertNarrativeCollectionAllowed,
  getState: getUserStoryState,
  getEvent: getNarrativeEventByIdempotency,
  applyOutcome: applyNarrativeOutcome,
  withLease: (input, work) => withStoryRuntimeLease(input, work),
};

function storyError(code: string) {
  return new Error(code);
}

function hashParts(...parts: Array<string | number>) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function eventKey(story: InteractiveStory, ...parts: Array<string | number>) {
  return `st:${hashParts(story.storyId, story.storyVersion, ...parts)}`;
}

function idempotencyKeyDigest(story: InteractiveStory, idempotencyKey: string) {
  return hashParts("start", story.storyId, story.storyVersion, idempotencyKey);
}

function runFlagKey(story: InteractiveStory) {
  return `story.${story.storyId}.v${story.storyVersion}.run`;
}

function startFlagKey(story: InteractiveStory, digest: string) {
  return `story.${story.storyId}.v${story.storyVersion}.start.${digest}`;
}

function choiceFlagKey(story: InteractiveStory, storyRunId: string, beatId: string) {
  return `story.${story.storyId}.v${story.storyVersion}.${storyRunId}.${beatId}.choice`;
}

function doneEventKey(story: InteractiveStory, storyRunId: string, beatId: string) {
  return eventKey(story, storyRunId, beatId, "done");
}

function getFlags(state: RuntimeState | null) {
  return state?.flags && typeof state.flags === "object" ? state.flags : {};
}

function parseCurrentRunId(story: InteractiveStory, state: RuntimeState | null) {
  const raw = getFlags(state)[runFlagKey(story)];
  if (raw === undefined) return null;
  if (typeof raw !== "string") throw storyError("STORY_STATE_CONFLICT");
  const match = raw.match(/^v(\d+):([0-9a-f-]{36})$/i);
  if (!match || Number(match[1]) !== story.storyVersion || !RUN_ID_PATTERN.test(match[2])) {
    throw storyError("STORY_STATE_CONFLICT");
  }
  return match[2];
}

function parseMappedRunId(value: unknown) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !RUN_ID_PATTERN.test(value)) throw storyError("STORY_STATE_CONFLICT");
  return value;
}

function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
}

function requireStory(storyId: string) {
  const story = getInteractiveStoryById(storyId);
  if (!story) throw storyError("STORY_NOT_FOUND");
  return story;
}

function identity(uid: string, story: InteractiveStory): NarrativeIdentity {
  return {
    uid,
    universeId: story.universeId,
    narrativeProfileId: STORY_NARRATIVE_PROFILE_ID,
  };
}

function toOutcome(effect: StoryNarrativeEffect): NarrativeOutcome {
  return {
    source: "user_action",
    transition: effect.transition,
    payload: effect.payload,
    resolverVersion: 1,
  };
}

async function applyStoryOutcome(
  deps: InteractiveStoryRuntimeDependencies,
  story: InteractiveStory,
  uid: string,
  idempotencyKey: string,
  outcome: NarrativeOutcome,
  phase: "lock" | "effect" | "complete" | "run",
) {
  try {
    return await deps.applyOutcome({
      ...identity(uid, story),
      narrativeProfileId: STORY_NARRATIVE_PROFILE_ID,
      canonRevision: STORY_CANON_REVISION,
      idempotencyKey,
      outcome,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (phase === "lock" && code === "NARRATIVE_IDEMPOTENCY_CONFLICT") {
      throw storyError("STORY_CHOICE_CONFLICT");
    }
    if (
      code === "NARRATIVE_STATE_VERSION_CONFLICT" ||
      code === "NARRATIVE_STATE_APPLY_CONFLICT" ||
      code === "NARRATIVE_EVENT_REJECTED" ||
      code === "NARRATIVE_EVENT_IN_PROGRESS" ||
      code === "NARRATIVE_EVENT_RECONCILIATION_FAILED" ||
      code === "NARRATIVE_EVENT_APPLY_FAILED" ||
      (phase !== "lock" && code === "NARRATIVE_IDEMPOTENCY_CONFLICT")
    ) {
      throw storyError("STORY_STATE_CONFLICT");
    }
    throw error;
  }
}

async function applyFlag(
  deps: InteractiveStoryRuntimeDependencies,
  story: InteractiveStory,
  uid: string,
  flagKey: string,
  value: string,
  key: string,
  phase: "lock" | "run",
) {
  return applyStoryOutcome(
    deps,
    story,
    uid,
    key,
    { source: "user_action", transition: "world.flag.set", payload: { key: flagKey, value }, resolverVersion: 1 },
    phase,
  );
}

async function readRunView(
  deps: InteractiveStoryRuntimeDependencies,
  story: InteractiveStory,
  uid: string,
  storyRunId: string,
  state: RuntimeState | null,
): Promise<InteractiveStoryRuntimeView> {
  const beat = story.beats[0];
  const doneEvent = await deps.getEvent({
    ...identity(uid, story),
    idempotencyKey: doneEventKey(story, storyRunId, beat.beatId),
  });
  if (doneEvent && doneEvent.status !== "applied") throw storyError("STORY_STATE_CONFLICT");

  const selectedValue = getFlags(state)[choiceFlagKey(story, storyRunId, beat.beatId)];
  if (selectedValue !== undefined && typeof selectedValue !== "string") throw storyError("STORY_STATE_CONFLICT");
  const selectedChoiceId = selectedValue as string | undefined;
  const selectedChoice = selectedChoiceId
    ? beat.choices.find((choice) => choice.choiceId === selectedChoiceId)
    : undefined;
  if (selectedChoiceId && !selectedChoice) throw storyError("STORY_STATE_CONFLICT");
  if (doneEvent && !selectedChoice) throw storyError("STORY_STATE_CONFLICT");

  const currentRunId = parseCurrentRunId(story, state);
  const isCurrentRun = currentRunId === storyRunId;
  const status: InteractiveStoryProgress["status"] = doneEvent ? "resolved" : "in_progress";
  const progress: InteractiveStoryProgress = {
    status,
    storyVersion: story.storyVersion,
    storyRunId,
    beatId: beat.beatId,
    ...(selectedChoiceId ? { selectedChoiceId } : {}),
    ready: status === "in_progress" && isCurrentRun && Boolean(state?.activeBeatIds?.includes(beat.beatId)),
  };

  return {
    story: toInteractiveStoryView(story),
    progress,
    ...(selectedChoice ? { selectedChoice: { choiceId: selectedChoice.choiceId, label: selectedChoice.label, result: selectedChoice.result } } : {}),
  };
}

export async function getInteractiveStoryRuntime(input: { uid: string; storyId: string }, dependencies = DEFAULT_DEPENDENCIES) {
  const story = requireStory(input.storyId);
  await dependencies.assertConsent(input.uid);
  const state = await dependencies.getState(identity(input.uid, story));
  const storyRunId = parseCurrentRunId(story, state);
  if (!storyRunId) {
    return {
      story: toInteractiveStoryView(story),
      progress: { status: "not_started", storyVersion: story.storyVersion, ready: false } satisfies InteractiveStoryProgress,
    } satisfies InteractiveStoryRuntimeView;
  }
  return readRunView(dependencies, story, input.uid, storyRunId, state);
}

export async function startInteractiveStory(
  input: { uid: string; storyId: string; idempotencyKey: string },
  dependencies = DEFAULT_DEPENDENCIES,
): Promise<InteractiveStoryRuntimeView> {
  const story = requireStory(input.storyId);
  if (!isValidIdempotencyKey(input.idempotencyKey)) throw storyError("STORY_INPUT_INVALID");
  await dependencies.assertConsent(input.uid);

  return dependencies.withLease({ uid: input.uid, universeId: story.universeId }, async (assertOwned) => {
    const storyIdentity = identity(input.uid, story);
    let state = await dependencies.getState(storyIdentity);
    const startDigest = idempotencyKeyDigest(story, input.idempotencyKey);
    const mappedRunId = parseMappedRunId(getFlags(state)[startFlagKey(story, startDigest)]);
    const currentRunId = parseCurrentRunId(story, state);
    let storyRunId: string | null = mappedRunId;

    if (mappedRunId) {
      const mappedView = await readRunView(dependencies, story, input.uid, mappedRunId, state);
      if (mappedView.progress.status === "resolved") return mappedView;
      if (currentRunId !== mappedRunId) throw storyError("STORY_STATE_CONFLICT");
    } else {
      storyRunId = currentRunId;
      if (storyRunId) {
        const currentView = await readRunView(dependencies, story, input.uid, storyRunId, state);
        if (currentView.progress.status === "resolved") storyRunId = null;
      }

      if (!storyRunId) {
        storyRunId = randomUUID();
        await assertOwned();
        await applyFlag(
          dependencies,
          story,
          input.uid,
          runFlagKey(story),
          `v${story.storyVersion}:${storyRunId}`,
          eventKey(story, storyRunId, "run"),
          "run",
        );
        state = await dependencies.getState(storyIdentity);
      }

      await assertOwned();
      await applyFlag(
        dependencies,
        story,
        input.uid,
        startFlagKey(story, startDigest),
        storyRunId,
        eventKey(story, "start", startDigest),
        "run",
      );
    }

    if (!storyRunId) throw storyError("STORY_STATE_CONFLICT");
    const activeRunId = storyRunId;
    const beat = story.beats[0];
    await assertOwned();
    await applyStoryOutcome(
      dependencies,
      story,
      input.uid,
      eventKey(story, activeRunId, beat.beatId, "start"),
      { source: "user_action", transition: "story.beat.activate", payload: { beatId: beat.beatId }, resolverVersion: 1 },
      "run",
    );
    state = await dependencies.getState(storyIdentity);
    await assertOwned();
    return readRunView(dependencies, story, input.uid, activeRunId, state);
  });
}

export async function chooseInteractiveStory(
  input: { uid: string; storyId: string; storyRunId: string; beatId: string; choiceId: string; idempotencyKey: string },
  dependencies = DEFAULT_DEPENDENCIES,
): Promise<InteractiveStoryRuntimeView> {
  const story = requireStory(input.storyId);
  if (!isValidIdempotencyKey(input.idempotencyKey) || !RUN_ID_PATTERN.test(input.storyRunId)) {
    throw storyError("STORY_INPUT_INVALID");
  }
  const beat = story.beats.find((item) => item.beatId === input.beatId);
  const choice = beat?.choices.find((item) => item.choiceId === input.choiceId);
  if (!beat || !choice) throw storyError("STORY_INPUT_INVALID");
  await dependencies.assertConsent(input.uid);

  return dependencies.withLease({ uid: input.uid, universeId: story.universeId }, async (assertOwned) => {
    const storyIdentity = identity(input.uid, story);
    let state = await dependencies.getState(storyIdentity);
    if (!state || parseCurrentRunId(story, state) !== input.storyRunId) throw storyError("STORY_RUN_NOT_ACTIVE");

    const currentView = await readRunView(dependencies, story, input.uid, input.storyRunId, state);
    if (currentView.progress.status === "resolved") {
      if (currentView.progress.selectedChoiceId !== input.choiceId) throw storyError("STORY_CHOICE_CONFLICT");
      return currentView;
    }
    if (!state.activeBeatIds?.includes(beat.beatId)) throw storyError("STORY_STATE_CONFLICT");

    const choiceKey = choiceFlagKey(story, input.storyRunId, beat.beatId);
    const lockedChoice = getFlags(state)[choiceKey];
    if (lockedChoice !== undefined && lockedChoice !== input.choiceId) throw storyError("STORY_CHOICE_CONFLICT");

    if (lockedChoice === undefined) {
      await assertOwned();
      const locked = await applyFlag(
        dependencies,
        story,
        input.uid,
        choiceKey,
        input.choiceId,
        eventKey(story, input.storyRunId, beat.beatId, "lock"),
        "lock",
      );
      state = locked.state;
    }

    for (const [index, effect] of choice.narrativeEffects.entries()) {
      await assertOwned();
      await applyStoryOutcome(
        dependencies,
        story,
        input.uid,
        eventKey(story, input.storyRunId, beat.beatId, "effect", index, effect.transition),
        toOutcome(effect),
        "effect",
      );
    }

    await assertOwned();
    const completed = await applyStoryOutcome(
      dependencies,
      story,
      input.uid,
      doneEventKey(story, input.storyRunId, beat.beatId),
      { source: "user_action", transition: "story.beat.complete", payload: { beatId: beat.beatId }, resolverVersion: 1 },
      "complete",
    );
    state = completed.state;
    await assertOwned();
    return readRunView(dependencies, story, input.uid, input.storyRunId, state);
  });
}

export function toInteractiveStoryChoiceView(choice: InteractiveStory["beats"][number]["choices"][number]): InteractiveStoryChoiceView {
  return { choiceId: choice.choiceId, label: choice.label, result: choice.result };
}
