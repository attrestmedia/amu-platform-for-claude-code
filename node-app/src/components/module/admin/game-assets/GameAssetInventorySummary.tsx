import { Badge } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import {
  GAME_ASSET_TYPES,
  type GameAssetInventorySummaryType,
  type GameAssetType,
} from "types/game/asset";

const REQUIRED_PLAY_TYPES = new Set<GameAssetType>([
  "character-sprite",
  "stage-tileset",
  "building-sheet",
  "tile",
  "object",
]);

export function GameAssetInventorySummary({
  inventory,
  universeId,
  scope,
}: {
  inventory: GameAssetInventorySummaryType | null;
  universeId: string;
  scope: "all" | "mine";
}) {
  if (!inventory) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4" aria-label="Game asset inventory">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold">
            <Lang text={{ ko: "유니버스 에셋 인벤토리", en: "Universe Asset Inventory" }} />
          </h3>
          <p className="text-sm text-muted-foreground">
            <Lang
              text={{
                ko: "등록·발행 상태와 R2 배포 준비 여부를 한 번에 확인합니다.",
                en: "Review registration, publication, and R2 delivery readiness.",
              }}
            />
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{universeId || "all universes"}</Badge>
          <Badge variant="outline">{scope === "mine" ? "my assets" : "permitted assets"}</Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label={{ ko: "등록", en: "Registered" }} value={inventory.total} />
        <Metric label={{ ko: "발행", en: "Published" }} value={inventory.published} />
        <Metric label={{ ko: "R2 준비", en: "R2 ready" }} value={inventory.r2Ready} tone="ready" />
        <Metric
          label={{ ko: "이관 필요", en: "Migration needed" }}
          value={inventory.migrationRequired}
          tone={inventory.migrationRequired > 0 ? "warning" : "ready"}
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {GAME_ASSET_TYPES.map((assetType) => {
          const registered = Number(inventory.byType[assetType] || 0);
          const published = Number(inventory.publishedByType[assetType] || 0);
          const missing = Boolean(universeId && REQUIRED_PLAY_TYPES.has(assetType) && published === 0);
          return (
            <div key={assetType} className="flex items-center justify-between rounded-md border border-border p-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{assetType}</p>
                <p className="text-xs text-muted-foreground">
                  {registered} registered · {published} published
                </p>
              </div>
              <Badge variant={missing ? "secondary" : published > 0 ? "accent" : "outline"}>
                {missing ? <Lang text={{ ko: "부족", en: "Missing" }} /> : published > 0 ? "ready" : "optional"}
              </Badge>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: { ko: string; en: string };
  value: number;
  tone?: "ready" | "warning";
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        <Lang text={label} />
      </p>
      <p className={tone === "warning" ? "mt-1 text-xl font-semibold text-warning" : "mt-1 text-xl font-semibold"}>
        {value}
      </p>
    </div>
  );
}
