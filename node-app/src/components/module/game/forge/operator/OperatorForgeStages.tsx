"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lang } from "components/module/i18n";
import { GameAssetInventorySummary } from "components/module/admin/game-assets/GameAssetInventorySummary";
import { GameAssetPostProductionDialog } from "components/module/admin/game-assets/GameAssetPostProductionDialog";
import { GameAssetChromaKeyDialog } from "components/module/admin/game-assets/GameAssetChromaKeyDialog";
import { GameAssetTemplateSection } from "components/module/admin/game-assets/GameAssetTemplateSection";
import { SpritePipelinePanel } from "components/module/admin/game-assets/pipeline/SpritePipelinePanel";
import { GameAssetDraftForm } from "components/module/admin/game-assets/sections/GameAssetDraftForm";
import { GameAssetList } from "components/module/admin/game-assets/sections/GameAssetList";
import { GameAssetRuntimeEditor } from "components/module/admin/game-assets/sections/GameAssetRuntimeEditor";
import { GameAssetStageAttach } from "components/module/admin/game-assets/sections/GameAssetStageAttach";
import { useAssetsStudio } from "./OperatorAssetsProvider";

export function OperatorCharacterStage() {
  const studio = useAssetsStudio();

  return (
    <div className="mx-auto flex min-w-0 w-full max-w-6xl flex-col gap-4">
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <GameAssetTemplateSection
          templates={studio.templates}
          registeredKeys={studio.registeredKeySet}
          busy={studio.loading || studio.busy}
          onRefresh={() => void studio.load()}
          onSeedTemplates={() => void studio.handleSeedTemplates()}
        />
      </section>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <GameAssetDraftForm form={studio.form} setForm={studio.setForm} busy={studio.busy} onCreate={studio.handleCreateAsset} />
        <section className="rounded-2xl border border-dashed border-border bg-surface p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-text">
            <Lang text={{ ko: "다음 단계", en: "Next step" }} />
          </p>
          <h2 className="mt-2 text-lg font-semibold">
            <Lang text={{ ko: "드래프트를 만든 뒤 8방향 스프라이트를 생성하세요", en: "Create a draft, then generate an 8-direction sprite" }} />
          </h2>
          <p className="mt-2 text-sm leading-6 text-secondary-text">
            <Lang
              text={{
                ko: "템플릿은 기존 Gen Studio 생성·과금 파이프라인을 사용합니다. 기준 이미지와 드래프트를 준비하면 다음 단계에서 파이프라인을 실행할 수 있습니다.",
                en: "Templates use the existing Gen Studio generation and billing pipeline. Prepare an anchor and draft before running the pipeline in the next step.",
              }}
            />
          </p>
          <Link href="/assets-studio/sprite" className="mt-4 inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary focus-visible-ring">
            <Lang text={{ ko: "스프라이트 단계로 이동", en: "Go to sprite stage" }} />
          </Link>
        </section>
      </section>
    </div>
  );
}

export function OperatorMasterSheetStage() {
  return (
    <section className="mx-auto min-w-0 w-full max-w-6xl rounded-2xl border border-dashed border-border bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-text">
        <Lang text={{ ko: "운영자 작업 안내", en: "Operator workflow note" }} />
      </p>
      <h1 className="mt-2 text-xl font-bold text-primary-text sm:text-2xl">
        <Lang text={{ ko: "방향 시트는 스프라이트 파이프라인 안에서 처리합니다", en: "Direction sheet work is handled inside the sprite pipeline" }} />
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-text">
        <Lang
          text={{
            ko: "운영자 에셋의 방향 시트는 별도 운영자 화면으로 분리하지 않습니다. 기준 이미지를 선택한 뒤 8방향 스프라이트 단계에서 파이프라인을 이어가세요.",
            en: "Operator direction-sheet work is not exposed as a separate operator screen. Choose an anchor and continue in the 8-direction sprite pipeline.",
          }}
        />
      </p>
      <Link href="/assets-studio/sprite" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible-ring">
        <Lang text={{ ko: "스프라이트 단계로 이동", en: "Go to sprite stage" }} />
      </Link>
    </section>
  );
}

