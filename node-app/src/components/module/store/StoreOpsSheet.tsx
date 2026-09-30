"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Eye, ImagePlus, Plus, RefreshCcw } from "lucide-react";
import {
  Button,
  dialog,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@amu-labs/ui";
import { SMARTSTORE_CREATE_ALLOWLIST_PRESETS } from "consts/commerce/smartstore";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toSafeString } from "utils/common";
import { SMARTSTORE_OPERATOR_TEXT } from "./manage/smartstoreDraftUtils";
import { UploadedImagesManageDialog } from "./manage/UploadedImagesManageDialog";

/**
 * @docHint
 * @purpose P6 책임 단위 분할 — 운영 시트(스토어바로가기·새 상품 초안·네이버 가져오기·전체 동기화)를
 *          list 뷰 전용 컴포넌트로 분리한다(설계 제안 §9). 편집 화면에서는 렌더되지 않는다.
 *          초안 생성·가져오기가 완료되면 onDraftReady(draftId)로 편집 화면에 합류한다.
 * @domain commerce.naver
 * @scope client
 */

type StoreOpsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  universeId: string;
  universeName: string;
  naverStoreUrl: string;
  storefrontOpen: boolean;
  /** 초안 생성·가져오기 성공 시 편집 화면으로 이동한다 */
  onDraftReady: (draftId: string) => void;
};

type SyncFromNaverSummary = {
  synced: number;
  hidden: number;
  failed: number;
  requested: number;
  imported: number;
  skipped: number;
  pruned: number;
};

type DraftImportResponse = {
  draft?: { draftId?: string } | null;
  summary?: SyncFromNaverSummary | null;
};

