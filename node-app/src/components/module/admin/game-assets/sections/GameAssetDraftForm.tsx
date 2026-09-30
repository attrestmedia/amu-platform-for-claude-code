"use client";

import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ImagePlus, Upload } from "lucide-react";
import type { GameAssetType } from "types/game/asset";
import {
  GAME_ASSET_DRAFT_TYPES,
  GAME_ASSET_TYPE_TEXT,
  type DraftFormType,
} from "../gameAssetForgeModel";

/**
 * @docHint
 * @purpose 관리자 Forge의 "드래프트 연결" 폼 — Gen Studio 결과/업로드 이미지를 게임 에셋 드래프트로 생성
 * @process 폼 입력  에셋 타입 선택  드래프트 생성 요청 (onCreate로 상위 위임)
 * @domain game.asset
 * @scope admin-client
 */
export function GameAssetDraftForm({
  form,
  setForm,
  busy,
  onCreate,
}: {
  form: DraftFormType;
  setForm: React.Dispatch<React.SetStateAction<DraftFormType>>;
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-4 flex items-center gap-2">
        <ImagePlus size={18} />
        <h3 className="font-semibold">
          <Lang text={{ ko: "드래프트 연결", en: "Connect Draft" }} />
        </h3>
      </div>

      <div className="space-y-3">
        <Label label={lang({ ko: "에셋 이름", en: "Asset Name" })}>
          <Input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </Label>

        <Label label={lang({ ko: "에셋 타입", en: "Asset Type" })}>
          <Select
            value={form.assetType}
            onValueChange={(value) => setForm((prev) => ({ ...prev, assetType: value as GameAssetType }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAME_ASSET_DRAFT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {lang(GAME_ASSET_TYPE_TEXT[type])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>

        <Label label="sourceImageAssetId">
          <Input
            value={form.sourceImageAssetId}
            onChange={(event) => setForm((prev) => ({ ...prev, sourceImageAssetId: event.target.value }))}
            placeholder="asset_xxx"
          />
        </Label>

        <Label label={lang({ ko: "보정 이미지 URL", en: "Edited Image URL" })}>
          <Input
            value={form.storageUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, storageUrl: event.target.value }))}
            placeholder="/apps/gen-studio/..."
          />
        </Label>

        <Label label="templateKey">
          <Input
            value={form.templateKey}
            onChange={(event) => setForm((prev) => ({ ...prev, templateKey: event.target.value }))}
          />
        </Label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="universeId">
            <Input
              value={form.universeId}
              onChange={(event) => setForm((prev) => ({ ...prev, universeId: event.target.value }))}
            />
          </Label>
          <Label label="stageId">
            <Input
              value={form.stageId}
              onChange={(event) => setForm((prev) => ({ ...prev, stageId: event.target.value }))}
            />
          </Label>
        </div>

        <Label label={lang({ ko: "태그", en: "Tags" })}>
          <Textarea
            value={form.tagsText}
            onChange={(event) => setForm((prev) => ({ ...prev, tagsText: event.target.value }))}
            rows={2}
          />
        </Label>

        <Button className="w-full" onClick={onCreate} disabled={busy}>
          <Upload size={16} />
          <Lang text={{ ko: "드래프트 생성", en: "Create Draft" }} />
        </Button>
      </div>
    </div>
  );
}
