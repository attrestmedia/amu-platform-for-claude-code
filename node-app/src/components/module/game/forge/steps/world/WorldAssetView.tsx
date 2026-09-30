"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Coins, Image as ImageIcon, RefreshCw, Shield, Sparkles } from "lucide-react";
import { Button, Preloader } from "@amu-labs/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Lang, lang } from "components/module/i18n";
import {
  createWorldAsset,
  getWorldAssetGenerationQuote,
  listWorldAssets,
  type WorldAssetGenerationQuote,
} from "libs/api/game";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import {
  WORLD_ASSET_CATEGORIES,
  WORLD_ASSET_CATEGORY_PRESETS,
  type WorldAssetCategoryKey,
  type WorldAssetPresetType,
} from "consts/game/worldAssetCatalog";
import { toErrorMessage } from "utils/common";
import { trackPlayEvent } from "utils/analytics/play";
import { CostConfirmDialog } from "../../shared/CostConfirmDialog";
import { WorldCategoryGrid } from "./WorldCategoryGrid";
import { WorldPresetPicker } from "./WorldPresetPicker";

const PAGE_SIZE = 8;
type ReadyCategoryKey = Exclude<WorldAssetCategoryKey, "effect" | "etc">;
const READY_CATEGORY_KEYS = WORLD_ASSET_CATEGORIES.filter(({ key }) => key !== "effect" && key !== "etc").map(({ key }) => key) as Array<ReadyCategoryKey>;

function isReadyCategory(value: string | null): value is ReadyCategoryKey {
  return Boolean(value && READY_CATEGORY_KEYS.includes(value as ReadyCategoryKey));
}

function newClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `forge-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function assetCategory(asset: { categories?: string[]; assetType?: string }) {
  return String(asset.categories?.[0] || asset.assetType || "object").trim().toLowerCase();
}

export function WorldAssetView({ universeId = DEFAULT_PLAY_UNIVERSE }: { universeId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const requestedCategory = searchParams.get("category");
  const initialCategory: ReadyCategoryKey = isReadyCategory(requestedCategory) ? requestedCategory : "building";
  const [categoryKey, setCategoryKey] = useState<ReadyCategoryKey>(initialCategory);
  const [selectedPresetKey, setSelectedPresetKey] = useState(WORLD_ASSET_CATEGORY_PRESETS[initialCategory][0]?.key || "");
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [latestAsset, setLatestAsset] = useState<Awaited<ReturnType<typeof createWorldAsset>>["asset"] | null>(null);

  const presets = WORLD_ASSET_CATEGORY_PRESETS[categoryKey];
  const selectedPreset = useMemo<WorldAssetPresetType | undefined>(
    () => presets.find((preset) => preset.key === selectedPresetKey),
    [presets, selectedPresetKey],
  );
  const quoteQuery = useQuery<WorldAssetGenerationQuote>({
    queryKey: ["forge-world-asset-quote", categoryKey, selectedPresetKey],
    queryFn: () => getWorldAssetGenerationQuote({ categoryKey, presetKey: selectedPresetKey }),
    enabled: Boolean(selectedPresetKey),
    staleTime: 30_000,
    retry: 1,
  });
  const assetsQuery = useQuery({
    queryKey: ["forge-world-assets", universeId, categoryKey, page],
    queryFn: () => listWorldAssets({ universeId, category: categoryKey, page, pageSize: PAGE_SIZE }),
    staleTime: 15_000,
    retry: 1,
  });

  const allAssetsQuery = useQuery({
    queryKey: ["forge-world-assets-counts", universeId],
    queryFn: () => listWorldAssets({ universeId, page: 1, pageSize: 100 }),
    staleTime: 15_000,
    retry: 1,
  });
  const counts = useMemo(() => {
    const next: Partial<Record<WorldAssetCategoryKey, number>> = {};
    for (const asset of allAssetsQuery.data?.data || []) {
      const key = assetCategory(asset) as WorldAssetCategoryKey;
      next[key] = (next[key] || 0) + 1;
    }
    return next;
  }, [allAssetsQuery.data?.data]);

  const handleCategorySelect = (next: WorldAssetCategoryKey) => {
    if (!isReadyCategory(next)) return;
    setCategoryKey(next);
    setSelectedPresetKey(WORLD_ASSET_CATEGORY_PRESETS[next][0]?.key || "");
    setPage(1);
    setError("");
    router.replace(`/assets-studio/world?category=${encodeURIComponent(next)}`, { scroll: false });
  };

  const handlePresetSelect = (preset: WorldAssetPresetType) => {
    setSelectedPresetKey(preset.key);
    setError("");
  };

  const openConfirm = () => {
    if (!selectedPreset || !quoteQuery.data) return;
    setError("");
    setConfirmOpen(true);
    trackPlayEvent("forge_cost_confirm", {
      universeId,
      category: categoryKey,
      presetKey: selectedPreset.key,
      quotedCoins: quoteQuery.data.quotedCoins,
      action: "world_asset_generate",
    });
  };

  const handleGenerate = async () => {
    if (!selectedPreset || !quoteQuery.data || generating) return;
    setGenerating(true);
    setError("");
    try {
      const result = await createWorldAsset({
        universeId,
        categoryKey,
        presetKey: selectedPreset.key,
        clientRequestId: newClientRequestId(),
      });
      setLatestAsset(result.asset);
      setConfirmOpen(false);
      await Promise.all([
        assetsQuery.refetch(),
        allAssetsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["userData"] }),
      ]);
      trackPlayEvent("forge_world_asset_generate", {
        universeId,
        category: categoryKey,
        presetKey: selectedPreset.key,
        quotedCoins: result.quote.quotedCoins,
        action: result.replayed ? "replay" : "generate",
        outcome: "success",
      });
    } catch (cause) {
      const message = toErrorMessage(cause, lang({ ko: "월드 에셋을 생성하지 못했습니다.", en: "Failed to generate the world asset." }));
      setError(message);
      trackPlayEvent("forge_world_asset_generate", {
        universeId,
        category: categoryKey,
        presetKey: selectedPreset.key,
        quotedCoins: quoteQuery.data.quotedCoins,
        action: "generate",
        outcome: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  const listError = assetsQuery.error ? toErrorMessage(assetsQuery.error, lang({ ko: "내 에셋을 불러오지 못했습니다.", en: "Failed to load your assets." })) : "";
  const assets = assetsQuery.data?.data || [];
  const pagination = assetsQuery.data?.pagination;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-text">STEP 4 · WORLD ASSETS</p>
          <h1 className="mt-2 text-2xl font-bold text-primary-text sm:text-3xl">
            <Lang text={{ ko: "월드 에셋 라이브러리", en: "World asset library" }} />
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-text">
            <Lang text={{ ko: "기본 에셋은 자유롭게 조합하고, 원하는 것이 없을 때만 AI로 새 에셋을 만드세요.", en: "Compose with the library freely, then create a new asset with AI when you need something unique." }} />
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-primary-text">
          <Shield className="size-4 shrink-0 text-accent" aria-hidden />
          <Lang text={{ ko: "조회·재사용·맵 배치는 무료", en: "Browse, reuse, and map placement are free" }} />
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <WorldCategoryGrid selectedKey={categoryKey} counts={counts} onSelect={handleCategorySelect} />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <WorldPresetPicker
          categoryKey={categoryKey}
          selectedPresetKey={selectedPresetKey}
          quote={quoteQuery.data}
          quoteLoading={quoteQuery.isFetching}
          onSelect={handlePresetSelect}
        />
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Coins className="mt-0.5 size-5 shrink-0 text-[color:var(--coin)]" aria-hidden />
            <p className="text-xs leading-5 text-secondary-text">
              <Lang text={{ ko: "AI 생성·재생성·AI 편집만 서버 모델 견적만큼 차감합니다. 고정 월드 에셋 단가는 없습니다.", en: "Only AI create, regenerate, and edit use the server model quote. There is no fixed world-asset price." }} />
            </p>
          </div>
          <Button className="min-h-11 shrink-0" onClick={openConfirm} disabled={!quoteQuery.data || quoteQuery.isFetching || generating} loading={quoteQuery.isFetching}>
            <Sparkles className="mr-2 size-4" aria-hidden />
            <Lang text={{ ko: quoteQuery.data ? "이 견적으로 생성하기" : "서버 견적 확인 중", en: quoteQuery.data ? "Generate with this quote" : "Checking server quote" }} />
          </Button>
        </div>
        {quoteQuery.error ? <p className="mt-3 text-sm text-destructive" role="alert">{toErrorMessage(quoteQuery.error, lang({ ko: "서버 견적을 확인하지 못했습니다.", en: "Failed to check the server quote." }))}</p> : null}
      </section>

      {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</p> : null}

      {latestAsset ? (
        <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5 sm:p-6" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary-text">
            <Check className="size-4 text-accent" aria-hidden />
            <Lang text={{ ko: "내 에셋에 저장되었습니다", en: "Saved to my assets" }} />
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
              {latestAsset.storage?.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL from the game asset API
                <img src={latestAsset.storage.url} alt={latestAsset.name} className="h-full w-full object-contain" />
              ) : <ImageIcon className="size-8 text-secondary-text" aria-hidden />}
            </div>
            <div>
              <h2 className="font-semibold text-primary-text">{latestAsset.name}</h2>
              <p className="mt-1 text-sm text-secondary-text"><Lang text={{ ko: "드래프트 상태로 저장되어 맵 배치에서 재사용할 수 있습니다.", en: "Saved as a draft and ready to reuse in map placement." }} /></p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="world-asset-mini-library-title">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 id="world-asset-mini-library-title" className="text-lg font-bold text-primary-text">
              <Lang text={{ ko: "내 에셋 미니 뷰", en: "My asset mini view" }} />
            </h2>
            <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "같은 에셋은 여러 맵에서 무료로 참조할 수 있습니다.", en: "The same asset can be referenced across maps for free." }} /></p>
          </div>
          {assetsQuery.isFetching ? <RefreshCw className="size-4 animate-spin text-secondary-text motion-reduce:animate-none" aria-label={lang({ ko: "새로 고치는 중", en: "Refreshing" })} /> : null}
        </div>

        {assetsQuery.isLoading ? <Preloader variant="spin" size="lg" container /> : listError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center" role="alert">
            <p className="text-sm text-destructive">{listError}</p>
            <Button variant="outline" className="mt-4 min-h-11" onClick={() => void assetsQuery.refetch()}><Lang text={{ ko: "다시 불러오기", en: "Try again" }} /></Button>
          </div>
        ) : assets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <ImageIcon className="mx-auto size-8 text-secondary-text" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-primary-text"><Lang text={{ ko: "이 카테고리의 에셋이 아직 없습니다.", en: "No assets in this category yet." }} /></p>
            <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "프리셋을 골라 첫 월드 에셋을 만들어 보세요.", en: "Choose a preset to create your first world asset." }} /></p>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {assets.map((asset) => (
                <li key={asset.gameAssetId} className="overflow-hidden rounded-xl border border-border bg-background">
                  <div className="flex aspect-square items-center justify-center bg-surface-2">
                    {asset.storage?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- game asset delivery URL
                      <img src={asset.storage.url} alt={asset.name} loading="lazy" className="h-full w-full object-contain p-2" />
                    ) : <ImageIcon className="size-7 text-secondary-text" aria-hidden />}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold text-primary-text">{asset.name}</p>
                    <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: asset.status === "published" ? "공용 에셋 · 무료 사용" : "내 드래프트 · 무료 재사용", en: asset.status === "published" ? "Shared · free to use" : "My draft · free to reuse" }} /></p>
                  </div>
                </li>
              ))}
            </ul>
            {pagination && pagination.totalPages > 1 ? (
              <nav className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4" aria-label={lang({ ko: "월드 에셋 페이지 이동", en: "World asset pagination" })}>
                <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="mr-1 size-4" aria-hidden /><Lang text={{ ko: "이전", en: "Previous" }} /></Button>
                <span className="text-sm text-secondary-text">{page} / {pagination.totalPages}</span>
                <Button variant="outline" className="min-h-11" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}><Lang text={{ ko: "다음", en: "Next" }} /><ChevronRight className="ml-1 size-4" aria-hidden /></Button>
              </nav>
            ) : null}
          </>
        )}
      </section>

      <CostConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={{ ko: "월드 에셋을 생성할까요?", en: "Generate this world asset?" }}
        description={{ ko: "서버가 확인한 모델별 견적만큼 코인이 차감됩니다. 기존 에셋 사용과 맵 배치는 무료입니다.", en: "Coins are charged only by the server model quote. Reusing existing assets and map placement are free." }}
        actionLabel={{ ko: "생성 및 내 에셋에 저장", en: "Generate and save" }}
        quotedCoins={quoteQuery.data?.quotedCoins}
        loading={generating}
        onConfirm={handleGenerate}
      />
    </div>
  );
}
