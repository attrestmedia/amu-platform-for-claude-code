"use client";

import type { Ref } from "react";
import { ChevronDown, ImagePlus } from "lucide-react";
import { Lang } from "components/module/i18n";
import { SmartstoreImageAssetRail, SmartstoreUrlImageCard } from "./SmartstoreDraftBlocks";
import type { DraftFormState, SmartstoreImageRailItem } from "./smartstoreDraftUtils";
import { SMARTSTORE_DETAIL_PANEL_CLASS } from "./smartstoreDraftUtils";

type DraftImagesSectionProps = {
  sectionRef: Ref<HTMLDetailsElement>;
  draftForm: DraftFormState;
  railItems: SmartstoreImageRailItem[];
  railLoading: boolean;
  railActionPending: boolean;
  onFormChange: (patch: Partial<DraftFormState>) => void;
  onUpload: (target: "representative" | "detail") => void;
  /** 모바일 카메라 촬영 — 기존 액션 시트의 촬영 경로를 이미지 탭으로 이관했다(P5). */
  onCapture: () => void;
  onPickMyImage: (target: "representative" | "detail") => void;
  onEditImage: (item: SmartstoreImageRailItem) => void;
  onSetRepresentative: (item: SmartstoreImageRailItem) => void;
  onAddDetail: (item: SmartstoreImageRailItem) => void;
  onRemoveDetail: (item: SmartstoreImageRailItem) => void;
  onInsertBody: (item: SmartstoreImageRailItem) => void;
};

export function DraftImagesSection({
  sectionRef,
  draftForm,
  railItems,
  railLoading,
  railActionPending,
  onFormChange,
  onUpload,
  onCapture,
  onPickMyImage,
  onEditImage,
  onSetRepresentative,
  onAddDetail,
  onRemoveDetail,
  onInsertBody,
}: DraftImagesSectionProps) {
  return (
    <details ref={sectionRef} open className={SMARTSTORE_DETAIL_PANEL_CLASS}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2">
          <ChevronDown className="h-4 w-4 transition-transform group-[&:not([open])]:-rotate-90" />
          <ImagePlus className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "상품 이미지", en: "Product Images" }} />
          </p>
        </div>
      </summary>
      <div className="border-t border-border py-4">
        <p className="text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "새 상품을 처음 등록할 때는 실제 촬영본 또는 실사 기반 편집본을 대표 이미지로 우선 사용하세요. AI로만 만든 대표 이미지는 운영자 확인 후 사용하세요.",
              en: "For a new product, prioritize real product photography or edited real-photo assets as the representative image. Pure AI hero images require operator confirmation.",
            }}
          />
        </p>
        <div className="mt-4 space-y-5">
          <div className="rounded-[1.1rem] border border-primary/30 bg-primary/5 p-3 sm:p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-primary-text">
                <Lang
                  text={{
                    ko: "스마트스토어 상단 대표 이미지",
                    en: "Smart Store Top Images",
                  }}
                />
              </p>
              <p className="mt-1 text-xxs leading-4 text-secondary-text">
                <Lang
                  text={{
                    ko: "스마트스토어 상세 페이지 상단에 노출되는 대표/추가 이미지입니다. 본문 이미지/생성 이미지와 별도로 관리됩니다.",
                    en: "Hero and additional images shown at the top of the Smart Store detail page. Managed separately from body/generated images.",
                  }}
                />
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-primary-text">
                    <Lang text={{ ko: "대표 이미지", en: "Representative" }} />
                  </p>
                  <button
                    type="button"
                    className="text-xxs font-semibold text-primary hover:underline"
                    onClick={() => onPickMyImage("representative")}
                  >
                    <Lang text={{ ko: "+ 내 이미지", en: "+ My images" }} />
                  </button>
                  <button
                    type="button"
                    className="text-xxs font-semibold text-primary hover:underline"
                    onClick={() => onUpload("representative")}
                  >
                    <Lang text={{ ko: "+ 업로드", en: "+ Upload" }} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SmartstoreUrlImageCard
                    url={draftForm.representativeImageUrl}
                    emptyLabel={{
                      ko: "대표 이미지 URL 입력 또는 업로드",
                      en: "Enter or upload representative URL",
                    }}
                    onChange={(next) => onFormChange({ representativeImageUrl: next })}
                    onRemove={
                      draftForm.representativeImageUrl.trim()
                        ? () => onFormChange({ representativeImageUrl: "" })
                        : undefined
                    }
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-primary-text">
                    <Lang text={{ ko: "추가 이미지", en: "Additional" }} />
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-xxs font-semibold text-primary hover:underline sm:hidden"
                      onClick={onCapture}
                    >
                      <Lang text={{ ko: "+ 촬영", en: "+ Capture" }} />
                    </button>
                    <button
                      type="button"
                      className="text-xxs font-semibold text-primary hover:underline"
                      onClick={() => onPickMyImage("detail")}
                    >
                      <Lang text={{ ko: "+ 내 이미지", en: "+ My images" }} />
                    </button>
                    <button
                      type="button"
                      className="text-xxs font-semibold text-primary hover:underline"
                      onClick={() => onUpload("detail")}
                    >
                      <Lang text={{ ko: "+ 업로드", en: "+ Upload" }} />
                    </button>
                    <button
                      type="button"
                      className="text-xxs font-semibold text-primary hover:underline"
                      onClick={() => {
                        const list = draftForm.detailImageUrlsText ? draftForm.detailImageUrlsText.split("\n") : [];
                        onFormChange({ detailImageUrlsText: [...list, ""].join("\n") });
                      }}
                    >
                      <Lang text={{ ko: "+ URL", en: "+ URL" }} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(draftForm.detailImageUrlsText.length === 0 ? [""] : draftForm.detailImageUrlsText.split("\n")).map(
                    (url, index, list) => (
                      <SmartstoreUrlImageCard
                        key={`detail-url-${index}`}
                        url={url}
                        emptyLabel={{
                          ko: `추가 이미지 ${index + 1}`,
                          en: `Additional ${index + 1}`,
                        }}
                        onChange={(next) => {
                          const arr = list.slice();
                          arr[index] = next;
                          onFormChange({ detailImageUrlsText: arr.join("\n") });
                        }}
                        onRemove={() => {
                          const arr = list.slice();
                          arr.splice(index, 1);
                          onFormChange({ detailImageUrlsText: arr.join("\n") });
                        }}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <p className="text-xxs font-semibold uppercase tracking-[0.18em] text-secondary-text">
              <Lang text={{ ko: "전체 이미지 (대표/추가/본문/생성)", en: "All Images" }} />
            </p>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          <SmartstoreImageAssetRail
            items={railItems}
            loadingGenerated={railLoading}
            actionPending={railActionPending}
            onEdit={onEditImage}
            onSetRepresentative={onSetRepresentative}
            onAddDetail={onAddDetail}
            onRemoveDetail={onRemoveDetail}
            onInsertBody={onInsertBody}
          />
        </div>
      </div>
    </details>
  );
}
