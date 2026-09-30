"use client";

import { useState } from "react";
import { Search, Image as ImageIcon, Download, Filter } from "lucide-react";
import Image from "next/image";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { logger } from "utils/log";
import fetchClient from "libs/api/fetchClient";
import { ensureGuestId } from "utils/normalize";

/* ================================================================
   Types & Constants
   ================================================================ */
interface ImageResult {
  id: string;
  src: string;
  alt: string;
  source: string;
  keyword: string;
  filename: string;
}

interface StockImageResult {
  id: string;
  source: "pexels" | "pixabay" | "unsplash";
  url: string;
  alt: string;
}

type StockImageSearchResponse = {
  success: boolean;
  data: StockImageResult[];
};

const FEATURES = [
  {
    icon: Search,
    title: { ko: "통합 검색", en: "Unified Search" },
    desc: { ko: "3개 소스를 한번에", en: "3 sources at once" },
  },
  {
    icon: Filter,
    title: { ko: "소스 필터", en: "Source Filter" },
    desc: { ko: "Pexels, Pixabay, Unsplash", en: "Pexels, Pixabay, Unsplash" },
  },
  {
    icon: Download,
    title: { ko: "JPG 다운로드", en: "JPG Download" },
    desc: { ko: "변환 후 바로 저장", en: "Convert and save instantly" },
  },
] as const;

/* ================================================================
   Main Component
   ================================================================ */
type SearchImgsPageProps = {
  startOpen?: boolean;
};

