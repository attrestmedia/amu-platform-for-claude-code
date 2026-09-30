"use client";

import { PersonaEditor } from "components/module/persona/PersonaEditor";
import TutorProfileImageSection from "components/module/persona/TutorProfileImageSection";
import type { PersonaFormValuesType } from "types/ai";
import { TutorIntroSection, TutorSettingsEditor } from "./TutorSettingsEditor";

type PersonaDisabledFields = Partial<Record<keyof PersonaFormValuesType | "personaType", boolean>>;

export interface TutorGenesisProfilePanelProps {
  value: PersonaFormValuesType;
  onChange: (next: PersonaFormValuesType) => void;
  personaDisabledFields?: PersonaDisabledFields;
  disabled?: boolean;
  settingsDisabled?: boolean;
  isAdmin?: boolean;
  pilotVoices?: readonly string[];
  imageGenerationPresentation?: "sheet" | "embedded";
}

/** Tutors의 저장·템플릿 편집 표면이 공유하는 Persona 편집 패널이다. */
export function TutorGenesisProfilePanel({
  value,
  onChange,
  personaDisabledFields,
  disabled,
  settingsDisabled = disabled,
  isAdmin = false,
  pilotVoices = [],
  imageGenerationPresentation = "embedded",
}: TutorGenesisProfilePanelProps) {
  return (
    <div className="space-y-6">
      <PersonaEditor
        value={value}
        onChange={onChange}
        disabledFields={personaDisabledFields}
        universeIdMode="readonly"
        canViewInternalIds={isAdmin}
        profilesSectionMode="hidden"
        spriteSectionMode="hidden"
        personaTypeControl="radio"
        personaTypeLabel={{ ko: "튜터 타입", en: "Tutor Type" }}
        pilotVoices={pilotVoices}
      />
      <TutorIntroSection value={value} onChange={onChange} disabled={disabled} />
      <div className="border-t border-border/40 pt-6">
        <TutorProfileImageSection
          value={value}
          onChange={onChange}
          disabled={disabled}
          canViewProfileUsageNote={isAdmin}
          generationPresentation={imageGenerationPresentation}
        />
      </div>
      <div className="border-t border-border/40 pt-6">
        <TutorSettingsEditor
          value={value}
          onChange={onChange}
          isAdmin={isAdmin}
          hideIntroSection
          disabled={settingsDisabled}
        />
      </div>
    </div>
  );
}
