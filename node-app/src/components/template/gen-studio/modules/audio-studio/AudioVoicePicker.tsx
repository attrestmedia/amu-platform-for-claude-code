"use client";

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { StudioAudioVoiceOption } from "libs/api/lab";

type AudioVoicePickerProps = {
  voices: StudioAudioVoiceOption[];
  value: string;
  onChange: (voiceId: string) => void;
  disabled?: boolean;
};

export function AudioVoicePicker({ voices, value, onChange, disabled = false }: AudioVoicePickerProps) {
  const selected = voices.find((voice) => voice.voiceId === value) || null;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="audio-voice">
        <Lang text={{ ko: "목소리", en: "Voice" }} />
      </Label>
      <Select value={value || undefined} onValueChange={(next) => onChange(String(next))} disabled={disabled}>
        <SelectTrigger
          id="audio-voice"
          className="min-h-11 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-describedby="audio-voice-help"
        >
          <SelectValue placeholder={lang({ ko: "목소리를 선택하세요", en: "Select a voice" })} />
        </SelectTrigger>
        <SelectContent>
          {voices.map((voice) => (
            <SelectItem key={voice.voiceId} value={voice.voiceId}>
              {`${voice.label} · ${voice.locales.join("/")} · ×${voice.creditMultiplier}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-secondary-text">
            {selected.locales.join(" / ")}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-secondary-text">
            {lang({ ko: `요율 배율 ×${selected.creditMultiplier}`, en: `Rate ×${selected.creditMultiplier}` })}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-secondary-text">
            <Lang text={{ ko: "상업 이용 가능", en: "Commercial use allowed" }} />
          </span>
          {selected.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-xs text-secondary-text">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <p id="audio-voice-help" className="text-xs leading-5 text-secondary-text">
        <Lang
          text={{
            ko: "선택한 Voice의 추가 비용은 위 요율 배율에 반영됩니다. 미리듣기 생성은 이번 화면에서 제공하지 않습니다.",
            en: "Extra cost for the selected voice follows the rate multiplier above. Preview generation is not offered in this screen.",
          }}
        />
      </p>
    </div>
  );
}
