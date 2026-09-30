import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, TooltipBasic } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { TEXT_PROVIDER_TYPES } from "consts/ai";
import { Check, Save } from "lucide-react";
import { cn } from "utils/common";
import { MARKETING_CONTENT_CHANNEL_OPTIONS, MARKETING_TAB_HEADER_CLASS } from "./MarketingOpsConstants";
import { MarketingTypoRulesPanel } from "./MarketingTypoRulesPanel";
import { MarketingTemplateReference } from "./MarketingTemplateReference";
import type { MarketingTemplatePreviewState } from "./MarketingTemplateSheets";
import type { MarketingTemplateOption, QueueCategoryComposerState, QueueComposerState } from "./MarketingOpsTypes";

type MarketingGenerationSettingsPanelProps = {
  busyKey: string;
  categoryScopeUniverseId: string;
  queueComposer: QueueComposerState;
  categoryComposer: QueueCategoryComposerState;
  selectedContentTemplate?: MarketingTemplateOption;
  selectedImageTemplate?: MarketingTemplateOption;
  isLocalAgentMode: boolean;
  selectedContentChannels: string[];
  isZeroUniverseGlobalMode: boolean;
  modelOptions: readonly string[];
  isGlobalScope: boolean;
  saveCategoryConfig: (options?: { defaultReviewMode?: string; generationSettings?: boolean }) => Promise<void>;
  setQueueComposerField: (key: Exclude<keyof QueueComposerState, "channels">, value: string) => void;
  toggleQueueChannel: (channel: string, checked: boolean) => void;
  setTemplatePreview: (preview: MarketingTemplatePreviewState) => void;
};

