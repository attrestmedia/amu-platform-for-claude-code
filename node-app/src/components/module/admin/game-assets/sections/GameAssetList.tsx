"use client";

import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { Check } from "lucide-react";
import type { GameAssetStatusType, GameAssetType, IGameAssetDoc } from "types/game/asset";
import { cn } from "utils/common";
import {
  GAME_ASSET_STATUSES,
  GAME_ASSET_STATUS_TEXT,
  GAME_ASSET_TYPES,
  GAME_ASSET_TYPE_TEXT,
  formatDate,
  type GameAssetListFiltersType,
} from "../gameAssetForgeModel";

/**
 * @docHint
 * @purpose 관리자 Forge의 에셋 드래프트 목록 + 필터 툴바 (선택한 에셋의 런타임 편집은 상위에서 렌더)
 * @process 필터 변경(onFiltersChange)  목록 렌더  에셋 선택(onSelectAsset)  상태 전환(onStatusChange)
 * @domain game.asset
 * @scope admin-client
 */
export function GameAssetList({
  assets,
  selectedAssetId,
  onSelectAsset,
  filters,
  onFiltersChange,
  onStatusChange,
  busy,
}: {
  assets: IGameAssetDoc[];
  selectedAssetId: string;
  onSelectAsset: (gameAssetId: string) => void;
  filters: GameAssetListFiltersType;
  onFiltersChange: React.Dispatch<React.SetStateAction<GameAssetListFiltersType>>;
  onStatusChange: (assetId: string, status: GameAssetStatusType) => void;
  busy: boolean;
}) {
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">
            <Lang text={{ ko: "게임 에셋 드래프트", en: "Game Asset Drafts" }} />
          </h3>
          <p className="text-sm text-muted-foreground">
            <Lang
              text={{
                ko: "published 상태가 런타임 연결 후보입니다.",
                en: "Published items are runtime candidates.",
              }}
            />
          </p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-5">
          <Input
            value={filters.universeId}
            onChange={(event) => onFiltersChange((current) => ({ ...current, universeId: event.target.value }))}
            placeholder="universeId"
          />
          <Input
            value={filters.stageId}
            onChange={(event) => onFiltersChange((current) => ({ ...current, stageId: event.target.value }))}
            placeholder="stageId"
          />
          <Select
            value={filters.scope}
            onValueChange={(value) => onFiltersChange((current) => ({ ...current, scope: value as "all" | "mine" }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang({ ko: "권한 내 전체", en: "All permitted" })}</SelectItem>
              <SelectItem value="mine">{lang({ ko: "내가 생성", en: "Created by me" })}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.assetType}
            onValueChange={(value) =>
              onFiltersChange((current) => ({
                ...current,
                assetType: value as GameAssetType | "all",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang({ ko: "모든 타입", en: "All types" })}</SelectItem>
              {GAME_ASSET_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {lang(GAME_ASSET_TYPE_TEXT[type])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.status}
            onValueChange={(value) =>
              onFiltersChange((current) => ({
                ...current,
                status: value as GameAssetStatusType | "all",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang({ ko: "모든 상태", en: "All statuses" })}</SelectItem>
              {GAME_ASSET_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {lang(GAME_ASSET_STATUS_TEXT[status])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">

        {assets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <Lang text={{ ko: "등록된 게임 에셋이 없습니다.", en: "No game assets yet." }} />
          </div>
        ) : (
          assets.map((asset) => (
            <div key={asset.gameAssetId} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{asset.name}</p>
                    <Badge variant={asset.status === "published" ? "accent" : "secondary"}>
                      {lang(GAME_ASSET_STATUS_TEXT[asset.status])}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{asset.gameAssetId}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-xs">
                    <Badge variant="outline">{lang(GAME_ASSET_TYPE_TEXT[asset.assetType])}</Badge>
                    {asset.universeId ? <Badge variant="outline">{asset.universeId}</Badge> : null}
                    {asset.stageId ? <Badge variant="outline">{asset.stageId}</Badge> : null}
                    {asset.templateKey ? <Badge variant="outline">{asset.templateKey}</Badge> : null}
                    <Badge variant={asset.storage?.driver === "r2" ? "accent" : "secondary"}>
                      {asset.storage?.driver === "r2" ? "R2" : "migration-required"}
                    </Badge>
                    {asset.createdBy ? <Badge variant="outline">{asset.createdBy}</Badge> : null}
                  </div>
                  {asset.storage?.url ? (
                    <p className="mt-2 truncate text-xs text-muted-foreground">{asset.storage.url}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button
                    variant={selectedAssetId === asset.gameAssetId ? "primary" : "outline"}
                    size="xs"
                    onClick={() => onSelectAsset(asset.gameAssetId)}
                  >
                    <Lang text={{ ko: "편집", en: "Edit" }} />
                  </Button>
                  {GAME_ASSET_STATUSES.filter((status) => status !== asset.status && status !== "published").map(
                    (status) => (
                      <Button
                        key={`${asset.gameAssetId}-${status}`}
                        variant={status === "published" ? "primary" : "outline"}
                        size="xs"
                        onClick={() => onStatusChange(asset.gameAssetId, status)}
                        disabled={busy}
                        className={cn(status === "published" && "font-semibold")}
                      >
                        {status === "published" ? <Check size={12} /> : null}
                        {lang(GAME_ASSET_STATUS_TEXT[status])}
                      </Button>
                    ),
                  )}
                </div>
              </div>
              <p className="mt-2 text-xxs text-muted-foreground">{formatDate(asset.updatedAt)}</p>
            </div>
          ))
        )}
      </div>
    </>
  );
}

