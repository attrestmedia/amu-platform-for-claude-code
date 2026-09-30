import type {
  CharacterGenesisShellPresentationType,
  CharacterGenesisSurfaceType,
} from "types/ui/characterGenesis";

export const CHARACTER_GENESIS_SHELL_PRESENTATION: Record<
  CharacterGenesisSurfaceType,
  CharacterGenesisShellPresentationType
> = {
  tutors: {
    headerActionButtonClass: "min-h-10 rounded-xl px-4 text-sm font-semibold shadow-sm",
    listPanelClass: "space-y-3 rounded-2xl border border-border/70 bg-surface/80 p-3 shadow-sm",
    inlineActionButtonClass: "min-h-10",
    destructiveActionExtraClass: "shadow-sm",
    personaEditorSectionMode: "accordion",
    applyThemeOverride: true,
  },
  play: {
    headerActionButtonClass: "",
    listPanelClass: "rounded-xl border bg-card p-3 space-y-2",
    inlineActionButtonClass: "",
    destructiveActionExtraClass: "",
    personaEditorSectionMode: "plain",
    applyThemeOverride: false,
  },
  store: {
    headerActionButtonClass: "",
    listPanelClass: "rounded-xl border bg-card p-3 space-y-2",
    inlineActionButtonClass: "",
    destructiveActionExtraClass: "",
    personaEditorSectionMode: "plain",
    applyThemeOverride: false,
  },
};

export function resolveCharacterGenesisShellPresentation(
  surface: CharacterGenesisSurfaceType,
): CharacterGenesisShellPresentationType {
  return CHARACTER_GENESIS_SHELL_PRESENTATION[surface];
}
