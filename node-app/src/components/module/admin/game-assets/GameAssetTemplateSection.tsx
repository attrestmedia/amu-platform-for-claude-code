"use client";

import type { PromptItemExtendedType } from "types/app";
import { Badge, Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { RefreshCw, Wand2 } from "lucide-react";
import { toUnknownRecord } from "utils/common/typeUtils";

export function GameAssetTemplateSection({
  templates,
  registeredKeys,
  busy,
  onRefresh,
  onSeedTemplates,
}: {
  templates: PromptItemExtendedType[];
  registeredKeys: Set<string>;
  busy: boolean;
  onRefresh: () => void;
  onSeedTemplates: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            <Lang text={{ ko: "게임 에셋 템플릿", en: "Game Asset Templates" }} />
          </h2>
          <p className="text-sm text-muted-foreground">
            <Lang
              text={{
                ko: "AI 생성은 Gen Studio의 기존 생성/과금 파이프라인에서 실행하고, 이 화면은 생성 결과를 게임 에셋으로 연결합니다.",
                en: "AI generation runs through the existing Gen Studio billing pipeline; this screen connects results to game assets.",
              }}
            />
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRefresh} disabled={busy}>
            <RefreshCw size={16} />
            <Lang text={{ ko: "새로고침", en: "Refresh" }} />
          </Button>
          <Button onClick={onSeedTemplates} disabled={busy}>
            <Wand2 size={16} />
            <Lang text={{ ko: "템플릿 등록", en: "Seed Templates" }} />
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {templates.map((template) => {
          const defaultParams = toUnknownRecord(template.defaultParams);
          const modelLock = toUnknownRecord(defaultParams.modelLock);
          return (
            <div key={template.key} className="min-w-0 rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{template.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{template.key}</p>
                </div>
                <Badge variant={registeredKeys.has(template.key) ? "accent" : "outline"}>
                  {registeredKeys.has(template.key) ? (
                    <Lang text={{ ko: "등록됨", en: "Registered" }} />
                  ) : (
                    <Lang text={{ ko: "대기", en: "Pending" }} />
                  )}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
                <Badge variant="secondary">admin</Badge>
                <Badge variant="secondary">{String(defaultParams.provider || "-")}</Badge>
                <Badge variant="secondary">{String(defaultParams.modelName || "-")}</Badge>
                {modelLock?.enabled ? <Badge variant="secondary">model lock</Badge> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
