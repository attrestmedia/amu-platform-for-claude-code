"use client";

import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { GameViewPreview } from "components/module/admin/game-assets/preview/GameViewPreview";
import { RefreshCw, Send } from "lucide-react";
import type { IGameAssetDoc } from "types/game";
import { toUnknownRecord } from "utils/common/typeUtils";
import { validateStageAssetProjectionMeta } from "utils/game";
import { SPRITE_ACTION_PRESETS } from "../spriteActionModel";
import type { useGameAssetRuntimeEditor } from "../useGameAssetRuntimeEditor";

type RuntimeEditorType = ReturnType<typeof useGameAssetRuntimeEditor>;
type ProjectionValidationType = ReturnType<typeof validateStageAssetProjectionMeta> | null;

export function GameAssetPublishSection({
  selectedAsset,
  editor,
  projectionMetaValidation,
  busy,
}: {
  selectedAsset: IGameAssetDoc;
  editor: RuntimeEditorType;
  projectionMetaValidation: ProjectionValidationType;
  busy: boolean;
}) {
  const {
    loadPublishTargets,
    personaOptions,
    publish,
    publishForm,
    setPublishForm,
    stageOptions,
    targetLoading,
  } = editor;

  return (
    <div className="border-t border-border pt-4">
      <h4 className="font-semibold">
        <Lang text={{ ko: "런타임 발행", en: "Publish to Runtime" }} />
      </h4>
      <p className="text-sm text-muted-foreground">
        <Lang
          text={{
            ko: "Persona sprite 또는 StageDoc asset으로 발행합니다.",
            en: "Publish this asset as a Persona sprite or StageDoc asset.",
          }}
        />
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Label label="universeId">
          <Input
            value={publishForm.universeId}
            onChange={(event) => setPublishForm((prev) => ({ ...prev, universeId: event.target.value }))}
          />
        </Label>

        <div className="flex items-end">
          <Button variant="outline" onClick={loadPublishTargets} disabled={targetLoading} className="w-full">
            <RefreshCw size={16} />
            <Lang text={{ ko: "대상 목록 로드", en: "Load Targets" }} />
          </Button>
        </div>

        <Label label={lang({ ko: "발행 대상", en: "Target" })}>
          <Select
            value={publishForm.targetType}
            onValueChange={(value) =>
              setPublishForm((prev) => ({ ...prev, targetType: value as "persona" | "stage" }))
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="persona">Persona sprite</SelectItem>
              <SelectItem value="stage">Stage asset</SelectItem>
            </SelectContent>
          </Select>
        </Label>

        {publishForm.targetType === "persona" ? (
          <>
            <Label label={lang({ ko: "적용할 동작", en: "Sprite action" })}>
              <Select
                value={publishForm.spriteActionKey}
                onValueChange={(raw) => {
                  const value = Array.isArray(raw) ? raw[0] || "walk" : raw;
                  setPublishForm((prev) => ({ ...prev, spriteActionKey: value }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {!SPRITE_ACTION_PRESETS.some((item) => item.key === publishForm.spriteActionKey) ? (
                    <SelectItem value={publishForm.spriteActionKey}>{publishForm.spriteActionKey}</SelectItem>
                  ) : null}
                  {SPRITE_ACTION_PRESETS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>{lang(item.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <Label label="personaPid">
              <Select
                value={publishForm.personaPid || "__manual__"}
                onValueChange={(raw) => {
                  const value = Array.isArray(raw) ? raw[0] || "__manual__" : raw;
                  setPublishForm((prev) => ({ ...prev, personaPid: value === "__manual__" ? "" : value }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">{lang({ ko: "직접 입력", en: "Manual" })}</SelectItem>
                  {personaOptions.map((persona) => (
                    <SelectItem key={persona.pid} value={persona.pid}>
                      {persona.name || persona.pid} ({persona.pid})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <Label label={lang({ ko: "직접 입력", en: "Manual" })}>
              <Input
                value={publishForm.personaPid}
                onChange={(event) => setPublishForm((prev) => ({ ...prev, personaPid: event.target.value }))}
                placeholder="persona pid"
              />
            </Label>
          </>
        ) : (
          <>
            <Label label="stageDocumentId">
              <Select
                value={publishForm.stageDocumentId || "__manual__"}
                onValueChange={(raw) => {
                  const value = Array.isArray(raw) ? raw[0] || "__manual__" : raw;
                  const selected = stageOptions.find(
                    (stage) => String(toUnknownRecord(stage)._id || "") === value,
                  );
                  setPublishForm((prev) => ({
                    ...prev,
                    stageDocumentId: value === "__manual__" ? "" : value,
                    stageId: selected?.stageId || prev.stageId,
                    stageName: selected?.stageName || prev.stageName,
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">{lang({ ko: "직접 입력", en: "Manual" })}</SelectItem>
                  {stageOptions
                    .map((stage) => ({ stage, id: String(toUnknownRecord(stage)._id || "") }))
                    .filter((row) => row.id)
                    .map(({ stage, id }) => (
                      <SelectItem key={id} value={id}>{stage.stageName} ({stage.stageId})</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Label>
            <Label label="stageId">
              <Input
                value={publishForm.stageId}
                onChange={(event) => setPublishForm((prev) => ({ ...prev, stageId: event.target.value }))}
              />
            </Label>
            <Label label="stageName">
              <Input
                value={publishForm.stageName}
                onChange={(event) => setPublishForm((prev) => ({ ...prev, stageName: event.target.value }))}
              />
            </Label>
            <Label label="assetName">
              <Input
                value={publishForm.assetName}
                onChange={(event) => setPublishForm((prev) => ({ ...prev, assetName: event.target.value }))}
              />
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label label="width">
                <Input
                  type="number"
                  min={1}
                  value={publishForm.width}
                  onChange={(event) => setPublishForm((prev) => ({ ...prev, width: event.target.value }))}
                />
              </Label>
              <Label label="height">
                <Input
                  type="number"
                  min={1}
                  value={publishForm.height}
                  onChange={(event) => setPublishForm((prev) => ({ ...prev, height: event.target.value }))}
                />
              </Label>
            </div>
            <Label label={lang({ ko: "역할", en: "Roles" })}>
              <Input
                value={publishForm.rolesText}
                onChange={(event) => setPublishForm((prev) => ({ ...prev, rolesText: event.target.value }))}
                placeholder="shop, obstacle"
              />
            </Label>
            {selectedAsset.storage?.url ? (
              <GameViewPreview
                className="sm:col-span-2"
                imageUrl={selectedAsset.storage.url}
                footprintWidth={Number(publishForm.width || 1)}
                footprintHeight={Number(publishForm.height || 1)}
              />
            ) : null}
          </>
        )}
      </div>

      {projectionMetaValidation && !projectionMetaValidation.valid ? (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
          <p className="font-semibold text-destructive">
            <Lang
              text={{
                ko: "투영 메타가 유효하지 않아 발행이 차단됩니다.",
                en: "Publishing is blocked by invalid projection metadata.",
              }}
            />
          </p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {projectionMetaValidation.issues.map((issue) => (
              <li key={`${issue.path}-${issue.code}`}>{issue.path}: {issue.code}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button
        className="mt-3"
        onClick={publish}
        disabled={busy || Boolean(projectionMetaValidation && !projectionMetaValidation.valid)}
      >
        <Send size={16} />
        <Lang text={{ ko: "발행", en: "Publish" }} />
      </Button>
    </div>
  );
}
