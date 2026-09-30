"use client";

import React, { useState } from "react";
import { Pencil, Sparkles, Download, Layers } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { CanvasDrawingApp } from "components/template/canvas-drawing/CanvasDrawingApp";

const FEATURES = [
  {
    icon: Sparkles,
    title: { ko: "자유로운 드로잉", en: "Free Drawing" },
    desc: { ko: "펜, 브러시, 색상을 자유롭게", en: "Free pen, brush & color tools" },
  },
  {
    icon: Layers,
    title: { ko: "레이어 지원", en: "Layer Support" },
    desc: { ko: "레이어로 체계적 작업", en: "Organize with layers" },
  },
  {
    icon: Download,
    title: { ko: "이미지 저장", en: "Save Image" },
    desc: { ko: "완성된 작업을 바로 다운로드", en: "Download your finished work" },
  },
] as const;

export default function DrawingPage() {
  const [showCanvas, setShowCanvas] = useState(false);

  if (showCanvas) {
    return (
      <div className="h-[calc(100dvh-3.5rem)] w-full sm:h-[calc(100dvh-4rem)]">
        <CanvasDrawingApp />
      </div>
    );
  }

  return (
    <div className="min-h-[60dvh] bg-background text-primary-text">
      <section className="mx-auto max-w-[50rem] px-5 pb-16 pt-12 sm:pt-20">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Pencil className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">
            <Lang text={{ ko: "Drawing", en: "Drawing" }} />
          </h1>
          <p className="mt-3 text-base text-secondary-text sm:text-lg">
            <Lang
              text={{
                ko: "빠르게 스케치하고 시각 아이디어를 정리하세요.",
                en: "Sketch quickly and organize your visual ideas.",
              }}
            />
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title.en}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-surface p-6 text-center"
            >
              <Icon className="h-6 w-6 text-primary" />
              <div className="text-sm font-semibold">
                <Lang text={title} />
              </div>
              <div className="text-xs text-secondary-text">
                <Lang text={desc} />
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="primary"
          size="xl"
          rounded="full"
          className="mt-10 w-full"
          onClick={() => setShowCanvas(true)}
        >
          <Pencil className="mr-2 h-4 w-4" />
          <Lang text={{ ko: "드로잉 시작하기", en: "Start Drawing" }} />
        </Button>
      </section>
    </div>
  );
}
