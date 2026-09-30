import { Maximize, Scissors, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { Point } from "../CanvasDrawingTypes";
import { normalizeCaptureRect } from "../utils";

const CAPTURE_RESIZE_HANDLE_POSITIONS = [
  { key: "nw", style: { left: 0, top: 0 } },
  { key: "ne", style: { left: "100%", top: 0 } },
  { key: "sw", style: { left: 0, top: "100%" } },
  { key: "se", style: { left: "100%", top: "100%" } },
] as const;

export function CaptureRegionOverlay({ start, now, handleSize, borderWidth }: { start: Point | null; now: Point | null; handleSize: number; borderWidth: number }) {
  if (!start || !now) return null;
  const rect = normalizeCaptureRect(start, now);
  return (
    <div data-export-ignore="true" className="pointer-events-none absolute inset-0 z-50">
      <div className="absolute border-2 border-primary/80 bg-primary/10" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
        {rect.width >= 2 && rect.height >= 2 ? CAPTURE_RESIZE_HANDLE_POSITIONS.map(({ key, style }) => <span key={key} className="absolute box-border border-primary bg-white" style={{ ...style, width: handleSize, height: handleSize, borderWidth, borderStyle: "solid", transform: "translate(-50%, -50%)" }} />) : null}
      </div>
    </div>
  );
}

export function CaptureActionBar({ captureMode, canCrop, externalControls, hideSave, cropLabel, onCrop, onSave, onClear }: { captureMode: "selecting" | "ready"; canCrop: boolean; externalControls: boolean; hideSave: boolean; cropLabel?: { ko: string; en: string }; onCrop: () => void; onSave: () => void; onClear: () => void }) {
  return (
    <div className="absolute bottom-3 left-3 rounded-xl border bg-background/90 px-3 py-2 text-xs shadow-sm">
      <p className="font-medium"><Lang text={{ ko: captureMode === "selecting" ? "영역을 선택하세요." : canCrop ? "이 영역으로 자를까요?" : "이 영역을 저장할까요?", en: captureMode === "selecting" ? "Drag to select region." : canCrop ? "Crop to this region?" : "Save this region?" }} /></p>
      {!externalControls ? (
        <div className="mt-1 flex gap-2">
          {canCrop ? <Button variant="ghost" size="sm" disabled={captureMode !== "ready"} onClick={onCrop}><Scissors className="icon-xs" aria-hidden /><Lang text={cropLabel || { ko: "자르기", en: "Crop" }} /></Button> : null}
          {!hideSave ? <Button variant="ghost" size="sm" disabled={captureMode !== "ready"} onClick={onSave}><Lang text={{ ko: "저장", en: "Save" }} /></Button> : null}
          <Button variant="ghost" size="icon-sm" aria-label={lang({ ko: "영역 선택 취소", en: "Cancel region selection" })} onClick={onClear}><X className="icon-xs" aria-hidden /></Button>
        </div>
      ) : null}
    </div>
  );
}

export function CanvasZoomControls({ zoom, canZoomOut, canZoomIn, onZoomOut, onReset, onZoomIn }: { zoom: number; canZoomOut: boolean; canZoomIn: boolean; onZoomOut: () => void; onReset: () => void; onZoomIn: () => void }) {
  return (
    <div data-export-ignore="true" className="absolute bottom-3 right-3 z-[55] flex items-center gap-1 rounded-full border bg-background/90 p-1 shadow-md backdrop-blur">
      <Button variant="ghost" size="icon-md" rounded="full" disabled={!canZoomOut} aria-label={lang({ ko: "이미지 축소", en: "Zoom out image" })} onClick={onZoomOut}><ZoomOut className="size-4" aria-hidden /></Button>
      <Button variant="ghost" size="sm" rounded="full" className="min-w-16 gap-1 px-2 text-xs tabular-nums" aria-label={lang({ ko: "화면에 맞춤", en: "Fit to viewport" })} onClick={onReset}><Maximize className="size-3.5" aria-hidden />{Math.round(zoom * 100)}%</Button>
      <Button variant="ghost" size="icon-md" rounded="full" disabled={!canZoomIn} aria-label={lang({ ko: "이미지 확대", en: "Zoom in image" })} onClick={onZoomIn}><ZoomIn className="size-4" aria-hidden /></Button>
    </div>
  );
}
