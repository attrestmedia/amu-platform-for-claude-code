"use client";

import { useEffect, useState } from "react";
import { SearchableSelectBox, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { listSystemPersonas } from "libs/api/universe/systemPersonas";
import { getSystemPersonaPreviewText } from "utils/ai/systemPersonaPreview";
import { cn } from "utils/common";
import type { UnknownRecord } from "utils/common/typeUtils";
import type { SystemPersonaServiceType, SystemPersonaTutorsPolicyDefaultsType } from "types/ai";
import { normalizeSystemPersonaTutorsPolicyDefaults } from "types/ai";

export type SystemPersonaPresetOption = {
  key: string;
  title: string;
  category?: string;
  summary?: string;
  tutorsPolicyDefaults?: SystemPersonaTutorsPolicyDefaultsType;
};

type SystemPersonaPresetPickerProps = {
  value?: string;
  onChange: (value: string, option?: SystemPersonaPresetOption) => void;
  onResolvedOption?: (option: SystemPersonaPresetOption | null) => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  showNoneOption?: boolean;
  placeholderText?: string;
  placeholderDescriptionText?: string;
  noneOptionLabelText?: string;
  noneOptionDescriptionText?: string;
  service?: SystemPersonaServiceType;
};

export default function SystemPersonaPresetPicker({
  value = "",
  onChange,
  onResolvedOption,
  disabled = false,
  className,
  compact = false,
  showNoneOption = true,
  placeholderText,
  placeholderDescriptionText,
  noneOptionLabelText,
  noneOptionDescriptionText,
  service = "tutors",
}: SystemPersonaPresetPickerProps) {
  const [items, setItems] = useState<SystemPersonaPresetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    // 마운트 시 1회만 페치 — 초기 state(loading=true, loadFailed=false)가 이미 적합하므로 별도 reset setState 불필요
    let ignore = false;

    listSystemPersonas({ enabled: true, service, selectableOnly: true })
      .then((rows) => {
        if (ignore) return;
        setItems(
          (rows || []).map((row: UnknownRecord) => ({
            key: String(row?.key || ""),
            title: String(row?.title || ""),
            category: String(row?.category || ""),
            summary: String(row?.summary || ""),
            tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults(row?.tutorsPolicyDefaults),
          })),
        );
      })
      .catch(() => {
        if (ignore) return;
        setItems([]);
        setLoadFailed(true);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [service]);

  useEffect(() => {
    onResolvedOption?.(items.find((item) => item.key === value) || null);
  }, [items, onResolvedOption, value]);

  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-24 items-center justify-center rounded-xl border border-border/40 bg-card/70",
          className,
        )}
      >
        <Preloader variant="spin" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className={cn("rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-xs text-danger", className)}>
        <Lang
          text={{ ko: "시스템 페르소나 목록을 불러오지 못했습니다.", en: "Failed to load system persona presets." }}
        />
      </div>
    );
  }

  const dropdownItems = [
    ...(showNoneOption
      ? [
          {
            value: "",
            title: noneOptionLabelText || lang({ ko: "직접 성격 만들기", en: "Custom persona" }),
            description:
              noneOptionDescriptionText ||
              lang({
                ko: "시스템 프리셋 없이, 아래 메모를 바탕으로 튜터 성격을 직접 정리합니다.",
                en: "Skip system presets and shape the tutor personality from your custom notes below.",
              }),
            keywords: [
              noneOptionLabelText || lang({ ko: "직접 성격 만들기", en: "Custom persona" }),
              noneOptionDescriptionText ||
                lang({
                  ko: "시스템 프리셋 없이, 아래 메모를 바탕으로 튜터 성격을 직접 정리합니다.",
                  en: "Skip system presets and shape the tutor personality from your custom notes below.",
                }),
            ].join(" "),
          },
        ]
      : []),
    ...items.map((item) => ({
      value: item.key,
      title: item.title,
      description:
        getSystemPersonaPreviewText({ summary: item.summary }) ||
        (item.category
          ? lang({
              ko: `${item.category} 카테고리의 시스템 페르소나입니다.`,
              en: `A system persona preset in the ${item.category} category.`,
            })
          : lang({
              ko: "공통 시스템 페르소나 프리셋입니다.",
              en: "A shared system persona preset.",
            })),
      badge: item.category,
      keywords: [item.key, item.category, item.summary].filter(Boolean).join(" "),
    })),
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <SearchableSelectBox
        items={dropdownItems}
        value={value}
        onChange={(nextValue) =>
          onChange(
            nextValue,
            items.find((item) => item.key === nextValue),
          )
        }
        disabled={disabled}
        placeholder={placeholderText || lang({ ko: "시스템 페르소나를 선택해주세요", en: "Select a system persona" })}
        placeholderDescription={
          placeholderDescriptionText ||
          lang({
            ko: "박스를 열면 요약과 카테고리를 보면서 선택할 수 있습니다.",
            en: "Open the box to choose while comparing summaries and categories.",
          })
        }
        emptyMessage={lang({
          ko: "선택 가능한 시스템 페르소나가 없습니다.",
          en: "There are no selectable system personas.",
        })}
        searchable={compact ? items.length > 4 : items.length > 5}
      />
    </div>
  );
}