export function MarketingGenerationSettingsPanel({
  busyKey,
  categoryScopeUniverseId,
  queueComposer,
  categoryComposer,
  selectedContentTemplate,
  selectedImageTemplate,
  isLocalAgentMode,
  selectedContentChannels,
  isZeroUniverseGlobalMode,
  modelOptions,
  isGlobalScope,
  saveCategoryConfig,
  setQueueComposerField,
  toggleQueueChannel,
  setTemplatePreview,
}: MarketingGenerationSettingsPanelProps) {
  return (
    <>
      <div className={MARKETING_TAB_HEADER_CLASS}>
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-text">03 · generation policy</span>
          <div className="flex items-center">
            <h4 className="text-base font-semibold tracking-tight text-primary-text">
              <Lang text={{ ko: "콘텐츠 생성 설정", en: "Content generation settings" }} />
            </h4>
            <TooltipBasic autoClose>
              <Lang
                text={{
                  ko: "선택한 job, 개별 채널, 또는 현재 카테고리 목록 전체에 적용할 생성 방식과 검수 정책을 조정합니다.",
                  en: "Adjust generation mode and review policy for selected jobs, a single channel, or the current category list.",
                }}
              />
            </TooltipBasic>
          </div>
        </div>

        <div className="flex w-full gap-1 sm:w-auto">
          <Button
            size="sm"
            onClick={() =>
              void saveCategoryConfig({
                defaultReviewMode: queueComposer.reviewMode,
                generationSettings: true,
              })
            }
            disabled={!!busyKey || !categoryScopeUniverseId}
            className="flex-1 sm:flex-none"
          >
            <Save className="icon-xxs" />
            <span>
              {busyKey === "category:save"
                ? lang({ ko: "저장 중...", en: "Saving..." })
                : lang({ ko: "설정 저장", en: "Save settings" })}
            </span>
          </Button>
        </div>
      </div>

      <Accordion
        type="multiple"
        defaultValue={["content-generation-settings", "proofreading-for-typos"]}
        className="flex flex-col gap-4"
      >
        <AccordionItem value="content-generation-settings" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <Lang text={{ ko: "콘텐츠 생성 정책", en: "Content creation policy" }} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-6">
              <div>
                <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                  <Lang text={{ ko: "운영 사이트 정보", en: "Operating site" }} />
                </label>
                <Input
                  inputMode="url"
                  maxLength={500}
                  value={queueComposer.siteUrl}
                  onChange={(event) => setQueueComposerField("siteUrl", event.target.value)}
                  placeholder={lang({
                    ko: "예: allmyuniverse.com",
                    en: "Example: allmyuniverse.com",
                  })}
                />
                <p className="mt-1 text-xs leading-5 text-muted-text">
                  <Lang
                    text={{
                      ko: "네이버 블로그 서식 하단의 콘텐츠 안내 문구에 사용됩니다.",
                      en: "Used in the content notice at the bottom of the Naver Blog format.",
                    }}
                  />
                </p>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <MarketingTemplateReference
                  type="content"
                  label={lang({ ko: "이번 콘텐츠 생성 템플릿", en: "Current content template" })}
                  templateKey={categoryComposer.defaultContentTemplateKey}
                  template={selectedContentTemplate}
                  setTemplatePreview={setTemplatePreview}
                />
                <MarketingTemplateReference
                  type="image"
                  label={lang({ ko: "후속 이미지 템플릿", en: "Follow-up image template" })}
                  templateKey={categoryComposer.defaultImageTemplateKey}
                  template={selectedImageTemplate}
                  setTemplatePreview={setTemplatePreview}
                />
              </div>

              <div className="grid gap-3 space-y-2 md:grid-cols-2">
                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "생성 방식", en: "Generation mode" }} />
                  </label>
                  <Select
                    value={queueComposer.generationMode}
                    onValueChange={(value) =>
                      setQueueComposerField("generationMode", Array.isArray(value) ? value[0] || "" : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="server_worker">
                        {lang({ ko: "웹 poll_worker", en: "Web poll_worker" })}
                      </SelectItem>
                      <SelectItem value="local_agent">{lang({ ko: "로컬 에이전트", en: "Local agent" })}</SelectItem>
                    </SelectContent>
                  </Select>
                  {isLocalAgentMode ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                      <p>
                        {lang({
                          ko: "로컬 터미널에서 marketing-ops MCP의 prepare_local_generation(jobId 또는 queueCategory 지정) -> submit_local_generation 흐름으로 생성 결과를 제출하세요.",
                          en: "Use marketing-ops MCP from a local terminal with prepare_local_generation(jobId or queueCategory) -> submit_local_generation.",
                        })}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "검수 모드", en: "Review mode" }} />
                  </label>
                  <Select
                    value={queueComposer.reviewMode}
                    onValueChange={(value) =>
                      setQueueComposerField("reviewMode", Array.isArray(value) ? value[0] || "" : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="review_required">
                        {lang({ ko: "1차 검수 필수", en: "Require first review" })}
                      </SelectItem>
                      <SelectItem value="auto_after_review">
                        {lang({ ko: "검수 후 자동화 준비", en: "Prepare auto after review" })}
                      </SelectItem>
                      <SelectItem value="full_auto">{lang({ ko: "완전 자동화", en: "Full automation" })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "콘텐츠 생성 채널", en: "Content channels" }} />
                  </label>
                  <div className="grid gap-2 md:grid-cols-4">
                    {MARKETING_CONTENT_CHANNEL_OPTIONS.map((channel) => {
                      const checked = selectedContentChannels.includes(channel.value);
                      return (
                        <label
                          key={channel.value}
                          className={cn(
                            "group flex min-h-[58px] cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-all",
                            checked
                              ? "border-primary bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_20%,transparent)]"
                              : "border-border bg-surface hover:border-border-hover",
                          )}
                        >
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "block truncate font-mono text-[13px] font-semibold",
                                checked ? "text-primary" : "text-primary-text",
                              )}
                            >
                              {channel.label}
                            </span>
                            <span className="block truncate text-[11px] text-secondary-text">
                              <Lang text={channel.description} />
                            </span>
                          </span>
                          <span
                            className={cn(
                              "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-all",
                              checked
                                ? "border-primary bg-primary text-accent"
                                : "border-border-hover bg-surface text-transparent",
                            )}
                          >
                            <Check size={12} strokeWidth={2.5} />
                          </span>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={(event) => toggleQueueChannel(channel.value, event.target.checked)}
                            disabled={isZeroUniverseGlobalMode}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "모델 Provider", en: "Model provider" }} />
                  </label>
                  <Select
                    value={queueComposer.modelProvider}
                    onValueChange={(value) =>
                      setQueueComposerField("modelProvider", Array.isArray(value) ? value[0] || "" : value)
                    }
                    disabled={isLocalAgentMode}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEXT_PROVIDER_TYPES.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                    <Lang text={{ ko: "콘텐츠 생성 모델", en: "Content model" }} />
                  </label>
                  <Select
                    value={queueComposer.modelName}
                    onValueChange={(value) =>
                      setQueueComposerField("modelName", Array.isArray(value) ? value[0] || "" : value)
                    }
                    disabled={isLocalAgentMode}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((modelName) => (
                        <SelectItem key={modelName} value={modelName}>
                          {modelName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-secondary-text">
                  <Lang text={{ ko: "추가 작업 지침", en: "Additional instruction" }} />
                </label>
                <Textarea
                  rows={3}
                  value={queueComposer.instructionText}
                  onChange={(event) => setQueueComposerField("instructionText", event.target.value)}
                  placeholder={lang({
                    ko: "예: CEO 관점의 실무 인사이트를 강조하고, Threads는 질문형 CTA로 마무리",
                    en: "Example: emphasize operator insights and end Threads with a question CTA.",
                  })}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="proofreading-for-typos" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <div className="flex items-center gap-1.5">
              <Lang text={{ ko: "오탈자 사전/검수", en: "Typo dictionary review" }} />
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <MarketingTypoRulesPanel universeId={categoryScopeUniverseId} isGlobalScope={isGlobalScope} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
}
