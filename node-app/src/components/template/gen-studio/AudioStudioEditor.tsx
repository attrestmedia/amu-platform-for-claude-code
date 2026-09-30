"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { Volume2 } from "lucide-react";
import {
  deleteStudioAudioAsset,
  estimateStudioAudio,
  fetchStudioAudioCatalog,
  type StudioAudioCatalog,
  type StudioAudioEstimateResult,
  type StudioAudioFormatType,
} from "libs/api/lab";
import { useAudioStudioGeneration } from "./hooks/useAudioStudioGeneration";
import { AudioVoicePicker } from "./modules/audio-studio/AudioVoicePicker";
import { AudioStudioResultPanel } from "./modules/audio-studio/AudioStudioResultPanel";
import { StudioDetailPresentation } from "./modules/StudioDetailPresentation";
import { StudioCreationWorkspace } from "./modules/StudioCreationWorkspace";
import { toErrorLike } from "utils/common";

type AudioStudioEditorProps = {
  routeTemplateKey?: string;
  routeDetailMode?: "custom";
};

const DEFAULT_TEMPLATE_KEY = "narration-basic";

// 기존 Gen Studio 정본과 동일한 visible focus 패턴 (modules/PresetCard.tsx). 새 토큰·유틸리티를 만들지 않는다.
const FOCUS_RING_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `audio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

function localeForVoice(locales: readonly string[] | undefined) {
  const list = locales || [];
  return list.includes("ko") ? "ko" : list[0] || "en";
}

type EstimateKey = { clientRequestId: string; sourceRevision: string; signature: string };

export function AudioStudioEditor({ routeTemplateKey, routeDetailMode }: AudioStudioEditorProps) {
  const [catalog, setCatalog] = useState<StudioAudioCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [modelName, setModelName] = useState("");
  const [format, setFormat] = useState<StudioAudioFormatType>("mp3");
  const [speed, setSpeed] = useState(1);
  const [silenceMs, setSilenceMs] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [estimate, setEstimate] = useState<StudioAudioEstimateResult | null>(null);
  const [estimateSignature, setEstimateSignature] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const estimateRef = useRef<EstimateKey | null>(null);

  const generation = useAudioStudioGeneration({
    onError: () => setResultOpen(true),
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await fetchStudioAudioCatalog();
        if (!active || !loaded) return;
        setCatalog(loaded);
        setVoiceId((current) => current || loaded.voices[0]?.voiceId || "");
        setModelName((current) => current || loaded.models.find((item) => item.preset === "fast")?.modelName || loaded.defaultModelName);
        setSpeed(loaded.speed.defaultValue);
      } catch {
        if (active) setCatalogError(lang({ ko: "음성 카탈로그를 불러오지 못했습니다.", en: "Failed to load the audio catalog." }));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const templateKey = useMemo(() => {
    const requested = String(routeTemplateKey || "").trim();
    const approved = catalog?.templates || [DEFAULT_TEMPLATE_KEY];
    return approved.includes(requested) ? requested : DEFAULT_TEMPLATE_KEY;
  }, [catalog?.templates, routeTemplateKey]);

  const selectedVoice = useMemo(
    () => catalog?.voices.find((voice) => voice.voiceId === voiceId) || null,
    [catalog?.voices, voiceId],
  );
  const locale = localeForVoice(selectedVoice?.locales);

  const signature = useMemo(
    () => JSON.stringify({ text, voiceId, modelName, format, speed, silenceMs, templateKey }),
    [text, voiceId, modelName, format, speed, silenceMs, templateKey],
  );
  const estimateStale = Boolean(estimate) && estimateSignature !== signature;
  const sourceRevision = useMemo(() => `studio-audio:${hashText(`${templateKey}:${text}`)}`, [templateKey, text]);

  const characterLimit = estimate?.maxTextLength || catalog?.maxTextLength || 4096;
  const characterCount = Array.from(text).length;
  const overLimit = characterCount > characterLimit;

  const buildPayload = useCallback(
    (clientRequestId: string) => ({
      provider: "elevenlabs" as const,
      modelName,
      voiceId,
      locale,
      format,
      speed,
      text,
      sourceRevision,
      templateKey,
      clientRequestId,
      scope: "user" as const,
      ...(silenceMs ? { silenceMs } : {}),
    }),
    [format, locale, modelName, silenceMs, sourceRevision, speed, templateKey, text, voiceId],
  );

  const requestEstimate = useCallback(async () => {
    if (estimating || generation.loading) return;
    if (!text.trim() || !voiceId || !modelName) {
      setEstimateError(lang({ ko: "텍스트와 목소리를 먼저 선택하세요.", en: "Enter text and choose a voice first." }));
      return;
    }
    if (overLimit) {
      setEstimateError(lang({ ko: `텍스트가 최대 ${characterLimit}자를 넘었습니다.`, en: `Text exceeds the ${characterLimit} character limit.` }));
      return;
    }
    setEstimating(true);
    setEstimateError("");
    const clientRequestId = newRequestId();
    try {
      const result = await estimateStudioAudio(buildPayload(clientRequestId));
      estimateRef.current = { clientRequestId, sourceRevision, signature };
      setEstimate(result);
      setEstimateSignature(signature);
    } catch (error: unknown) {
      estimateRef.current = null;
      setEstimate(null);
      setEstimateError(String(toErrorLike(error).message || "") || lang({ ko: "견적을 계산하지 못했습니다.", en: "Could not compute the estimate." }));
    } finally {
      setEstimating(false);
    }
  }, [buildPayload, characterLimit, estimating, generation.loading, modelName, overLimit, signature, sourceRevision, text, voiceId]);

  const handleGenerate = useCallback(() => {
    const key = estimateRef.current;
    if (!key || estimateStale || generation.loading) return;
    setResultOpen(true);
    void generation.generate({
      text,
      sourceRevision: key.sourceRevision,
      templateKey,
      voiceId,
      locale,
      format,
      speed,
      modelName,
      clientRequestId: key.clientRequestId,
      ...(silenceMs ? { silenceMs } : {}),
    });
  }, [estimateStale, format, generation, locale, modelName, silenceMs, speed, templateKey, text, voiceId]);

  const handleDelete = useCallback(
    async (assetId: string) => {
      try {
        await deleteStudioAudioAsset(assetId, { policy: "soft" });
        await generation.refresh();
      } catch {
        setResultOpen(true);
      }
    },
    [generation],
  );

  const generateDisabled = !estimate || estimateStale || generation.loading || overLimit || (routeDetailMode === "custom" && !text.trim());

  return (
    <StudioDetailPresentation
      open
      onOpenChange={() => undefined}
      presentation="page"
      fallback={null}
      pending={null}
    >
      <StudioCreationWorkspace
        header={
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <span className="text-primary" aria-hidden="true">
              <Volume2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-primary-text">
                <Lang text={{ ko: "음성 제작", en: "Voice production" }} />
              </h1>
              <p className="truncate text-xs text-secondary-text">
                <Lang
                  text={{
                    ko: "템플릿 선택 → 텍스트·Voice 설정 → 견적 확인 → 생성",
                    en: "Template → text and voice → estimate → generate",
                  }}
                />
              </p>
            </div>
          </header>
        }
        footerHeightPx={196}
        footer={
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
            {estimate ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary-text" aria-live="polite">
                <span>
                  {lang({ ko: `예상 코인 ${estimate.estimatedCoins}`, en: `Estimated coins ${estimate.estimatedCoins}` })}
                </span>
                <span>
                  {lang({ ko: `${estimate.characters}자 · ${estimate.segmentCount}구간`, en: `${estimate.characters} chars · ${estimate.segmentCount} segments` })}
                </span>
                <span>{lang({ ko: `요율 ${selectedVoice?.creditMultiplier ?? 1}×`, en: `Rate ${selectedVoice?.creditMultiplier ?? 1}×` })}</span>
                <span className="truncate">{estimate.pricingRevision}</span>
                {estimateStale ? (
                  <span className="text-warning">
                    <Lang text={{ ko: "설정이 바뀌어 견적이 만료되었습니다. 다시 확인하세요.", en: "Settings changed; the estimate is stale. Recalculate." }} />
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-secondary-text">
                <Lang text={{ ko: "견적을 확인한 뒤 생성할 수 있습니다.", en: "Confirm an estimate before generating." }} />
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={requestEstimate} disabled={estimating || generation.loading} className={`min-h-11 ${FOCUS_RING_CLASS}`}>
                <Lang text={{ ko: estimating ? "견적 계산 중" : "견적 확인", en: estimating ? "Calculating" : "Check estimate" }} />
              </Button>
              <Button variant="primary" onClick={handleGenerate} disabled={generateDisabled} className={`min-h-11 ${FOCUS_RING_CLASS}`}>
                <Lang text={{ ko: "음성 생성", en: "Generate audio" }} />
              </Button>
              {generation.canCancel ? (
                <Button variant="ghost" onClick={() => void generation.cancel()} className={`min-h-11 ${FOCUS_RING_CLASS}`}>
                  <Lang text={{ ko: "취소", en: "Cancel" }} />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => setResultOpen(true)}
                disabled={!generation.job && !generation.loading}
                className={`min-h-11 ${FOCUS_RING_CLASS}`}
              >
                <Lang text={{ ko: "결과 보기", en: "View result" }} />
              </Button>
            </div>
          </div>
        }
        resultOpen={resultOpen}
        onResultOpenChange={setResultOpen}
        resultTitle={{ ko: "음성 생성 결과", en: "Voice generation result" }}
        result={
          <AudioStudioResultPanel
            job={generation.job}
            loading={generation.loading || generation.resuming}
            onRefresh={() => void generation.refresh()}
            onDelete={(assetId) => void handleDelete(assetId)}
            onRetry={generation.retry}
            canRetry={generation.canRetry}
          />
        }
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          {catalogError ? (
            <p className="rounded-md border border-border px-3 py-2 text-sm text-danger" role="alert">
              {catalogError}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="audio-text">
              <Lang text={{ ko: "읽을 텍스트", en: "Text to read" }} />
            </Label>
            <Textarea
              id="audio-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              aria-describedby="audio-text-help"
              placeholder={lang({ ko: "음성으로 만들 텍스트를 입력하세요.", en: "Enter the text to turn into speech." })}
              className={FOCUS_RING_CLASS}
            />
            <p id="audio-text-help" className={`text-xs ${overLimit ? "text-danger" : "text-secondary-text"}`}>
              {lang({ ko: `${characterCount} / ${characterLimit}자`, en: `${characterCount} / ${characterLimit} chars` })}
            </p>
          </div>

          <AudioVoicePicker voices={catalog?.voices || []} value={voiceId} onChange={setVoiceId} disabled={!catalog} />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-primary-text">
              <Lang text={{ ko: "생성 모드", en: "Generation mode" }} />
            </legend>
            <div className="flex flex-wrap gap-2">
              {(catalog?.models || []).map((model) => (
                <Button
                  key={model.modelName}
                  variant={modelName === model.modelName ? "primary" : "outline"}
                  onClick={() => setModelName(model.modelName)}
                  aria-pressed={modelName === model.modelName}
                  className={`min-h-11 ${FOCUS_RING_CLASS}`}
                >
                  <span className="flex flex-col items-start">
                    <Lang text={model.label} />
                    <span className="text-xs opacity-80">
                      <Lang text={model.description} />
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Button
              variant="ghost"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              className={`min-h-11 justify-start ${FOCUS_RING_CLASS}`}
            >
              <Lang text={{ ko: advancedOpen ? "고급 설정 닫기" : "고급 설정 열기", en: advancedOpen ? "Hide advanced settings" : "Show advanced settings" }} />
            </Button>

            {advancedOpen && catalog ? (
              <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="audio-speed">
                    <Lang text={{ ko: "속도", en: "Speed" }} />
                  </Label>
                  <Input
                    id="audio-speed"
                    type="number"
                    min={catalog.speed.min}
                    max={catalog.speed.max}
                    step={catalog.speed.step}
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                    className={FOCUS_RING_CLASS}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="audio-format">
                    <Lang text={{ ko: "출력 형식", en: "Output format" }} />
                  </Label>
                  <Select value={format} onValueChange={(value) => setFormat(String(value) as StudioAudioFormatType)}>
                    <SelectTrigger id="audio-format" className={`min-h-11 w-full ${FOCUS_RING_CLASS}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.formats.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="audio-silence">
                    <Lang text={{ ko: "구간 사이 무음(ms)", en: "Silence between segments (ms)" }} />
                  </Label>
                  <Input
                    id="audio-silence"
                    type="number"
                    min={0}
                    max={catalog.silenceMaxMs}
                    step={100}
                    value={silenceMs}
                    onChange={(event) => setSilenceMs(Number(event.target.value))}
                    className={FOCUS_RING_CLASS}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {estimateError ? (
            <p className="rounded-md border border-border px-3 py-2 text-sm text-danger" role="alert">
              {estimateError}
            </p>
          ) : null}
        </div>
      </StudioCreationWorkspace>
    </StudioDetailPresentation>
  );
}
