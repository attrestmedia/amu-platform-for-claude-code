"use client";

import { Fragment } from "react";
import { RichTextRenderer } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import type { ContentStudioReferenceImageType } from "types/app";
import {
  distributeGeneratedContentImageSlots,
  splitGeneratedContentBlocks,
} from "utils/commerce/generatedContentLayout";

type GeneratedContentRendererProps = {
  content: string;
  referenceImages?: readonly ContentStudioReferenceImageType[];
  className?: string;
};

export function GeneratedContentRenderer({ content, referenceImages = [], className }: GeneratedContentRendererProps) {
  const blocks = splitGeneratedContentBlocks(content);
  const images = referenceImages.filter((image) => Boolean(image?.previewUrl)).slice(0, 4);
  const slots = distributeGeneratedContentImageSlots(blocks.length, images.length);
  const imagesByBlock = new Map<number, ContentStudioReferenceImageType[]>();

  images.forEach((image, index) => {
    const blockIndex = slots[index] ?? blocks.length - 1;
    const current = imagesByBlock.get(blockIndex) || [];
    current.push(image);
    imagesByBlock.set(blockIndex, current);
  });

  return (
    <div className={className}>
      {blocks.map((block, blockIndex) => (
        <Fragment key={`${blockIndex}:${block.slice(0, 24)}`}>
          <RichTextRenderer content={block} />
          {(imagesByBlock.get(blockIndex) || []).map((image, imageIndex) => (
            <figure key={`${image.name}:${imageIndex}`} className="my-4 overflow-hidden rounded-xl border border-border bg-muted/20">
              <ImageBox
                src={image.previewUrl}
                alt={image.name || `reference-${imageIndex + 1}`}
                width="100%"
                height="auto"
                minWidth={220}
                maxWidth={720}
                minHeight={140}
                maxHeight={520}
                objectFit="object-contain"
                sizes="(max-width: 640px) 92vw, 720px"
                className="w-full"
              />
              <figcaption className="border-t border-border/70 px-3 py-2 text-xxs text-secondary-text">
                참고 이미지 {imageIndex + 1}
              </figcaption>
            </figure>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
