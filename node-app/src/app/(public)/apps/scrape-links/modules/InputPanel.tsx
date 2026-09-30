"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, FileText, Save, Globe, X, RotateCcw, List, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { IScrapeLinkCategory } from "libs/api/mini-app/scrapeLinks";
import { listNaverBlogPosts } from "libs/api/thirdparty/scraper";
import {
  DEFAULT_SCRAPE_LINKS_BASE_DOMAIN,
  extractAndNormalizeAll,
  normalizeBaseDomain,
} from "utils/mini-apps/scrapeLinks";
import { toErrorMessage } from "utils/common";
import { UNCATEGORIZED_CATEGORY_VALUE } from "./categoryConstants";

type InputMode = "text" | "urls" | "naver";

type SubmitPayload = {
  text?: string;
  urls?: string[];
  source: "paste" | "manual" | "text-extract";
  baseDomain?: string | null;
};

const BASE_DOMAIN_STORAGE_KEY = "scrapeLinks:baseDomain";

function readStoredBaseDomain(): string {
  if (typeof window === "undefined") return DEFAULT_SCRAPE_LINKS_BASE_DOMAIN;
  try {
    const raw = window.localStorage.getItem(BASE_DOMAIN_STORAGE_KEY);
    const normalized = normalizeBaseDomain(raw || "");
    return normalized || DEFAULT_SCRAPE_LINKS_BASE_DOMAIN;
  } catch {
    return DEFAULT_SCRAPE_LINKS_BASE_DOMAIN;
  }
}

interface InputPanelProps {
  onSubmit: (payload: SubmitPayload) => void;
  saving: boolean;
  categories: IScrapeLinkCategory[];
  selectedCategoryId: string;
  onCategoryChange: (next: string) => void;
}

