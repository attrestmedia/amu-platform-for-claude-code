"use client";

import { Button, Input, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { CANON_ENTITY_LAYER, CANON_ENTITY_TYPE_VALUES, type CanonEntityType, type CanonLayer } from "types/game";
import { cn } from "utils/common";

export type CanonDraftFormValue = {
  entityType: CanonEntityType;
  entityId: string;
  payloadText: string;
  changelog: string;
};

type CanonDraftFormProps = {
  value: CanonDraftFormValue;
  submitting: boolean;
  onChange: (value: CanonDraftFormValue) => void;
  onSubmit: () => void;
};

const fieldClassName = "w-full bg-background text-primary-text focus-visible:ring-2 focus-visible:ring-primary";

export function CanonDraftForm({ value, submitting, onChange, onSubmit }: CanonDraftFormProps) {
  const layer: CanonLayer = CANON_ENTITY_LAYER[value.entityType];
  const update = (patch: Partial<CanonDraftFormValue>) => onChange({ ...value, ...patch });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      aria-describedby="canon-draft-help"
    >
      <div>
        <h2 className="text-base font-semibold text-primary-text">
          <Lang text={{ ko: "새 Draft 작성", en: "Create draft" }} />
        </h2>
        <p id="canon-draft-help" className="mt-1 text-xs leading-relaxed text-secondary-text">
          <Lang text={{ ko: "저장 후 Review로 제출할 수 있습니다. AI는 Global Canon에 직접 쓸 수 없습니다.", en: "Save a draft, then submit it for review. AI cannot write Global Canon directly." }} />
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-primary-text">
          <span><Lang text={{ ko: "Entity 종류", en: "Entity type" }} /></span>
          <select
            value={value.entityType}
            onChange={(event) => update({ entityType: event.target.value as CanonEntityType })}
            className={cn(fieldClassName, "h-10 rounded-md border border-border px-3 text-sm")}
            aria-label={lang({ ko: "Entity 종류", en: "Entity type" })}
          >
            {CANON_ENTITY_TYPE_VALUES.map((entityType) => (
              <option key={entityType} value={entityType}>{entityType}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm font-medium text-primary-text">
          <span><Lang text={{ ko: "Layer", en: "Layer" }} /></span>
          <Input value={layer} readOnly aria-label={lang({ ko: "자동 계산된 Canon layer", en: "Calculated Canon layer" })} className={cn(fieldClassName, "font-mono")} />
        </label>
      </div>

      <label className="block space-y-1.5 text-sm font-medium text-primary-text">
        <span><Lang text={{ ko: "Entity ID", en: "Entity ID" }} /></span>
        <Input
          value={value.entityId}
          onChange={(event) => update({ entityId: event.target.value })}
          required
          pattern="[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}"
          placeholder={lang({ ko: "예: harbor-arrival", en: "e.g. harbor-arrival" })}
          className={cn(fieldClassName, "font-mono")}
        />
        <span className="block text-xs font-normal text-secondary-text">
          <Lang text={{ ko: "영문·숫자로 시작하는 120자 이내 ID", en: "Up to 120 characters; start with a letter or number" }} />
        </span>
      </label>

      <label className="block space-y-1.5 text-sm font-medium text-primary-text">
        <span><Lang text={{ ko: "Payload (JSON)", en: "Payload (JSON)" }} /></span>
        <Textarea
          value={value.payloadText}
          onChange={(event) => update({ payloadText: event.target.value })}
          required
          rows={12}
          spellCheck={false}
          className={cn(fieldClassName, "min-h-56 resize-y font-mono text-xs leading-relaxed")}
          placeholder={'{\n  "title": "..."\n}'}
          aria-label={lang({ ko: "Canon payload JSON", en: "Canon payload JSON" })}
        />
        <span className="block text-xs font-normal text-secondary-text">
          <Lang text={{ ko: "저장 시 JSON 형식과 entity별 필수 참조를 검사합니다.", en: "JSON shape and entity-specific references are validated on save." }} />
        </span>
      </label>

      <label className="block space-y-1.5 text-sm font-medium text-primary-text">
        <span><Lang text={{ ko: "변경 기록", en: "Changelog" }} /></span>
        <Textarea
          value={value.changelog}
          onChange={(event) => update({ changelog: event.target.value })}
          rows={3}
          maxLength={2000}
          className={cn(fieldClassName, "resize-y")}
          placeholder={lang({ ko: "이번 revision에서 바뀐 내용을 남겨주세요.", en: "Describe what changed in this revision." })}
        />
      </label>

      <Button type="submit" variant="primary" loading={submitting} loadingText={lang({ ko: "저장 중...", en: "Saving..." })}>
        <Lang text={{ ko: "Draft 저장", en: "Save draft" }} />
      </Button>
    </form>
  );
}
