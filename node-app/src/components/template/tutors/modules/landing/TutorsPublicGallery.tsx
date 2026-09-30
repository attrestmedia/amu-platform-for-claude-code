"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ImageBox } from "components/module/image";
import { lang } from "components/module/i18n";
import { cn } from "utils/common";
import type { PublicTutorGalleryItemType } from "types/ai";
import { TUTORS_LANDING_IMAGES } from "./tutorsLandingContent";

type GallerySlot = {
  left: string;
  top: string;
  width: string;
  rotate: number;
  scale: number;
  zIndex: number;
};

const GALLERY_SLOTS: GallerySlot[] = [
  { left: "8%", top: "34%", width: "42%", rotate: -6, scale: 0.98, zIndex: 30 },
  { left: "45%", top: "30%", width: "43%", rotate: 4, scale: 1.03, zIndex: 40 },
  { left: "50%", top: "6%", width: "39%", rotate: 7, scale: 0.94, zIndex: 20 },
  { left: "16%", top: "8%", width: "39%", rotate: -8, scale: 0.92, zIndex: 10 },
];

const GALLERY_CYCLE_MS = 2800;
const FRONT_SLOT_INDEX = 1;
const HOVER_Z_INDEX = 100;

type Props = {
  items: PublicTutorGalleryItemType[];
  onSelect: () => void;
};

export default function TutorsPublicGallery({ items, onSelect }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = (event?: MediaQueryListEvent) => setReducedMotion(event?.matches ?? query.matches);
    syncPreference();
    query.addEventListener("change", syncPreference);
    return () => query.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (reducedMotion || focusedIndex !== null || items.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, GALLERY_CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [focusedIndex, items.length, reducedMotion]);

  if (items.length === 0) {
    return <TutorsGalleryFallback />;
  }

  const safeActiveIndex = activeIndex % items.length;

  return (
    <div
      role="group"
      className="relative isolate h-full min-h-[20rem] w-full sm:min-h-[30rem]"
      aria-label={lang({ ko: "공개 튜터 이미지 갤러리", en: "Public tutor image gallery" })}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-8 rounded-full bg-primary/10 blur-3xl dark:bg-primary/5"
      />
      {items.map((item, index) => {
        const slotIndex = (index - safeActiveIndex + items.length) % items.length;
        const slot = GALLERY_SLOTS[slotIndex % GALLERY_SLOTS.length];
        const isFocused = focusedIndex === index;
        const isFront = !isFocused && focusedIndex === null && slotIndex === FRONT_SLOT_INDEX;
        const rotate = isFocused ? 0 : isFront ? slot.rotate * 0.65 : slot.rotate;
        const scale = isFocused ? 1.06 : isFront ? slot.scale + 0.02 : slot.scale;

        return (
          <button
            key={item.pid}
            type="button"
            onClick={onSelect}
            onMouseEnter={() => setFocusedIndex(index)}
            onMouseLeave={() => setFocusedIndex((current) => (current === index ? null : current))}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex((current) => (current === index ? null : current))}
            aria-label={lang({ ko: `${item.name} 튜터로 시작하기`, en: `Start with tutor ${item.name}` })}
            className={cn(
              "group absolute min-h-11 cursor-pointer overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl outline-none will-change-transform",
              "transition-[transform,box-shadow] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
              isFocused && "shadow-[0_30px_60px_-15px_rgba(0,0,0,0.45)]",
            )}
            style={{
              aspectRatio: "3 / 4",
              left: slot.left,
              top: slot.top,
              width: slot.width,
              transform: `rotate(${rotate}deg) scale(${scale})`,
              transformOrigin: "center center",
              zIndex: isFocused ? HOVER_Z_INDEX : slot.zIndex,
            }}
          >
            <ImageBox
              src={item.imageUrl}
              alt={lang({ ko: `${item.name} 공개 튜터`, en: `${item.name}, public tutor` })}
              width="100%"
              height="100%"
              objectFit="object-cover"
              allowUpscale
              sizes="(min-width: 1024px) 18rem, (min-width: 640px) 36vw, 44vw"
              className="absolute inset-0 h-full w-full"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 pt-10 text-left">
              <p className="truncate text-xs font-semibold text-white sm:text-sm">{item.name}</p>
              <p className="mt-0.5 text-xxs text-white/75">{lang({ ko: "공개 튜터", en: "Public tutor" })}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function TutorsGalleryFallback() {
  return (
    <div className="relative h-full min-h-[20rem] w-full overflow-hidden rounded-3xl sm:min-h-[30rem]">
      <Image
        src={TUTORS_LANDING_IMAGES.hero}
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 38rem, (min-width: 640px) 50vw, 100vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, color-mix(in srgb, var(--background) 20%, transparent), transparent 45%)",
        }}
      />
    </div>
  );
}
