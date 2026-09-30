"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, Wand2, X } from "lucide-react";
import { Button, Input, Label, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";
import fetchClient from "libs/api/fetchClient";
import { listStudioImageMetas } from "libs/api/lab/imagePrompts";
import { listTutorsPersonas } from "libs/api/tutors/personas";
import { readPersonaReferenceSlots } from "libs/server-utils/character/personaReferenceSetAdapter";
import {
  createMyGameCharacter,
  getMyPersonalCharacterJoinContext,
  getMyGameCharacterGenesisOptions,
  listMyFailedGameCharacterAnchorIds,
  runMyGameCharacterPipelineAction,
} from "libs/api/game";
import { listStudioImageTemplatePreviewMetas } from "libs/api/lab";
import { toErrorMessage } from "utils/common";
import type { ImagePromptMetaType, ImageStudioDoneMetaType } from "types/app";
import type { PersonaFormValuesType } from "types/ai";
import type { ICharacterReferenceKit } from "types/character";
import type { UserGameCharacterSourceType } from "types/game";
import type { CharacterSpeciesId } from "consts/game/characterGenesisPolicy";
import { CHARACTER_GENESIS_STAGES } from "types/ui/characterGenesis";
import { CharacterGenesisOptionsPanel } from "./CharacterGenesisOptionsPanel";
import { trackPlayEvent } from "utils/analytics/play";
import {
  CHARACTER_STARTER_PRESETS,
  CHARACTER_STARTER_PRESET_TEMPLATE_KEY,
  type CharacterStarterPresetType,
} from "consts/game/characterStarterPresets";
import { CostConfirmDialog } from "components/module/game/forge/shared/CostConfirmDialog";
import { MethodStarterPresets } from "components/module/game/forge/steps/character/MethodStarterPresets";
import { MethodTemplateGrid } from "components/module/game/forge/steps/character/MethodTemplateGrid";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import {
  isAnchorCandidate,
  isCharacterCandidate,
} from "components/module/game/forge/steps/character/characterSourceModel";
import type { CharacterRegisterSource } from "components/module/game/forge/steps/character/MethodTemplateGrid";

type SourceTabType = "gen-studio" | "new" | "upload";
type SelectedSourceType = {
  key: string;
  sourceType: UserGameCharacterSourceType;
  assetId?: string;
  personaId?: string;
  referenceKitId?: string;
  url: string;
  label: string;
  speciesId?: CharacterSpeciesId;
};

function ReferenceKitSourceGrid({
  sources,
  selectedKey,
  failedKeys,
  onSelect,
}: {
  sources: SelectedSourceType[];
  selectedKey: string;
  failedKeys: Set<string>;
  onSelect: (source: SelectedSourceType) => void;
}) {
  if (!sources.length) return null;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-background p-4" aria-labelledby="reference-kit-sources-title">
      <div>
        <p className="text-sm font-semibold" id="reference-kit-sources-title">
          <Lang text={{ ko: "레퍼런스 킷", en: "Reference kits" }} />
        </p>
        <p className="mt-1 text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "운영자가 준비한 캐릭터 레퍼런스를 기준 이미지로 사용할 수 있어요.",
              en: "Use an operator-prepared character reference as your anchor image.",
            }}
          />
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sources.map((source) => {
          const selected = selectedKey === source.key;
          const failed = Boolean(source.assetId && failedKeys.has(source.assetId));
          return (
            <button
              key={source.key}
              type="button"
              onClick={() => onSelect(source)}
              aria-pressed={selected}
              aria-label={source.label}
              className={`group relative min-h-11 overflow-hidden rounded-xl border bg-surface text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/60"}`}
            >
              <span
                role="img"
                aria-label={source.label}
                className="relative block aspect-square w-full bg-muted bg-cover bg-center"
                style={{ backgroundImage: `url("${source.url.replace(/"/g, "%22")}")` }}
              >
                <span className="absolute bottom-2 left-2 rounded-full bg-background/90 px-2 py-1 text-xxs font-medium">
                  <Lang text={{ ko: "레퍼런스", en: "Reference" }} />
                </span>
                {failed ? (
                  <span className="absolute left-2 top-2 rounded bg-danger px-2 py-1 text-xxs font-semibold text-white">
                    <Lang text={{ ko: "이전 실패", en: "Failed before" }} />
                  </span>
                ) : null}
              </span>
              <span className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">{source.label}</span>
                {selected ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function studioSource(meta: ImagePromptMetaType): SelectedSourceType {
  return {
    key: `gen-studio:${meta.assetId}`,
    sourceType: "gen-studio",
    assetId: meta.assetId,
    url: meta.url,
    label: "캐릭터 이미지",
  };
}

function tutorSource(persona: PersonaFormValuesType): SelectedSourceType | null {
  const url = readPersonaReferenceSlots(persona.profiles).slots.profile || "";
  const personaId = String(persona.pid || "").trim();
  if (!url || !personaId) return null;
  return {
    key: `tutors-profile:${personaId}:${url}`,
    sourceType: "tutors-profile",
    personaId,
    url,
    label: String(persona.name || "Tutor"),
    speciesId: persona.personaType === "monster" ? "monster" : "human",
  };
}

function referenceKitSource(kit: ICharacterReferenceKit): SelectedSourceType | null {
  const image = [kit.images?.profile, kit.images?.frontFullBody].find(
    (candidate) => Boolean(candidate?.assetId && candidate.url),
  );
  if (!image?.assetId || !image.url) return null;
  const label = String(kit.displayName || kit.name || "Reference kit").trim() || "Reference kit";
  return {
    key: `reference-kit:${kit.kitId}:${image.assetId}`,
    sourceType: "reference-kit",
    referenceKitId: kit.kitId,
    assetId: image.assetId,
    url: image.url,
    label,
  };
}

/**
 * @docHint
 * @purpose 사용자가 자기 이미지로 8방향 캐릭터를 만드는 단계형 화면
 * @process 소유 이미지 선택  기준 컷 확정  사용자 pipeline wrapper 실행  다음 단계 이동
 * @domain game.user-character
 * @scope user-client
 */
export function UserCharacterStudio({
  universeId,
  embedded = false,
}: {
  universeId: string;
  embedded?: boolean;
}) {
  const { isAdministrator } = useUserData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMethod = searchParams.get("method");
  const initialSourceTab: SourceTabType = requestedMethod === "upload"
    ? "upload"
    : requestedMethod === "new"
      ? "new"
      : "gen-studio";
  const [sourceTab, setSourceTab] = useState<SourceTabType>(initialSourceTab);
  const [selectedSource, setSelectedSource] = useState<SelectedSourceType | null>(null);
  const [name, setName] = useState("");
  const [speciesId, setSpeciesId] = useState<CharacterSpeciesId>("human");
  const [primaryAttributeId, setPrimaryAttributeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingStarterPreset, setPendingStarterPreset] = useState<CharacterStarterPresetType | null>(null);
  const [starterEditorPreset, setStarterEditorPreset] = useState<CharacterStarterPresetType | null>(null);
  const [starterResultPreset, setStarterResultPreset] = useState<CharacterStarterPresetType | null>(null);
  const [starterResultSources, setStarterResultSources] = useState<SelectedSourceType[]>([]);
  const [activeStarterKey, setActiveStarterKey] = useState("");
  const [error, setError] = useState("");

  const imagesQuery = useQuery({
    queryKey: ["character-studio-images"],
    queryFn: () => listStudioImageMetas({ scope: "user", limit: 36 }),
    staleTime: 30_000,
    retry: 1,
  });
  const tutorsQuery = useQuery({
    queryKey: ["character-studio-tutors"],
    queryFn: listTutorsPersonas,
    staleTime: 30_000,
    retry: 1,
  });
  const referenceKitsQuery = useQuery<{ kits: ICharacterReferenceKit[] }>({
    queryKey: ["character-reference-kits", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<{ data?: { kits?: ICharacterReferenceKit[] } }>(
        `/universe/${universeId}/character-reference-kits?limit=80`,
        { responseType: "auto", cache: "no-store" },
      );
      return { kits: response?.data?.data?.kits || [] };
    },
    enabled: Boolean(universeId && isAdministrator),
    staleTime: 30_000,
    retry: false,
  });
  const failedAnchorsQuery = useQuery({
    queryKey: ["my-game-character-failed-anchors", universeId],
    queryFn: () => listMyFailedGameCharacterAnchorIds({ universeId }),
    staleTime: 10_000,
    retry: 1,
  });
  const genesisOptionsQuery = useQuery({
    queryKey: ["my-game-character-genesis-options", universeId],
    queryFn: () => getMyGameCharacterGenesisOptions(universeId),
    enabled: Boolean(universeId),
    staleTime: 60_000,
    retry: false,
  });
  const starterPreviewQuery = useQuery({
    queryKey: ["character-starter-previews"],
    queryFn: () => listStudioImageTemplatePreviewMetas({
      templateKeys: [CHARACTER_STARTER_PRESET_TEMPLATE_KEY],
      perTemplate: 3,
    }),
    staleTime: 60_000,
    retry: 1,
  });

  const imageSources = useMemo(
    () => (imagesQuery.data || [])
      .filter(isAnchorCandidate)
      .filter(isCharacterCandidate)
      .slice(0, 12)
      .map(studioSource),
    [imagesQuery.data],
  );
  const tutorSources = useMemo(
    () => (tutorsQuery.data || [])
      .map(tutorSource)
      .filter((item): item is SelectedSourceType => Boolean(item)),
    [tutorsQuery.data],
  );
  const referenceKitSources = useMemo(
    () => (referenceKitsQuery.data?.kits || [])
      .filter((kit) => kit.status !== "archived")
      .map(referenceKitSource)
      .filter((item): item is SelectedSourceType => Boolean(item)),
    [referenceKitsQuery.data?.kits],
  );
  const failedAnchorIdSet = useMemo(
    () => new Set(failedAnchorsQuery.data || []),
    [failedAnchorsQuery.data],
  );
  const sourceLoadError = imagesQuery.error || tutorsQuery.error || failedAnchorsQuery.error || referenceKitsQuery.error;
  const templateSources = useMemo(
    () => [...imageSources, ...tutorSources].slice(0, 12),
    [imageSources, tutorSources],
  );
  const starterPreviewUrls = useMemo(() => {
    const items = starterPreviewQuery.data?.[CHARACTER_STARTER_PRESET_TEMPLATE_KEY] || [];
    return items.reduce<Record<string, string>>((acc, item, index) => {
      if (item.url) acc[CHARACTER_STARTER_PRESETS[index]?.key || ""] = item.url;
      return acc;
    }, {});
  }, [starterPreviewQuery.data]);

  const chooseSource = (source: SelectedSourceType) => {
    setSelectedSource(source);
    if (source.speciesId) setSpeciesId(source.speciesId);
    if (!name.trim()) setName(source.label.slice(0, 40));
    setError("");
  };

  const confirmAnchor = async () => {
    if (!selectedSource || !name.trim()) return;
    setBusy(true);
    setError("");
    trackPlayEvent("character_create_start", {
      universeId,
      sourceType: selectedSource.sourceType,
    });
    try {
      const { character } = await createMyGameCharacter({
        universeId,
        name: name.trim(),
        sourceType: selectedSource.sourceType,
        sourceImageAssetId: selectedSource.assetId,
        sourcePersonaId: selectedSource.personaId,
        sourceReferenceKitId: selectedSource.referenceKitId,
        sourceImageUrl: selectedSource.sourceType === "tutors-profile" ? selectedSource.url : undefined,
        speciesId,
        primaryAttributeId: primaryAttributeId || undefined,
      });
      await runMyGameCharacterPipelineAction(character.characterId, "prepare");
      const joinContext = await getMyPersonalCharacterJoinContext(character.characterId);
      if (joinContext.mode === "join") {
        router.push(`/assets-studio/character-join?characterId=${encodeURIComponent(character.characterId)}&universeId=${encodeURIComponent(universeId)}`);
      } else {
        router.push(`/assets-studio/world-seed?characterId=${encodeURIComponent(character.characterId)}&universeId=${encodeURIComponent(universeId)}`);
      }
    } catch (caught) {
      setError(toErrorMessage(caught, "기준 컷을 확정하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const requestStarterGeneration = (preset: CharacterStarterPresetType) => {
    setPendingStarterPreset(preset);
    trackPlayEvent("forge_cost_confirm", { universeId, outcome: "open", presetKey: preset.key });
  };

  const openStarterEditor = () => {
    const preset = pendingStarterPreset;
    if (!preset) return;
    setStarterResultPreset(null);
    setStarterResultSources([]);
    setStarterEditorPreset(preset);
    setActiveStarterKey("");
    setError("");
    trackPlayEvent("forge_cost_confirm", { universeId, outcome: "confirm", presetKey: preset.key });
    setSourceTab("new");
    setPendingStarterPreset(null);
  };

  const handleStarterGenerationDone = (
    preset: CharacterStarterPresetType,
    _images: string[],
    _coins?: number,
    meta?: ImageStudioDoneMetaType,
  ) => {
    const sources = (meta?.assets || [])
      .filter((asset): asset is ImagePromptMetaType & { assetId: string; url: string } => Boolean(asset.assetId && asset.url))
      .map((asset) => ({
        key: `new:${asset.assetId}`,
        sourceType: "new" as const,
        assetId: asset.assetId,
        url: asset.url,
        label: preset.label.ko,
        speciesId: preset.key === "companion" ? "monster" as const : "human" as const,
      }));

    setActiveStarterKey("");
    setStarterEditorPreset(null);
    if (sources.length === 0) {
      setStarterResultPreset(null);
      setStarterResultSources([]);
      setError("생성 결과를 선택할 수 있는 자산 정보를 받지 못했습니다.");
      return;
    }
    setStarterResultPreset(preset);
    setStarterResultSources(sources);
    setError("");
  };

  const handleStarterGenerationFailed = (errorCode: string) => {
    setActiveStarterKey("");
    setError(toErrorMessage(errorCode, "새 캐릭터 이미지를 만들지 못했습니다."));
  };

  if (
    imagesQuery.isLoading ||
    tutorsQuery.isLoading ||
    failedAnchorsQuery.isLoading ||
    (Boolean(isAdministrator) && referenceKitsQuery.isLoading)
  ) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Preloader
          variant="spin"
          size="lg"
          text={<Lang text={{ ko: "내 이미지와 캐릭터 소스를 불러오는 중...", en: "Loading your character sources..." }} />}
        />
      </div>
    );
  }

  return (
    <main className={embedded ? "min-h-full" : "min-h-full bg-background px-4 py-6 sm:px-6 sm:py-10"}>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {!embedded ? (
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wand2 className="h-4 w-4" aria-hidden />
                <span>AMU Play · {universeId}</span>
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">
                <Lang text={{ ko: "내 8방향 캐릭터 만들기", en: "Create my 8-direction character" }} />
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                <Lang
                  text={{
                    ko: "기준 이미지를 고른 뒤 생성 단계를 직접 확인하며 진행하세요. 같은 요청은 중복 생성·중복 과금되지 않습니다.",
                    en: "Choose an anchor image, then review each generation step. Duplicate requests are deduplicated.",
                  }}
                />
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link href={`/play/${encodeURIComponent(universeId)}/select-character`}>
                <Lang text={{ ko: "캐릭터 선택으로", en: "Back to characters" }} />
              </Link>
            </Button>
          </header>
        ) : null}

        {error || sourceLoadError ? (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error || toErrorMessage(sourceLoadError, "캐릭터 소스를 불러오지 못했습니다.")}
            {error ? (
              <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={confirmAnchor} loading={busy}>
                <Lang text={{ ko: "다시 시도", en: "Try again" }} />
              </Button>
            ) : null}
          </div>
        ) : null}

        <section
          data-character-genesis-stage={CHARACTER_GENESIS_STAGES[1]}
          className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6"
        >
          <div className="mb-5">
            <p className="text-xs font-medium text-primary">STEP 1</p>
            <h2 className="mt-1 text-xl font-semibold">
              <Lang text={{ ko: "캐릭터 등록 방법을 골라보세요", en: "Choose how to register your character" }} />
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-text">
              <Lang text={{ ko: "세 가지 방법 중 하나를 고르면 필요한 선택지만 보여드릴게요.", en: "Choose one of three methods and we will show only what you need." }} />
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { key: "template", enabled: true, label: { ko: "내 이미지에서 고르기", en: "Choose from my images" }, description: { ko: "내가 만든 이미지와 프로필에서 선택", en: "Choose from your images and profiles" } },
              { key: "new", enabled: true, label: { ko: "새 캐릭터 만들기", en: "Create a new character" }, description: { ko: "준비된 세 가지 스타일에서 선택", en: "Choose from three ready styles" } },
              { key: "upload", enabled: false, label: { ko: "이미지 업로드", en: "Upload an image" }, description: { ko: "운영 검토 기준 확정 후 제공", en: "Available after moderation policy review" } },
            ].map((method) => {
              const selected = method.enabled && ((method.key === "template" && sourceTab === "gen-studio") || (method.key === sourceTab));
              return (
                <button
                  key={method.key}
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={!method.enabled}
                  disabled={!method.enabled}
                  onClick={() => {
                    if (!method.enabled) return;
                    setSourceTab(method.key === "template" ? "gen-studio" : method.key as SourceTabType);
                    setSelectedSource(null);
                    trackPlayEvent("forge_method_select", { universeId, method: method.key });
                  }}
                  className={`min-h-20 rounded-xl border p-4 text-left transition-colors motion-reduce:transition-none ${selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : method.enabled ? "border-border bg-background hover:border-primary/60" : "border-border bg-muted/60 opacity-70"}`}
                >
                  <span className="block text-sm font-semibold"><Lang text={method.label} /></span>
                  <span className="mt-1 block text-xs leading-5 text-secondary-text"><Lang text={method.description} /></span>
                  {!method.enabled ? <span className="mt-2 inline-flex min-h-7 items-center rounded-full bg-background px-2 text-xxs font-semibold text-secondary-text"><Lang text={{ ko: "준비 중", en: "Coming soon" }} /></span> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            {sourceTab === "gen-studio" ? (
              <div className="space-y-3">
                <ReferenceKitSourceGrid
                  sources={referenceKitSources}
                  selectedKey={selectedSource?.key || ""}
                  failedKeys={failedAnchorIdSet}
                  onSelect={chooseSource}
                />
                <p className="text-sm font-semibold"><Lang text={{ ko: "캐릭터로 쓰기 좋은 이미지", en: "Images ready for a character" }} /></p>
                <MethodTemplateGrid
                  sources={templateSources as unknown as CharacterRegisterSource[]}
                  selectedKey={selectedSource?.key || ""}
                  failedKeys={failedAnchorIdSet}
                  onSelect={chooseSource}
                />
              </div>
            ) : null}

            {sourceTab === "new" ? (
              <div className="space-y-3">
                {starterEditorPreset ? (
                  <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-labelledby="starter-editor-title">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold" id="starter-editor-title">
                          <Lang text={{ ko: `${starterEditorPreset.label.ko} 스타터 생성`, en: `${starterEditorPreset.label.en} starter generation` }} />
                        </p>
                        <p className="mt-1 text-xs leading-5 text-secondary-text">
                          <Lang text={{ ko: "생성이 끝나면 결과 목록에서 기준 컷을 직접 선택하세요.", en: "After generation, choose the anchor cut from the result list." }} />
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="min-h-11 min-w-11"
                        aria-label={lang({ ko: "스타터 생성 닫기", en: "Close starter generation" })}
                        onClick={() => {
                          setStarterEditorPreset(null);
                          setActiveStarterKey("");
                        }}
                        disabled={activeStarterKey === starterEditorPreset.key}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                    <ImageStudioEditor
                      mode="user"
                      surface="embedded"
                      detailPresentation="embedded"
                      initialTemplateKey={CHARACTER_STARTER_PRESET_TEMPLATE_KEY}
                      allowedTemplateKeys={[CHARACTER_STARTER_PRESET_TEMPLATE_KEY]}
                      initialTemplateVariables={starterEditorPreset.variables}
                      requiredTemplateVariableKeys={Object.keys(starterEditorPreset.variables)}
                      lockedTemplateVariableKeys={Object.keys(starterEditorPreset.variables)}
                      allowCustomPrompt={false}
                      onGenerationStarted={() => setActiveStarterKey(starterEditorPreset.key)}
                      onGenerationFailed={({ errorCode }) => handleStarterGenerationFailed(errorCode)}
                      onDone={(images, coins, meta) => handleStarterGenerationDone(starterEditorPreset, images, coins, meta)}
                    />
                  </section>
                ) : null}

                {starterResultPreset && starterResultSources.length > 0 ? (
                  <section className="space-y-3 rounded-xl border border-border bg-background p-4" aria-labelledby="starter-result-title">
                    <div>
                      <p className="text-sm font-semibold" id="starter-result-title">
                        <Lang text={{ ko: `${starterResultPreset.label.ko} 생성 결과에서 기준 컷 선택`, en: `Choose an anchor cut from ${starterResultPreset.label.en} results` }} />
                      </p>
                      <p className="mt-1 text-xs leading-5 text-secondary-text">
                        <Lang text={{ ko: "결과를 확인한 뒤 선택한 이미지가 기준 컷으로 적용됩니다.", en: "Review the results; only the image you choose will be applied as the anchor cut." }} />
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {starterResultSources.map((source) => {
                        const selected = selectedSource?.key === source.key;
                        return (
                          <button
                            key={source.key}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => chooseSource(source)}
                            className={`min-h-11 overflow-hidden rounded-xl border text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-surface hover:border-primary/60"}`}
                          >
                            <span
                              role="img"
                              aria-label={lang({ ko: `${starterResultPreset.label.ko} 생성 결과`, en: `${starterResultPreset.label.en} generated result` })}
                              className="block aspect-[4/3] w-full bg-cover bg-center"
                              style={{ backgroundImage: `url("${source.url.replace(/"/g, "%22")}")` }}
                            />
                            <span className="block px-3 py-2 text-sm font-semibold">
                              <Lang text={{ ko: selected ? "기준 컷으로 선택됨" : "이 이미지를 기준 컷으로 선택", en: selected ? "Selected as anchor cut" : "Choose this image as anchor cut" }} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <div>
                  <p className="text-sm font-semibold"><Lang text={{ ko: "스타터 스타일", en: "Starter styles" }} /></p>
                  <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "스타일을 고르면 서버가 실행 직전 가격과 잔액을 확인합니다.", en: "The server checks price and balance immediately before running." }} /></p>
                </div>
                <MethodStarterPresets
                  presets={CHARACTER_STARTER_PRESETS}
                  previews={starterPreviewUrls}
                  activeKey={activeStarterKey}
                  onGenerate={requestStarterGeneration}
                />
              </div>
            ) : null}

            {sourceTab === "upload" ? (
              <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/60 p-5 text-center">
                <p className="text-sm font-semibold"><Lang text={{ ko: "이미지 업로드는 준비 중입니다", en: "Image upload is coming soon" }} /></p>
                <p className="text-xs leading-5 text-secondary-text"><Lang text={{ ko: "실제 인물·미성년 이미지의 운영 검토 기준과 처리 기한을 확정한 뒤 제공할 예정입니다.", en: "This will be available after the moderation rules and review timeline for real-person and minor images are finalized." }} /></p>
              </div>
            ) : null}
          </div>
        </section>

        <section
          data-character-genesis-stages={[CHARACTER_GENESIS_STAGES[0], CHARACTER_GENESIS_STAGES[2]].join(" ")}
          className="grid gap-5 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6 md:grid-cols-[180px_1fr]"
        >
          <div
            className="aspect-square overflow-hidden rounded-xl border border-dashed border-border bg-muted bg-cover bg-center"
            style={selectedSource ? { backgroundImage: `url("${selectedSource.url.replace(/"/g, "%22")}")` } : undefined}
          >
            {!selectedSource ? <span className="flex h-full items-center justify-center px-4 text-center text-sm text-secondary-text"><Lang text={{ ko: "이미지를 선택하세요", en: "Choose an image" }} /></span> : null}
          </div>
          <div className="flex flex-col justify-center space-y-4">
            <div className="space-y-2">
              <Label htmlFor="character-name-modern"><Lang text={{ ko: "캐릭터 이름", en: "Character name" }} /></Label>
              <Input
                id="character-name-modern"
                size="lg"
                aria-label={lang({ ko: "캐릭터 이름", en: "Character name" })}
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 40))}
                maxLength={40}
                placeholder="AMU Explorer"
              />
            </div>
            <CharacterGenesisOptionsPanel
              universeId={universeId}
              speciesId={speciesId}
              primaryAttributeId={primaryAttributeId}
              options={genesisOptionsQuery.data}
              disabled={busy}
              onSpeciesChange={setSpeciesId}
              onAttributeChange={setPrimaryAttributeId}
            />
            <Button onClick={confirmAnchor} loading={busy} disabled={!selectedSource || !name.trim()} className="min-h-11 w-full sm:w-fit">
              <Check className="mr-2 size-4" aria-hidden />
              <Lang text={{ ko: "캐릭터 등록하고 다음 단계로", en: "Register and continue" }} />
            </Button>
          </div>
        </section>

        <CostConfirmDialog
          open={Boolean(pendingStarterPreset)}
          onOpenChange={(open) => {
            if (!open) {
              trackPlayEvent("forge_cost_confirm", { universeId, outcome: "cancel", presetKey: pendingStarterPreset?.key });
              setPendingStarterPreset(null);
            }
          }}
          title={{ ko: "새 캐릭터 이미지를 만들까요?", en: "Create a new character image?" }}
          description={{ ko: "생성 화면에서 결과를 확인한 뒤 기준 컷을 직접 선택합니다.", en: "Open the generation screen, review the result, and choose the anchor cut yourself." }}
          actionLabel={{ ko: "생성 화면 열기", en: "Open generation" }}
          onConfirm={openStarterEditor}
          loading={Boolean(activeStarterKey)}
        />
      </div>
    </main>
  );
}