export function InputPanel({ onSubmit, saving, categories, selectedCategoryId, onCategoryChange }: InputPanelProps) {
  const [mode, setMode] = useState<InputMode>("text");
  const [value, setValue] = useState("");
  const [blogId, setBlogId] = useState("");
  const [naverFetching, setNaverFetching] = useState(false);
  const [baseDomain, setBaseDomain] = useState<string>(DEFAULT_SCRAPE_LINKS_BASE_DOMAIN);
  const [editingDomain, setEditingDomain] = useState(false);
  const [domainDraft, setDomainDraft] = useState<string>(DEFAULT_SCRAPE_LINKS_BASE_DOMAIN);
  const [domainError, setDomainError] = useState<string>("");

  // localStorage hydrate — 클라이언트 마운트 후 1회만
  useEffect(function hydrateBaseDomainFromStorage() {
    const stored = readStoredBaseDomain();
    // localStorage(외부 시스템) 값으로 초기 baseDomain 동기화
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBaseDomain(stored);
    setDomainDraft(stored);
  }, []);

  const preview = useMemo(() => {
    if (mode === "naver") return [];
    if (!value.trim()) return [];
    if (mode === "text") return extractAndNormalizeAll(value, { baseDomain });
    const urls = value
      .split(/[\n,;\s]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    return extractAndNormalizeAll(urls.join("\n"), { baseDomain });
  }, [baseDomain, mode, value]);

  const canSubmit =
    mode === "naver" ? blogId.trim().length > 1 && !saving && !naverFetching : preview.length > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (mode === "text") {
      onSubmit({ text: value, source: "text-extract", baseDomain });
      setValue("");
      return;
    }
    if (mode === "urls") {
      onSubmit({ urls: preview.map((it) => it.normalizedUrl), source: "paste", baseDomain });
      setValue("");
      return;
    }
    // mode === "naver"
    setNaverFetching(true);
    try {
      const result = await listNaverBlogPosts({ blogId: blogId.trim(), maxPages: 20, limit: 300 });
      const urls = (result.posts || [])
        .map((p) => p?.url)
        .filter((u): u is string => typeof u === "string" && u.length > 0);
      if (!urls.length) {
        toast.message(lang({ ko: "포스트를 찾지 못했습니다.", en: "No posts found." }));
        return;
      }
      toast.success(
        lang({
          ko: `${result.count ?? urls.length}개 포스트를 가져왔습니다.`,
          en: `Fetched ${result.count ?? urls.length} posts.`,
        }),
      );
      onSubmit({ urls, source: "paste", baseDomain });
      setBlogId("");
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, lang({ ko: "네이버 블로그 가져오기 실패", en: "Naver fetch failed." })));
    } finally {
      setNaverFetching(false);
    }
  };

  const handleStartEditDomain = () => {
    setDomainDraft(baseDomain);
    setDomainError("");
    setEditingDomain(true);
  };

  const handleCancelEditDomain = () => {
    setDomainDraft(baseDomain);
    setDomainError("");
    setEditingDomain(false);
  };

  const handleSaveDomain = () => {
    const normalized = normalizeBaseDomain(domainDraft);
    if (!normalized) {
      setDomainError(lang({ ko: "유효한 도메인을 입력하세요.", en: "Enter a valid domain." }));
      return;
    }
    setBaseDomain(normalized);
    setDomainDraft(normalized);
    setDomainError("");
    setEditingDomain(false);
    try {
      window.localStorage.setItem(BASE_DOMAIN_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
  };

  const handleCopyPreview = async () => {
    if (!preview.length) return;
    const text = preview.map((it) => it.normalizedUrl).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(
        lang({
          ko: `${preview.length}건 URL 복사됨`,
          en: `Copied ${preview.length} URLs`,
        }),
      );
    } catch {
      toast.error(lang({ ko: "복사 실패", en: "Copy failed" }));
    }
  };

  const handleResetDomain = () => {
    setBaseDomain(DEFAULT_SCRAPE_LINKS_BASE_DOMAIN);
    setDomainDraft(DEFAULT_SCRAPE_LINKS_BASE_DOMAIN);
    setDomainError("");
    setEditingDomain(false);
    try {
      window.localStorage.removeItem(BASE_DOMAIN_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const isDefaultDomain = baseDomain === DEFAULT_SCRAPE_LINKS_BASE_DOMAIN;

  return (
    <section className="rounded-2xl border border-border/60 bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-full bg-background p-1">
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              mode === "text" ? "bg-primary text-white" : "text-secondary-text"
            }`}
            onClick={() => setMode("text")}
          >
            <FileText className="h-3.5 w-3.5" />
            <Lang text={{ ko: "텍스트에서 추출", en: "Extract from text" }} />
          </button>
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              mode === "urls" ? "bg-primary text-white" : "text-secondary-text"
            }`}
            onClick={() => setMode("urls")}
          >
            <Link2 className="h-3.5 w-3.5" />
            <Lang text={{ ko: "URL 목록 붙여넣기", en: "Paste URL list" }} />
          </button>
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              mode === "naver" ? "bg-primary text-white" : "text-secondary-text"
            }`}
            onClick={() => setMode("naver")}
          >
            <List className="h-3.5 w-3.5" />
            <Lang text={{ ko: "네이버 블로그", en: "Naver Blog" }} />
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-secondary-text whitespace-nowrap">
            {preview.length > 0 ? (
              <Lang
                text={{
                  ko: `${preview.length}개 발견`,
                  en: `${preview.length} found`,
                }}
              />
            ) : null}
          </span>

          <Select
            value={selectedCategoryId}
            onValueChange={(value) => onCategoryChange(String(value || UNCATEGORIZED_CATEGORY_VALUE))}
          >
            <SelectTrigger size="sm" className="bg-background">
              <SelectValue placeholder={lang({ ko: "저장 카테고리 선택", en: "Select storage category" })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNCATEGORIZED_CATEGORY_VALUE}>
                <Lang text={{ ko: "미분류", en: "Uncategorized" }} />
              </SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === "naver" ? (
        <Input
          value={blogId}
          onChange={(e) => setBlogId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={lang({ ko: "네이버 블로그 ID", en: "Naver Blog ID (e.g. rihodad)" })}
          className="w-full"
        />
      ) : (
        <textarea
          className="w-full rounded-xl border border-border bg-background p-3 text-sm text-primary-text placeholder:text-secondary-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={
            mode === "text"
              ? lang({
                  ko: "메시지/글을 그대로 붙여넣으세요. 링크만 자동으로 추출합니다.",
                  en: "Paste any text. Links will be extracted automatically.",
                })
              : lang({
                  ko: "URL을 한 줄에 하나씩 붙여넣으세요.",
                  en: "Paste one URL per line.",
                })
          }
          rows={6}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}

      {editingDomain ? (
        <div className="flex flex-col gap-2 mt-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-secondary-text">
            <Globe className="h-3.5 w-3.5" />
            <Lang
              text={{
                ko: "상대 경로에 연결할 기본 도메인",
                en: "Default domain for relative paths",
              }}
            />
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={domainDraft}
              onChange={(e) => {
                setDomainDraft(e.target.value);
                if (domainError) setDomainError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveDomain();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancelEditDomain();
                }
              }}
              placeholder="https://allmyuniverse.com"
              className="min-w-[16rem] flex-1"
              size="sm"
              autoFocus
            />
            <Button variant="primary" size="sm" onClick={handleSaveDomain}>
              <Lang text={{ ko: "저장", en: "Save" }} />
            </Button>
          </div>
          {domainError && <p className="text-xs text-danger">{domainError}</p>}
          <div className="flex items-center gap-4 ml-auto">
            <Button variant="text" size="xs" onClick={handleCancelEditDomain} className="flex items-center px-0">
              <X className="mr-1 h-3.5 w-3.5" />
              <Lang text={{ ko: "취소", en: "Cancel" }} />
            </Button>
            <Button
              variant="text"
              size="xs"
              onClick={handleResetDomain}
              disabled={isDefaultDomain}
              className="flex items-center px-0"
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              <Lang text={{ ko: "기본값", en: "Reset" }} />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-secondary-text" />
          <span className="text-xs text-secondary-text">
            <Lang text={{ ko: "기본 도메인:", en: "Default domain:" }} />
          </span>
          <span className="truncate text-xs font-medium text-primary-text">{baseDomain}</span>
          {!isDefaultDomain && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-medium text-primary">
              <Lang text={{ ko: "사용자 지정", en: "Custom" }} />
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleStartEditDomain} className="ml-auto">
            <Lang text={{ ko: "편집", en: "Edit" }} />
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="md"
          onClick={handleSubmit}
          disabled={!canSubmit}
          loading={saving || naverFetching}
        >
          <Save className="mr-1.5 h-4 w-4" />
          {mode === "naver" ? (
            <Lang text={{ ko: "포스트 가져와 저장", en: "Fetch & save posts" }} />
          ) : (
            <Lang
              text={{
                ko: preview.length > 0 ? `${preview.length}개 저장` : "저장",
                en: preview.length > 0 ? `Save ${preview.length}` : "Save",
              }}
            />
          )}
        </Button>
        {mode !== "naver" && value && (
          <Button variant="ghost" size="md" onClick={() => setValue("")}>
            <Lang text={{ ko: "지우기", en: "Clear" }} />
          </Button>
        )}
        {mode === "naver" && blogId && (
          <Button variant="ghost" size="md" onClick={() => setBlogId("")}>
            <Lang text={{ ko: "지우기", en: "Clear" }} />
          </Button>
        )}
      </div>

      {preview.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-secondary-text">
              <Lang
                text={{
                  ko: `미리보기 (${preview.length}건)`,
                  en: `Preview (${preview.length})`,
                }}
              />
            </span>
            <Button variant="ghost" size="xs" onClick={handleCopyPreview}>
              <Copy className="mr-1 h-3 w-3" />
              <Lang text={{ ko: "복사", en: "Copy" }} />
            </Button>
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-background/60 p-2 text-xs text-secondary-text">
            {preview.map((it) => (
              <li key={it.normalizedUrl} className="truncate">
                · {it.normalizedUrl}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
