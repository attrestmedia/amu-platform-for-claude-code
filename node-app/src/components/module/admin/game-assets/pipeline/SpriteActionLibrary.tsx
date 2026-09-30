"use client";

import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { IGameAssetPipelineDoc } from "types/game";
import { Check, Plus } from "lucide-react";
import { cn } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";
import { normalizeSpriteActionKey, type SpriteActionPresetType } from "../spriteActionModel";

export type SpriteActionDraftType = {
  key: string;
  labelKo: string;
  labelEn: string;
  motionAction: string;
  motionSequence: string;
  fps: number;
  frameCount: number;
  loop: boolean;
  symmetryEligible: boolean;
};

export function SpriteActionLibrary({
  actions,
  pipelines,
  selectedActionKey,
  effectiveAnchorAssetId,
  effectiveAnchorSourceUrl,
  dialogOpen,
  actionDraft,
  onSelect,
  onDialogOpenChange,
  onDraftChange,
  onAdd,
  saving = false,
}: {
  actions: SpriteActionPresetType[];
  pipelines: IGameAssetPipelineDoc[];
  selectedActionKey: string;
  effectiveAnchorAssetId: string;
  effectiveAnchorSourceUrl: string;
  dialogOpen: boolean;
  actionDraft: SpriteActionDraftType;
  onSelect: (action: SpriteActionPresetType, pipeline?: IGameAssetPipelineDoc) => void;
  onDialogOpenChange: (open: boolean) => void;
  onDraftChange: (draft: SpriteActionDraftType) => void;
  onAdd: () => void | Promise<void>;
  saving?: boolean;
}) {
  return (
    <>
      <div className="rounded-xl border border-border bg-background/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="font-semibold">
              <Lang text={{ ko: "캐릭터 동작 라이브러리", en: "Character action library" }} />
            </h4>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              <Lang
                text={{
                  ko: "걷기는 기본 동작입니다. 같은 기준 캐릭터로 필요한 동작만 추가하면 얼굴·의상·색상을 유지한 별도 8방향 시트를 만듭니다.",
                  en: "Walk is the base action. Add only what you need to create separate 8-direction sheets while preserving identity and style.",
                }}
              />
            </p>
          </div>
          <Button variant="outline" onClick={() => onDialogOpenChange(true)} className="min-h-11 shrink-0">
            <Plus className="size-4" />
            <Lang text={{ ko: "동작 추가", en: "Add action" }} />
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => {
            const matchingPipeline = pipelines.find(
              (pipeline) =>
                normalizeSpriteActionKey(toUnknownRecord(pipeline.variables).sprite_action_key) === action.key &&
                Number(toUnknownRecord(pipeline.variables).sprite_frame_count || 4) === action.frameCount &&
                (effectiveAnchorAssetId
                  ? String(pipeline.anchor?.imageAssetId || "") === effectiveAnchorAssetId
                  : effectiveAnchorSourceUrl
                    ? String(pipeline.anchor?.sourceUrl || "") === effectiveAnchorSourceUrl
                    : true),
            );
            const selected = selectedActionKey === action.key;
            return (
              <button
                key={action.key}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(action, matchingPipeline)}
                className={cn(
                  "min-h-24 rounded-xl border p-3 text-left transition focus-visible-ring",
                  selected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border bg-surface hover:border-primary/50",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{lang(action.label)}</span>
                  {selected ? <Check className="size-4 text-primary" aria-hidden /> : null}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{lang(action.description)}</span>
                <span className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="outline">{action.fps} fps</Badge>
                  <Badge variant="outline">
                    <Lang text={{ ko: `${action.frameCount}프레임`, en: `${action.frameCount} frames` }} />
                  </Badge>
                  <Badge variant="outline">
                    {action.loop ? lang({ ko: "반복", en: "Loop" }) : lang({ ko: "단발", en: "One-shot" })}
                  </Badge>
                  {action.symmetryEligible ? (
                    <Badge variant="outline"><Lang text={{ ko: "미러 가능", en: "Mirror eligible" }} /></Badge>
                  ) : null}
                  {action.motionGuideVersion > 0 ? (
                    <Badge variant="outline">
                      <Lang text={{ ko: `모션 가이드 v${action.motionGuideVersion}`, en: `Motion guide v${action.motionGuideVersion}` }} />
                    </Badge>
                  ) : null}
                  {matchingPipeline ? <Badge variant="secondary">{matchingPipeline.status}</Badge> : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          <Lang
            text={{
              ko: "모션 가이드는 플랫폼이 소유·관리하는 공용 기준 자산입니다. 가이드를 참고해 생성된 캐릭터 결과물의 권리는 사용자에게 귀속됩니다.",
              en: "Motion guides are shared reference assets owned and maintained by the platform. Rights to character outputs created with them belong to the user.",
            }}
          />
        </p>
      </div>

      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><Lang text={{ ko: "사용자 정의 동작 추가", en: "Add a custom action" }} /></DialogTitle>
            <DialogDescription>
              <Lang
                text={{
                  ko: "기본은 4프레임입니다. 6·8프레임은 텍스처 메모리와 생성 난도가 증가하는 관리자 옵트인입니다.",
                  en: "Four frames is the default. Six and eight frames are admin opt-ins with higher texture memory and generation complexity.",
                }}
              />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Label label={lang({ ko: "동작 키", en: "Action key" })}>
                <Input value={actionDraft.key} onChange={(event) => onDraftChange({ ...actionDraft, key: event.target.value })} placeholder="cast-magic" />
              </Label>
              <Label label={lang({ ko: "표시 이름", en: "Display name" })}>
                <Input value={actionDraft.labelKo} onChange={(event) => onDraftChange({ ...actionDraft, labelKo: event.target.value })} placeholder={lang({ ko: "마법 사용", en: "Cast magic" })} />
              </Label>
            </div>
            <Label label={lang({ ko: "동작 설명", en: "Motion description" })}>
              <Textarea value={actionDraft.motionAction} onChange={(event) => onDraftChange({ ...actionDraft, motionAction: event.target.value })} rows={3} placeholder="clear magic casting action with hands close to the body" />
            </Label>
            <Label label={lang({ ko: "동작 프레임 순서", en: "Motion sequence" })}>
              <Input value={actionDraft.motionSequence} onChange={(event) => onDraftChange({ ...actionDraft, motionSequence: event.target.value })} placeholder="ready, gather energy, cast, recover" />
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label label="FPS">
                <Input type="number" min={1} max={24} value={actionDraft.fps} onChange={(event) => onDraftChange({ ...actionDraft, fps: Number(event.target.value) })} />
              </Label>
              <Label label={lang({ ko: "프레임 수", en: "Frame count" })}>
                <Select
                  value={String(actionDraft.frameCount)}
                  onValueChange={(value) => onDraftChange({ ...actionDraft, frameCount: Number(value) })}
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4"><Lang text={{ ko: "4프레임 · 기본", en: "4 frames · Default" }} /></SelectItem>
                    <SelectItem value="6"><Lang text={{ ko: "6프레임 · 옵트인", en: "6 frames · Opt-in" }} /></SelectItem>
                    <SelectItem value="8"><Lang text={{ ko: "8프레임 · 옵트인", en: "8 frames · Opt-in" }} /></SelectItem>
                  </SelectContent>
                </Select>
              </Label>
            </div>
            {actionDraft.frameCount > 4 ? (
              <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
                <Lang
                  text={{
                    ko: `${actionDraft.frameCount}프레임 시트는 동작당 최대 ${actionDraft.frameCount * 8}개 셀을 사용합니다. 모바일 텍스처 메모리와 생성 실패 가능성을 확인한 뒤 선택하세요.`,
                    en: `${actionDraft.frameCount}-frame sheets use up to ${actionDraft.frameCount * 8} cells per action. Confirm mobile texture memory and generation reliability before opting in.`,
                  }}
                />
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-h-11 items-center justify-between rounded-lg border border-border px-3">
                <span className="text-sm font-medium"><Lang text={{ ko: "반복 재생", en: "Loop playback" }} /></span>
                <Switch checked={actionDraft.loop} onCheckedChange={(checked) => onDraftChange({ ...actionDraft, loop: checked })} />
              </div>
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
              <div>
                <span className="text-sm font-medium"><Lang text={{ ko: "좌우 미러 허용", en: "Allow horizontal mirroring" }} /></span>
                <p className="text-xs text-muted-foreground">
                  <Lang text={{ ko: "반복 동작이며 글자·로고·비대칭 장비가 없을 때만 켜세요.", en: "Enable only for loops without text, logos, or asymmetric gear." }} />
                </p>
              </div>
              <Switch
                checked={actionDraft.symmetryEligible}
                disabled={!actionDraft.loop}
                onCheckedChange={(checked) => onDraftChange({ ...actionDraft, symmetryEligible: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onDialogOpenChange(false)} disabled={saving}><Lang text={{ ko: "취소", en: "Cancel" }} /></Button>
            <Button onClick={onAdd} loading={saving}><Plus className="size-4" /><Lang text={{ ko: "동작 저장", en: "Save action" }} /></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
