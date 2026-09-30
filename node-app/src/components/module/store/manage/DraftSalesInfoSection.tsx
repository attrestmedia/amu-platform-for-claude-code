"use client";

import type { Ref } from "react";
import { ChevronDown } from "lucide-react";
import { Input, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { UnknownRecord } from "utils/common/typeUtils";
import {
  SMARTSTORE_DETAIL_GUIDE_FIELD_OPTIONS,
  SMARTSTORE_NOTICE_FIELD_OPTIONS,
  getNoticePayloadFieldValue,
  type DraftFormState,
} from "./smartstoreDraftUtils";
import { SMARTSTORE_DETAIL_PANEL_CLASS } from "./smartstoreDraftUtils";

type DraftSalesInfoSectionProps = {
  sectionRef: Ref<HTMLDetailsElement>;
  draftForm: DraftFormState;
  noticePayload: UnknownRecord;
  onFormChange: (patch: Partial<DraftFormState>) => void;
  onNoticeFieldChange: (key: string, value: string) => void;
};

export function DraftSalesInfoSection({
  sectionRef,
  draftForm,
  noticePayload,
  onFormChange,
  onNoticeFieldChange,
}: DraftSalesInfoSectionProps) {
  return (
    <details ref={sectionRef} className={SMARTSTORE_DETAIL_PANEL_CLASS}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2">
          <ChevronDown className="h-4 w-4 transition-transform group-[&:not([open])]:-rotate-90" />
          <p className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "판매 필수 정보", en: "Required Sales Info" }} />
          </p>
        </div>
        {draftForm.categoryPolicyGroup ? (
          <span className="rounded-full border border-border px-3 py-1 text-xxs uppercase tracking-[0.18em] text-secondary-text">
            {draftForm.categoryPolicyGroup}
          </span>
        ) : null}
      </summary>
      <div className="border-t border-border px-4 py-4">
        <p className="text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "새 상품 등록 전에 상품정보고시, 원산지, 배송/반품/A/S, 브랜드 정보를 입력해야 합니다.",
              en: "Enter notice, origin, shipping/return/A/S, and brand info before publishing a new product.",
            }}
          />
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "브랜드명", en: "Brand Name" }} />
            </label>
            <Input value={draftForm.brandName} onChange={(event) => onFormChange({ brandName: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "제조사", en: "Manufacturer" }} />
            </label>
            <Input
              value={draftForm.manufacturerName}
              onChange={(event) => onFormChange({ manufacturerName: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "모델명", en: "Model Name" }} />
            </label>
            <Input value={draftForm.modelName} onChange={(event) => onFormChange({ modelName: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "원산지 코드", en: "Origin Code" }} />
            </label>
            <Input
              value={draftForm.originAreaCode}
              onChange={(event) => onFormChange({ originAreaCode: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "원산지명", en: "Origin Name" }} />
            </label>
            <Input
              value={draftForm.originAreaName}
              onChange={(event) => onFormChange({ originAreaName: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "상품정보고시 유형", en: "Notice Type" }} />
            </label>
            <Input
              value={draftForm.noticeType}
              onChange={(event) => onFormChange({ noticeType: event.target.value })}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "원산지 설명", en: "Origin Description" }} />
            </label>
            <Textarea
              rows={3}
              value={draftForm.originContent}
              onChange={(event) => onFormChange({ originContent: event.target.value })}
            />
          </div>
          <div className="space-y-3 border-t border-border pt-4 sm:col-span-2">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "상품 필수 고시 정보", en: "Required Product Notice" }} />
            </label>
            <p className="text-xs leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "고객에게 안내해야 하는 정보를 항목별로 입력하세요. 저장할 때 네이버 규격에 맞게 자동 정리됩니다.",
                  en: "Fill in each field. Values are formatted for Naver automatically on save.",
                }}
              />
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SMARTSTORE_NOTICE_FIELD_OPTIONS.map((option) => (
                <div key={option.key} className="space-y-2">
                  <label className="text-xs font-semibold text-secondary-text">
                    <Lang text={option.label} />
                  </label>
                  <Input
                    value={getNoticePayloadFieldValue(noticePayload, option.key)}
                    onChange={(event) => onNoticeFieldChange(option.key, event.target.value)}
                  />
                </div>
              ))}
            </div>
            <details className="rounded-[0.9rem] border border-border bg-surface px-3 py-3 text-xs text-secondary-text">
              <summary className="cursor-pointer font-semibold text-primary-text">
                <Lang text={{ ko: "고급: 전송 데이터 직접 편집", en: "Advanced: edit raw data" }} />
              </summary>
              <Textarea
                className="mt-3"
                rows={4}
                value={draftForm.noticePayloadText}
                onChange={(event) => onFormChange({ noticePayloadText: event.target.value })}
                placeholder={lang({
                  ko: '{\n  "품명": "패브릭 포스터",\n  "모델명": "Spring Poster"\n}',
                  en: '{\n  "name": "Fabric Poster",\n  "model": "Spring Poster"\n}',
                })}
              />
            </details>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t border-b border-border py-4">
          <div>
            <p className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "상세 설명 안내 폼", en: "Detail Guide Form" }} />
            </p>
            <p className="mt-1 text-xs leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "입력값은 상세 설명의 ‘상품 정보’, ‘배송/교환’, ‘사이즈/관리’ HTML 블록으로 가공해 삽입됩니다.",
                  en: "These values are converted into product, shipping, and size/care HTML blocks for the detail content.",
                }}
              />
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SMARTSTORE_DETAIL_GUIDE_FIELD_OPTIONS.map((option) => (
              <div key={option.key} className="space-y-2">
                <label className="text-xs font-semibold text-secondary-text">
                  <Lang text={option.label} />
                </label>
                <Textarea
                  rows={option.rows}
                  value={getNoticePayloadFieldValue(noticePayload, option.key)}
                  onChange={(event) => onNoticeFieldChange(option.key, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-1">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "배송 정책", en: "Shipping Policy" }} />
            </label>
            <Textarea
              rows={4}
              value={draftForm.shippingPolicyText}
              onChange={(event) => onFormChange({ shippingPolicyText: event.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "반품/교환 정책", en: "Return Policy" }} />
            </label>
            <Textarea
              rows={4}
              value={draftForm.returnPolicyText}
              onChange={(event) => onFormChange({ returnPolicyText: event.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "A/S 정책", en: "A/S Policy" }} />
            </label>
            <Textarea
              rows={4}
              value={draftForm.asPolicyText}
              onChange={(event) => onFormChange({ asPolicyText: event.target.value })}
            />
          </div>
        </div>
      </div>
    </details>
  );
}
