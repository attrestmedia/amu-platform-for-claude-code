"use client";

import { useState } from "react";
import { Preloader } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import {
  CHARACTER_ANCHOR_GENERATION_TEMPLATE_KEYS,
  CHARACTER_ANCHOR_RECOMMENDED_DESCRIPTION,
  CHARACTER_ANCHOR_RECOMMENDED_TEMPLATE_KEYS,
  isCharacterAnchorGenerationTemplateKey,
} from "consts/game/characterAnchorTemplates";
import { toErrorMessage } from "utils/common";
import type { ImagePromptMetaType, ImageStudioDoneMetaType } from "types/app";

export type CharacterTemplateGenerationSource = {
  key: string;
  sourceType: "new";
  assetId: string;
  url: string;
  label: string;
  templateKey: string;
};

/**
 * @docHint
 * @purpose Gen Studio 템플릿으로 캐릭터 기준 컷을 생성하고 사용자가 결과를 선택
 * @process 허용 템플릿 갤러리  생성 결과 검증  사용자 기준 컷 선택
 * @domain game.user-character
 * @scope user-client
 */
export function CharacterTemplateGeneration({
  universeId,
  speciesLabel,
  selectedKey,
  onSelect,
  onGeneratingChange,
}: {
  universeId: string;
  speciesLabel: { ko: string; en: string };
  selectedKey?: string;
  onSelect: (source: CharacterTemplateGenerationSource) => void;
  onGeneratingChange: (generating: boolean) => void;
}) {
  const [sources, setSources] = useState<CharacterTemplateGenerationSource[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | { ko: string; en: string } | null>(null);

  const handleGenerationDone = (
    _images: string[],
    _coins?: number,
    meta?: ImageStudioDoneMetaType,
  ) => {
    setGenerating(false);
    onGeneratingChange(false);
    const templateKey = meta?.templateKey;
    if (!isCharacterAnchorGenerationTemplateKey(templateKey)) {
      setSources([]);
      setGenerationError({
        ko: "캐릭터 기준 컷용 템플릿에서 만든 결과만 사용할 수 있어요.",
        en: "Only results from a character anchor template can be used.",
      });
      return;
    }

    const nextSources = (meta?.assets || [])
      .filter((asset): asset is ImagePromptMetaType & { assetId: string; url: string } => Boolean(asset.assetId && asset.url))
      .map((asset) => ({
        key: `new:${asset.assetId}`,
        sourceType: "new" as const,
        assetId: asset.assetId,
        url: asset.url,
        label: meta?.templateTitle || "새 캐릭터",
        templateKey,
      }));

    setSources(nextSources);
    if (nextSources.length === 0) {
      setGenerationError("생성 결과를 선택할 수 있는 자산 정보를 받지 못했습니다.");
      return;
    }
    setGenerationError(null);
  };

  const handleGenerationFailed = (errorCode: string) => {
    setGenerating(false);
    onGeneratingChange(false);
    setGenerationError(toErrorMessage(errorCode, "새 캐릭터 이미지를 만들지 못했습니다."));
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-background p-4" aria-labelledby="character-template-generation-title" aria-busy={generating}>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold" id="character-template-generation-title">
          <Lang text={{ ko: "Gen Studio 템플릿으로 기준 컷 만들기", en: "Create an anchor cut with a Gen Studio template" }} />
        </h3>
        <p className="text-sm leading-6 text-secondary-text">
          <Lang
            text={{
              ko: `Universe ${universeId}에 선택한 종족(${speciesLabel.ko})으로 등록돼요. 템플릿 안의 인물 설명은 생성 결과에만 반영돼요.`,
              en: `This character will be registered in Universe ${universeId} as ${speciesLabel.en}. Character details in the template affect the generated image only.`,
            }}
          />
        </p>
      </div>

      <ImageStudioEditor
        mode="user"
        surface="embedded"
        detailPresentation="embedded"
        allowedTemplateKeys={CHARACTER_ANCHOR_GENERATION_TEMPLATE_KEYS}
        recommendedTemplateKeys={CHARACTER_ANCHOR_RECOMMENDED_TEMPLATE_KEYS}
        recommendedTemplateDescription={CHARACTER_ANCHOR_RECOMMENDED_DESCRIPTION}
        onGenerationStarted={() => {
          setGenerating(true);
          onGeneratingChange(true);
          setGenerationError(null);
        }}
        onGenerationFailed={({ errorCode }) => handleGenerationFailed(errorCode)}
        onDone={handleGenerationDone}
      />

      {generating ? (
        <div className="flex min-h-11 items-center" aria-live="polite">
          <Preloader
            variant="spin"
            size="sm"
            text={<Lang text={{ ko: "캐릭터 기준 컷을 생성하고 있어요.", en: "Generating your character anchor cut." }} />}
          />
        </div>
      ) : null}

      {generationError ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {typeof generationError === "string" ? generationError : <Lang text={generationError} />}
        </p>
      ) : null}

      {sources.length > 0 ? (
        <section className="space-y-3" aria-labelledby="character-anchor-results-title">
          <div>
            <h4 className="text-sm font-semibold" id="character-anchor-results-title">
              <Lang text={{ ko: "생성 결과에서 기준 컷 선택", en: "Choose an anchor cut from the results" }} />
            </h4>
            <p className="mt-1 text-xs leading-5 text-secondary-text">
              <Lang text={{ ko: "결과를 확인한 뒤 선택한 이미지가 기준 컷으로 적용됩니다.", en: "Review the results; only the image you choose will be applied as the anchor cut." }} />
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sources.map((source) => {
              const selected = selectedKey === source.key;
              return (
                <button
                  key={source.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(source)}
                  className={`min-h-11 overflow-hidden rounded-xl border text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-surface hover:border-primary/60"}`}
                >
                  <span
                    role="img"
                    aria-label={source.label}
                    className="block aspect-[4/3] w-full bg-cover bg-center"
                    style={{ backgroundImage: `url("${source.url.replace(/"/g, "%22")}")` }}
                  />
                  <span className="block px-3 py-2 text-sm font-semibold">
                    <Lang text={{ ko: selected ? "기준 컷으로 선택됨" : "이 이미지를 기준 컷으로 선택", en: selected ? "Selected as anchor cut" : "Choose this image as the anchor cut" }} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
