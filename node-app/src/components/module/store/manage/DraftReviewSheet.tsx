"use client";

import { AlertCircle, CheckCircle2, ChevronDown, Shield } from "lucide-react";
import { Button, Checkbox, Sheet, SheetContent, SheetDescription, SheetTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { ICommerceDraftPublishPreview, ICommerceProductDraft } from "types/commerce";
import { PreviewBlock } from "./SmartstoreDraftBlocks";
import { mapValidationIssueToSection, type SmartstoreSectionKey } from "./smartstoreSectionStatus";
import { type DraftDiffRow } from "./smartstoreDraftUtils";

/**
 * @docHint
 * @purpose P4 등록 점검 Review Sheet — 스마트스토어 반영의 필수 관문(설계 제안 §6).
 *          readiness(✓/미충족)·변경 diff·검토 확인란을 한 시트에서 보고 [변경사항 반영]으로 publish한다.
 *          preview는 특정 revision에 결합된다 — draft revision이 바뀌면 invalid 상태로
 *          "다시 확인"을 요구한다(검토한 내용과 반영되는 내용의 동일성 보장).
 *          blocking 오류만 반영을 막고 advisory는 "권장 개선"으로 분리 표시한다.
 *          변경 없음(update 모드에서 diff 없음)이면 [변경사항 반영]을 노출하지 않는다.
 * @domain commerce.naver
 * @scope client
 */

export type DraftReviewChecklistItem = {
  key: "factualConfirmed" | "representativeImageConfirmed" | "aiDisclosureChecked";
  label: { ko: string; en: string };
  checked: boolean;
};

type DraftReviewSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** dirty 저장 + readiness + preview 진행 중 */
  preparing: boolean;
  /** preview가 검토한 draft revision. 현재 revision과 다르면 검토가 무효다. */
  previewRevision: number | null;
  invalid: boolean;
  onRefresh: () => void;
  validation?: ICommerceProductDraft["validation"];
  /** publish-preview 응답 — readiness validation + 전송 payload를 함께 담는다 */
  previewData?: {
    validation: ICommerceProductDraft["validation"];
    preview: ICommerceDraftPublishPreview;
  } | null;
  publishMode: "create" | "update";
  hasImportedSnapshot: boolean;
  diffRows: DraftDiffRow[];
  checklist: DraftReviewChecklistItem[];
  onChecklistChange: (key: DraftReviewChecklistItem["key"], checked: boolean) => void;
  onNavigateSection: (section: SmartstoreSectionKey) => void;
  publishPending: boolean;
  onPublish: () => void;
};