export function OperatorSpriteStage() {
  const studio = useAssetsStudio();
  const searchParams = useSearchParams();
  const routeAssetId = searchParams.get("assetId") || "";
  const anchor = studio.form.sourceImageAssetId || studio.form.storageUrl || routeAssetId;

  return (
    <div className="mx-auto flex min-w-0 w-full max-w-6xl flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Lang text={{ ko: "운영자 기준 이미지", en: "Operator anchor" }} />
          </p>
          <p className="mt-1 truncate text-sm font-semibold">{anchor || <Lang text={{ ko: "아직 기준 이미지가 선택되지 않았습니다.", en: "No anchor image selected yet." }} />}</p>
          <p className="mt-1 text-xs text-secondary-text">
            <Lang text={{ ko: "기준 이미지와 파이프라인 입력은 이 단계에서 확인합니다.", en: "Review the anchor and pipeline inputs in this stage." }} />
          </p>
        </div>
        <Link href="/assets-studio/character" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-primary/30 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible-ring">
          <Lang text={{ ko: "드래프트 단계로 돌아가기", en: "Back to draft stage" }} />
        </Link>
      </section>
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <SpritePipelinePanel anchorImageAssetId={studio.form.sourceImageAssetId || routeAssetId} anchorSourceUrl={studio.form.storageUrl} studioImages={[]} studioSearched={false} />
      </section>
    </div>
  );
}

export function OperatorWorldStage() {
  const studio = useAssetsStudio();

  return (
    <div className="mx-auto flex min-w-0 w-full max-w-6xl flex-col gap-4">
      <GameAssetInventorySummary inventory={studio.inventory} universeId={studio.listFilters.universeId} scope={studio.listFilters.scope} />
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <GameAssetList
          assets={studio.assets}
          selectedAssetId={studio.selectedAssetId}
          onSelectAsset={studio.setSelectedAssetId}
          filters={studio.listFilters}
          onFiltersChange={studio.setListFilters}
          onStatusChange={studio.runtimeEditor.changeStatus}
          busy={studio.busy}
        />
      </section>
    </div>
  );
}

export function OperatorReviewStage() {
  const studio = useAssetsStudio();

  return (
    <div className="mx-auto flex min-w-0 w-full max-w-6xl flex-col gap-4">
      <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          <Lang text={{ ko: "검수·적용", en: "Review and apply" }} />
        </p>
        <h1 className="mt-1 text-xl font-bold text-primary-text sm:text-2xl">
          <Lang text={{ ko: "게임 에셋을 검수하고 스테이지에 적용하세요", en: "Review game assets and apply them to a stage" }} />
        </h1>
      </section>
      <GameAssetInventorySummary inventory={studio.inventory} universeId={studio.listFilters.universeId} scope={studio.listFilters.scope} />
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <GameAssetList
          assets={studio.assets}
          selectedAssetId={studio.selectedAssetId}
          onSelectAsset={studio.setSelectedAssetId}
          filters={studio.listFilters}
          onFiltersChange={studio.setListFilters}
          onStatusChange={studio.runtimeEditor.changeStatus}
          busy={studio.busy}
        />
        <GameAssetStageAttach
          key={studio.selectedAsset?.gameAssetId || "no-selected-asset"}
          asset={studio.selectedAsset}
          stages={studio.runtimeEditor.stageOptions}
          loading={studio.runtimeEditor.targetLoading}
          busy={studio.busy}
          onLoadStages={() => void studio.runtimeEditor.loadStageTargets()}
          onAttach={(stageDocumentId) => void studio.runtimeEditor.attachToStage(stageDocumentId)}
        />
        <GameAssetRuntimeEditor
          selectedAsset={studio.selectedAsset}
          editor={studio.runtimeEditor}
          projectionMetaValidation={studio.projectionMetaValidation}
          busy={studio.busy}
          onOpenPostProduction={() => studio.setPostProductionOpen(true)}
          onOpenChromaKey={() => studio.setChromaKeyOpen(true)}
        />
      </section>
      <GameAssetPostProductionDialog
        open={studio.postProductionOpen}
        asset={studio.selectedAsset}
        onOpenChange={studio.setPostProductionOpen}
        onSaved={studio.load}
      />
      <GameAssetChromaKeyDialog
        open={studio.chromaKeyOpen}
        asset={studio.selectedAsset}
        onOpenChange={studio.setChromaKeyOpen}
        onSaved={studio.load}
      />
    </div>
  );
}
