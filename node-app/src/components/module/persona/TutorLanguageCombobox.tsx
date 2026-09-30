"use client";

import { Combobox } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { TUTOR_LANGUAGE_OPTIONS } from "consts/tutors";
import { useGlobalStore } from "store/global";
import { cn } from "utils/common";

type TutorLanguageComboboxProps = {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
};

export default function TutorLanguageCombobox({
  value = "",
  onChange,
  disabled = false,
  className,
  triggerClassName,
}: TutorLanguageComboboxProps) {
  useGlobalStore((state) => state.language);

  const options = TUTOR_LANGUAGE_OPTIONS.map((option) => ({
    value: option.value,
    label: lang(option.label),
    description: option.nativeName,
    keywords: option.searchText,
  }));

  return (
    <Combobox
      value={value}
      onValueChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={lang({ ko: "언어 선택", en: "Select language" })}
      searchPlaceholder={lang({ ko: "언어 검색", en: "Search language" })}
      emptyText={lang({ ko: "선택할 언어가 없습니다.", en: "No language found." })}
      className={className}
      triggerClassName={cn("min-h-10", triggerClassName)}
      contentClassName="max-h-72 overflow-hidden"
      listClassName="max-h-60"
    />
  );
}
