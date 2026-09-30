"use client";

import type { Ref } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { SMARTSTORE_CREATE_ALLOWLIST_PRESETS } from "consts/commerce/smartstore";
import { SMARTSTORE_DETAIL_PANEL_CLASS } from "./smartstoreDraftUtils";
import { NaverCategorySearchInput } from "./NaverCategorySearchInput";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { CommerceDraftStatusType } from "types/commerce";
import {
  DRAFT_STATUS_LABEL,
  SMARTSTORE_SALE_STATUS_OPTIONS,
  formatDate,
  type DraftFormState,
} from "./smartstoreDraftUtils";

type DraftBasicInfoSectionProps = {
  sectionRef: Ref<HTMLDetailsElement>;
  universeId: string;
  draftForm: DraftFormState;
  draftStatus: CommerceDraftStatusType;
  draftUpdatedAt?: string;
  onFormChange: (patch: Partial<DraftFormState>) => void;
  onCreateWithAi: () => void;
  aiAssistPending: boolean;
};

export function DraftBasicInfoSection({
  sectionRef,
  universeId,
  draftForm,
  draftStatus,
  draftUpdatedAt,
  onFormChange,
  onCreateWithAi,
  aiAssistPending,
}: DraftBasicInfoSectionProps) {
  return (
    <details ref={sectionRef} open className={SMARTSTORE_DETAIL_PANEL_CLASS}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2">
          <ChevronDown className="h-4 w-4 transition-transform group-[&:not([open])]:-rotate-90" />
          <span className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "기본 정보", en: "Basic Info" }} />
          </span>
        </div>
      </summary>
      <div className="border-t border-border py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs" rounded="full" onClick={onCreateWithAi} loading={aiAssistPending}>
            <Sparkles className="icon-xs" />
            <Lang text={{ ko: "AI로 만들기", en: "Create with AI" }} />
          </Button>
          <p className="text-xxs leading-4 text-secondary-text">
            <Lang
              text={{
                ko: "이전 단계의 상품 이미지를 AI가 분석해 상품명·소개 등을 채워줍니다.",
                en: "AI reads the product photos from the previous step and fills in the basic info.",
              }}
            />
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-secondary-text">
              <Lang text={{ ko: "스토어 표시 상품명", en: "Store Display Name" }} />
            </label>
            <Input value={draftForm.title} onChange={(event) => onFormChange({ title: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-secondary-text">
              <Lang text={{ ko: "스마트스토어 상품명", en: "Smart Store Product Name" }} />
            </label>
            <Input
              value={draftForm.channelProductName}
              onChange={(event) => onFormChange({ channelProductName: event.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary-text">
            <Lang text={{ ko: "짧은 상품 소개", en: "Short Product Intro" }} />
          </label>
          <Textarea
            value={draftForm.summary}
            onChange={(event) => onFormChange({ summary: event.target.value })}
            rows={3}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-secondary-text">
              <Lang text={{ ko: "판매가", en: "Sale Price" }} />
            </label>
            <Input value={draftForm.price} onChange={(event) => onFormChange({ price: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-secondary-text">
              <Lang text={{ ko: "재고", en: "Stock" }} />
            </label>
            <Input
              value={draftForm.stockQuantity}
              onChange={(event) => onFormChange({ stockQuantity: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-secondary-text">
              <Lang text={{ ko: "네이버 카테고리", en: "Naver Category" }} />
            </label>
            <NaverCategorySearchInput
              universeId={universeId}
              categoryId={draftForm.categoryId}
              onSelect={(categoryId) => onFormChange({ categoryId })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-secondary-text">
              <Lang text={{ ko: "등록 가능 카테고리 유형", en: "Allowed Category Type" }} />
            </label>
            <Select
              value={draftForm.categoryPolicyGroup}
              onValueChange={(value) => onFormChange({ categoryPolicyGroup: String(value || "") })}
            >
              <SelectTrigger>
                <SelectValue placeholder={lang({ ko: "카테고리 유형 선택", en: "Select category type" })} />
              </SelectTrigger>
              <SelectContent>
                {SMARTSTORE_CREATE_ALLOWLIST_PRESETS.map((preset) => (
                  <SelectItem key={preset.group} value={preset.group}>
                    {preset.label.ko}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-secondary-text">
              <Lang text={{ ko: "판매 상태", en: "Sale Status" }} />
            </label>
            <Select
              value={draftForm.statusType}
              onValueChange={(value) => onFormChange({ statusType: String(value || "") })}
            >
              <SelectTrigger>
                <SelectValue placeholder={lang({ ko: "판매 상태 선택", en: "Select status" })} />
              </SelectTrigger>
              <SelectContent>
                {SMARTSTORE_SALE_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {lang(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <details className="group rounded-[0.9rem] border border-border bg-surface [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-xs font-semibold text-secondary-text">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-[&:not([open])]:-rotate-90" />
            <Lang text={{ ko: "고급 설정 (선택 입력)", en: "Advanced (optional)" }} />
          </summary>
          <div className="grid gap-4 border-t border-border px-3 py-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-secondary-text">
                <Lang text={{ ko: "네이버 등록 상품명", en: "Name on Naver" }} />
              </label>
              <Input
                value={draftForm.productName}
                onChange={(event) => onFormChange({ productName: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-secondary-text">
                <Lang text={{ ko: "내부 관리 코드", en: "Internal Management Code" }} />
              </label>
              <Input
                value={draftForm.sellerManagementCode}
                placeholder={lang({ ko: "우리 스토어에서만 쓰는 관리용 코드", en: "Code used only by your store" })}
                onChange={(event) => onFormChange({ sellerManagementCode: event.target.value })}
              />
            </div>
          </div>
        </details>

        <div className="flex flex-col sm:flex-row gap-3 rounded-lg border border-border bg-background/70 px-4 py-4 text-sm text-secondary-text">
          <p className="font-semibold text-primary-text">
            <Lang text={{ ko: "현재 상태", en: "Current Status" }} />
          </p>
          <p>{lang(DRAFT_STATUS_LABEL[draftStatus])}</p>
          <p>{formatDate(draftUpdatedAt)}</p>
        </div>
      </div>
    </details>
  );
}
