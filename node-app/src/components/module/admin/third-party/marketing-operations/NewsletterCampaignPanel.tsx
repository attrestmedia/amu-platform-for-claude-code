"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@amu-labs/ui";
import { RefreshCw } from "lucide-react";
import { lang } from "components/module/i18n";

type Checklist = { copy: boolean; links: boolean; claims: boolean; consentGate: boolean };
type Campaign = {
  campaignId: string;
  issueId: string;
  status: string;
  draft?: {
    issueTitle?: string;
    intro?: string;
    stories?: Array<{ title?: string; source?: string; commercialLabel?: string }>;
    claims?: Array<{ verified?: boolean }>;
  };
  testMessageId?: string;
};

const EMPTY_CHECKLIST: Checklist = { copy: false, links: false, claims: false, consentGate: false };

function campaignTitle(campaign: Campaign) {
  return String(campaign.draft?.issueTitle || campaign.issueId || campaign.campaignId);
}

export function NewsletterCampaignPanel({ universeId }: { universeId?: string }) {
  const [items, setItems] = useState<Campaign[]>([]);
  const [checklists, setChecklists] = useState<Record<string, Checklist>>({});
  const [testRecipients, setTestRecipients] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    setBusyKey("load");
    setMessage("");
    try {
      const query = universeId ? `?universeId=${encodeURIComponent(universeId)}` : "";
      const response = await fetch(`/api/newsletter/campaigns${query}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { data?: { items?: Campaign[] }; error?: string };
      if (response.status === 404 && payload.error === "newsletter_campaign_disabled") {
        setDisabled(true);
        setItems([]);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "newsletter_campaign_load_failed");
      setDisabled(false);
      setItems(payload.data?.items || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "newsletter_campaign_load_failed");
    } finally {
      setBusyKey("");
    }
  }, [universeId]);

  useEffect(() => {
    // 초기 API 동기화 결과를 화면 상태에 반영하는 유일한 effect다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const updateChecklist = (campaignId: string, key: keyof Checklist, value: boolean) => {
    setChecklists((current) => ({
      ...current,
      [campaignId]: { ...(current[campaignId] || EMPTY_CHECKLIST), [key]: value },
    }));
  };

  const approve = async (campaign: Campaign) => {
    const checklist = checklists[campaign.campaignId] || EMPTY_CHECKLIST;
    if (!Object.values(checklist).every(Boolean)) return;
    setBusyKey(`approve:${campaign.campaignId}`);
    setMessage("");
    try {
      const response = await fetch(`/api/newsletter/campaigns/${encodeURIComponent(campaign.campaignId)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checklist }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "newsletter_campaign_approve_failed");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "newsletter_campaign_approve_failed");
    } finally {
      setBusyKey("");
    }
  };

  const testSend = async (campaign: Campaign) => {
    const recipientEmail = String(testRecipients[campaign.campaignId] || "").trim();
    if (!recipientEmail) return;
    setBusyKey(`test:${campaign.campaignId}`);
    setMessage("");
    try {
      const response = await fetch(
        `/api/newsletter/campaigns/${encodeURIComponent(campaign.campaignId)}/test-send`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recipientEmail }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "newsletter_campaign_test_send_failed");
      setMessage(lang({ ko: "테스트 발송 queue 등록을 완료했습니다.", en: "Test send was queued." }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "newsletter_campaign_test_send_failed");
    } finally {
      setBusyKey("");
    }
  };

  const checklistLabels = useMemo(
    () =>
      [
        ["copy", "문안 검수"],
        ["links", "링크 검수"],
        ["claims", "claim 출처 확인"],
        ["consentGate", "동의·억제 gate 확인"],
      ] as const,
    [],
  );

  return (
    <section className="space-y-4" aria-labelledby="newsletter-campaign-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-text">amu · newsletter-ops</p>
          <h4 id="newsletter-campaign-title" className="mt-1 text-lg font-semibold text-primary-text">
            뉴스레터 발송 승인
          </h4>
          <p className="mt-1 text-sm leading-6 text-secondary-text">
            에이전트는 검수 대기 draft만 만들 수 있고, 승인·테스트 queue 등록은 이 관리자 화면에서만 가능합니다.
          </p>
        </div>
        <Button variant="ghost" size="xs" onClick={() => void load()} disabled={busyKey === "load"} aria-label="뉴스레터 캠페인 새로고침">
          <RefreshCw className={busyKey === "load" ? "animate-spin icon-xxs" : "icon-xxs"} />
          <span className="sr-only">새로고침</span>
        </Button>
      </header>

      {message ? <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm" role="alert">{message}</p> : null}
      {disabled ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-secondary-text">
          뉴스레터 campaign 운영은 feature flag가 꺼져 있습니다. 운영 승인 전에는 화면과 queue가 활성화되지 않습니다.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-secondary-text">
          검수 대기 뉴스레터 draft가 없습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((campaign) => {
            const checklist = checklists[campaign.campaignId] || EMPTY_CHECKLIST;
            const canApprove = campaign.status === "waiting_review" && Object.values(checklist).every(Boolean);
            const canTest = campaign.status === "approved" || campaign.status === "test_sent";
            return (
              <article key={campaign.campaignId} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h5 className="truncate font-semibold text-primary-text">{campaignTitle(campaign)}</h5>
                    <p className="mt-1 text-xs text-secondary-text">
                      {campaign.issueId} · {campaign.draft?.stories?.length || 0}건 큐레이션 · claim {campaign.draft?.claims?.length || 0}건
                    </p>
                  </div>
                  <Badge variant="outlineMuted" size="xs">{campaign.status}</Badge>
                </div>
                {campaign.status === "waiting_review" ? (
                  <div className="mt-4 space-y-2 border-t border-border pt-3">
                    <p className="text-xs font-medium text-secondary-text">승인 전 필수 확인</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {checklistLabels.map(([key, label]) => (
                        <label key={key} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-primary-text">
                          <input
                            type="checkbox"
                            checked={checklist[key]}
                            onChange={(event) => updateChecklist(campaign.campaignId, key, event.target.checked)}
                            className="h-4 w-4 accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <Button size="sm" onClick={() => void approve(campaign)} disabled={!canApprove || busyKey === `approve:${campaign.campaignId}`}>
                      {busyKey === `approve:${campaign.campaignId}` ? "승인 중…" : "관리자 승인"}
                    </Button>
                  </div>
                ) : null}
                {canTest ? (
                  <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1 text-xs font-medium text-secondary-text">
                      테스트 수신 주소(사전 등록 자기 주소)
                      <input
                        type="email"
                        value={testRecipients[campaign.campaignId] || ""}
                        onChange={(event) => setTestRecipients((current) => ({ ...current, [campaign.campaignId]: event.target.value }))}
                        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        placeholder="operator@example.com"
                        inputMode="email"
                      />
                    </label>
                    <Button size="sm" variant="outline" onClick={() => void testSend(campaign)} disabled={!testRecipients[campaign.campaignId] || busyKey === `test:${campaign.campaignId}`}>
                      {busyKey === `test:${campaign.campaignId}` ? "등록 중…" : "테스트 발송"}
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