export function DraftReviewSheet({
  open,
  onOpenChange,
  preparing,
  previewRevision,
  invalid,
  onRefresh,
  validation,
  previewData,
  publishMode,
  hasImportedSnapshot,
  diffRows,
  checklist,
  onChecklistChange,
  onNavigateSection,
  publishPending,
  onPublish,
}: DraftReviewSheetProps) {
  const blockingErrors = validation?.errors || [];
  const advisoryWarnings = validation?.warnings || [];
  const changedRows = diffRows.filter((row) => row.changed);
  // update 모드에서 변경이 없으면 반영 자체가 무의미하다 — create 모드는 항상 신규 등록이다.
  const noChanges = publishMode === "update" && hasImportedSnapshot && changedRows.length === 0;
  const ready = Boolean(validation?.ready) && blockingErrors.length === 0;
  const sectionLabel: Record<SmartstoreSectionKey, { ko: string; en: string }> = {
    images: { ko: "상품 이미지", en: "Images" },
    product: { ko: "상품 정보", en: "Product Info" },
    required: { ko: "판매 정보", en: "Sales Info" },
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[calc(100%-1rem)] flex-col overflow-y-auto bg-surface p-0 sm:max-w-[32rem]"
      >
        <div className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base font-semibold text-primary-text">
            <Lang text={{ ko: "등록 점검", en: "Pre-publish Review" }} />
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "스마트스토어에 반영하기 전에 준비 상태와 변경 내용을 확인하세요.",
                en: "Review readiness and changes before applying to Smart Store.",
              }}
            />
          </SheetDescription>
        </div>

        <div className="flex-1 space-y-4 px-5 py-4">
          {preparing ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-secondary-text">
              <Lang
                text={{
                  ko: "최신 초안을 저장하고 점검을 준비하는 중입니다...",
                  en: "Saving the latest draft and preparing the review...",
                }}
              />
            </div>
          ) : invalid ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-amber-800">
                <Lang
                  text={{
                    ko: "상품이 변경되어 다시 확인이 필요합니다.",
                    en: "The product changed. Review again to continue.",
                  }}
                />
              </p>
              <p className="mt-1 text-xxs leading-4 text-amber-700">
                {previewRevision !== null
                  ? lang({
                      ko: `검토 시점 revision: ${previewRevision}`,
                      en: `Reviewed revision: ${previewRevision}`,
                    })
                  : null}
              </p>
              <Button size="sm" rounded="full" className="mt-3" onClick={onRefresh}>
                <Lang text={{ ko: "다시 확인", en: "Review again" }} />
              </Button>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                <div className="flex items-center gap-2">
                  {ready ? (
                    <CheckCircle2 className="icon-xs text-emerald-600" />
                  ) : (
                    <AlertCircle className="icon-xs text-amber-600" />
                  )}
                  <p className="text-sm font-semibold text-primary-text">
                    {ready ? (
                      <Lang text={{ ko: "등록 준비 완료", en: "Ready to publish" }} />
                    ) : (
                      <Lang text={{ ko: "반영 전에 확인이 필요합니다", en: "Needs attention before publishing" }} />
                    )}
                  </p>
                </div>
                {blockingErrors.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-amber-800">
                    {blockingErrors.map((item, index) => {
                      const section = mapValidationIssueToSection(item);
                      return (
                        <li
                          key={`${item.code}-${index}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-[0.75rem] border border-amber-200 bg-amber-50 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1">{item.message || item.code || item.field}</span>
                          {section ? (
                            <Button
                              size="xs"
                              variant="outline"
                              rounded="full"
                              className="shrink-0"
                              onClick={() => {
                                onOpenChange(false);
                                onNavigateSection(section);
                              }}
                            >
                              <Lang text={{ ko: "수정하기", en: "Fix" }} />
                              <Lang text={sectionLabel[section]} />
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>

              <section className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                <p className="text-sm font-semibold text-primary-text">
                  <Lang text={{ ko: "반영 전 확인", en: "Confirmations" }} />
                </p>
                <div className="mt-3 space-y-2.5">
                  {checklist.map((item) => (
                    <label
                      key={item.key}
                      className="flex cursor-pointer items-center gap-2.5 text-xs leading-5 text-primary-text"
                    >
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={(checked) => onChecklistChange(item.key, checked === true)}
                      />
                      <Lang text={item.label} />
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                <p className="text-sm font-semibold text-primary-text">
                  <Lang text={{ ko: "변경 사항", en: "Changes" }} />
                </p>
                {publishMode === "create" ? (
                  <p className="mt-2 text-xs leading-5 text-secondary-text">
                    <Lang
                      text={{
                        ko: "스마트스토어에 신규 상품으로 등록됩니다.",
                        en: "This draft will be published as a new Smart Store product.",
                      }}
                    />
                  </p>
                ) : hasImportedSnapshot ? (
                  changedRows.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {changedRows.map((row) => (
                        <div
                          key={row.key}
                          className="rounded-[0.75rem] border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs"
                        >
                          <p className="font-semibold uppercase tracking-[0.14em] text-secondary-text">
                            <Lang text={row.label} />
                          </p>
                          <p className="mt-1 text-secondary-text">
                            <Lang text={{ ko: "원본", en: "Source" }} />: {row.source || "-"}
                          </p>
                          <p className="mt-0.5 text-primary-text">
                            <Lang text={{ ko: "현재", en: "Current" }} />: {row.current || "-"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-[0.75rem] border border-dashed border-border px-3 py-4 text-center text-xs leading-5 text-secondary-text">
                      <Lang
                        text={{
                          ko: "현재 스마트스토어와 다른 변경사항이 없습니다.",
                          en: "No changes compared to the current Smart Store product.",
                        }}
                      />
                    </div>
                  )
                ) : (
                  <p className="mt-2 text-xs leading-5 text-secondary-text">
                    <Lang
                      text={{
                        ko: "기존 스마트스토어 상품을 가져오면 원본과의 차이가 여기에 표시됩니다.",
                        en: "Differences from the imported product will appear here.",
                      }}
                    />
                  </p>
                )}
                {advisoryWarnings.length > 0 ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="flex items-center gap-1.5 text-xxs font-semibold text-amber-700">
                      <Shield className="icon-xs" />
                      <Lang text={{ ko: "권장 개선 — 반영은 가능합니다", en: "Recommended — not blocking" }} />
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xxs leading-4 text-amber-700">
                      {advisoryWarnings.map((item, index) => (
                        <li key={`${item.code}-${index}`}>{item.message || item.code || item.field}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>

              {previewData ? (
                <section className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                  <details className="group [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-secondary-text">
                      <ChevronDown className="icon-xs transition-transform group-[&:not([open])]:-rotate-90" />
                      <Lang text={{ ko: "고급: 전송 데이터 보기", en: "Advanced: raw payload" }} />
                    </summary>
                    <div className="mt-3 space-y-3">
                      <PreviewBlock title={{ ko: "새 상품 등록 전송 내용", en: "New Product Payload" }} payload={previewData.preview.createPayload} />
                      <PreviewBlock title={{ ko: "스마트스토어 상품 수정 내용", en: "Channel Product Update" }} payload={previewData.preview.updatePayloads?.channelProduct} />
                      <PreviewBlock title={{ ko: "네이버 원상품 수정 내용", en: "Origin Product Update" }} payload={previewData.preview.updatePayloads?.originProduct} />
                    </div>
                  </details>
                </section>
              ) : null}
            </>
          )}
        </div>

        {!invalid && !preparing ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            <Button size="sm" variant="outline" rounded="full" onClick={() => onOpenChange(false)}>
              {noChanges ? (
                <Lang text={{ ko: "닫기", en: "Close" }} />
              ) : (
                <Lang text={{ ko: "취소", en: "Cancel" }} />
              )}
            </Button>
            {noChanges ? null : (
              <Button
                size="sm"
                rounded="full"
                disabled={blockingErrors.length > 0}
                loading={publishPending}
                onClick={onPublish}
              >
                <Lang
                  text={
                    publishMode === "create"
                      ? { ko: "새 상품 등록", en: "Publish New Product" }
                      : { ko: "변경사항 반영", en: "Apply Changes" }
                  }
                />
              </Button>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
