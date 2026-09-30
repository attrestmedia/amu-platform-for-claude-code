import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, TooltipBasic } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { MARKETING_QUEUE_SCHEDULE_HINT } from "libs/marketing/operator/adminGuide";
import { Eye, RefreshCw, Save } from "lucide-react";
import { cn } from "utils/common";
import {
  MARKETING_PRIORITY_OPTIONS,
  QUEUE_CATEGORY_POLICY_NONE,
  REVIEW_PANEL_LABEL_CLASS,
  TEMPLATE_KEY_NONE,
  MARKETING_TAB_HEADER_CLASS,
} from "./MarketingOpsConstants";
import type {
  MarketingQueueCategoryConfig,
  MarketingTemplateOption,
  MarketingUniverseOption,
  QueueCategoryComposerState,
  QueueComposerState,
  WorkerPollResult,
} from "./MarketingOpsTypes";
import type { MarketingTemplatePreviewState } from "./MarketingTemplateSheets";
import {
  formatDate,
  fromOptionalSelectValue,
  getCategoryPolicyLabel,
  getTemplateLabel,
  toSafeString,
} from "./MarketingOpsUtils";

type MarketingQueueTabProps = {
  busyKey: string;
  isZeroUniverseGlobalMode: boolean;
  isGlobalScope: boolean;
  availableUniverses: MarketingUniverseOption[];
  queueComposer: QueueComposerState;
  categoryComposer: QueueCategoryComposerState;
  categoryLoading: boolean;
  categoryScopeUniverseId: string;
  selectedCategoryPolicyValue: string;
  categoryConfigs: MarketingQueueCategoryConfig[];
  selectedContentTemplate?: MarketingTemplateOption;
  selectedImageTemplate?: MarketingTemplateOption;
  contentTemplateOptions: MarketingTemplateOption[];
  imageTemplateOptions: MarketingTemplateOption[];
  workerResult: WorkerPollResult | null;
  enqueueTargets: () => Promise<void>;
  loadCategoryConfigs: (selectedQueueCategory?: string) => Promise<void>;
  saveCategoryConfig: (options?: { defaultReviewMode?: string; generationSettings?: boolean }) => Promise<void>;
  setQueueComposerField: (key: Exclude<keyof QueueComposerState, "channels">, value: string) => void;
  setCategoryComposerField: (key: keyof QueueCategoryComposerState, value: string | boolean) => void;
  selectCategoryPolicy: (value: string | string[]) => void;
  setTemplatePreview: (state: MarketingTemplatePreviewState) => void;
};

