"use client";

import type { ChangeEvent } from "react";
import { Button, Input } from "@amu-labs/ui";
import { FileUpload } from "components/module/upload";
import { Lang } from "components/module/i18n";
import { SpriteSheetPreview } from "components/module/game";
import type { IPersonaSprite, PersonaSpriteBaseDirection } from "types/ai";

interface SpriteSheetEditorProps {
  universeId: string;
  pid?: string;
  value?: IPersonaSprite | null;
  onChange: (next: IPersonaSprite | null) => void;
}

const SPRITE_DIRECTION_GUIDES: Array<{
  direction: PersonaSpriteBaseDirection;
  iso: "SW" | "NE" | "NW" | "SE";
  ko: string;
  en: string;
}> = [
  { direction: "down", iso: "SW", ko: "남서", en: "South-West" },
  { direction: "up", iso: "NE", ko: "북동", en: "North-East" },
  { direction: "left", iso: "NW", ko: "북서", en: "North-West" },
  { direction: "right", iso: "SE", ko: "남동", en: "South-East" },
];

function createDefaultSprite(): IPersonaSprite {
  return {
    url: "",
    frameWidth: 256,
    frameHeight: 256,
    columns: 4,
    rows: 4,
    fps: 8,
    idleFps: 0,
    idleDirection: "down",
    animations: {
      down: { row: 0, frames: [0, 1, 2, 3] },
      up: { row: 1, frames: [0, 1, 2, 3] },
      left: { row: 2, frames: [0, 1, 2, 3] },
      right: { row: 3, frames: [0, 1, 2, 3] },
    },
  };
}

function clampInteger(value: string, fallback: number, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function parseFrameList(value: string, columns: number) {
  const maxColumn = Math.max(0, columns - 1);
  const parsed = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item))
    .map((item) => Math.min(maxColumn, Math.max(0, item)));

  return parsed.length > 0 ? Array.from(new Set(parsed)) : [0];
}

export function SpriteSheetEditor({ universeId, pid, value, onChange }: SpriteSheetEditorProps) {
  const sprite = value || null;

  const patchSprite = (patch: Partial<IPersonaSprite>) => {
    const base = sprite || createDefaultSprite();
    onChange({
      ...base,
      ...patch,
      animations: patch.animations ? patch.animations : base.animations,
    });
  };

  const patchDirection = (
    direction: PersonaSpriteBaseDirection,
    patch: Partial<IPersonaSprite["animations"][PersonaSpriteBaseDirection]>,
  ) => {
    const base = sprite || createDefaultSprite();
    patchSprite({
      animations: {
        ...base.animations,
        [direction]: {
          ...base.animations[direction],
          ...patch,
        },
      },
    });
  };

  const handleNumberChange =
    (key: "frameWidth" | "frameHeight" | "columns" | "rows" | "fps" | "idleFps", min = 0) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const base = sprite || createDefaultSprite();
      patchSprite({ [key]: clampInteger(e.target.value, base[key] || 0, min) } as Partial<IPersonaSprite>);
    };

  if (!sprite) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          <Lang
            text={{
              ko: "스프라이트 시트를 등록하면 4x4 기준으로 아이소메트릭 대각선 4방향 보행 프레임을 한 장의 시트로 관리합니다. 현재 별칭은 down=남서(SW), up=북동(NE), left=북서(NW), right=남동(SE)입니다.",
              en: "Register a sprite sheet to manage the four isometric diagonal walk directions in one 4x4 sheet. Aliases are down=SW, up=NE, left=NW, right=SE.",
            }}
          />
        </p>
        <Button onClick={() => onChange(createDefaultSprite())}>
          <Lang text={{ ko: "스프라이트 시트 설정 시작", en: "Set Up Sprite Sheet" }} />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            <Lang text={{ ko: "스프라이트 시트", en: "Sprite Sheet" }} />
          </div>
          <p className="text-xs text-muted-foreground">
            <Lang
              text={{
                ko: "기본 배치는 1행 down(SW), 2행 up(NE), 3행 left(NW), 4행 right(SE) 순의 4행과 각 방향 4프레임입니다.",
                en: "The default layout uses 4 rows ordered as down(SW), up(NE), left(NW), right(SE), with 4 frames per direction.",
              }}
            />
          </p>
        </div>
        <Button variant="outline" onClick={() => onChange(null)}>
          <Lang text={{ ko: "제거", en: "Remove" }} />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Sheet URL</label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <Input
                value={sprite.url || ""}
                onChange={(e) => patchSprite({ url: e.target.value })}
                placeholder="/uploads/..."
              />
              <FileUpload
                universeId={universeId}
                pid={pid}
                kind="persona-sprite-sheet"
                value={sprite.url ? [sprite.url] : []}
                onChange={(urls) => patchSprite({ url: urls?.[0] || "" })}
                multiple={false}
                ui="button"
                buttonLabel="업로드"
                deleteRemote
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-gray-500">Frame Width</label>
              <Input type="number" min={1} value={sprite.frameWidth} onChange={handleNumberChange("frameWidth", 1)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Frame Height</label>
              <Input type="number" min={1} value={sprite.frameHeight} onChange={handleNumberChange("frameHeight", 1)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Columns</label>
              <Input type="number" min={1} value={sprite.columns} onChange={handleNumberChange("columns", 1)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Rows</label>
              <Input type="number" min={1} value={sprite.rows} onChange={handleNumberChange("rows", 1)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">FPS</label>
              <Input type="number" min={1} value={sprite.fps || 8} onChange={handleNumberChange("fps", 1)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Idle FPS</label>
              <Input type="number" min={0} value={sprite.idleFps || 0} onChange={handleNumberChange("idleFps", 0)} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-black/5 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {SPRITE_DIRECTION_GUIDES.map((guide) => (
              <div key={`preview-${guide.direction}`} className="space-y-1">
                <div className="text-xxs font-medium text-muted-foreground">
                  {guide.direction} · {guide.iso}
                </div>
                <SpriteSheetPreview
                  sprite={sprite}
                  direction={guide.direction}
                  className="aspect-square rounded-lg bg-white border border-border/40"
                  imageClassName="bg-white"
                  alt={`${guide.direction}-${guide.iso}`}
                />
              </div>
            ))}
          </div>
          <p className="text-xxs leading-5 text-muted-foreground">
            <Lang
              text={{
                ko: "참고 규칙: 4열 x 4행, 1행 down(SW), 2행 up(NE), 3행 left(NW), 4행 right(SE). 각 행은 idle → step-1 → step-2 → step-3 순서입니다.",
                en: "Reference: 4 columns x 4 rows. Rows are down(SW), up(NE), left(NW), right(SE). Each row follows idle → step-1 → step-2 → step-3.",
              }}
            />
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {SPRITE_DIRECTION_GUIDES.map((guide) => {
          const animation = sprite.animations[guide.direction];
          return (
            <div key={guide.direction} className="rounded-lg border p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {guide.direction} · {guide.iso} ({guide.ko}/{guide.en})
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-gray-500">{guide.direction}.row</label>
                  <Input
                    type="number"
                    min={0}
                    max={Math.max(0, sprite.rows - 1)}
                    value={animation.row}
                    onChange={(e) =>
                      patchDirection(guide.direction, { row: clampInteger(e.target.value, animation.row, 0) })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{guide.direction}.frames</label>
                  <Input
                    value={animation.frames.join(", ")}
                    onChange={(e) =>
                      patchDirection(guide.direction, { frames: parseFrameList(e.target.value, sprite.columns) })
                    }
                    placeholder="0, 1, 2, 3"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
