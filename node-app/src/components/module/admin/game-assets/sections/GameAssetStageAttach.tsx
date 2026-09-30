"use client";

import { useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { IGameAssetDoc, IStageDoc } from "types/game";
import { toUnknownRecord } from "utils/common/typeUtils";

export function GameAssetStageAttach({
  asset,
  stages,
  loading,
  busy,
  onLoadStages,
  onAttach,
}: {
  asset: IGameAssetDoc | null;
  stages: IStageDoc[];
  loading: boolean;
  busy: boolean;
  onLoadStages: () => void;
  onAttach: (stageDocumentId: string) => void;
}) {
  const [stageDocumentId, setStageDocumentId] = useState("");

  if (!asset) return null;

  return (
    <section className="mt-4 rounded-lg border border-border bg-muted/20 p-3" aria-label={lang({ ko: "스테이지 빠른 연결", en: "Quick stage attachment" })}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold"><Lang text={{ ko: "이 스테이지에 추가", en: "Add to this stage" }} /></h4>
          <p className="mt-1 text-xs text-muted-foreground">
            <Lang text={{ ko: "대상만 선택하면 서버가 에셋 이름·크기·런타임 메타를 채웁니다.", en: "Choose a target and the server fills the asset name, size, and runtime metadata." }} />
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Select value={stageDocumentId || "__none__"} onValueChange={(raw) => setStageDocumentId(Array.isArray(raw) ? raw[0] || "" : raw)}>
              <SelectTrigger className="min-h-11 flex-1" aria-label={lang({ ko: "대상 스테이지", en: "Target stage" })}><SelectValue placeholder={lang({ ko: "스테이지 선택", en: "Select a stage" })} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>{lang({ ko: "스테이지 선택", en: "Select a stage" })}</SelectItem>
                {stages.map((stage) => {
                  const id = String(toUnknownRecord(stage)._id || "");
                  return id ? <SelectItem key={id} value={id}>{stage.stageName} ({stage.stageId})</SelectItem> : null;
                })}
              </SelectContent>
            </Select>
            <Button variant="outline" className="min-h-11" disabled={loading} onClick={onLoadStages}><RefreshCw className="size-4" aria-hidden /><Lang text={loading ? { ko: "불러오는 중...", en: "Loading..." } : { ko: "목록 새로고침", en: "Refresh list" }} /></Button>
          </div>
        </div>
        <Button className="min-h-11" disabled={busy || !stageDocumentId || stageDocumentId === "__none__"} onClick={() => onAttach(stageDocumentId)}><Link2 className="size-4" aria-hidden /><Lang text={{ ko: "스테이지에 추가", en: "Add to stage" }} /></Button>
      </div>
    </section>
  );
}
