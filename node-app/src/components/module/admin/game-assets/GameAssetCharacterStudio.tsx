"use client";

import { useState } from "react";
import { Button, Input, Preloader } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import { GameAssetTemplateSection } from "./GameAssetTemplateSection";
import { SpritePipelinePanel } from "./pipeline/SpritePipelinePanel";
import type { ImagePromptMetaType, PromptItemExtendedType } from "types/app";
import { Check, Copy, BookOpen, Map, Paintbrush, Search, Sparkles, SquareUserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "utils/common";
import { writeTextToClipboard } from "utils/helper";

const studioSearchSuggestions = ["character", "portrait", "pixel"] as const;

export function GameAssetCharacterStudio({
  templates,
  registeredKeys,
  busy,
  studioImages,
  studioTemplateKey,
  studioSearched,
  studioLoading,
  sourceImageAssetId,
  sourceUrl,
  drawingSaving,
  onCreatePersona,
  onRefresh,
  onSeedTemplates,
  onStudioTemplateKeyChange,
  onLoadStudioImages,
  onSelectStudioImage,
  onOpenDrawing,
}: {
  templates: PromptItemExtendedType[];
  registeredKeys: Set<string>;
  busy: boolean;
  studioImages: ImagePromptMetaType[];
  studioTemplateKey: string;
  studioSearched: boolean;
  studioLoading: boolean;
  sourceImageAssetId: string;
  sourceUrl: string;
  drawingSaving: boolean;
  onCreatePersona: () => void;
  onRefresh: () => void;
  onSeedTemplates: () => void;
  onStudioTemplateKeyChange: (value: string) => void;
  onLoadStudioImages: () => void;
  onSelectStudioImage: (image: ImagePromptMetaType) => void;
  onOpenDrawing: () => void;
}) {
  const [copiedStudioAssetId, setCopiedStudioAssetId] = useState<string | null>(null);
  const currentStep = sourceUrl || sourceImageAssetId ? 2 : 1;
  const handleCopyStudioAssetId = async (assetId: string) => {
    try {
      await writeTextToClipboard(assetId);
      setCopiedStudioAssetId(assetId);
      toast.success(lang({ ko: "assetId를 복사했습니다.", en: "Asset ID copied." }));
      window.setTimeout(() => setCopiedStudioAssetId((current) => (current === assetId ? null : current)), 1200);
    } catch {
      toast.error(lang({ ko: "assetId를 복사하지 못했습니다.", en: "Could not copy the asset ID." }));
    }
  };
  const steps = [
    { number: 1, icon: SquareUserRound, title: { ko: "1. 기준 캐릭터", en: "1. Character" }, body: { ko: "Gen Studio 결과 선택", en: "Choose a Gen Studio result" } },
    { number: 2, icon: Paintbrush, title: { ko: "2. 스타일 고정", en: "2. Lock style" }, body: { ko: "필요하면 드로잉 보정", en: "Refine with Drawing" } },
    { number: 3, icon: Sparkles, title: { ko: "3. 동작 만들기", en: "3. Add actions" }, body: { ko: "걷기 + 필요한 동작", en: "Walk + optional actions" } },
    { number: 4, icon: BookOpen, title: { ko: "4. 검수·적용", en: "4. Review & apply" }, body: { ko: "미리보고 캐릭터에 발행", en: "Preview and publish" } },
  ];

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-primary/5 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <Sparkles className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">AMU Play</p>
              <h2 className="mt-1 text-xl font-bold sm:text-2xl">
                <Lang text={{ ko: "캐릭터와 월드 에셋을 한곳에서 완성하세요", en: "Build characters and world assets in one place" }} />
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                <Lang
                  text={{
                    ko: "이미지를 고르고 스타일 기준을 확정한 뒤, 필요한 동작을 추가해 생성·편집·검수·발행합니다. 기술 파이프라인은 현재 단계에 맞춰 자동으로 안내됩니다.",
                    en: "Choose an image, lock the style anchor, then add the actions you need to generate, edit, review, and publish. The technical pipeline is revealed only when needed.",
                  }}
                />
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button onClick={onCreatePersona} className="min-h-11">
                  <SquareUserRound className="size-4" />
                  <Lang text={{ ko: "새 캐릭터 정보 만들기", en: "Create character profile" }} />
                </Button>
                <Button variant="outline" onClick={() => window.open("/gen-studio", "_blank", "noopener,noreferrer")} className="min-h-11">
                  <Sparkles className="size-4" />
                  <Lang text={{ ko: "Gen Studio에서 기준 이미지 만들기", en: "Create an anchor in Gen Studio" }} />
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-border bg-background px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-semibold text-primary">
              <Lang
                text={{
                  ko: `현재 단계: ${currentStep}. ${currentStep === 1 ? "기준 캐릭터" : "스타일 고정"}`,
                  en: `Current step: ${currentStep}. ${currentStep === 1 ? "Character" : "Lock style"}`,
                }}
              />
            </p>
            <span className="text-xs text-muted-foreground">
              <Lang text={{ ko: `${currentStep}/4 단계`, en: `Step ${currentStep} of 4` }} />
            </span>
          </div>
        </div>
        <ol className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4" aria-label={lang({ ko: "캐릭터 제작 단계", en: "Character creation steps" })}>
          {steps.map((step) => (
            <li
              key={step.title.ko}
              aria-current={currentStep === step.number ? "step" : undefined}
              className={cn("flex items-center gap-3 p-4", currentStep === step.number ? "bg-primary/10" : "bg-background")}
            >
              <step.icon className="size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-semibold"><Lang text={step.title} /></p>
                <p className="mt-0.5 text-xs text-muted-foreground"><Lang text={step.body} /></p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <details className="rounded-xl border border-border bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold focus-visible-ring">
          <Map className="size-4 text-muted-foreground" aria-hidden />
          <Lang text={{ ko: "관리자 초기 설정·템플릿 상태", en: "Admin setup and template status" }} />
        </summary>
        <div className="border-t border-border p-4">
          <GameAssetTemplateSection templates={templates} registeredKeys={registeredKeys} busy={busy} onRefresh={onRefresh} onSeedTemplates={onSeedTemplates} />
        </div>
      </details>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-semibold"><Lang text={{ ko: "Gen Studio 결과 선택", en: "Select Gen Studio Result" }} /></h3>
            <p className="text-sm text-muted-foreground">
              <Lang text={{ ko: "이미 과금 처리된 생성 결과를 선택해 스타일 기준으로 사용합니다.", en: "Select an already billed result to use as the style anchor." }} />
            </p>
          </div>
          <div className="w-full sm:w-[28rem]">
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Input
                value={studioTemplateKey}
                onChange={(event) => onStudioTemplateKeyChange(event.target.value)}
                placeholder={lang({ ko: "에셋 ID·템플릿·프롬프트 검색", en: "Search asset ID, template, or prompt" })}
                aria-label={lang({ ko: "Gen Studio 결과 검색", en: "Search Gen Studio results" })}
              />
              <Button variant="outline" onClick={onLoadStudioImages} disabled={studioLoading} aria-busy={studioLoading}>
                <Search size={16} /><Lang text={{ ko: "검색", en: "Search" }} />
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <Lang text={{ ko: "에셋 ID·템플릿 키·생성 프롬프트를 부분 검색합니다.", en: "Search asset IDs, template keys, and generation prompts." }} />
            </p>
          </div>
        </div>

        {studioSearched ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <span className="font-semibold"><Lang text={{ ko: "검색 범위: 전체", en: "Search scope: all" }} /></span>
            <span><Lang text={{ ko: "다른 사용자의 이미지가 포함될 수 있습니다. 카드의 소유자 표시를 확인하세요.", en: "Images from other users may be included. Check the owner label on each card." }} /></span>
          </div>
        ) : null}

        {studioLoading ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
            <Preloader variant="spin" size="sm" />
            <Lang text={{ ko: "Gen Studio 결과를 불러오는 중입니다.", en: "Loading Gen Studio results." }} />
          </div>
        ) : !studioSearched ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            <Lang text={{ ko: "검색 전입니다. 에셋 ID·템플릿·프롬프트를 입력하고 검색하세요.", en: "No search yet. Enter an asset ID, template, or prompt and search." }} />
          </div>
        ) : studioImages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            <p><Lang text={{ ko: "검색 결과가 없습니다.", en: "No results found." }} /></p>
            <p className="mt-1 text-xs">
              <Lang text={{ ko: "다른 키워드나 아래 예시를 사용해 다시 검색해 보세요.", en: "Try another keyword or one of the examples below." }} />
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {studioSearchSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="min-h-11 rounded-full border border-border px-3 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary focus-visible-ring"
                  onClick={() => onStudioTemplateKeyChange(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {studioImages.map((image) => (
              <article key={image.assetId} className="rounded-lg border border-border bg-background p-2">
                <button type="button" onClick={() => onSelectStudioImage(image)} className="block w-full rounded-md text-left transition hover:outline hover:outline-1 hover:outline-primary focus-visible-ring">
                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-md bg-muted">
                    <ImageBox src={image.url} alt={image.assetId} minWidth={120} maxWidth={240} minHeight={120} maxHeight={160} />
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold">{image.templateKey || image.modelName || image.assetId}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-full border border-border px-2 py-0.5 text-xxs text-muted-foreground">
                      <Lang
                        text={
                          image.isOwner === true
                            ? { ko: "내 이미지", en: "My image" }
                            : image.isOwner === false
                              ? { ko: "다른 사용자", en: "Other user" }
                              : { ko: "소유자 미확인", en: "Owner unknown" }
                        }
                      />
                    </span>
                    <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xxs text-primary">
                      <Lang text={{ ko: "스타일 기준용", en: "Style anchor" }} />
                    </span>
                  </div>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xxs text-muted-foreground" title={image.assetId}>{image.assetId}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 shrink-0 gap-1.5 px-2 text-xs"
                    onClick={() => void handleCopyStudioAssetId(image.assetId)}
                    aria-label={lang({ ko: `${image.assetId} assetId 복사`, en: `Copy asset ID ${image.assetId}` })}
                  >
                    {copiedStudioAssetId === image.assetId ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    <Lang text={copiedStudioAssetId === image.assetId ? { ko: "복사됨", en: "Copied" } : { ko: "복사", en: "Copy" }} />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {sourceUrl ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold"><Lang text={{ ko: "스타일 기준 이미지 선택됨", en: "Style anchor selected" }} /></p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{sourceImageAssetId || sourceUrl}</p>
            </div>
            <Button variant="outline" onClick={onOpenDrawing} disabled={drawingSaving} className="min-h-11 shrink-0">
              <Paintbrush className="size-4" /><Lang text={{ ko: "드로잉으로 보정", en: "Edit in Drawing" }} />
            </Button>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-4">
          <h3 className="font-semibold"><Lang text={{ ko: "8방향 스프라이트 만들기", en: "Create an 8-direction sprite" }} /></h3>
          <p className="text-sm text-muted-foreground">
            <Lang text={{ ko: "걷기를 기본으로 만들고, 필요하면 뛰기·공격·방어·쓰러지기 또는 직접 정의한 동작을 추가하세요.", en: "Start with walk, then add run, attack, defend, down, or a custom action when needed." }} />
          </p>
        </div>
        <SpritePipelinePanel
          anchorImageAssetId={sourceImageAssetId}
          anchorSourceUrl={sourceImageAssetId ? undefined : sourceUrl}
          studioImages={studioImages}
          studioSearched={studioSearched}
          studioLoading={studioLoading}
          onSelectStudioImage={onSelectStudioImage}
        />
      </section>
    </>
  );
}