export function StoreOpsSheet({
  open,
  onOpenChange,
  universeId,
  universeName,
  naverStoreUrl,
  storefrontOpen,
  onDraftReady,
}: StoreOpsSheetProps) {
  const queryClient = useQueryClient();
  const [newDraftTitle, setNewDraftTitle] = useState("");
  const [newDraftCategoryPolicyGroup, setNewDraftCategoryPolicyGroup] = useState("");
  const [importChannelProductNo, setImportChannelProductNo] = useState("");
  const [syncFromNaverSummary, setSyncFromNaverSummary] = useState<SyncFromNaverSummary | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [imagesManageOpen, setImagesManageOpen] = useState(false);

  const createAllowlistDraft = async () => {
    setCreatePending(true);
    try {
      const title = newDraftTitle.trim();
      const response = await fetchClient.post<{ data?: { draft?: { draftId?: string } | null } }>(
        `/universe/${universeId}/commerce/drafts/create-allowlist`,
        {
          // 빈 title 전송 시 서버 validator가 400(title_invalid)으로 거절하므로 값이 있을 때만 포함
          ...(title ? { title } : {}),
          categoryPolicyGroup: newDraftCategoryPolicyGroup,
        },
      );
      const draft = (response?.data?.data?.draft || null) as { draftId?: string } | null;
      await queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] });
      if (draft?.draftId) {
        setNewDraftTitle("");
        onOpenChange(false);
        onDraftReady(String(draft.draftId));
      }
    } catch (error) {
      const detail = toSafeString((error as Error)?.message) || "잠시 후 다시 시도해 주세요.";
      void dialog.alert(
        lang({
          ko: `초안 생성에 실패했습니다.\n${detail}`,
          en: `Failed to create the draft.\n${detail}`,
        }),
      );
    } finally {
      setCreatePending(false);
    }
  };

  const importDraft = async () => {
    setImportPending(true);
    try {
      const response = await fetchClient.post<{ data?: DraftImportResponse }>(
        `/universe/${universeId}/commerce/drafts/import-from-naver`,
        { channelProductNo: Number(importChannelProductNo) },
      );
      const data = (response?.data?.data || null) as DraftImportResponse | null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] }),
        queryClient.invalidateQueries({ queryKey: ["storefront-products", universeId] }),
      ]);
      if (data?.draft?.draftId) {
        onOpenChange(false);
        onDraftReady(String(data.draft.draftId));
      }
    } finally {
      setImportPending(false);
    }
  };

  const syncFromNaver = async () => {
    setSyncPending(true);
    try {
      const response = await fetchClient.post<{ data?: { summary?: SyncFromNaverSummary | null } }>(
        `/universe/${universeId}/commerce/drafts/sync-from-naver`,
        {
          pageSize: 50,
          maxPages: 5,
          pruneMissing: true,
          visibleStatusTypes: ["SALE"],
          visibleDisplayStatusTypes: ["ON"],
        },
      );
      const data = (response?.data?.data || null) as { summary?: SyncFromNaverSummary | null } | null;
      setSyncFromNaverSummary(data?.summary || null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] }),
        queryClient.invalidateQueries({ queryKey: ["storefront-products", universeId] }),
      ]);
    } finally {
      setSyncPending(false);
    }
  };

  const selectedPreset = SMARTSTORE_CREATE_ALLOWLIST_PRESETS.find(
    (item) => item.group === newDraftCategoryPolicyGroup,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[calc(100%-1rem)] overflow-y-auto bg-surface p-0 sm:max-w-[28rem]">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle>
            <Lang text={SMARTSTORE_OPERATOR_TEXT.operations} />
          </SheetTitle>
          <SheetDescription>
            <Lang
              text={{
                ko: `새 상품 초안 만들기, 단건 가져오기, 전체 동기화, 상품 이미지 관리를 한 곳에서 실행합니다. (${universeName})`,
                en: `Create new drafts, import a single product, sync the storefront, and manage product images. (${universeName})`,
              }}
            />
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 p-5">
          <div className="rounded-2xl border border-border bg-background/70 px-3 py-3 sm:hidden">
            <p className="text-xxs font-semibold uppercase tracking-[0.18em] text-secondary-text">
              <Lang text={{ ko: "공개 스토어 바로가기", en: "Storefront Shortcuts" }} />
            </p>
            <div className="mt-3 grid gap-2">
              <Button
                variant="outline"
                rounded="full"
                className="w-full"
                onClick={() => window.location.assign(`/store/${universeId}?mode=preview`)}
              >
                <Eye className="mr-2 icon-xs" />
                <Lang text={SMARTSTORE_OPERATOR_TEXT.storePreview} />
              </Button>
              <Button
                variant="outline"
                rounded="full"
                className="w-full"
                onClick={() => window.location.assign(naverStoreUrl || `/store/${universeId}`)}
                disabled={!storefrontOpen}
              >
                <Lang text={SMARTSTORE_OPERATOR_TEXT.openStorefront} />
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/70 px-3 py-3">
            <p className="text-xxs font-semibold uppercase tracking-[0.18em] text-secondary-text">
              <Lang text={{ ko: "새 상품 초안", en: "New Product Draft" }} />
            </p>
            <p className="mt-2 text-xs leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "신규 등록이 가능한 카테고리 유형을 선택해 새 상품 초안을 빠르게 시작합니다.",
                  en: "Start a create-ready draft by selecting one of the approved category groups.",
                }}
              />
            </p>
            <div className="mt-3 space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                  <Lang text={{ ko: "카테고리 유형", en: "Category Type" }} />
                </label>
                <Select
                  value={newDraftCategoryPolicyGroup}
                  onValueChange={(value) => setNewDraftCategoryPolicyGroup(String(value || ""))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={lang({ ko: "카테고리군 선택", en: "Select a category group" })} />
                  </SelectTrigger>
                  <SelectContent>
                    {SMARTSTORE_CREATE_ALLOWLIST_PRESETS.map((preset) => (
                      <SelectItem key={preset.group} value={preset.group}>
                        {preset.label.ko}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPreset ? (
                  <p className="text-xxs leading-5 text-secondary-text">{selectedPreset.description.ko}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                  <Lang text={{ ko: "상품 이름", en: "Product Title" }} />
                </label>
                <Input
                  value={newDraftTitle}
                  onChange={(event) => setNewDraftTitle(event.target.value)}
                  placeholder={lang({ ko: "예: 4월 신상품 파우치", en: "Example: April new pouch release" })}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => void createAllowlistDraft()}
                loading={createPending}
                disabled={!newDraftCategoryPolicyGroup}
              >
                <Plus className="mr-2 icon-xs" />
                <Lang text={{ ko: "새 상품 초안 만들기", en: "Create Draft" }} />
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/70 px-3 py-3">
            <p className="text-xxs font-semibold uppercase tracking-[0.18em] text-secondary-text">
              <Lang text={{ ko: "네이버 상품 가져오기", en: "Import From Naver" }} />
            </p>
            <p className="mt-2 text-xs leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "스마트스토어 상품번호로 기존 상품을 초안으로 가져오거나 기존 초안을 갱신합니다.",
                  en: "Import an existing Smart Store product by channel product number or refresh the existing draft.",
                }}
              />
            </p>
            <div className="mt-3 space-y-2">
              <Input
                value={importChannelProductNo}
                onChange={(event) => setImportChannelProductNo(event.target.value)}
                placeholder={lang({ ko: "예: 1234567890", en: "Example: 1234567890" })}
              />
              <Button
                className="w-full"
                variant="outline"
                onClick={() => void importDraft()}
                loading={importPending}
                disabled={!importChannelProductNo.trim()}
              >
                <Download className="mr-2 icon-xs" />
                <Lang text={{ ko: "상품 가져오기", en: "Import Product" }} />
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/70 px-3 py-3">
            <p className="text-xxs font-semibold uppercase tracking-[0.18em] text-secondary-text">
              <Lang text={{ ko: "상품 이미지 관리", en: "Product Image Library" }} />
            </p>
            <p className="mt-2 text-xs leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "이 유니버스에 업로드된 이미지를 관리합니다. 상품 등록 화면의 '내 이미지' 선택기에서 함께 사용됩니다.",
                  en: "Manage images uploaded to this universe. Shared with the 'My Images' picker in product registration.",
                }}
              />
            </p>
            <Button
              className="mt-3 w-full"
              variant="outline"
              onClick={() => setImagesManageOpen(true)}
            >
              <ImagePlus className="mr-2 icon-xs" />
              <Lang text={{ ko: "이미지 관리", en: "Manage Images" }} />
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-background/70 px-3 py-3">
            <p className="text-xxs font-semibold uppercase tracking-[0.18em] text-secondary-text">
              <Lang text={{ ko: "공개 스토어 동기화", en: "Smart Store Sync" }} />
            </p>
            <p className="mt-2 text-xs leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "스마트스토어에서 판매 중이고 전시 중인 상품을 AMU 공개 스토어 목록에 맞춰 동기화합니다.",
                  en: "Sync live Smart Store sale products into the AMU storefront projection.",
                }}
              />
            </p>
            <Button
              className="mt-3 w-full"
              variant="outline"
              onClick={() => void syncFromNaver()}
              loading={syncPending}
            >
              <RefreshCcw className="mr-2 icon-xs" />
              <Lang text={{ ko: "스마트스토어 전체 동기화", en: "Sync Smart Store" }} />
            </Button>
            {syncFromNaverSummary ? (
              <div className="mt-3 rounded-lg border border-border/70 bg-surface/70 px-3 py-2 text-xxs leading-5 text-secondary-text">
                <p>
                  <Lang text={{ ko: "동기화 결과", en: "Sync Result" }} />: {syncFromNaverSummary.synced}
                  <Lang text={{ ko: "개 노출", en: " shown" }} />, {syncFromNaverSummary.hidden}
                  <Lang text={{ ko: "개 숨김", en: " hidden" }} />, {syncFromNaverSummary.failed}
                  <Lang text={{ ko: "개 실패", en: " failed" }} />
                </p>
                <p>
                  <Lang text={{ ko: "조회/가져오기/건너뜀", en: "Fetched/imported/skipped" }} />:{" "}
                  {syncFromNaverSummary.requested} / {syncFromNaverSummary.imported} / {syncFromNaverSummary.skipped}
                </p>
                {syncFromNaverSummary.pruned > 0 ? (
                  <p>
                    <Lang text={{ ko: "스토어에서 사라진 상품 정리", en: "Pruned stale projections" }} />:{" "}
                    {syncFromNaverSummary.pruned}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
      <UploadedImagesManageDialog
        open={imagesManageOpen}
        onClose={() => setImagesManageOpen(false)}
        universeId={universeId}
      />
    </Sheet>
  );
}
