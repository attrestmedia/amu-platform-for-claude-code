"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Label, Preloader, Textarea } from "@amu-labs/ui";
import { Check, Copy, Power, RefreshCw } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { listAdminCardNewsTemplates, mutateAdminCardNewsTemplate } from "libs/api/lab";
import {
  getCardNewsTemplatePreset,
  validateCardNewsTemplatePreset,
} from "libs/card-news/templateResolver";
import {
  CARD_NEWS_BUILT_IN_TEMPLATE_ID,
  CARD_NEWS_BUILT_IN_TEMPLATE_VERSION,
  type CardNewsTemplatePreset,
  type CardNewsTemplateRegistryEntry,
  type CardNewsTemplateRegistryStatus,
} from "types/card-news";
import { cn, runAfterCurrentRender, toErrorMessage } from "utils/common";

type DraftMode = "register" | "publish_version";

const DEFAULT_PRESET = getCardNewsTemplatePreset({
  id: CARD_NEWS_BUILT_IN_TEMPLATE_ID,
  version: CARD_NEWS_BUILT_IN_TEMPLATE_VERSION,
});

function formatPreset(preset: CardNewsTemplatePreset, version = preset.version) {
  return JSON.stringify({ ...preset, version }, null, 2);
}

function entryKey(entry: CardNewsTemplateRegistryEntry) {
  return `${entry.id}@${entry.version}`;
}

