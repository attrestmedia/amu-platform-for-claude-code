"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Label, Textarea } from "@amu-labs/ui";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock3,
  Coins,
  ImagePlus,
  Loader2,
  RefreshCcw,
  Settings2,
  Sparkles,
  Video,
} from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { enqueueStudioVideoJob, getStudioVideoJob, fetchGenStudioModelCatalog } from "libs/api/lab";
import type { GenStudioModelCatalogClientResult } from "libs/api/lab/modelCatalog";
import {
  VIDEO_CAPABILITY_MATRIX,
  estimateVideoGenerationCoins,
  getDefaultVideoModel,
  validateVideoGenerationRequest,
  type VideoAsset,
  type VideoGenJob,
  type VideoGenerationModeType,
} from "types/ai";
import { cn } from "utils/common";
import { getCatalogVideoModelOptions, type CatalogVideoModelOption } from "utils/app/genStudioCatalogClient";
import { VideoPreviewCard } from "./modules/video-studio/VideoPreviewCard";
import {
  VIDEO_MODE_OPTIONS,
  VIDEO_PURPOSE_OPTIONS,
  VIDEO_QUALITY_OPTIONS,
  VIDEO_STYLE_OPTIONS,
  type LocalizedText,
} from "./modules/video-studio/videoStudioOptions";

type VideoStudioEditorProps = {
  initialPrompt?: string;
};

type VideoStudioStatus = "idle" | "queued" | "running" | "success" | "failed";

const STATUS_LABELS: Record<VideoStudioStatus, LocalizedText> = {
  idle: { ko: "생성 전", en: "Ready" },
  queued: { ko: "대기 중", en: "Queued" },
  running: { ko: "생성 중", en: "Generating" },
  success: { ko: "완료", en: "Complete" },
  failed: { ko: "확인 필요", en: "Needs attention" },
};

const ERROR_LABELS: Record<string, LocalizedText> = {
  VIDEO_PIPELINE_NOT_READY: {
    ko: "영상 provider가 아직 운영 검증 전입니다. 이미지 생성은 계속 이용할 수 있습니다.",
    en: "Video providers are still awaiting runtime verification. Image generation remains available.",
  },
  prompt_required: { ko: "영상에서 일어날 일을 한 문장으로 입력해 주세요.", en: "Describe what should happen in the video." },
  reference_required: { ko: "이 모드에는 참고 이미지가 필요합니다.", en: "This mode requires a reference image." },
};

function getErrorText(code: string) {
  return ERROR_LABELS[code] || { ko: "생성에 실패했습니다. 설정을 확인하고 다시 시도해 주세요.", en: "Generation failed. Check the settings and try again." };
}

function findCapability(provider: string, modelName: string) {
  return VIDEO_CAPABILITY_MATRIX.find((item) => item.provider === provider && item.modelName === modelName) || null;
}

function localizedOptionLabel(options: readonly { value: string; label: LocalizedText }[], value: string) {
  return options.find((option) => option.value === value)?.label || { ko: value, en: value };
}

function StatusBadge({ status }: { status: VideoStudioStatus }) {
  return (
    <Badge variant={status === "failed" ? "outline" : status === "success" ? "primary" : "outline"} size="xs">
      {status === "running" || status === "queued" ? <Loader2 className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
      <Lang text={STATUS_LABELS[status]} />
    </Badge>
  );
}

function SettingSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  id: string;
  label: LocalizedText;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: LocalizedText }[];
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id} className="text-xs font-medium text-primary-text">
        <Lang text={label} />
      </Label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 w-full appearance-none rounded-xl border border-border bg-surface px-3 pr-9 text-sm text-primary-text outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {lang(option.label)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-secondary-text" aria-hidden="true" />
      </div>
    </div>
  );
}

function statusFromJob(job: VideoGenJob | null): VideoStudioStatus {
  if (!job) return "idle";
  if (job.status === "queued") return "queued";
  if (job.status === "running") return "running";
  if (job.status === "success" || job.status === "partial") return "success";
  return "failed";
}