export function MarketingQueueTab({
  busyKey,
  isZeroUniverseGlobalMode,
  isGlobalScope,
  availableUniverses,
  queueComposer,
  categoryComposer,
  categoryLoading,
  categoryScopeUniverseId,
  selectedCategoryPolicyValue,
  categoryConfigs,
  selectedContentTemplate,
  selectedImageTemplate,
  contentTemplateOptions,
  imageTemplateOptions,
  workerResult,
  enqueueTargets,
  loadCategoryConfigs,
  saveCategoryConfig,
  setQueueComposerField,
  setCategoryComposerField,
  selectCategoryPolicy,
  setTemplatePreview,
}: MarketingQueueTabProps) {
  return (
    <>
      <div className={MARKETING_TAB_HEADER_CLASS}>
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-text">01 · Enqueue</span>
          <div className="flex items-center gap-1">
            <h4 className="text-base font-semibold tracking-tight text-primary-text">
              <Lang text={{ ko: "Queue 등록하기", en: "Register queue" }} />
            </h4>
            <TooltipBasic autoClose triggerAs="span">
              <Lang
                text={{
                  ko: "여러 URL 중 선택한 실행 개수만큼 마케팅 queue job으로 바로 등록합니다.",
                  en: "Register the selected batch size of URLs as marketing queue jobs.",
                }}
              />
            </TooltipBasic>
          </div>
        </div>

        <div className="flex gap-1 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            rounded="lg"
            onClick={() => void enqueueTargets()}
            disabled={!!busyKey || isZeroUniverseGlobalMode}
          >
            <Save className="icon-xxs" />
            <span>{lang({ ko: "Queue 등록", en: "Enqueue" })}</span>
          </Button>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["pilot-config", "category-config"]} className="flex flex-col gap-4">
        <AccordionItem value="pilot-config" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <Lang text={{ ko: "실행 입력과 생성 정책", en: "Run inputs and generation policy" }} />
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-3 md:grid-cols-2">
              {isGlobalScope ? (
                <div className="flex items-center gap-4 md:col-span-2">
                  <label className={REVIEW_PANEL_LABEL_CLASS}>
                    <Lang text={{ ko: "queue 대상 유니버스", en: "Queue target universe" }} />
                  </label>
                  {availableUniverses.length > 0 ? (
                    <Select
                      value={queueComposer.targetUniverseId}
                      onValueChange={(value) =>
                        setQueueComposerField("targetUniverseId", Array.isArray(value) ? value[0] || "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={lang({ ko: "대상 유니버스 선택", en: "Select target universe" })} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUniverses.map((universe) => (
                          <SelectItem key={universe.id} value={universe.id}>
                            {universe.name} ({universe.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                      <Lang
                        text={{
                          ko: "현재 queue 대상으로 선택할 유니버스가 없습니다. 먼저 유니버스를 생성해주세요.",
                          en: "There is no universe available as an enqueue target yet. Create a universe first.",
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-3">
              <Tabs
                value={queueComposer.sourceInputMode}
                onValueChange={(value) => setQueueComposerField("sourceInputMode", value)}
                className="w-full"
              >
                <TabsList className="mb-3 grid h-auto w-full grid-cols-2 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 shadow-none">
                  <TabsTrigger value="urls" className="text-xs">
                    <Lang text={{ ko: "URL 목록", en: "URL list" }} />
                  </TabsTrigger>
                  <TabsTrigger value="direct" className="text-xs">
                    <Lang text={{ ko: "직접 원문", en: "Manual source" }} />
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="urls" className="mt-0">
                  <label className={REVIEW_PANEL_LABEL_CLASS}>
                    <Lang text={{ ko: "URL 목록", en: "URL list" }} />
                  </label>
                  <Textarea
                    rows={4}
                    value={queueComposer.bulkTargets}
                    onChange={(event) => setQueueComposerField("bulkTargets", event.target.value)}
                    placeholder={lang({
                      ko: "한 줄에 원문 URL 하나씩 입력하세요.",
                      en: "Enter one source URL per line.",
                    })}
                    disabled={isZeroUniverseGlobalMode}
                  />
                  <p className="mt-1 text-xxs leading-5 text-slate-500">
                    <Lang
                      text={{
                        ko: "WordPress URL은 WP 글로, 일반 웹 URL은 웹 원문 snapshot job으로 등록됩니다. 서버는 한 번에 최대 50건만 받습니다.",
                        en: "WordPress URLs are queued as WP posts. Other web URLs are queued as source snapshot jobs. The server accepts up to 50 items per batch.",
                      }}
                    />
                  </p>
                </TabsContent>
                <TabsContent value="direct" className="mt-0">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className={REVIEW_PANEL_LABEL_CLASS}>
                        <Lang text={{ ko: "원문 URL", en: "Source URL" }} />
                      </label>
                      <Input
                        value={queueComposer.sourceUrl}
                        onChange={(event) => setQueueComposerField("sourceUrl", event.target.value)}
                        placeholder="https://..."
                        disabled={isZeroUniverseGlobalMode}
                      />
                    </div>
                    <div>
                      <label className={REVIEW_PANEL_LABEL_CLASS}>
                        <Lang text={{ ko: "제목", en: "Title" }} />
                      </label>
                      <Input
                        value={queueComposer.sourceTitle}
                        onChange={(event) => setQueueComposerField("sourceTitle", event.target.value)}
                        placeholder={lang({ ko: "원문 제목", en: "Source title" })}
                        disabled={isZeroUniverseGlobalMode}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={REVIEW_PANEL_LABEL_CLASS}>
                        <Lang text={{ ko: "요약/발췌", en: "Excerpt" }} />
                      </label>
                      <Textarea
                        rows={2}
                        value={queueComposer.sourceExcerptText}
                        onChange={(event) => setQueueComposerField("sourceExcerptText", event.target.value)}
                        placeholder={lang({
                          ko: "비워두면 본문 앞부분을 사용합니다.",
                          en: "Uses the beginning of the body when empty.",
                        })}
                        disabled={isZeroUniverseGlobalMode}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={REVIEW_PANEL_LABEL_CLASS}>
                        <Lang text={{ ko: "본문", en: "Body" }} />
                      </label>
                      <Textarea
                        rows={8}
                        value={queueComposer.sourceContentText}
                        onChange={(event) => setQueueComposerField("sourceContentText", event.target.value)}
                        placeholder={lang({
                          ko: "소셜 콘텐츠 생성에 사용할 원문 본문",
                          en: "Source body for social content generation",
                        })}
                        disabled={isZeroUniverseGlobalMode}
                      />
                    </div>
                    <div>
                      <label className={REVIEW_PANEL_LABEL_CLASS}>
                        <Lang text={{ ko: "대표 이미지 URL", en: "Hero image URL" }} />
                      </label>
                      <Input
                        value={queueComposer.sourceImageUrl}
                        onChange={(event) => setQueueComposerField("sourceImageUrl", event.target.value)}
                        placeholder="https://..."
                        disabled={isZeroUniverseGlobalMode}
                      />
                    </div>
                    <div>
                      <label className={REVIEW_PANEL_LABEL_CLASS}>
                        <Lang text={{ ko: "카테고리", en: "Categories" }} />
                      </label>
                      <Input
                        value={queueComposer.sourceCategories}
                        onChange={(event) => setQueueComposerField("sourceCategories", event.target.value)}
                        placeholder={lang({ ko: "쉼표로 구분", en: "Comma separated" })}
                        disabled={isZeroUniverseGlobalMode}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={REVIEW_PANEL_LABEL_CLASS}>
                        <Lang text={{ ko: "태그", en: "Tags" }} />
                      </label>
                      <Input
                        value={queueComposer.sourceTags}
                        onChange={(event) => setQueueComposerField("sourceTags", event.target.value)}
                        placeholder={lang({ ko: "쉼표로 구분", en: "Comma separated" })}
                        disabled={isZeroUniverseGlobalMode}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  <Lang text={{ ko: "큐 카테고리", en: "Queue category" }} />
                </label>
                <Input
                  value={queueComposer.queueCategory}
                  onChange={(event) => {
                    setQueueComposerField("queueCategory", event.target.value);
                    setCategoryComposerField("queueCategory", event.target.value);
                  }}
                  placeholder="general, ai-news, naver-rewrite..."
                  disabled={isZeroUniverseGlobalMode}
                />
              </div>
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  <Lang text={{ ko: "우선순위", en: "Priority" }} />
                </label>
                <Select
                  value={queueComposer.priority}
                  onValueChange={(value) =>
                    setQueueComposerField("priority", Array.isArray(value) ? value[0] || "normal" : value)
                  }
                  disabled={isZeroUniverseGlobalMode}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETING_PRIORITY_OPTIONS.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  <Lang text={{ ko: "1회 실행 개수", en: "Batch size" }} />
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={queueComposer.batchSize}
                  onChange={(event) => setQueueComposerField("batchSize", event.target.value)}
                  disabled={isZeroUniverseGlobalMode}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="category-config" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <div className="flex items-center gap-1">
              <Lang text={{ ko: "카테고리 실행 정책", en: "Category execution policy" }} />
              <TooltipBasic autoClose triggerAs="span">
                <Lang
                  text={{
                    ko: "카테고리별 기본 실행 개수, 우선순위, 템플릿, 생성 채널을 저장하고 queue 등록에 재사용합니다.",
                    en: "Save default batch size, priority, templates, and generation channels per category for queue runs.",
                  }}
                />
              </TooltipBasic>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="policy-settings">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-end">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      void loadCategoryConfigs(categoryComposer.queueCategory || queueComposer.queueCategory)
                    }
                    disabled={categoryLoading || !!busyKey || !categoryScopeUniverseId}
                  >
                    <RefreshCw className={cn(categoryLoading ? "animate-spin" : "", "icon-xxs")} />
                    <span>{lang({ ko: "정책 조회", en: "Load policies" })}</span>
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => void saveCategoryConfig()}
                    disabled={!!busyKey || !categoryScopeUniverseId}
                  >
                    <Save className="icon-xxs" />
                    <span>{lang({ ko: "정책 저장", en: "Save policy" })}</span>
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className={REVIEW_PANEL_LABEL_CLASS}>
                    <Lang text={{ ko: "저장된 정책", en: "Saved policy" }} />
                  </label>
                  <Select
                    value={selectedCategoryPolicyValue}
                    onValueChange={selectCategoryPolicy}
                    disabled={!categoryScopeUniverseId || categoryConfigs.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={lang({ ko: "정책 선택", en: "Select policy" })} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={QUEUE_CATEGORY_POLICY_NONE}>
                        {lang({ ko: "직접 설정", en: "Manual" })}
                      </SelectItem>
                      {categoryConfigs.map((item) => (
                        <SelectItem
                          key={toSafeString(item.configId || item.queueCategory)}
                          value={toSafeString(item.queueCategory)}
                        >
                          {getCategoryPolicyLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className={REVIEW_PANEL_LABEL_CLASS}>
                    <Lang text={{ ko: "정책 이름", en: "Policy label" }} />
                  </label>
                  <Input
                    value={categoryComposer.label}
                    onChange={(event) => setCategoryComposerField("label", event.target.value)}
                    placeholder={lang({ ko: "예: 네이버 리라이트", en: "Example: Naver rewrite" })}
                  />
                </div>

                <div>
                  <label className={REVIEW_PANEL_LABEL_CLASS}>
                    <Lang text={{ ko: "정책 카테고리 키", en: "Policy category key" }} />
                  </label>
                  <Input
                    value={categoryComposer.queueCategory}
                    onChange={(event) => setCategoryComposerField("queueCategory", event.target.value)}
                    placeholder={queueComposer.queueCategory || "general"}
                  />
                </div>

                <div>
                  <label className={REVIEW_PANEL_LABEL_CLASS}>
                    <Lang text={{ ko: "기본 1회 실행 개수", en: "Default batch size" }} />
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={categoryComposer.defaultBatchSize}
                    onChange={(event) => setCategoryComposerField("defaultBatchSize", event.target.value)}
                  />
                </div>

                <div>
                  <label className={REVIEW_PANEL_LABEL_CLASS}>
                    <Lang text={{ ko: "기본 우선순위", en: "Default priority" }} />
                  </label>
                  <Select
                    value={categoryComposer.defaultPriority}
                    onValueChange={(value) =>
                      setCategoryComposerField("defaultPriority", Array.isArray(value) ? value[0] || "normal" : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKETING_PRIORITY_OPTIONS.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className={REVIEW_PANEL_LABEL_CLASS}>
                    <Lang text={{ ko: "기본 검수 모드", en: "Default review mode" }} />
                  </label>
                  <Select
                    value={categoryComposer.defaultReviewMode}
                    onValueChange={(value) =>
                      setCategoryComposerField(
                        "defaultReviewMode",
                        Array.isArray(value) ? value[0] || "review_required" : value,
                      )
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

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className={REVIEW_PANEL_LABEL_CLASS}>
                      <Lang text={{ ko: "기본 콘텐츠 템플릿", en: "Default content template" }} />
                    </label>
                    {selectedContentTemplate ? (
                      <Button
                        variant="blank"
                        size="xs"
                        onClick={() => setTemplatePreview({ type: "content", item: selectedContentTemplate })}
                        className="inline-flex items-center gap-1 text-secondary-text py-0 h-auto"
                      >
                        <Eye className="icon-xxs" />
                        <span>{lang({ ko: "내용 보기", en: "Preview" })}</span>
                      </Button>
                    ) : null}
                  </div>
                  <Select
                    value={categoryComposer.defaultContentTemplateKey || TEMPLATE_KEY_NONE}
                    onValueChange={(value) =>
                      setCategoryComposerField("defaultContentTemplateKey", fromOptionalSelectValue(value))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={lang({ ko: "콘텐츠 템플릿 선택", en: "Select content template" })} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TEMPLATE_KEY_NONE}>{lang({ ko: "선택 안 함", en: "None" })}</SelectItem>
                      {contentTemplateOptions.map((item) => (
                        <SelectItem key={toSafeString(item.key)} value={toSafeString(item.key)}>
                          {getTemplateLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className={REVIEW_PANEL_LABEL_CLASS}>
                      <Lang text={{ ko: "기본 이미지 템플릿", en: "Default image template" }} />
                    </label>
                    {selectedImageTemplate ? (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setTemplatePreview({ type: "image", item: selectedImageTemplate })}
                      >
                        <Eye className="icon-xxs" />
                        <span>{lang({ ko: "내용 보기", en: "Preview" })}</span>
                      </Button>
                    ) : null}
                  </div>
                  <Select
                    value={categoryComposer.defaultImageTemplateKey || TEMPLATE_KEY_NONE}
                    onValueChange={(value) =>
                      setCategoryComposerField("defaultImageTemplateKey", fromOptionalSelectValue(value))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={lang({ ko: "이미지 템플릿 선택", en: "Select image template" })} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TEMPLATE_KEY_NONE}>{lang({ ko: "선택 안 함", en: "None" })}</SelectItem>
                      {imageTemplateOptions.map((item) => (
                        <SelectItem key={toSafeString(item.key)} value={toSafeString(item.key)}>
                          {getTemplateLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 mt-4 pt-3 border-t border-border">
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  <Lang text={{ ko: "예약 시작 시각", en: "Scheduled start time" }} />
                </label>
                <Input
                  type="datetime-local"
                  value={queueComposer.scheduledAt}
                  onChange={(event) => setQueueComposerField("scheduledAt", event.target.value)}
                  disabled={isZeroUniverseGlobalMode}
                />
                <p className="mt-1 text-xxs leading-5 text-slate-500">
                  <Lang text={MARKETING_QUEUE_SCHEDULE_HINT} />
                </p>
              </div>

              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>worker id</label>
                <Input
                  value={queueComposer.workerId}
                  onChange={(event) => setQueueComposerField("workerId", event.target.value)}
                  placeholder="admin-ui"
                />
              </div>

              <div className="rounded-lg border border-border px-3 py-3 text-xs text-slate-600 col-span-1 sm:col-span-2">
                {workerResult ? (
                  <>
                    <p className="font-medium text-primary-text">
                      {lang({ ko: "최근 실행 결과", en: "Latest run" })}: {toSafeString(workerResult.status) || "-"}
                    </p>
                    <p>scope: {toSafeString(workerResult.scope) || (isGlobalScope ? "global" : "universe")}</p>
                    <p>universeId: {toSafeString(workerResult.universeId) || "-"}</p>
                    <p>jobId: {toSafeString(workerResult.jobId) || "-"}</p>
                    <p>reason: {toSafeString(workerResult.reason) || "-"}</p>
                    <p>scheduledAt: {formatDate(workerResult.scheduledAt)}</p>
                  </>
                ) : (
                  <p>{lang({ ko: "아직 수동 실행 결과가 없습니다.", en: "No manual worker result yet." })}</p>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
}