export function CardNewsTemplateAdminPanel() {
  const [entries, setEntries] = useState<CardNewsTemplateRegistryEntry[]>([]);
  const [draftMode, setDraftMode] = useState<DraftMode>("register");
  const [draftJson, setDraftJson] = useState(() => formatPreset(DEFAULT_PRESET));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      setEntries(await listAdminCardNewsTemplates());
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "카드뉴스 템플릿 목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runAfterCurrentRender(() => void loadEntries());
  }, [loadEntries]);

  const parsedDraft = useMemo(() => {
    try {
      return validateCardNewsTemplatePreset(JSON.parse(draftJson)) as CardNewsTemplatePreset;
    } catch {
      return null;
    }
  }, [draftJson]);

  const submitDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parsedDraft) {
      setErrorMessage("프리셋 JSON이 유효하지 않습니다. 계약 버전·레이아웃·슬롯을 확인해 주세요.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      await mutateAdminCardNewsTemplate({ action: draftMode, preset: parsedDraft });
      setMessage(draftMode === "register" ? "프리셋 버전을 DB에 등록했습니다." : "새 프리셋 버전을 발행했습니다.");
      await loadEntries();
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "프리셋을 저장하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const prepareNewVersion = (entry: CardNewsTemplateRegistryEntry) => {
    const latestVersion = Math.max(
      entry.version,
      ...entries.filter((candidate) => candidate.id === entry.id).map((candidate) => candidate.version),
    );
    setDraftMode("publish_version");
    setDraftJson(formatPreset(entry.preset, latestVersion + 1));
    setMessage(`${entry.id}@${latestVersion + 1} 초안을 준비했습니다. JSON을 검토한 뒤 발행하세요.`);
    setErrorMessage("");
  };

  const changeStatus = async (entry: CardNewsTemplateRegistryEntry, status: CardNewsTemplateRegistryStatus) => {
    if (entry.source !== "database") {
      setErrorMessage("built-in preset은 먼저 DB에 등록한 뒤 활성화·비활성화할 수 있습니다.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      await mutateAdminCardNewsTemplate({ action: status === "active" ? "activate" : "deactivate", id: entry.id, version: entry.version });
      setMessage(`${entry.id}@${entry.version}을 ${status === "active" ? "활성화" : "비활성화"}했습니다.`);
      await loadEntries();
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "템플릿 상태를 변경하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const registerBuiltIn = (entry: CardNewsTemplateRegistryEntry) => {
    setDraftMode("register");
    setDraftJson(formatPreset(entry.preset));
    setMessage(`${entry.id}@${entry.version} DB 등록 초안을 준비했습니다.`);
    setErrorMessage("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">CardNews</p>
          <h1 className="mt-1 text-xl font-bold text-primary-text">
            <Lang text={{ ko: "템플릿 레지스트리", en: "Template registry" }} />
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-text">
            <Lang text={{ ko: "버전은 수정하지 않고 새 버전으로 발행합니다. 기존 덱은 저장 당시 template id/version을 계속 사용합니다.", en: "Versions are immutable. Publish a new version instead of editing one; existing decks keep their original template id and version." }} />
          </p>
        </div>
        <Button variant="outline" className="min-h-11 shrink-0 gap-2 self-start" onClick={() => void loadEntries()} disabled={loading || saving}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
          <Lang text={{ ko: "새로고침", en: "Refresh" }} />
        </Button>
      </div>

      {errorMessage ? <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">{errorMessage}</p> : null}
      {message ? <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary" role="status" aria-live="polite">{message}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <form className="space-y-3 rounded-2xl border border-border bg-surface p-4" onSubmit={submitDraft}>
          <div>
            <h2 className="text-base font-semibold text-primary-text"><Lang text={{ ko: "프리셋 등록·새 버전 발행", en: "Register or publish a preset" }} /></h2>
            <p className="mt-1 text-xs leading-5 text-secondary-text"><Lang text={{ ko: "전체 preset contract JSON을 검증한 뒤 immutable snapshot으로 저장합니다.", en: "Validate the full preset contract JSON before saving an immutable snapshot." }} /></p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-news-template-draft-mode" label={<Lang text={{ ko: "작업", en: "Action" }} />} />
            <select id="card-news-template-draft-mode" className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-primary-text" value={draftMode} onChange={(event) => setDraftMode(event.target.value as DraftMode)}>
              <option value="register">{lang({ ko: "새 template id/version 등록", en: "Register template id/version" })}</option>
              <option value="publish_version">{lang({ ko: "기존 template의 다음 버전 발행", en: "Publish next version" })}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-news-template-draft-json" label={<Lang text={{ ko: "Preset contract JSON", en: "Preset contract JSON" }} />} />
            <Textarea id="card-news-template-draft-json" value={draftJson} onChange={(event) => setDraftJson(event.target.value)} rows={24} className="min-h-[30rem] resize-y font-mono text-xs leading-5" spellCheck={false} aria-describedby="card-news-template-draft-help" />
            <p id="card-news-template-draft-help" className={cn("text-xs leading-5", parsedDraft ? "text-secondary-text" : "text-danger")}>
              {parsedDraft
                ? `${parsedDraft.id}@${parsedDraft.version} · ${parsedDraft.fontFamily} · ${parsedDraft.supportedAspectRatios.join(", ")}`
                : "JSON을 입력하면 contract validation 결과가 여기에 표시됩니다."}
            </p>
          </div>
          <Button type="submit" className="min-h-11 w-full gap-2" disabled={!parsedDraft || saving}>
            <Check className="size-4" aria-hidden />
            <Lang text={{ ko: draftMode === "register" ? "DB에 immutable 등록" : "다음 버전 발행", en: draftMode === "register" ? "Register immutable version" : "Publish next version" }} />
          </Button>
        </form>

        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4" aria-labelledby="card-news-template-registry-list-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="card-news-template-registry-list-title" className="text-base font-semibold text-primary-text"><Lang text={{ ko: `등록된 버전 (${entries.length})`, en: `Registered versions (${entries.length})` }} /></h2>
              <p className="mt-1 text-xs leading-5 text-secondary-text"><Lang text={{ ko: "같은 template id에서는 한 버전만 active가 되도록 관리합니다.", en: "Only one version per template id remains active." }} /></p>
            </div>
          </div>
          {loading && entries.length === 0 ? <div className="flex min-h-32 items-center justify-center"><Preloader /></div> : null}
          {!loading && entries.length === 0 ? <p className="rounded-lg bg-background p-3 text-sm text-secondary-text"><Lang text={{ ko: "등록된 템플릿이 없습니다.", en: "No templates registered." }} /></p> : null}
          <div className="space-y-2">
            {entries.map((entry) => (
              <article key={entryKey(entry)} className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-primary-text"><Lang text={entry.preset.name} /></p>
                    <p className="mt-1 break-all font-mono text-xs text-secondary-text">{entryKey(entry)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Badge variant={entry.status === "active" ? "primary" : "outline"} size="xs">{entry.status}</Badge>
                    <Badge variant="outline" size="xs">{entry.source}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-secondary-text"><Lang text={entry.preset.description} /></p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.source === "builtin" ? (
                    <Button variant="outline" className="min-h-11 gap-2" onClick={() => registerBuiltIn(entry)} disabled={saving}>
                      <Copy className="size-4" aria-hidden />
                      <Lang text={{ ko: "DB에 등록", en: "Register in DB" }} />
                    </Button>
                  ) : null}
                  {entry.source === "database" ? (
                    <>
                      <Button variant="outline" className="min-h-11 gap-2" onClick={() => void changeStatus(entry, entry.status === "active" ? "inactive" : "active")} disabled={saving}>
                        <Power className="size-4" aria-hidden />
                        <Lang text={{ ko: entry.status === "active" ? "비활성화" : "활성화", en: entry.status === "active" ? "Deactivate" : "Activate" }} />
                      </Button>
                      <Button variant="outline" className="min-h-11 gap-2" onClick={() => prepareNewVersion(entry)} disabled={saving}>
                        <Copy className="size-4" aria-hidden />
                        <Lang text={{ ko: "새 버전 작성", en: "Draft new version" }} />
                      </Button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