export function VideoStudioEditor({ initialPrompt = "" }: VideoStudioEditorProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [purpose, setPurpose] = useState("product");
  const [style, setStyle] = useState("cinematic");
  const [quality, setQuality] = useState("balanced");
  const [mode, setMode] = useState<VideoGenerationModeType>("text-to-video");
  const [provider, setProvider] = useState<"google" | "xai" | "zai">("google");
  const [modelName, setModelName] = useState(getDefaultVideoModel("google"));
  const [duration, setDuration] = useState("8");
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [audio, setAudio] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [catalog, setCatalog] = useState<GenStudioModelCatalogClientResult | null>(null);
  const [status, setStatus] = useState<VideoStudioStatus>("idle");
  const [job, setJob] = useState<VideoGenJob | null>(null);
  const [errorCode, setErrorCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchGenStudioModelCatalog("video").then((result) => {
      if (!cancelled) setCatalog(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const videoModelOptions = useMemo<CatalogVideoModelOption[]>(
    () => getCatalogVideoModelOptions(catalog?.video),
    [catalog],
  );
  const selectedCatalogModel = videoModelOptions.find(
    (item) => item.provider === provider && item.modelName === modelName,
  );
  const pipelineAvailable = Boolean(selectedCatalogModel);
  const capability = findCapability(provider, modelName);
  const inputImages = useMemo(
    () => (referenceUrl.trim() ? [{ url: referenceUrl.trim() }] : []),
    [referenceUrl],
  );
  const requestForValidation = useMemo(
    () => ({
      prompt,
      provider,
      modelName,
      mode,
      inputImages,
      durationSeconds: Number(duration),
      resolution,
      aspectRatio,
      audio: { enabled: audio },
    }),
    [aspectRatio, audio, duration, inputImages, mode, modelName, prompt, provider, resolution],
  );
  const validation = useMemo(() => validateVideoGenerationRequest(requestForValidation), [requestForValidation]);
  const estimate = useMemo(
    () =>
      estimateVideoGenerationCoins({
        provider,
        modelName,
        durationSeconds: Number(duration),
        resolution,
      }),
    [duration, modelName, provider, resolution],
  );
  const previewAsset: VideoAsset | null = job?.assets?.[0] || null;
  const activeError = errorCode ? getErrorText(errorCode) : null;

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getStudioVideoJob(job.jobId);
        if (cancelled || !next) return;
        setJob(next);
        setStatus(statusFromJob(next));
        if (next.status === "queued" || next.status === "running") {
          timer = setTimeout(() => void poll(), 2500);
        }
      } catch {
        if (!cancelled) setErrorCode("POLL_FAILED");
      }
    };
    timer = setTimeout(() => void poll(), 2500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [job]);

  const handleProviderChange = useCallback((nextProvider: string) => {
    const typedProvider = nextProvider as "google" | "xai" | "zai";
    const nextCapability = VIDEO_CAPABILITY_MATRIX.find((item) => item.provider === typedProvider);
    setProvider(typedProvider);
    setModelName((nextCapability?.modelName || getDefaultVideoModel(typedProvider)) as typeof modelName);
    setDuration(String(nextCapability?.durations[0] || 5));
    setResolution(nextCapability?.resolutions[0] || "720p");
    setAspectRatio(nextCapability?.aspectRatios[0] || "16:9");
    setAudio(Boolean(nextCapability?.audio));
  }, []);

  const handleModelChange = useCallback((nextModelName: string) => {
    const nextCapability = VIDEO_CAPABILITY_MATRIX.find((item) => item.modelName === nextModelName);
    setModelName(nextModelName as typeof modelName);
    setDuration(String(nextCapability?.durations[0] || 5));
    setResolution(nextCapability?.resolutions[0] || "720p");
    setAspectRatio(nextCapability?.aspectRatios[0] || "16:9");
    setAudio(Boolean(nextCapability?.audio));
  }, []);

  const handleGenerate = useCallback(async () => {
    setErrorCode("");
    const check = validateVideoGenerationRequest(requestForValidation);
    if (!check.ok) {
      setStatus("failed");
      setErrorCode(check.reason);
      return;
    }
    if (!pipelineAvailable) {
      setStatus("failed");
      setErrorCode("VIDEO_PIPELINE_NOT_READY");
      return;
    }

    setIsSubmitting(true);
    setStatus("queued");
    try {
      const result = await enqueueStudioVideoJob({
        modality: "video",
        prompt: `${purpose}: ${prompt.trim()} Style: ${style}. Quality: ${quality}.`,
        provider,
        modelName,
        mode,
        inputImages: inputImages.length ? inputImages : undefined,
        aspectRatio,
        durationSeconds: Number(duration),
        resolution,
        audio: { enabled: audio },
        visibility: "private",
        clientRequestId: `gen-studio-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pricingRevision: catalog?.pricingRevision,
      });
      const nextJob = result?.job || null;
      setJob(nextJob);
      setStatus(statusFromJob(nextJob));
      if (!nextJob) setErrorCode("EMPTY_JOB_RESPONSE");
    } catch (error) {
      setStatus("failed");
      setErrorCode((error as { errorCode?: string })?.errorCode || "VIDEO_GENERATION_FAILED");
    } finally {
      setIsSubmitting(false);
    }
  }, [aspectRatio, audio, catalog, duration, inputImages, mode, modelName, pipelineAvailable, prompt, provider, purpose, quality, requestForValidation, resolution, style]);

  const resetForRetry = useCallback(() => {
    setStatus("idle");
    setJob(null);
    setErrorCode("");
  }, []);

  const modeLabel = localizedOptionLabel(VIDEO_MODE_OPTIONS, mode);

  return (
    <div className="mx-auto w-full max-w-[70rem]" data-amu-gen-studio-media-mode="video">
      <div className="mb-6 flex flex-col gap-2 sm:mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" size="xs">
            <Video className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            <Lang text={{ ko: "영상 생성", en: "Video generation" }} />
          </Badge>
          <StatusBadge status={status} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-primary-text sm:text-3xl">
          <Lang text={{ ko: "목적을 정하면, 영상 결과에 집중하세요.", en: "Choose the intent, then focus on the result." }} />
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-secondary-text">
          <Lang text={{ ko: "모델명보다 영상의 목적·스타일·품질을 먼저 정합니다. provider와 모델은 고급 설정에서만 확인합니다.", en: "Start with purpose, style, and quality. Provider and model details stay in Advanced settings." }} />
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="video-intent-heading">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="video-intent-heading" className="text-base font-semibold text-primary-text">
                  <Lang text={{ ko: "무엇을 만들까요?", en: "What are you making?" }} />
                </h2>
                <p className="mt-1 text-xs leading-5 text-secondary-text">
                  <Lang text={{ ko: "첫 선택은 AMU 추천 흐름으로 시작합니다.", en: "Start with the AMU recommended flow." }} />
                </p>
              </div>
              <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SettingSelect id="video-purpose" label={{ ko: "목적", en: "Purpose" }} value={purpose} onChange={setPurpose} options={VIDEO_PURPOSE_OPTIONS} />
              <SettingSelect id="video-style" label={{ ko: "스타일", en: "Style" }} value={style} onChange={setStyle} options={VIDEO_STYLE_OPTIONS} />
              <SettingSelect id="video-quality" label={{ ko: "품질", en: "Quality" }} value={quality} onChange={setQuality} options={VIDEO_QUALITY_OPTIONS} />
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="video-prompt" className="text-xs font-medium text-primary-text">
                <Lang text={{ ko: "영상 설명", en: "Video description" }} />
              </Label>
              <Textarea
                id="video-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={lang({ ko: "예: 신제품이 책상 위에서 천천히 회전하고, 자연광이 표면을 스칩니다.", en: "Example: The new product slowly rotates on a desk as natural light moves across it." })}
                className="min-h-32 resize-y"
                aria-describedby="video-prompt-help"
              />
              <p id="video-prompt-help" className="text-xs leading-5 text-secondary-text">
                <Lang text={{ ko: "장면·움직임·분위기를 한 문장 이상으로 적으면 결과가 안정적입니다.", en: "Include the scene, movement, and mood for a more stable result." }} />
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="video-options-heading">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="video-options-heading" className="text-base font-semibold text-primary-text">
                  <Lang text={{ ko: "영상 옵션", en: "Video options" }} />
                </h2>
                <p className="mt-1 text-xs text-secondary-text"><Lang text={modeLabel} /></p>
              </div>
              <Clock3 className="h-5 w-5 text-secondary-text" aria-hidden="true" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingSelect id="video-mode" label={{ ko: "생성 방식", en: "Creation mode" }} value={mode} onChange={(value) => setMode(value as VideoGenerationModeType)} options={VIDEO_MODE_OPTIONS} />
              <SettingSelect
                id="video-duration"
                label={{ ko: "길이", en: "Duration" }}
                value={duration}
                onChange={setDuration}
                options={(capability?.durations || [5, 8]).map((item) => ({ value: String(item), label: { ko: `${item}초`, en: `${item}s` } }))}
              />
              <SettingSelect
                id="video-resolution"
                label={{ ko: "해상도", en: "Resolution" }}
                value={resolution}
                onChange={setResolution}
                options={(capability?.resolutions || ["720p"]).map((item) => ({ value: item, label: { ko: item, en: item } }))}
              />
              <SettingSelect
                id="video-aspect"
                label={{ ko: "화면 비율", en: "Aspect ratio" }}
                value={aspectRatio}
                onChange={setAspectRatio}
                options={(capability?.aspectRatios || ["16:9", "9:16"]).map((item) => ({ value: item, label: { ko: item, en: item } }))}
              />
            </div>
            {mode !== "text-to-video" ? (
              <div className="mt-4 space-y-2">
                <Label htmlFor="video-reference-url" className="text-xs font-medium text-primary-text">
                  <Lang text={{ ko: "참고 이미지 URL", en: "Reference image URL" }} />
                </Label>
                <div className="relative">
                  <ImagePlus className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-secondary-text" aria-hidden="true" />
                  <input
                    id="video-reference-url"
                    type="url"
                    value={referenceUrl}
                    onChange={(event) => setReferenceUrl(event.target.value)}
                    placeholder="https://…"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm text-primary-text outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                  />
                </div>
                <p className="text-xs leading-5 text-secondary-text">
                  <Lang text={{ ko: "참고 이미지 수와 형식은 선택된 capability에 맞지 않으면 생성 전에 차단됩니다.", en: "Reference count and format are blocked before generation when they exceed the selected capability." }} />
                </p>
              </div>
            ) : null}
            <label className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2 text-sm text-primary-text">
              <span>
                <span className="block font-medium"><Lang text={{ ko: "오디오 포함", en: "Include audio" }} /></span>
                <span className="block text-xs text-secondary-text"><Lang text={{ ko: "지원하는 provider에서만 활성화됩니다.", en: "Available only for providers that support audio." }} /></span>
              </span>
              <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} disabled={!capability?.audio} className="h-5 w-5 accent-primary" />
            </label>
          </section>

          <section className="rounded-2xl border border-border/70 bg-surface-2/50" aria-labelledby="video-advanced-heading">
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-medium text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-expanded={advancedOpen}
              aria-controls="video-advanced-panel"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" aria-hidden="true" /><Lang text={{ ko: "고급 설정", en: "Advanced settings" }} /></span>
              <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", advancedOpen && "rotate-180")} aria-hidden="true" />
            </button>
            {advancedOpen ? (
              <div id="video-advanced-panel" className="grid gap-3 border-t border-border/70 px-4 pb-4 pt-4 sm:grid-cols-2">
                <SettingSelect
                  id="video-provider"
                  label={{ ko: "Provider", en: "Provider" }}
                  value={provider}
                  onChange={handleProviderChange}
                  options={[
                    { value: "google", label: { ko: "Google · AMU 추천", en: "Google · AMU recommended" } },
                    { value: "xai", label: { ko: "xAI", en: "xAI" } },
                    { value: "zai", label: { ko: "Z.ai", en: "Z.ai" } },
                  ]}
                  disabled={!pipelineAvailable}
                />
                <SettingSelect
                  id="video-model"
                  label={{ ko: "Model", en: "Model" }}
                  value={modelName}
                  onChange={handleModelChange}
                  options={(videoModelOptions.length
                    ? videoModelOptions.filter((item) => item.provider === provider)
                    : VIDEO_CAPABILITY_MATRIX.filter((item) => item.provider === provider).map((item) => ({
                        provider: item.provider,
                        modelName: item.modelName,
                        displayName: item.modelName,
                        upstreamModelName: item.modelName,
                      })))
                    .map((item) => ({ value: item.modelName, label: { ko: item.displayName, en: item.displayName } }))}
                  disabled={!pipelineAvailable}
                />
                <p className="text-xs leading-5 text-secondary-text sm:col-span-2">
                  <Lang text={{ ko: "모델 성능 순위는 표시하지 않습니다. 운영 검증을 통과한 모델만 실제 생성에 사용됩니다.", en: "Models are not ranked. Only runtime-verified models can generate real output." }} />
                </p>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label={lang({ ko: "생성 결과 및 비용", en: "Generated result and cost" })}>
          <VideoPreviewCard asset={previewAsset} />
          <section className="rounded-2xl border border-border bg-surface p-4" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "예상 비용", en: "Estimated cost" }} /></p>
                <p className="mt-1 flex items-center gap-1.5 text-xl font-semibold text-primary-text">
                  <Coins className="h-5 w-5 text-primary" aria-hidden="true" />
                  {estimate ? estimate.coins.toLocaleString() : "—"}
                  <span className="text-sm font-normal text-secondary-text"><Lang text={{ ko: "코인", en: "coins" }} /></span>
                </p>
              </div>
              <Badge variant="outline" size="xs"><Lang text={{ ko: "정가 기준", en: "List price" }} /></Badge>
            </div>
            <p className="mt-3 text-xs leading-5 text-secondary-text">
              <Lang text={{ ko: `길이 ${duration}초 · ${resolution} · 가격 revision ${catalog?.pricingRevision || "확인 중"}`, en: `${duration}s · ${resolution} · pricing revision ${catalog?.pricingRevision || "checking"}` }} />
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-border/70 bg-surface-2 px-3 py-2 text-xs text-secondary-text">
              <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <Lang text={{ ko: "완료까지 시간이 걸릴 수 있어 알림과 진행 상태를 함께 제공합니다.", en: "Video jobs may take time, so progress and notifications are provided together." }} />
            </div>
            {activeError ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-5 text-danger" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <Lang text={activeError} />
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                className="min-h-11 flex-1"
                onClick={() => void handleGenerate()}
                disabled={isSubmitting || status === "queued" || status === "running"}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Video className="mr-2 h-4 w-4" aria-hidden="true" />}
                <Lang text={{ ko: pipelineAvailable ? "영상 생성하기" : "영상 생성 준비 확인", en: pipelineAvailable ? "Generate video" : "Check video readiness" }} />
              </Button>
              {status === "failed" ? (
                <Button variant="outline" className="min-h-11" onClick={resetForRetry} aria-label={lang({ ko: "영상 생성 다시 설정", en: "Reset video generation" })}>
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only"><Lang text={{ ko: "다시 시도", en: "Retry" }} /></span>
                </Button>
              ) : null}
            </div>
            {!validation.ok ? (
              <p className="mt-3 text-xs leading-5 text-amber-700">
                <Lang text={getErrorText(validation.reason)} />
              </p>
            ) : null}
            {job?.status === "success" ? (
              <p className="mt-3 flex items-center gap-1 text-xs text-success" role="status">
                <Check className="h-4 w-4" aria-hidden="true" />
                <Lang text={{ ko: "영상이 내부 asset으로 저장되었습니다.", en: "The video was saved as an internal asset." }} />
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
