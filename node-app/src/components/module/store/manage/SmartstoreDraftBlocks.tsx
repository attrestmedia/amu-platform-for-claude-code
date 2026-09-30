"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { MoreVertical, X } from "lucide-react";
import { Badge, Button, Dropdown, Input } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { UnknownRecord } from "utils/common/typeUtils";
import type { SmartstoreImageRailItem } from "./smartstoreDraftUtils";

export function PreviewBlock({ title, payload }: { title: { ko: string; en: string }; payload: UnknownRecord | undefined }) {
  const pretty = useMemo(() => JSON.stringify(payload || {}, null, 2), [payload]);
  return (
    <div className="rounded-[1.1rem] border border-border bg-background/80">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold text-primary-text">
        <Lang text={title} />
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-xs leading-6 text-secondary-text">{pretty}</pre>
    </div>
  );
}

export function SmartstoreUrlImageCard({
  url,
  emptyLabel,
  onChange,
  onRemove,
}: {
  url: string;
  emptyLabel: { ko: string; en: string };
  onChange: (next: string) => void;
  onRemove?: () => void;
}) {
  const trimmed = url.trim();
  const [editing, setEditing] = useState(!trimmed);
  return (
    <div className="overflow-hidden rounded-[0.9rem] border border-border bg-surface">
      <div className="relative aspect-square w-full bg-background">
        {trimmed ? (
          <Image src={trimmed} alt="" fill unoptimized sizes="180px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center text-xxs leading-4 text-secondary-text">
            <Lang text={emptyLabel} />
          </div>
        )}
        {onRemove ? (
          <button
            type="button"
            className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-secondary-text shadow-sm hover:text-danger"
            aria-label={lang({ ko: "이미지 제거", en: "Remove image" })}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="space-y-1.5 px-2 py-2">
        {editing ? (
          <Input
            value={url}
            placeholder={lang({ ko: "https://...", en: "https://..." })}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => {
              if (url.trim()) setEditing(false);
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="block w-full truncate text-left text-xxs leading-4 text-secondary-text transition hover:text-primary"
            onClick={() => setEditing(true)}
            title={trimmed || lang({ ko: "URL 입력", en: "Enter URL" })}
          >
            {trimmed || lang({ ko: "URL 입력", en: "Enter URL" })}
          </button>
        )}
      </div>
    </div>
  );
}

export function SmartstoreImageAssetRail({
  items,
  loadingGenerated,
  actionPending,
  onEdit,
  onSetRepresentative,
  onAddDetail,
  onRemoveDetail,
  onInsertBody,
}: {
  items: SmartstoreImageRailItem[];
  loadingGenerated: boolean;
  actionPending: boolean;
  onEdit: (item: SmartstoreImageRailItem) => void;
  onSetRepresentative: (item: SmartstoreImageRailItem) => void;
  onAddDetail: (item: SmartstoreImageRailItem) => void;
  onRemoveDetail: (item: SmartstoreImageRailItem) => void;
  onInsertBody: (item: SmartstoreImageRailItem) => void;
}) {
  if (!items.length && loadingGenerated) {
    return (
      <div className="rounded-[1rem] border border-dashed border-border px-4 py-8 text-center text-xs text-secondary-text">
        <Lang text={{ ko: "이미지를 불러오는 중입니다...", en: "Loading images..." }} />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-[1rem] border border-dashed border-border px-4 py-8 text-center text-xs leading-5 text-secondary-text">
        <Lang
          text={{
            ko: "대표 이미지, 추가 이미지, 본문 이미지 또는 Gen Studio 생성 이미지가 아직 없습니다.",
            en: "No representative, detail, body, or Gen Studio images yet.",
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.id} className="overflow-hidden rounded-[1rem] border border-border bg-surface">
          <div className="relative aspect-square w-full bg-background">
            <Image src={item.url} alt="" fill unoptimized sizes="180px" className="object-cover" />
            <div className="absolute left-2 top-2">
              <Badge variant={item.role === "generated" ? "accent" : "outline"} size="xs">
                <Lang text={item.label} />
              </Badge>
            </div>
          </div>
          <div className="space-y-3 px-3 py-3">
            <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-secondary-text">
              {item.description || item.templateKey || item.url}
            </p>
            {/* 카드 기본 액션 1개 + ⋯ overflow — 가이드 §11(직접 노출 0~2개 + overflow) */}
            <div className="flex items-center justify-between gap-2">
              {item.role !== "representative" ? (
                <Button
                  size="xs"
                  rounded="md"
                  onClick={() => onSetRepresentative(item)}
                  loading={actionPending && Boolean(item.assetId)}
                >
                  <Lang text={{ ko: "대표로", en: "Set hero" }} />
                </Button>
              ) : (
                <Badge size="xs" variant="primary">
                  <Lang text={{ ko: "대표 이미지", en: "Representative" }} />
                </Badge>
              )}
              <Dropdown
                variant="ghost"
                options={[
                  {
                    value: "edit",
                    label: lang({ ko: "Gen Studio에서 편집", en: "Edit in Gen Studio" }),
                  },
                  item.role === "detail"
                    ? {
                        value: "removeDetail",
                        label: lang({ ko: "추가 이미지에서 제거", en: "Remove from additional" }),
                      }
                    : {
                        value: "addDetail",
                        label: lang({ ko: "추가 이미지로", en: "Use as additional" }),
                      },
                  {
                    value: "insertBody",
                    label: lang({ ko: "본문에 삽입", en: "Insert into body" }),
                  },
                ]}
                selected={null}
                onSelect={(value) => {
                  if (value === "edit") onEdit(item);
                  else if (value === "addDetail") onAddDetail(item);
                  else if (value === "removeDetail") onRemoveDetail(item);
                  else if (value === "insertBody") onInsertBody(item);
                }}
                renderTrigger={() => (
                  <MoreVertical className="icon-xs" aria-hidden="true" />
                )}
                hideArrow
                openPortal
                openSide="bottom"
                contentAlign="end"
                contentSideOffset={6}
                triggerAriaLabel={lang({ ko: "이미지 더보기", en: "More image actions" })}
                className="h-7 w-7 shrink-0 justify-center border-0 bg-transparent p-0"
                dropdownClassName="min-w-44 rounded-xl border-border p-1 shadow-xl"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