export default function SearchImgsPage({ startOpen = false }: SearchImgsPageProps = {}) {
  const [showTool, setShowTool] = useState(startOpen);
  const [query, setQuery] = useState("");
  const [queryCount, setQueryCount] = useState(2);
  const [isRandom, setIsRandom] = useState(true);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedApis, setSelectedApis] = useState({ pexels: true, pixabay: true, unsplash: true });

  /* ── helpers ── */
  const extractKeywords = (input: string): string[] => {
    const lines = input.includes("\n") ? input.split("\n") : input.split(",");
    const keywords: string[] = [];
    lines.forEach((line) => {
      const clean = line.replace(/^\d+\.\s*|^-\s*/g, "").trim();
      if (!clean) return;
      if (clean.includes(" ")) clean.split(/\s+/).forEach((w) => w && keywords.push(w));
      else keywords.push(clean);
    });
    return keywords;
  };

  const searchImages = async () => {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return;
    setIsSearching(true);
    setResults([]);
    const all: ImageResult[] = [];
    const providers = Object.entries(selectedApis)
      .filter(([, selected]) => selected)
      .map(([provider]) => provider)
      .join(",");
    const guestId = ensureGuestId();
    for (const kw of keywords) {
      try {
        const response = await fetchClient.get<StockImageSearchResponse>("/apps/image-search", {
          params: { q: kw, providers, count: queryCount, random: isRandom },
          headers: guestId ? { "x-guest-id": guestId } : undefined,
          timeout: 20000,
        });
        all.push(
          ...response.data.data.map((image) => ({
            id: `${image.source}:${image.id}`,
            src: image.url,
            alt: image.alt || "Image",
            source: image.source.charAt(0).toUpperCase() + image.source.slice(1),
            keyword: kw,
            filename: `${kw.replace(/\s+/g, "_")}_${image.id}.jpg`,
          })),
        );
      } catch (error) {
        logger.error("Stock image search error:", error);
      }
    }
    setResults(all);
    setIsSearching(false);
  };

  const convertImageToJpg = (imageUrl: string): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "Anonymous";
      img.src = imageUrl;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Empty canvas"))), "image/jpeg");
      };
      img.onerror = () => reject(new Error("Image load failed"));
    });

  const downloadImage = async (url: string, filename: string) => {
    try {
      const name = filename.toLowerCase().endsWith(".jpg") ? filename : filename.replace(/\.[^/.]+$/, "") + ".jpg";
      const blob = await convertImageToJpg(url);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      logger.error("Download error:", e);
    }
  };

  const handleFilenameChange = (id: string, filename: string) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, filename } : r)));
  };

  /* ── Landing ── */
  if (!showTool) {
    return (
      <div className="min-h-[60dvh] bg-background text-primary-text">
        <section className="mx-auto max-w-[50rem] px-5 pb-16 pt-12 sm:pt-20">
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <ImageIcon className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold sm:text-4xl">
              <Lang text={{ ko: "Search Images", en: "Search Images" }} />
            </h1>
            <p className="mt-3 text-base text-secondary-text sm:text-lg">
              <Lang
                text={{
                  ko: "Pexels, Pixabay, Unsplash에서 무료 이미지를 한번에 검색하고 다운로드하세요.",
                  en: "Search and download free images from Pexels, Pixabay, and Unsplash at once.",
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

          <Button variant="primary" size="xl" rounded="full" className="mt-10 w-full" onClick={() => setShowTool(true)}>
            <Search className="mr-2 h-4 w-4" />
            <Lang text={{ ko: "이미지 검색 시작", en: "Start Searching" }} />
          </Button>
        </section>
      </div>
    );
  }

  /* ── Tool UI ── */
  return (
    <div className="mx-auto max-w-[80rem] px-5 py-8 sm:px-8">
      {/* 검색 입력 */}
      <div className="mx-auto max-w-[50rem]">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">
            <Lang text={{ ko: "이미지 검색", en: "Image Search" }} />
          </h1>
          <Button onClick={searchImages} loading={isSearching}>
            <Search className="mr-1.5 h-4 w-4" />
            <Lang text={{ ko: "검색", en: "Search" }} />
          </Button>
        </div>

        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang({
            ko: "키워드를 입력하세요 (줄바꿈 또는 쉼표로 구분)",
            en: "Enter keywords (newline or comma separated)",
          })}
          rows={4}
          className="mt-4 w-full rounded-xl border border-border bg-surface p-3 text-sm text-primary-text placeholder:text-secondary-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="number"
              value={queryCount}
              onChange={(e) => setQueryCount(Number(e.target.value))}
              min={1}
              max={20}
              className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-center text-sm"
            />
            <span className="text-secondary-text">
              <Lang text={{ ko: "건", en: "per keyword" }} />
            </span>
          </label>

          <label className="flex items-center gap-2 text-secondary-text">
            <input
              type="checkbox"
              checked={isRandom}
              onChange={() => setIsRandom(!isRandom)}
              className="rounded border-border"
            />
            <Lang text={{ ko: "랜덤", en: "Random" }} />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {(["pexels", "pixabay", "unsplash"] as const).map((api) => (
            <label key={api} className="flex items-center gap-2 text-secondary-text">
              <input
                type="checkbox"
                checked={selectedApis[api]}
                onChange={() => setSelectedApis((prev) => ({ ...prev, [api]: !prev[api] }))}
                className="rounded border-border"
              />
              <span className="capitalize">{api}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 결과 그리드 */}
      {results.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">
            <Lang
              text={{
                ko: `검색 결과 (${results.length}건)`,
                en: `Results (${results.length})`,
              }}
            />
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {results.map((result) => (
              <div key={result.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="relative aspect-square">
                  <Image src={result.src} alt={result.alt} fill className="object-cover" unoptimized />
                </div>
                <div className="p-3">
                  <input
                    type="text"
                    value={result.filename}
                    onChange={(e) => handleFilenameChange(result.id, e.target.value)}
                    className="mb-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="xs"
                    rounded="lg"
                    className="w-full"
                    onClick={() => downloadImage(result.src, result.filename)}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    <Lang text={{ ko: "다운로드", en: "Download" }} />
                  </Button>
                  <div className="mt-2 flex items-center justify-between text-xxs text-secondary-text">
                    <span>{result.source}</span>
                    <span>{result.keyword}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
