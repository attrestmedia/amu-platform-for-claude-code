export const CHARACTER_GENESIS_SURFACES = ["tutors", "play", "store"] as const;
export type CharacterGenesisSurfaceType = (typeof CHARACTER_GENESIS_SURFACES)[number];

export const CHARACTER_GENESIS_STAGES = ["identity", "reference-set", "result-apply"] as const;
export type CharacterGenesisStageType = (typeof CHARACTER_GENESIS_STAGES)[number];

export type CharacterGenesisShellPresentationType = {
  headerActionButtonClass: string;
  listPanelClass: string;
  inlineActionButtonClass: string;
  destructiveActionExtraClass: string;
  personaEditorSectionMode: "accordion" | "plain";
  applyThemeOverride: boolean;
};
