"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FlipHorizontal2, RefreshCw } from "lucide-react";
import { Badge, Button, Checkbox } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { getSpriteSheetProfile, SPRITE_SHEET_V2_CONTRACT } from "consts/game/gameAssetTemplates";
import type {
  IGameAssetPipelineDoc,
  SpriteDirectionPricingQuoteType,
  SpriteDirectionType,
} from "types/game";
import { canMirrorSpriteDirection, normalizeSpriteActionVariables } from "utils/game/assetPipeline";
import { cn } from "utils/common";

const STATUS_STYLE: Record<string, string> = {
  passed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-danger/15 text-danger",
  regenerating: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  pending: "bg-muted text-muted-foreground",
};

export function DirectionGrid({
  pipeline,
  quote,
  quoteLoading = false,
  busy,
  onRegenerate,
  onMirror,
}: {
  pipeline: IGameAssetPipelineDoc;
  quote: SpriteDirectionPricingQuoteType | null;
  quoteLoading?: boolean;
  busy: boolean;
  onRegenerate: (directions: SpriteDirectionType[]) => void | Promise<void>;
  onMirror: (direction: SpriteDirectionType) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<SpriteDirectionType[]>([]);
  const actionVariables = normalizeSpriteActionVariables(pipeline.variables);
  const profile = getSpriteSheetProfile(actionVariables.sprite_sheet_profile);
  const frameCount = profile.frameCount;
  const directionGrid = profile.directionGeneration;
  const failedDirections = useMemo(
    () =>
      SPRITE_SHEET_V2_CONTRACT.rowOrder.filter(
        (direction) => pipeline.directions?.[direction]?.status === "failed",
      ) as SpriteDirectionType[],
    [pipeline.directions],
  );
  const actionableSelected = selected.filter((direction) => failedDirections.includes(direction));
  const freeRetryCount = actionableSelected.filter((direction) => {
    const regen = pipeline.directions?.[direction]?.regen;
    return Boolean(regen?.freeRetryEligible && !regen.freeRetryUsed);
  }).length;
  const grossCoins = actionableSelected.length * Number(quote?.perDirectionCoins || 0);
  const expectedCoins = Math.max(0, grossCoins - freeRetryCount * Number(quote?.perDirectionCoins || 0));

  const toggleDirection = (direction: SpriteDirectionType, checked: boolean) => {
    setSelected((current) =>
      checked ? Array.from(new Set([...current, direction])) : current.filter((item) => item !== direction),
    );
  };

  return (
    <section aria-labelledby={`direction-grid-${pipeline.pipelineId}`} className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id={`direction-grid-${pipeline.pipelineId}`} className="font-semibold">
            <Lang text={{ ko: "8방향 품질 상태", en: "Eight-direction quality status" }} />
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            <Lang
              text={{
                ko: `통과한 방향은 그대로 보존하고 실패한 방향만 ${directionGrid.columns}×${directionGrid.rows} ${frameCount}프레임 그리드로 다시 생성합니다.`,
                en: `Passed directions are preserved; only failed directions are regenerated as ${directionGrid.columns}×${directionGrid.rows} ${frameCount}-frame grids.`,
              }}
            />
          </p>
        </div>
        {failedDirections.length ? (
          <Button
            variant="outline"
            className="min-h-11 shrink-0"
            disabled={busy || actionableSelected.length === 0 || !quote}
            onClick={() => void onRegenerate(actionableSelected)}
          >
            <RefreshCw className="mr-2 size-4" aria-hidden />
            <Lang
              text={{
                ko: `선택 ${actionableSelected.length}방향 재생성`,
                en: `Regenerate ${actionableSelected.length} selected`,
              }}
            />
          </Button>
        ) : null}
      </div>

      {failedDirections.length ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
          {quote ? (
            <p>
              <Lang
                text={{
                  ko: `서버 견적: ${actionableSelected.length} × ${quote.perDirectionCoins.toLocaleString()}코인 = ${grossCoins.toLocaleString()}코인 · 검증 유래 무료 재시도 ${freeRetryCount}건 반영 시 예상 차감 ${expectedCoins.toLocaleString()}코인`,
                  en: `Server quote: ${actionableSelected.length} × ${quote.perDirectionCoins.toLocaleString()} coins = ${grossCoins.toLocaleString()} · estimated charge ${expectedCoins.toLocaleString()} after ${freeRetryCount} verification retry credit(s)`,
                }}
              />
            </p>
          ) : quoteLoading ? (
            <p role="status" className="text-muted-foreground">
              <Lang text={{ ko: "서버 가격 견적을 계산하는 중입니다.", en: "Calculating the server pricing quote." }} />
            </p>
          ) : (
            <p role="alert" className="flex items-center gap-2 text-danger">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <Lang
                text={{
                  ko: "서버 가격 견적을 확인할 수 없어 재생성을 잠갔습니다. 잠시 후 다시 시도하세요.",
                  en: "Regeneration is locked because the server pricing quote is unavailable. Try again shortly.",
                }}
              />
            </p>
          )}
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {SPRITE_SHEET_V2_CONTRACT.rowOrder.map((rawDirection) => {
          const direction = rawDirection as SpriteDirectionType;
          const state = pipeline.directions?.[direction] || { status: "pending" as const };
          const verify = state.verify;
          const failed = state.status === "failed";
          const checked = actionableSelected.includes(direction);
          const canMirror = failed && canMirrorSpriteDirection({ pipeline, targetDirection: direction });
          const previewUrl = /^https?:\/\//.test(String(state.stripAssetRef || ""))
            ? String(state.stripAssetRef)
            : "";

          return (
            <li key={direction} className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
              {previewUrl ? (
                <span
                  role="img"
                  aria-label={lang({ ko: `${direction} 방향 첫 프레임`, en: `${direction} first frame` })}
                  className="block aspect-square w-full bg-muted bg-no-repeat"
                  style={{
                    backgroundImage: `url("${previewUrl.replace(/"/g, "%22")}")`,
                    backgroundPosition: "0 50%",
                    backgroundSize: `${frameCount * 100}% 100%`,
                  }}
                />
              ) : (
                <span className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                  <Lang text={{ ko: "미리보기 대기", en: "Preview pending" }} />
                </span>
              )}
              <div className="space-y-2 p-3">
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs font-semibold">{direction}</span>
                  <Badge className={cn("text-[10px]", STATUS_STYLE[state.status] || STATUS_STYLE.pending)}>
                    {state.derivedFrom ? "mirrored" : state.status}
                  </Badge>
                </div>
                {verify ? (
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    <Lang
                      text={{
                        ko: `빈 ${verify.emptyCells ?? 0} · 잘림 ${verify.croppedCells ?? 0} · 편차 ${verify.heightVariancePx ?? 0}px`,
                        en: `empty ${verify.emptyCells ?? 0} · crop ${verify.croppedCells ?? 0} · var ${verify.heightVariancePx ?? 0}px`,
                      }}
                    />
                  </p>
                ) : (
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    <Lang text={{ ko: "검증 지표 없음", en: "No verification metrics" }} />
                  </p>
                )}
                {failed ? (
                  <div className="space-y-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-2 text-xs">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleDirection(direction, value === true)}
                        aria-label={lang({ ko: `${direction} 재생성 선택`, en: `Select ${direction} for regeneration` })}
                      />
                      <Lang text={{ ko: "재생성 선택", en: "Select" }} />
                    </label>
                    {canMirror ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 w-full"
                        disabled={busy}
                        onClick={() => void onMirror(direction)}
                      >
                        <FlipHorizontal2 className="mr-1 size-4" aria-hidden />
                        <Lang text={{ ko: "미러로 채우기", en: "Fill by mirror" }} />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
