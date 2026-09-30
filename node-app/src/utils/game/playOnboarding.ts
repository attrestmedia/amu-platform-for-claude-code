export type PlayOnboardingStep = "character" | "move" | "talk";

export type PlayOnboardingProgress = {
  version: 1;
  characterReady: boolean;
  moved: boolean;
  talked: boolean;
  completedAt: string | null;
};

const STORAGE_PREFIX = "amu:play:onboarding:v1:";

export const EMPTY_PLAY_ONBOARDING_PROGRESS: PlayOnboardingProgress = {
  version: 1,
  characterReady: false,
  moved: false,
  talked: false,
  completedAt: null,
};

export function getPlayOnboardingStorageKey(universeId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(universeId.trim())}`;
}

export function normalizePlayOnboardingProgress(value: unknown): PlayOnboardingProgress {
  if (!value || typeof value !== "object") return { ...EMPTY_PLAY_ONBOARDING_PROGRESS };
  const source = value as Partial<PlayOnboardingProgress>;
  const characterReady = source.characterReady === true;
  const moved = characterReady && source.moved === true;
  const talked = moved && source.talked === true;
  return {
    version: 1,
    characterReady,
    moved,
    talked,
    completedAt: talked && typeof source.completedAt === "string" ? source.completedAt : null,
  };
}

export function readPlayOnboardingProgress(
  universeId: string,
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage,
): PlayOnboardingProgress {
  if (!storage || !universeId.trim()) return { ...EMPTY_PLAY_ONBOARDING_PROGRESS };
  try {
    const raw = storage.getItem(getPlayOnboardingStorageKey(universeId));
    return raw ? normalizePlayOnboardingProgress(JSON.parse(raw)) : { ...EMPTY_PLAY_ONBOARDING_PROGRESS };
  } catch {
    return { ...EMPTY_PLAY_ONBOARDING_PROGRESS };
  }
}

export function writePlayOnboardingProgress(
  universeId: string,
  progress: PlayOnboardingProgress,
  storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage,
): void {
  if (!storage || !universeId.trim()) return;
  try {
    storage.setItem(getPlayOnboardingStorageKey(universeId), JSON.stringify(normalizePlayOnboardingProgress(progress)));
  } catch {
    // Storage can be unavailable in private or embedded WebView contexts.
  }
}

export function advancePlayOnboarding(
  progress: PlayOnboardingProgress,
  step: PlayOnboardingStep,
  now = new Date().toISOString(),
): PlayOnboardingProgress {
  const current = normalizePlayOnboardingProgress(progress);
  if (step === "character") {
    return { ...current, characterReady: true };
  }
  if (step === "move" && current.characterReady) {
    return { ...current, moved: true };
  }
  if (step === "talk" && current.moved) {
    return { ...current, talked: true, completedAt: current.completedAt || now };
  }
  return current;
}

export function resetPlayOnboardingProgress(): PlayOnboardingProgress {
  return { ...EMPTY_PLAY_ONBOARDING_PROGRESS };
}
