"use client";

import { useEffect, useState } from "react";
import { Button } from "@amu-labs/ui";
import { Layout } from "lucide-react";
import { Lang } from "components/module/i18n";
import { listCardNewsTemplates } from "libs/api/lab";
import { getCardNewsTemplatePreset, listCardNewsTemplatePresets } from "libs/card-news/templateResolver";
import {
  CARD_NEWS_BUILT_IN_TEMPLATE_ID,
  CARD_NEWS_BUILT_IN_TEMPLATE_VERSION,
  type CardNewsTemplatePreset,
  type CardNewsTemplateReference,
} from "types/card-news";

type CardNewsTemplatePickerProps = {
  disabled?: boolean;
  onStart: (template: CardNewsTemplateReference, preset: CardNewsTemplatePreset) => void;
};

const TEMPLATE_REFERENCE = {
  id: CARD_NEWS_BUILT_IN_TEMPLATE_ID,
  version: CARD_NEWS_BUILT_IN_TEMPLATE_VERSION,
} as const;

export function CardNewsTemplatePicker({ disabled = false, onStart }: CardNewsTemplatePickerProps) {
  const [presets, setPresets] = useState<CardNewsTemplatePreset[]>(() => {
    const defaultPreset = getCardNewsTemplatePreset(TEMPLATE_REFERENCE);
    return [defaultPreset];
  });

  useEffect(() => {
    let mounted = true;
    void listCardNewsTemplates()
      .then((entries) => {
        if (!mounted) return;
        setPresets(entries);
      })
      .catch(() => {
        if (!mounted) return;
        setPresets(listCardNewsTemplatePresets().filter((preset) => preset.version === CARD_NEWS_BUILT_IN_TEMPLATE_VERSION));
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="mb-4 rounded-2xl border border-border bg-surface px-3 py-3 shadow-sm sm:px-4" aria-labelledby="card-news-template-title">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary-text">
        <Layout className="size-4 text-accent-text" aria-hidden />
        <p id="card-news-template-title"><Lang text={{ ko: "템플릿으로 시작", en: "Start with a template" }} /></p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {presets.map((preset) => {
          const template = { id: preset.id, version: preset.version } satisfies CardNewsTemplateReference;
          return (
            <div key={`${preset.id}@${preset.version}`} className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-primary-text"><Lang text={preset.name} /></p>
                <p className="mt-1 text-xs leading-5 text-secondary-text"><Lang text={preset.description} /></p>
                <p className="mt-1 text-xs text-secondary-text">
                  <Lang text={{ ko: `v${preset.version} · 표지 · 본문 · 마무리 · 대표 이미지 슬롯`, en: `v${preset.version} · cover · body · closing · evidence slots` }} />
                </p>
              </div>
              <Button
                variant="outline"
                className="min-h-11 shrink-0 gap-2 self-start sm:self-auto"
                disabled={disabled}
                onClick={() => onStart(template, preset)}
              >
                <Layout className="size-4" aria-hidden />
                <Lang text={{ ko: "대표 이미지와 시작", en: "Start with an image" }} />
              </Button>
            </div>
          );
        })}
      </div>
      {presets.length === 0 ? (
        <p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-secondary-text" role="status">
          <Lang text={{ ko: "현재 활성화된 템플릿이 없습니다. 빈 카드로 시작할 수 있습니다.", en: "No active templates are available. You can start with a blank card." }} />
        </p>
      ) : null}
    </section>
  );
}
