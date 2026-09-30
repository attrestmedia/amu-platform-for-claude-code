"use client";

import { useState } from "react";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { Layers, X } from "lucide-react";
import { TemplateGroupBulkDialog } from "./TemplateGroupBulkDialog";
import type { GenStudioTemplateGroupPromptType } from "types/app";

type TemplateGroupSelectionBarProps = {
  selectedTemplateKeys: string[];
  templateMetaByKey?: Record<string, { title: string; thumb: string }>;
  promptType?: Exclude<GenStudioTemplateGroupPromptType, "audio">;
  initialGroupKey?: string;
  onClear: () => void;
  onDone: () => void;
};

export function TemplateGroupSelectionBar({
  selectedTemplateKeys,
  templateMetaByKey,
  promptType = "image",
  initialGroupKey,
  onClear,
  onDone,
}: TemplateGroupSelectionBarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "관리자 그룹 편집 모드", en: "Admin group edit mode" }} />
          </p>
          <p className="mt-1 text-xs text-secondary-text">
            <Lang
              text={{
                ko: `${selectedTemplateKeys.length}개 템플릿 선택됨`,
                en: `${selectedTemplateKeys.length} templates selected`,
              }}
            />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onClear} disabled={!selectedTemplateKeys.length}>
            <X className="h-4 w-4" />
            <Lang text={{ ko: "선택 해제", en: "Clear" }} />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Layers className="h-4 w-4" />
            <Lang text={{ ko: "그룹 설정", en: "Group settings" }} />
          </Button>
          <Button variant="blank" size="sm" onClick={onDone}>
            <Lang text={{ ko: "편집 종료", en: "Done" }} />
          </Button>
        </div>
      </div>
      <TemplateGroupBulkDialog
        open={dialogOpen}
        selectedTemplateKeys={selectedTemplateKeys}
        templateMetaByKey={templateMetaByKey}
        promptType={promptType}
        initialGroupKey={initialGroupKey}
        onOpenChange={setDialogOpen}
        onComplete={onClear}
      />
    </>
  );
}
