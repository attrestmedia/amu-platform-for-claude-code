"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import type { ContentStudioApplyContentArgsType, ContentStudioReferenceImageType } from "types/app";
import { GeneratedContentRenderer } from "./GeneratedContentRenderer";

/** 생성 결과 표현 영역. 최근 자산 조회와 visibility/delete/reuse mutation은 도메인 hook에 위임한다. */
export function ContentStudioResult({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(className)}
      data-amu-gen-studio-region="result"
      aria-label={lang({ ko: "생성 결과", en: "Generated content" })}
    >
      {children}
    </section>
  );
}

export function ContentStudioOutputList({
  outputs,
  assetIds = [],
  referenceImages = [],
  onCopy,
  onApplyContent,
}: {
  outputs: string[];
  assetIds?: string[];
  referenceImages?: readonly ContentStudioReferenceImageType[];
  onCopy: (text: string) => void;
  onApplyContent?: (args: ContentStudioApplyContentArgsType) => Promise<void> | void;
}) {
  const [applyingAssetId, setApplyingAssetId] = useState("");
  if (outputs.length === 0) return null;

  return (
    <div className="space-y-3">
      {outputs.map((text, index) => (
        <div key={`${index}:${text.slice(0, 24)}`} className="rounded-lg border border-border bg-card p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-secondary-text"># {index + 1}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onCopy(text)} className="min-h-10 text-xs">
                <Lang text={{ ko: "복사", en: "Copy" }} />
              </Button>
              {onApplyContent && assetIds[index] ? (
                <Button
                  size="sm"
                  variant="primary"
                  loading={applyingAssetId === assetIds[index]}
                  onClick={async () => {
                    const assetId = assetIds[index];
                    setApplyingAssetId(assetId);
                    try {
                      await onApplyContent({
                        assetId,
                        text,
                        referenceImages: referenceImages.length ? [...referenceImages] : undefined,
                      });
                    } finally {
                      setApplyingAssetId("");
                    }
                  }}
                  className="min-h-10 text-xs"
                >
                  <Lang text={{ ko: "적용하기", en: "Apply" }} />
                </Button>
              ) : null}
            </div>
          </div>
          <GeneratedContentRenderer content={text} referenceImages={referenceImages} />
        </div>
      ))}
    </div>
  );
}
