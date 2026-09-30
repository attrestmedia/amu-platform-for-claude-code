"use client";

import { Badge } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import type { VideoAsset } from "types/ai";

export function VideoPreviewCard({ asset }: { asset?: VideoAsset | null }) {
  return (
    <section
      aria-label="Generated video preview"
      className="overflow-hidden rounded-2xl border border-border bg-surface"
      data-amu-gen-studio-region="video-preview"
    >
      <div className="aspect-video w-full bg-surface-2">
        {asset?.url ? (
          <video
            className="h-full w-full object-contain"
            controls
            preload="metadata"
            playsInline
            src={asset.url}
            aria-label={asset.alt || "Generated video"}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-secondary-text">
            <Lang
              text={{
                ko: "생성된 영상이 이 영역에 표시됩니다.",
                en: "Your generated video will appear here.",
              }}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
        <p className="text-xs text-secondary-text">
          <Lang text={{ ko: "자동 재생하지 않음 · 미리보기는 내부 asset만 사용", en: "No autoplay · previews use internal assets only" }} />
        </p>
        {asset?.mimeType ? <Badge variant="outline" size="xs">{asset.mimeType}</Badge> : null}
      </div>
    </section>
  );
}

