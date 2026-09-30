"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Copy, ImagePlus } from "lucide-react";
import { Button, Checkbox } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { ImagePromptMetaType } from "types/app";
import { SMARTSTORE_MODEL_CONSISTENCY_ITEM_TEXT } from "./smartstoreImageVariants";

/**
 * 생성 결과 목록 — 비교 · 모델 일관성 검수 · 선택 적용 (SSM-203).
 *
 * 적용은 항상 사용자의 명시 클릭이고, 스토어 payload로 나가는 용도는 **검수 항목을 다 체크해야** 눌린다.
 * 서버(`apply-asset`)도 같은 항목을 강제하므로 화면 체크는 편의가 아니라 같은 계약의 앞단이다.
 */

export type SmartstoreVariantResultGridProps = {
  results: ImagePromptMetaType[];
  /** 적용 버튼에 쓰는 용도 이름. */
  variantLabel: { ko: string; en: string };
  /** 서버가 요구하는 차단 검수 항목 id. */
  requiredCheckItemIds: string[];
  /** 스토어 payload로 나가는 용도인가. false면 검수는 기록만 하고 적용을 막지 않는다. */
  gateRequired: boolean;
  appliedAssetIds: string[];
  compareIds: string[];
  onToggleCompare: (assetId: string) => void;
  onApply: (assetId: string, checkedItemIds: string[]) => void;
  applyingAssetId: string | null;
  /** 포즈 참조 만들기 모드에서는 적용 대신 포즈 참조로 채택한다. */
  poseProxyMode?: boolean;
  onUsePoseProxy?: (url: string) => void;
  poseProxyUrls?: string[];
};

export function SmartstoreVariantResultGrid({
  results,
  variantLabel,
  requiredCheckItemIds,
  gateRequired,
  appliedAssetIds,
  compareIds,
  onToggleCompare,
  onApply,
  applyingAssetId,
  poseProxyMode = false,
  onUsePoseProxy,
  poseProxyUrls = [],
}: SmartstoreVariantResultGridProps) {
  const [openChecklistAssetId, setOpenChecklistAssetId] = useState<string | null>(null);
  const [checkedByAsset, setCheckedByAsset] = useState<Record<string, string[]>>({});

  const toggleCheck = useCallback((assetId: string, itemId: string) => {
    setCheckedByAsset((prev) => {
      const current = prev[assetId] || [];
      const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId];
      return { ...prev, [assetId]: next };
    });
  }, []);

  if (results.length === 0) {
    return (
      <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-secondary-text">
        <ImagePlus className="h-5 w-5" />
        <Lang text={{ ko: "이 시트에서 만든 결과가 아직 없습니다.", en: "No result generated in this session yet." }} />
      </div>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {results.map((asset) => {
        const applied = appliedAssetIds.includes(asset.assetId);
        const comparing = compareIds.includes(asset.assetId);
        const checked = checkedByAsset[asset.assetId] || [];
        const missing = requiredCheckItemIds.filter((id) => !checked.includes(id));
        const checklistOpen = openChecklistAssetId === asset.assetId;
        const usedAsPoseProxy = Boolean(asset.url) && poseProxyUrls.includes(asset.url);

        return (
          <div key={asset.assetId} className="rounded-[0.85rem] border border-border bg-surface p-2">
            <div className="relative aspect-[3/4] overflow-hidden rounded-[0.65rem] bg-background">
              {asset.url ? <Image src={asset.url} alt="" fill unoptimized sizes="180px" className="object-cover" /> : null}
              {applied || usedAsPoseProxy ? (
                <span className="absolute right-1 top-1 rounded-full bg-primary p-1 text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </div>

            {poseProxyMode ? (
              <Button
                size="xs"
                variant={usedAsPoseProxy ? "outline" : "primary"}
                rounded="md"
                className="mt-2 w-full"
                disabled={usedAsPoseProxy || !asset.url}
                onClick={() => onUsePoseProxy?.(asset.url)}
              >
                {usedAsPoseProxy ? (
                  <Lang text={{ ko: "포즈 참조로 사용 중", en: "Used as pose reference" }} />
                ) : (
                  <Lang text={{ ko: "포즈 참조로 사용", en: "Use as pose reference" }} />
                )}
              </Button>
            ) : (
              <>
                {checklistOpen ? (
                  <div className="mt-2 space-y-1 rounded-lg border border-border bg-background/70 p-2">
                    <p className="text-xxs font-semibold text-primary-text">
                      <Lang text={{ ko: "모델 일관성 확인", en: "Model consistency check" }} />
                    </p>
                    {requiredCheckItemIds.map((itemId) => (
                      <label key={itemId} className="flex items-start gap-1.5 text-xxs leading-4 text-secondary-text">
                        <Checkbox
                          checked={checked.includes(itemId)}
                          onCheckedChange={() => toggleCheck(asset.assetId, itemId)}
                        />
                        <Lang text={SMARTSTORE_MODEL_CONSISTENCY_ITEM_TEXT[itemId] || { ko: itemId, en: itemId }} />
                      </label>
                    ))}
                    {gateRequired && missing.length > 0 ? (
                      <p className="text-xxs leading-4 text-destructive">
                        <Lang
                          text={{
                            ko: `${missing.length}개 항목을 더 확인해야 적용할 수 있습니다.`,
                            en: `${missing.length} more item(s) must be confirmed before applying.`,
                          }}
                        />
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <Button
                  size="xs"
                  variant={applied ? "outline" : "primary"}
                  rounded="md"
                  className="mt-2 w-full"
                  disabled={applied || (checklistOpen && gateRequired && missing.length > 0)}
                  loading={applyingAssetId === asset.assetId}
                  onClick={() => {
                    if (!checklistOpen) {
                      setOpenChecklistAssetId(asset.assetId);
                      return;
                    }
                    onApply(asset.assetId, checked);
                  }}
                >
                  {applied ? (
                    <Lang text={{ ko: "적용됨", en: "Applied" }} />
                  ) : checklistOpen ? (
                    <Lang
                      text={{
                        ko: `확인 완료 · ${lang(variantLabel)}으로 적용`,
                        en: `Confirmed · apply as ${lang(variantLabel)}`,
                      }}
                    />
                  ) : (
                    <Lang text={{ ko: `${lang(variantLabel)}으로 적용`, en: `Apply as ${lang(variantLabel)}` }} />
                  )}
                </Button>
              </>
            )}

            <Button
              size="xs"
              variant={comparing ? "primary" : "outline"}
              rounded="md"
              className="mt-1 w-full"
              onClick={() => onToggleCompare(asset.assetId)}
            >
              <Copy className="h-3.5 w-3.5" />
              <Lang text={comparing ? { ko: "비교 해제", en: "Unpin" } : { ko: "비교", en: "Compare" }} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
