/**
 * @docHint
 * @purpose Preview server pricing for a selected model and usage shape
 * @process Fetch catalog options and send a read-only pricing preview request
 * @domain admin-system
 * @scope component
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Preloader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  fetchSystemModelControls,
  fetchSystemPricingSummary,
  previewSystemPricing,
  type SystemModelControlClientItem,
  type SystemPricingPreviewResult,
  type SystemPricingSummary,
} from "libs/api/admin/systemControls";
import { logger } from "utils/log";

type PricingPreviewFormState = {
  provider: string;
  modality: "image" | "text" | "audio";
  modelName: string;
  variant: string;
  inputTokens: string;
  outputTokens: string;
  imageCount: string;
  seconds: string;
};

const INITIAL_FORM: PricingPreviewFormState = {
  provider: "google",
  modality: "image",
  modelName: "",
  variant: "",
  inputTokens: "1000",
  outputTokens: "500",
  imageCount: "1",
  seconds: "5",
};

function createInitialForm(models: SystemModelControlClientItem[]): PricingPreviewFormState {
  const fallback =
    models.find((item) => item.defaultModel && item.modality === "image") ||
    models.find((item) => item.modality === "image");
  return { ...INITIAL_FORM, provider: fallback?.provider || "google", modelName: fallback?.modelName || "" };
}

export function PricingPreviewSection() {
  const [models, setModels] = useState<SystemModelControlClientItem[]>([]);
  const [summary, setSummary] = useState<SystemPricingSummary | null>(null);
  const [form, setForm] = useState<PricingPreviewFormState>(INITIAL_FORM);
  const [preview, setPreview] = useState<SystemPricingPreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(function loadPricingPreviewInputs() {
    let alive = true;
    Promise.all([fetchSystemModelControls(), fetchSystemPricingSummary()])
      .then(([nextModels, nextSummary]) => {
        if (!alive) return;
        setModels(nextModels);
        setSummary(nextSummary);
        setForm((current) => current.modelName ? current : createInitialForm(nextModels));
        setFailed(false);
      })
      .catch((error) => {
        logger.error("[SystemControlBox] pricing inputs load failed", error);
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const modelOptions = useMemo(
    () =>
      models.filter(
        (item) => item.provider === form.provider && item.modality === form.modality && item.enabled,
      ),
    [form.modality, form.provider, models],
  );

  useEffect(function syncPreviewModelFromOptions() {
    if (form.modality === "audio") return;
    if (modelOptions.some((item) => item.modelName === form.modelName)) return;
    const nextModel = modelOptions.find((item) => item.defaultModel)?.modelName || modelOptions[0]?.modelName || "";
    if (!nextModel) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((current) => ({ ...current, modelName: nextModel }));
  }, [form.modality, form.modelName, modelOptions]);

  function updateForm<K extends keyof PricingPreviewFormState>(key: K, value: PricingPreviewFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handlePreview() {
    setPreviewLoading(true);
    setPreviewFailed(false);
    try {
      const result = await previewSystemPricing({
        provider: form.provider,
        modelName: form.modelName,
        modality: form.modality,
        variant: form.variant || undefined,
        usage:
          form.modality === "text" || form.modality === "audio"
            ? {
                [form.modality]: {
                  input: Math.max(0, Number(form.inputTokens || 0)),
                  output: Math.max(0, Number(form.outputTokens || 0)),
                },
              }
            : undefined,
        fixed:
          form.modality === "image"
            ? { images: Math.max(0, Number(form.imageCount || 0)), seconds: Math.max(0, Number(form.seconds || 0)) }
            : form.modality === "audio"
              ? { seconds: Math.max(0, Number(form.seconds || 0)) }
              : undefined,
      });
      setPreview(result);
    } catch (error) {
      logger.error("[SystemControlBox] pricing preview failed", error);
      setPreviewFailed(true);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-background p-6" role="status" aria-live="polite">
        <Preloader variant="spin" size="sm" container />
      </div>
    );
  }

  if (failed) {
    return (
      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-lg font-semibold"><Lang text={{ ko: "가격 미리보기", en: "Pricing preview" }} /></h2>
        <p className="mt-3 text-sm text-destructive" role="alert">
          <Lang text={{ ko: "가격 정보를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.", en: "Could not load pricing data. Refresh the page and try again." }} />
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold"><Lang text={{ ko: "가격 미리보기", en: "Pricing preview" }} /></h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <Lang text={{ ko: "서버의 승인된 가격표를 기준으로 예상 코인을 계산합니다.", en: "Estimate coins using the server's approved pricing catalog." }} />
          </p>
        </div>
        {summary ? (
          <span className="text-xs text-muted-foreground">
            {summary.totalEntries} entries · db {summary.dbEntries} / fallback {summary.fallbackEntries}
          </span>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)]">
        <div className="grid min-w-0 gap-3">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid min-w-0 gap-1 text-sm">
              <span><Lang text={{ ko: "용도", en: "Modality" }} /></span>
              <Select value={form.modality} onValueChange={(value) => updateForm("modality", String(value || "image") as PricingPreviewFormState["modality"])}>
                <SelectTrigger aria-label={lang({ ko: "용도", en: "Modality" })}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">image</SelectItem>
                  <SelectItem value="text">text</SelectItem>
                  <SelectItem value="audio">audio</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span><Lang text={{ ko: "공급자", en: "Provider" }} /></span>
              <Select value={form.provider} onValueChange={(value) => updateForm("provider", String(value || ""))}>
                <SelectTrigger aria-label={lang({ ko: "공급자", en: "Provider" })}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["google", "openai", "claude", "deepseek", "xai", "zai", "photoroom", "pixian"].map((provider) => (
                    <SelectItem key={provider} value={provider}>{provider}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span>Variant</span>
              <Input aria-label="Variant" value={form.variant} onChange={(event) => updateForm("variant", event.target.value)} />
            </label>
          </div>

          <label className="grid min-w-0 gap-1 text-sm">
            <span>Model</span>
            {form.modality !== "audio" && modelOptions.length ? (
              <Select value={form.modelName} onValueChange={(value) => updateForm("modelName", String(value || ""))}>
                <SelectTrigger aria-label="Model"><SelectValue placeholder="model" /></SelectTrigger>
                <SelectContent>
                  {modelOptions.map((item) => <SelectItem key={item.key} value={item.modelName}>{item.modelName}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input aria-label="Model" value={form.modelName} onChange={(event) => updateForm("modelName", event.target.value)} />
            )}
          </label>

          {(form.modality === "text" || form.modality === "audio") ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>Input tokens</span>
                <Input type="number" min="0" inputMode="numeric" value={form.inputTokens} onChange={(event) => updateForm("inputTokens", event.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Output tokens</span>
                <Input type="number" min="0" inputMode="numeric" value={form.outputTokens} onChange={(event) => updateForm("outputTokens", event.target.value)} />
              </label>
            </div>
          ) : null}
          {form.modality === "image" ? (
            <label className="grid gap-1 text-sm">
              <span><Lang text={{ ko: "이미지 수", en: "Image count" }} /></span>
              <Input type="number" min="0" inputMode="numeric" value={form.imageCount} onChange={(event) => updateForm("imageCount", event.target.value)} />
            </label>
          ) : null}
          {(form.modality === "image" || form.modality === "audio") ? (
            <label className="grid gap-1 text-sm">
              <span><Lang text={{ ko: "초", en: "Seconds" }} /></span>
              <Input type="number" min="0" inputMode="decimal" value={form.seconds} onChange={(event) => updateForm("seconds", event.target.value)} />
            </label>
          ) : null}
          <div>
            <Button variant="outline" loading={previewLoading} onClick={handlePreview}>
              <Lang text={{ ko: "서버 견적 계산", en: "Run server quote" }} />
            </Button>
          </div>
          {previewFailed ? (
            <p className="text-sm text-destructive" role="alert">
              <Lang text={{ ko: "가격 미리보기에 실패했습니다.", en: "Failed to preview pricing." }} />
            </p>
          ) : null}
        </div>

        <div className="min-w-0 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm" aria-live="polite">
          {preview ? (
            <dl className="grid gap-2">
              <div className="break-all font-semibold">{preview.billingKey}</div>
              <div><dt className="inline text-muted-foreground"><Lang text={{ ko: "과금 방식", en: "Strategy" }} />: </dt><dd className="inline">{preview.billingStrategy}</dd></div>
              <div><dt className="inline text-muted-foreground"><Lang text={{ ko: "예상 코인", en: "Estimated coins" }} />: </dt><dd className="inline">{preview.coins}</dd></div>
              {preview.tokenPricing ? (
                <div className="break-words text-muted-foreground">
                  token: in {preview.tokenPricing.input} / out {preview.tokenPricing.output} ({preview.tokenPricingSource})
                </div>
              ) : null}
              {preview.fixedPricing ? (
                <div className="break-words text-muted-foreground">
                  fixed:
                  {typeof preview.fixedPricing.perImage === "number" ? " image " + preview.fixedPricing.perImage : ""}
                  {typeof preview.fixedPricing.perSecond === "number" ? " second " + preview.fixedPricing.perSecond : ""}
                  {typeof preview.fixedPricing.perMinute === "number" ? " minute " + preview.fixedPricing.perMinute : ""}
                  {" "}({preview.fixedPricingSource})
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-muted-foreground">
              <Lang text={{ ko: "공급자·모델·사용량을 입력하면 예상 코인을 확인할 수 있습니다.", en: "Enter a provider, model, and usage to preview estimated coins." }} />
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
