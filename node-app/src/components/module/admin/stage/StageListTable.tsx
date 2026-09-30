"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import type { IStageDoc } from "types/game";

export type StageDocWithId = IStageDoc & { _id?: string };

export function StageListTable({
  stages,
  page,
  totalPages,
  totalCount,
  canEditStage,
  onEdit,
  onOpenMap,
  onOpenDeepLink,
  onDelete,
  onPageChange,
}: {
  stages: StageDocWithId[];
  page: number;
  totalPages: number;
  totalCount: number;
  canEditStage: (stage: StageDocWithId) => boolean;
  onEdit: (stage: StageDocWithId) => void;
  onOpenMap: (stage: StageDocWithId, mode: "edit" | "view") => void;
  onOpenDeepLink: (stage: StageDocWithId, mode: "edit" | "view") => void;
  onDelete: (stage: StageDocWithId) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-default border">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead className="bg-muted">
          <tr>
            {['stageId', 'stageName', 'usageType', 'ownerType', 'ownerId', 'visibility', 'updatedAt'].map((label) => <th key={label} className="border-b px-2 py-2 text-left whitespace-nowrap">{label}</th>)}
            <th className="min-w-[300px] border-b px-2 py-2 text-center whitespace-nowrap">{lang({ ko: "작업", en: "Actions" })}</th>
          </tr>
        </thead>
        <tbody>
          {stages.length === 0 ? (
            <tr><td colSpan={8} className="px-2 py-5 text-center text-sm text-muted-foreground">{lang({ ko: "등록된 StageDoc이 없습니다.", en: "No StageDoc found." })}</td></tr>
          ) : null}
          {stages.map((stage) => {
            const canEdit = canEditStage(stage);
            const canOpenMap = stage.domain === "stage" && Boolean(stage._id);
            const mode = canEdit ? "edit" : "view";
            const time = stage.updatedAt || stage.createdAt;
            return (
              <tr key={stage._id || `${stage.domain}:${stage.stageId}:${stage.stageName}`}>
                <td className="border-b px-2 py-2">{stage.stageId}</td>
                <td className="border-b px-2 py-2">{stage.stageName}</td>
                <td className="border-b px-2 py-2">{stage.usageType}</td>
                <td className="border-b px-2 py-2">{stage.ownerType}</td>
                <td className="border-b px-2 py-2 text-xs">{stage.ownerId || "-"}</td>
                <td className="border-b px-2 py-2">{stage.visibility}</td>
                <td className="border-b px-2 py-2 text-xs text-muted-foreground">{time ? new Date(time).toLocaleString() : "-"}</td>
                <td className="border-b px-2 py-2">
                  <div className="flex justify-center gap-2">
                    <Button size="sm" variant="outline" className="min-h-11" disabled={!canEdit} onClick={() => canEdit && onEdit(stage)}>{lang({ ko: "문서 편집", en: "Edit doc" })}</Button>
                    <Button size="sm" variant="outline" className="min-h-11" disabled={!canOpenMap} onClick={() => canOpenMap && onOpenMap(stage, mode)}>{canEdit ? lang({ ko: "맵 열기", en: "Open map" }) : lang({ ko: "맵 보기", en: "View map" })}</Button>
                    <Button size="icon-md" variant="ghost" aria-label={lang({ ko: "맵 편집기 새 경로로 열기", en: "Open map editor deep link" })} disabled={!canOpenMap} onClick={() => canOpenMap && onOpenDeepLink(stage, mode)}><ExternalLink className="size-4" aria-hidden /></Button>
                    <Button size="sm" variant="destructive" className="min-h-11" disabled={!canEdit} onClick={() => canEdit && onDelete(stage)}>{lang({ ko: "삭제", en: "Delete" })}</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        <span>{lang({ ko: "총", en: "Total" })} {totalCount} / {page} {lang({ ko: "페이지", en: "page" })}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>{lang({ ko: "이전", en: "Prev" })}</Button>
          <span>{page} / {totalPages}</span>
          <Button size="sm" variant="outline" className="min-h-11" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>{lang({ ko: "다음", en: "Next" })}</Button>
        </div>
      </div>
    </div>
  );
}
