import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import {
  PROMO_SLOT_DEFINITIONS,
  getPromoFormWarnings,
  getPromoPreviewAspectClass,
  type PromoForm,
  type PromoSlotId,
} from "./PromoCreativeDomain";

const LABEL_CLASS = "mb-1 block text-xs font-medium text-secondary-text";

export function PromoCreativeEditor({
  form,
  editingId,
  busy,
  onChange,
  onSave,
  onCancel,
  onOpenStudio,
  onUploadImage,
  onImageUrlBlur,
}: {
  form: PromoForm;
  editingId: string;
  busy: boolean;
  onChange: (next: PromoForm) => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenStudio: () => void;
  onUploadImage: (file: File) => void;
  onImageUrlBlur: () => void;
}) {
  const setField = <K extends keyof PromoForm>(key: K, value: PromoForm[K]) => onChange({ ...form, [key]: value });
  const toggleSlot = (slotId: PromoSlotId, checked: boolean) =>
    setField(
      "slotIds",
      checked ? Array.from(new Set([...form.slotIds, slotId])) : form.slotIds.filter((item) => item !== slotId),
    );
  const aspectClass = getPromoPreviewAspectClass(form.slotIds);
  const warnings = getPromoFormWarnings(form);

  return (
    <section className="space-y-5 rounded-xl border border-border bg-surface p-4" aria-labelledby="promo-editor-title">
      <div>
        <h4 id="promo-editor-title" className="font-semibold">
          <Lang text={{ ko: editingId ? "소재 편집" : "새 소재", en: editingId ? "Edit creative" : "New creative" }} />
        </h4>
        <p className="mt-1 text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "카피와 이미지가 초안으로 저장되며, 검수 요청과 활성화는 목록에서 별도로 진행합니다.",
              en: "Copy and media are saved as a draft. Review and activation remain separate list actions.",
            }}
          />
        </p>
      </div>

      <fieldset>
        <legend className={LABEL_CLASS}>{lang({ ko: "노출 슬롯", en: "Placement slots" })}</legend>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {PROMO_SLOT_DEFINITIONS.map((slot) => {
            const checked = form.slotIds.includes(slot.id);
            return (
              <label
                key={slot.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3",
                  checked ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:border-border-hover",
                )}
              >
                <Checkbox checked={checked} onCheckedChange={(value) => toggleSlot(slot.id, value === true)} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-primary-text">
                    <Lang text={slot.label} />{" "}
                    <span className="font-mono text-[11px] text-muted-text">{slot.ratio}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-secondary-text">
                    <Lang text={slot.placement} />
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-3">
        <label>
          <span className={LABEL_CLASS}>{lang({ ko: "캠페인 ID", en: "Campaign ID" })}</span>
          <Input value={form.campaignId} onChange={(event) => setField("campaignId", event.target.value)} />
        </label>
        <label>
          <span className={LABEL_CLASS}>{lang({ ko: "서비스 축", en: "Service axis" })}</span>
          <Select
            value={form.axis}
            onValueChange={(value) => setField("axis", (Array.isArray(value) ? value[0] : value) as PromoForm["axis"])}
          >
            <SelectTrigger aria-label={lang({ ko: "서비스 축", en: "Service axis" })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["genstudio", "tutors", "play", "branding"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className={LABEL_CLASS}>{lang({ ko: "A/B 변형", en: "A/B variant" })}</span>
          <Select
            value={form.variant}
            onValueChange={(value) => setField("variant", (Array.isArray(value) ? value[0] : value) as "A" | "B")}
          >
            <SelectTrigger aria-label={lang({ ko: "A/B 변형", en: "A/B variant" })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Variant A</SelectItem>
              <SelectItem value="B">Variant B</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className={LABEL_CLASS}>
            {lang({ ko: `소재 라벨 (${form.label.length}/30)`, en: `Creative label (${form.label.length}/30)` })}
          </span>
          <Input maxLength={30} value={form.label} onChange={(event) => setField("label", event.target.value)} />
        </label>
        <label>
          <span className={LABEL_CLASS}>
            {lang({ ko: `CTA (${form.ctaLabel.length}/12)`, en: `CTA (${form.ctaLabel.length}/12)` })}
          </span>
          <Input maxLength={12} value={form.ctaLabel} onChange={(event) => setField("ctaLabel", event.target.value)} />
        </label>
      </div>

      <label>
        <span className={LABEL_CLASS}>
          {lang({ ko: `헤드라인 (${form.headline.length}/24)`, en: `Headline (${form.headline.length}/24)` })}
        </span>
        <Input maxLength={24} value={form.headline} onChange={(event) => setField("headline", event.target.value)} />
      </label>

      <label>
        <span className={LABEL_CLASS}>
          {lang({ ko: `본문 (${form.body.length}/60)`, en: `Body (${form.body.length}/60)` })}
        </span>
        <Textarea
          maxLength={60}
          value={form.body}
          onChange={(event) => setField("body", event.target.value)}
          rows={3}
        />
      </label>

      <label>
        <span className={LABEL_CLASS}>{lang({ ko: "앱 랜딩 URL", en: "App landing URL" })}</span>
        <Input
          value={form.landingUrl}
          onChange={(event) => setField("landingUrl", event.target.value)}
          placeholder="https://app.allmyuniverse.com/..."
        />
      </label>

      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary-text">
              <Lang text={{ ko: "배너 이미지", en: "Banner image" }} />
            </p>
            <p className="mt-1 text-xs leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "이미지를 R2에 직접 업로드하거나 Gen Studio 템플릿으로 새로 제작합니다.",
                  en: "Upload an image directly to R2 or create one with a Gen Studio template.",
                }}
              />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted/60 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
              <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
              <Lang text={{ ko: "이미지 업로드", en: "Upload image" }} />
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onUploadImage(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 shrink-0"
              onClick={onOpenStudio}
              disabled={!form.slotIds.length || busy}
            >
              <ImagePlus className="icon-xxs" />
              <Lang text={{ ko: "Gen Studio로 제작", en: "Create in Gen Studio" }} />
            </Button>
          </div>
        </div>
        <label>
          <span className={LABEL_CLASS}>{lang({ ko: "이미지 URL", en: "Image URL" })}</span>
          <Input
            value={form.imageUrl}
            onChange={(event) =>
              onChange({ ...form, imageUrl: event.target.value, imageAssetId: "", imageWidth: 0, imageHeight: 0 })
            }
            onBlur={onImageUrlBlur}
            placeholder="https://assets.allmyuniverse.com/..."
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className={LABEL_CLASS}>templateKey</span>
            <Input value={form.templateKey} onChange={(event) => setField("templateKey", event.target.value)} />
          </label>
          <div>
            <span className={LABEL_CLASS}>{lang({ ko: "이미지 크기", en: "Image dimensions" })}</span>
            <div className="flex min-h-10 items-center rounded-md border border-border bg-background px-3 text-sm text-secondary-text">
              {form.imageWidth && form.imageHeight
                ? `${form.imageWidth} × ${form.imageHeight}`
                : lang({ ko: "URL 확인 후 자동 감지", en: "Detected after URL validation" })}
            </div>
          </div>
        </div>
        <div
          className="rounded-lg border border-border bg-background p-3"
          aria-label={lang({ ko: "소재와 카피 미리보기", en: "Creative and copy preview" })}
        >
          <div className={cn("relative w-full overflow-hidden rounded-md bg-muted/40", aspectClass)}>
            {form.imageUrl ? (
              <Image
                src={form.imageUrl}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 48rem"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-text">
                <Lang text={{ ko: "이미지 없음", en: "No image" }} />
              </div>
            )}
          </div>
          <div className="mt-3 max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-text">
              {form.label || lang({ ko: "소재 라벨", en: "Creative label" })}
            </p>
            <p className="mt-1 font-semibold text-primary-text">
              {form.headline || lang({ ko: "헤드라인 미리보기", en: "Headline preview" })}
            </p>
            {form.body ? <p className="mt-1 text-sm leading-6 text-secondary-text">{form.body}</p> : null}
            {form.ctaLabel ? <p className="mt-2 text-sm font-medium text-primary">{form.ctaLabel} →</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label>
          <span className={LABEL_CLASS}>{lang({ ko: "포함 카테고리", en: "Include categories" })}</span>
          <Input
            value={form.includeCategories}
            onChange={(event) => setField("includeCategories", event.target.value)}
          />
        </label>
        <label>
          <span className={LABEL_CLASS}>{lang({ ko: "추가 제외 카테고리", en: "Additional exclusions" })}</span>
          <Input
            value={form.excludeCategories}
            onChange={(event) => setField("excludeCategories", event.target.value)}
          />
        </label>
        <label>
          <span className={LABEL_CLASS}>{lang({ ko: "태그", en: "Tags" })}</span>
          <Input value={form.tags} onChange={(event) => setField("tags", event.target.value)} />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className={LABEL_CLASS}>{lang({ ko: "노출 시작 (선택)", en: "Starts at (optional)" })}</span>
          <Input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => setField("startsAt", event.target.value)}
          />
        </label>
        <label>
          <span className={LABEL_CLASS}>{lang({ ko: "노출 종료 (선택)", en: "Ends at (optional)" })}</span>
          <Input
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => setField("endsAt", event.target.value)}
          />
        </label>
      </div>
      {warnings.length ? (
        <div
          className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-primary-text"
          role="status"
        >
          <p className="font-medium">
            <Lang text={{ ko: "검수 전 확인", en: "Before review" }} />
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-secondary-text">
            {warnings.map((warning) => (
              <li key={warning.ko}>
                <Lang text={warning} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="min-h-11" onClick={onSave} disabled={busy}>
          <Lang
            text={{ ko: editingId ? "수정 초안 저장" : "새 초안 저장", en: editingId ? "Save changes" : "Save draft" }}
          />
        </Button>
        {editingId ? (
          <Button variant="outline" size="sm" className="min-h-11" onClick={onCancel} disabled={busy}>
            <Lang text={{ ko: "취소", en: "Cancel" }} />
          </Button>
        ) : null}
      </div>
    </section>
  );
}
