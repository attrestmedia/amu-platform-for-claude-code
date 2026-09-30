"use client";

import { useState } from "react";
import {
  ChevronDown,
  Download,
  Eye,
  Images,
  RotateCcw,
  Search,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Lang, lang } from "components/module/i18n";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import type { NormalizedFrameGuide } from "../../CanvasDrawingTypes";
import { FrameNormalizeAction } from "./FrameNormalizeAction";
import { SpritePlaybackPreview } from "./SpritePlaybackPreview";
import type { SpritePostProductionConfig } from "./SpritePostProductionTypes";
import type { SpritePostProductionController } from "./useSpritePostProduction";

function safeFileBaseName(value: string) {
  return String(value || "sprite-atlas").trim().replace(/[^a-z0-9_-]+/gi, "-") || "sprite-atlas";
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function downloadAtlas(imageSrc: string, baseName: string) {
  const response = await fetch(imageSrc);
  if (!response.ok) throw new Error("sprite_atlas_download_failed");
  const blob = await response.blob();
  const extension = blob.type === "image/webp" ? "webp" : "png";
  triggerBlobDownload(blob, `${safeFileBaseName(baseName)}.${extension}`);
}

function downloadManifest(manifest: Record<string, unknown>, baseName: string) {
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json;charset=utf-8" });
  triggerBlobDownload(blob, `${safeFileBaseName(baseName)}.manifest.json`);
}

function getProcessingErrorText(error: string) {
  if (error === "sprite_image_too_large") {
    return { ko: "4096×4096을 넘는 시트는 브라우저 후보정에서 처리할 수 없습니다.", en: "Sheets larger than 4096×4096 cannot be processed in the browser editor." };
  }
  if (error === "sprite_image_load_failed") {
    return { ko: "시트 이미지를 불러오지 못했습니다. R2 접근 권한을 확인하세요.", en: "Could not load the sheet. Check R2 access permissions." };
  }
  return { ko: "스프라이트 분석에 실패했습니다. 배경 제거 후 다시 시도하세요.", en: "Sprite analysis failed. Remove the background and try again." };
}

export function SpritePostProductionPanel({
  imageSrc,
  guide,
  config,
  controller,
  disabled,
}: {
  imageSrc: string;
  guide: NormalizedFrameGuide;
  config: SpritePostProductionConfig;
  controller: SpritePostProductionController;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const direction = config.directionRows[controller.activeRow] || config.directionRows[0];
  const bibleAvailable = Boolean(
    config.bibleSourceUrl && direction && (config.bibleDirections || []).includes(direction),
  );
  const sprite = { ...config.sprite, url: imageSrc };
  const busy = disabled || Boolean(controller.processing);
  const manifest = {
    ...config.manifest,
    image: `${safeFileBaseName(config.exportBaseName)}.${imageSrc.startsWith("data:image/png") ? "png" : "webp"}`,
    ...(controller.lastNormalization ? { postProduction: controller.lastNormalization } : {}),
  };
  const currentAnalysis = controller.analysis;
  const fullCellFrameCount =
    currentAnalysis?.frames.filter((frame) => {
      return Boolean(
        frame.bounds &&
          frame.bounds.width >= currentAnalysis.cellWidth * 0.98 &&
          frame.bounds.height >= currentAnalysis.cellHeight * 0.98,
      );
    }).length || 0;

  const handleAtlasDownload = async () => {
    try {
      await downloadAtlas(imageSrc, config.exportBaseName);
    } catch {
      toast.error(lang({ ko: "atlas 다운로드에 실패했습니다.", en: "Failed to download the atlas." }));
    }
  };

  return (
    <section className="rounded-xl border border-border/60 bg-surface/60" aria-labelledby="sprite-post-production-title">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left focus-visible-ring"
        aria-expanded={expanded}
        aria-controls="sprite-post-production-controls"
        onClick={() => setExpanded((current) => !current)}
      >
        <span>
          <span id="sprite-post-production-title" className="block text-sm font-semibold">
            <Lang text={{ ko: "스프라이트 정렬 도구", en: "Sprite alignment tools" }} />
          </span>
          <span className="block text-xs leading-5 text-muted-foreground">
            <Lang text={{ ko: "오버레이는 최종 이미지에 포함되지 않습니다.", en: "Overlays are excluded from the final image." }} />
          </span>
        </span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {expanded ? (
        <div id="sprite-post-production-controls" className="space-y-3 border-t border-border/60 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              <span><Lang text={{ ko: "방향 행", en: "Direction row" }} /></span>
              <Select
                value={String(controller.activeRow)}
                onValueChange={(value) => controller.setActiveRow(Number(value))}
              >
                <SelectTrigger className="min-h-11" aria-label={lang({ ko: "방향 행 선택", en: "Select direction row" })}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: Math.max(1, Number(guide.rows) || 1) }, (_, row) => (
                    <SelectItem key={row} value={String(row)}>
                      {config.directionRows[row] || `row-${row + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span><Lang text={{ ko: "작업 프레임", en: "Active frame" }} /></span>
              <Select
                value={String(controller.activeFrame)}
                onValueChange={(value) => controller.setActiveFrame(Number(value))}
              >
                <SelectTrigger className="min-h-11" aria-label={lang({ ko: "작업 프레임 선택", en: "Select active frame" })}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: Math.max(1, Number(guide.columns) || 1) }, (_, frame) => (
                    <SelectItem key={frame} value={String(frame)}>
                      F{frame + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={controller.onionVisible ? "secondary" : "outline"}
              size="sm"
              className="min-h-11"
              aria-pressed={controller.onionVisible}
              disabled={busy || Number(guide.columns) < 2}
              onClick={() => controller.setOnionVisible((current) => !current)}
            >
              <Images className="size-4" aria-hidden />
              <Lang text={{ ko: "오니언 스킨", en: "Onion skin" }} />
            </Button>
            <Button
              variant={controller.bibleVisible ? "secondary" : "outline"}
              size="sm"
              className="min-h-11"
              aria-pressed={controller.bibleVisible}
              disabled={busy || !bibleAvailable}
              onClick={() => controller.setBibleVisible((current) => !current)}
            >
              <Eye className="size-4" aria-hidden />
              <Lang text={{ ko: "바이블 오버레이", en: "Bible overlay" }} />
            </Button>
            <Button
              variant={controller.alignmentVisible ? "secondary" : "outline"}
              size="sm"
              className="min-h-11"
              disabled={busy}
              loading={controller.processing === "analyze"}
              loadingText={<Lang text={{ ko: "분석 중...", en: "Analyzing..." }} />}
              onClick={() => {
                if (controller.analysis) {
                  controller.setAlignmentVisible((current) => !current);
                  return;
                }
                void controller.runAnalysis();
              }}
            >
              <Search className="size-4" aria-hidden />
              <Lang text={{ ko: "anchor drift 분석", en: "Analyze anchor drift" }} />
            </Button>
          </div>

          {!bibleAvailable ? (
            <p className="text-xs leading-5 text-muted-foreground">
              <Lang
                text={{
                  ko: config.bibleSourceUrl
                    ? "선택한 방향은 5방향 바이블에 없어 오버레이를 사용할 수 없습니다."
                    : "연결된 5방향 캐릭터 바이블이 없어 바이블 오버레이가 비활성화되었습니다.",
                  en: config.bibleSourceUrl
                    ? "The selected direction is not available in the five-direction Bible."
                    : "Bible overlay is unavailable because this asset has no linked five-direction Bible.",
                }}
              />
            </p>
          ) : null}

          {controller.analysis ? (
            <div className="space-y-2 rounded-lg border border-border bg-background p-3">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <span><Lang text={{ ko: "평균 drift", en: "Mean drift" }} /><strong className="ml-1 tabular-nums">{controller.analysis.meanDriftPx.toFixed(1)}px</strong></span>
                <span><Lang text={{ ko: "최대 drift", en: "Max drift" }} /><strong className="ml-1 tabular-nums">{controller.analysis.maxDriftPx.toFixed(1)}px</strong></span>
                <span><Lang text={{ ko: "빈 프레임", en: "Empty frames" }} /><strong className="ml-1 tabular-nums">{controller.analysis.emptyFrames}</strong></span>
                <span><Lang text={{ ko: "선택 프레임", en: "Selected frame" }} /><strong className="ml-1 tabular-nums">{controller.selectedMetric?.driftPx.toFixed(1) || "-"}px</strong></span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                <Lang text={{ ko: "점은 알파 bbox 하단 중앙 pivot, 원은 정렬 목표입니다. 선과 bbox가 함께 표시되어 색상만으로 상태를 구분하지 않습니다.", en: "The dot is the alpha-bounds bottom-center pivot and the ring is the target. Lines and bounds supplement color-coded status." }} />
              </p>
              {fullCellFrameCount > 0 ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs leading-5" role="status">
                  <Lang
                    text={{
                      ko: `${fullCellFrameCount}개 프레임의 알파 영역이 셀 전체를 채웁니다. 정확한 pivot 계산을 위해 먼저 배경 제거를 실행하세요.`,
                      en: `${fullCellFrameCount} frames fill their entire cells with alpha. Remove the background before relying on pivot analysis.`,
                    }}
                  />
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  disabled={busy || !controller.selectedMetric || controller.selectedMetric.empty}
                  onClick={controller.selectReferenceFrame}
                >
                  <Target className="size-4" aria-hidden />
                  <Lang text={{ ko: "선택 프레임을 pivot 기준으로", en: "Use selected frame as pivot" }} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  disabled={busy || controller.referenceFrameIndex === null}
                  onClick={controller.resetReferenceFrame}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  <Lang text={{ ko: "기본 anchor 복원", en: "Reset default anchor" }} />
                </Button>
                <FrameNormalizeAction
                  disabled={busy || controller.analysis.nonEmptyFrames === 0}
                  loading={controller.processing === "normalize"}
                  onNormalize={() => void controller.normalizeFrames()}
                />
              </div>
              {controller.referenceFrameIndex !== null ? (
                <p className="text-xs text-muted-foreground">
                  <Lang text={{ ko: `F${controller.referenceFrameIndex + 1}의 pivot을 정렬 기준으로 사용합니다.`, en: `Frame ${controller.referenceFrameIndex + 1} pivot is the alignment target.` }} />
                </p>
              ) : null}
            </div>
          ) : null}

          {controller.lastNormalization ? (
            <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs leading-5" role="status">
              <Lang
                text={{
                  ko: `${controller.lastNormalization.normalizedFrames}개 프레임을 한 번의 실행 취소 단위로 정규화했습니다. 최대 drift ${controller.lastNormalization.beforeMaxDriftPx.toFixed(1)}px → ${controller.lastNormalization.afterMaxDriftPx.toFixed(1)}px`,
                  en: `Normalized ${controller.lastNormalization.normalizedFrames} frames as one undo step. Max drift ${controller.lastNormalization.beforeMaxDriftPx.toFixed(1)}px → ${controller.lastNormalization.afterMaxDriftPx.toFixed(1)}px`,
                }}
              />
            </p>
          ) : null}

          {controller.error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive" role="alert">
              <Lang text={getProcessingErrorText(controller.error)} />
            </p>
          ) : null}

          {direction ? <SpritePlaybackPreview key={direction} sprite={sprite} direction={direction} /> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={() => void handleAtlasDownload()}>
              <Download className="size-4" aria-hidden />
              <Lang text={{ ko: "atlas 내보내기", en: "Export atlas" }} />
            </Button>
            <Button variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={() => downloadManifest(manifest, config.exportBaseName)}>
              <Download className="size-4" aria-hidden />
              <Lang text={{ ko: "manifest 내보내기", en: "Export manifest" }} />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
