/**
 * ChromaKey v2 — Preview Panel (CK-401)
 *
 * 크로마키 프리셋·파라미터 조절·실시간 preview UI.
 * CK-400의 ChromaKeyBrowserSession으로 Worker 기반 preview를 제공한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope browser
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, Eye, Grid3x3, Moon, Pipette, Sun } from "lucide-react";
import { Lang } from "components/module/i18n";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider } from "@amu-labs/ui";
import { CHROMA_KEY_COVERAGE_MODES } from "types/game/chroma-key";
import type {
  ChromaKeyModeType,
  ChromaKeyOptionsType,
} from "types/game/chroma-key";
import type { ChromaKeyPreviewResult } from "utils/game/chromaKeyBrowserAdapter";
import {
  createChromaKeyBrowserSession,
  checkChromaKeyWorkerStatus,
} from "utils/game/chromaKeyBrowserAdapter";
import type { ChromaKeyBrowserSession } from "utils/game/chromaKeyBrowserAdapter";
import { runAfterCurrentRender } from "utils/common";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type BackgroundPreviewMode = "checker" | "light" | "dark" | "alpha-mask";

export type ChromaKeyPanelOptions = ChromaKeyOptionsType;

export type ChromaKeyPreviewPanelProps = {
  imageSrc: string;
  initialOptions: ChromaKeyOptionsType;
  onOptionsChange: (options: ChromaKeyOptionsType) => void;
  onPreviewResult?: (result: ChromaKeyPreviewResult | null) => void;
  disabled?: boolean;
};

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const BG_MODES: { value: BackgroundPreviewMode; icon: typeof Grid3x3; ko: string; en: string }[] = [
  { value: "checker", icon: Grid3x3, ko: "체커 배경", en: "Checker" },
  { value: "light", icon: Sun, ko: "밝은 배경", en: "Light" },
  { value: "dark", icon: Moon, ko: "어두운 배경", en: "Dark" },
  { value: "alpha-mask", icon: Eye, ko: "알파 마스크", en: "Alpha" },
];

const KEY_MODES: { value: ChromaKeyModeType; ko: string; en: string }[] = [
  { value: "auto", ko: "자동", en: "Auto" },
  { value: "green", ko: "그린", en: "Green" },
  { value: "blue", ko: "블루", en: "Blue" },
  { value: "magenta", ko: "마젠타", en: "Magenta" },
  { value: "custom", ko: "사용자", en: "Custom" },
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// ChromaKeyPreviewPanel
// ---------------------------------------------------------------------------

export function ChromaKeyPreviewPanel({
  imageSrc,
  initialOptions,
  onOptionsChange,
  onPreviewResult,
  disabled,
}: ChromaKeyPreviewPanelProps) {
  const sessionRef = useRef<ChromaKeyBrowserSession | null>(null);
  const workerStatus = useMemo(() => checkChromaKeyWorkerStatus(), []);

  const [options, setOptions] = useState<ChromaKeyOptionsType>(initialOptions);
  const [previewResult, setPreviewResult] = useState<ChromaKeyPreviewResult | null>(null);
  const [bgMode, setBgMode] = useState<BackgroundPreviewMode>("checker");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState("#ff00ff");
  const busy = disabled || processing;

  useEffect(() => {
    return () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, []);

  const requestPreview = useCallback(
    async (nextOptions: ChromaKeyOptionsType) => {
      if (!workerStatus.available) return;
      setProcessing(true);
      setError(null);
      try {
        if (!sessionRef.current) {
          sessionRef.current = createChromaKeyBrowserSession();
        }
        const result = await sessionRef.current.processPreview(imageSrc, nextOptions);
        setPreviewResult(result);
        onPreviewResult?.(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        onPreviewResult?.(null);
      } finally {
        setProcessing(false);
      }
    },
    [imageSrc, workerStatus.available, onPreviewResult],
  );

  useEffect(() => {
    if (workerStatus.available && imageSrc) {
      runAfterCurrentRender(() => void requestPreview(initialOptions));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateOption = useCallback(
    <K extends keyof ChromaKeyOptionsType>(key: K, value: ChromaKeyOptionsType[K]) => {
      setOptions((prev) => {
        const next = { ...prev, [key]: value };
        onOptionsChange(next);
        void requestPreview(next);
        return next;
      });
    },
    [onOptionsChange, requestPreview],
  );

  const resolvedColor = previewResult?.detection as Record<string, unknown> | undefined;
  const keyR = (resolvedColor?.resolvedColor as { r?: number })?.r ?? 255;
  const keyG = (resolvedColor?.resolvedColor as { g?: number })?.g ?? 0;
  const keyB = (resolvedColor?.resolvedColor as { b?: number })?.b ?? 255;

  return (
    <section className="flex flex-col gap-4 text-sm" aria-label="Chroma Key Controls">
      {!workerStatus.available ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          <Lang text={{ ko: "Web Worker를 지원하지 않는 브라우저입니다.", en: "Your browser does not support Web Workers." }} />
        </p>
      ) : null}

      <fieldset disabled={busy}>
        <legend className="mb-1.5 text-xs font-medium text-secondary-text">
          <Lang text={{ ko: "키 색상", en: "Key Color" }} />
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {KEY_MODES.map((mode) => (
            <Button
              key={mode.value}
              variant={options.keyMode === mode.value ? "primary" : "outline"}
              size="sm"
              className="min-h-11 text-xs"
              onClick={() => updateOption("keyMode", mode.value)}
            >
              <Lang text={mode} />
            </Button>
          ))}
        </div>
      </fieldset>

      {options.keyMode === "custom" ? (
        <fieldset disabled={busy}>
          <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-secondary-text">
            <Pipette className="size-3.5" aria-hidden />
            <Lang text={{ ko: "사용자 키 색상", en: "Custom Key Color" }} />
          </legend>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={customHex}
              onChange={(e) => {
                setCustomHex(e.target.value);
                const hex = e.target.value.replace("#", "");
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                  updateOption("keyColor", { r, g, b });
                }
              }}
              className="h-11 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
              aria-label="Custom key color picker"
            />
            <span className="text-xs text-secondary-text">{customHex}</span>
            {previewResult && (
              <span className="flex items-center gap-1 text-xs text-secondary-text">
                <span
                  className="inline-block size-3.5 rounded-full border border-border"
                  style={{ backgroundColor: rgbToHex(keyR, keyG, keyB) }}
                  aria-hidden
                />
                <Lang text={{ ko: "감지됨", en: "Detected" }} />
              </span>
            )}
          </div>
        </fieldset>
      ) : null}

      <fieldset disabled={busy} className="flex flex-col gap-3">
        <legend className="sr-only"><Lang text={{ ko: "기본 조절", en: "Basic adjustments" }} /></legend>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "유사도", en: "Similarity" }} /></label>
            <output className="text-xs tabular-nums text-secondary-text" htmlFor="ck-similarity">{Math.round(options.similarity)}</output>
          </div>
          <Slider id="ck-similarity" min={0} max={100} step={1} value={[options.similarity]} onValueChange={([v]) => updateOption("similarity", v ?? 0)} aria-label="Similarity" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "부드러움", en: "Softness" }} /></label>
            <output className="text-xs tabular-nums text-secondary-text" htmlFor="ck-softness">{Math.round(options.softness)}</output>
          </div>
          <Slider id="ck-softness" min={0} max={100} step={1} value={[options.softness]} onValueChange={([v]) => updateOption("softness", v ?? 0)} aria-label="Softness" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "스필 제거", en: "Despill" }} /></label>
            <output className="text-xs tabular-nums text-secondary-text" htmlFor="ck-despill">{Math.round(options.despill * 100)}%</output>
          </div>
          <Slider id="ck-despill" min={0} max={100} step={1} value={[Math.round(options.despill * 100)]} onValueChange={([v]) => updateOption("despill", clamp((v ?? 0) / 100, 0, 1))} aria-label="Despill" />
        </div>
      </fieldset>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="flex w-full items-center justify-between text-xs min-h-11">
            <Lang text={{ ko: "고급 설정", en: "Advanced" }} />
            <ChevronDown className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} aria-hidden />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 flex flex-col gap-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "가장자리 feather", en: "Feather" }} /></label>
              <output className="text-xs tabular-nums text-secondary-text" htmlFor="ck-feather">{options.feather.toFixed(1)}px</output>
            </div>
            <Slider id="ck-feather" min={0} max={10} step={0.1} value={[options.feather]} onValueChange={([v]) => updateOption("feather", v ?? 0)} aria-label="Feather" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "마스크 확장", en: "Choke" }} /></label>
              <output className="text-xs tabular-nums text-secondary-text" htmlFor="ck-choke">{options.choke > 0 ? "+" : ""}{options.choke.toFixed(1)}px</output>
            </div>
            <Slider id="ck-choke" min={-10} max={10} step={0.5} value={[options.choke]} onValueChange={([v]) => updateOption("choke", v ?? 0)} aria-label="Choke" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary-text"><Lang text={{ ko: "적용 범위", en: "Coverage" }} /></label>
            <Select value={options.coverageMode} onValueChange={(v) => updateOption("coverageMode", v as typeof options.coverageMode)}>
              <SelectTrigger className="h-11 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHROMA_KEY_COVERAGE_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode} className="text-xs">
                    <Lang text={{ ko: mode === "global" ? "전체" : "경계 연결", en: mode === "global" ? "Global" : "Border-connected" }} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <fieldset disabled={busy}>
        <legend className="mb-1.5 text-xs font-medium text-secondary-text"><Lang text={{ ko: "배경 보기", en: "Background" }} /></legend>
        <div className="flex gap-1">
          {BG_MODES.map((bg) => (
            <Button key={bg.value} variant={bgMode === bg.value ? "primary" : "outline"} size="sm" className="min-h-11 flex-1 justify-center text-xs" onClick={() => setBgMode(bg.value)} aria-pressed={bgMode === bg.value}>
              <bg.icon className="size-3.5" aria-hidden />
              <span className="ml-1 hidden sm:inline"><Lang text={bg} /></span>
            </Button>
          ))}
        </div>
      </fieldset>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert" aria-live="assertive">{error}</div>
      ) : null}

      {previewResult?.evaluation?.verdict && !error ? (
        <div className={`rounded-lg border px-3 py-2 text-xs ${
          previewResult.evaluation.verdict === "pass" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
          previewResult.evaluation.verdict === "warn" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" :
          "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
        }`} role="status" aria-live="polite">
          <span className="font-semibold">
            <Lang text={{
              ko: previewResult.evaluation.verdict === "pass" ? "✓ 통과" : previewResult.evaluation.verdict === "warn" ? "⚠ 경고" : "✗ 실패",
              en: previewResult.evaluation.verdict === "pass" ? "✓ Pass" : previewResult.evaluation.verdict === "warn" ? "⚠ Warn" : "✗ Fail",
            }} />
          </span>
          {previewResult.evaluation.reason ? <span className="ml-1 text-secondary-text">— {previewResult.evaluation.reason}</span> : null}
          {previewResult.downscaled ? (
            <span className="ml-1 block text-secondary-text">
              <Lang text={{ ko: `미리보기: ${previewResult.width}×${previewResult.height} (원본 ${previewResult.originalWidth}×${previewResult.originalHeight})`, en: `Preview: ${previewResult.width}×${previewResult.height} (original ${previewResult.originalWidth}×${previewResult.originalHeight})` }} />
            </span>
          ) : null}
        </div>
      ) : null}

      {processing ? (
        <div className="flex items-center gap-2 text-xs text-secondary-text" aria-live="polite">
          <span className="inline-block size-3 motion-safe:animate-pulse rounded-full bg-primary/50" aria-hidden />
          <Lang text={{ ko: "처리 중...", en: "Processing..." }} />
        </div>
      ) : null}
    </section>
  );
}
