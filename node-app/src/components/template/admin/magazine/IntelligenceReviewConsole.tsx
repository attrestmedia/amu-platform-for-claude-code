"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, RefreshCw, Search, Shield } from "lucide-react";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import type { KnowledgeEvidenceRef, MagazineKnowledgeArticle } from "libs/server-utils/magazine/magazineKnowledgeContract";
import { cn } from "utils/common";
import { PAGE_LAYOUT_CLASS, THEME_OVERRIDE_CLASS } from "utils/theme";

type KnowledgeDetail = {
  article: MagazineKnowledgeArticle;
  revision: string;
  sourceRevision: string;
  updatedAt: string;
  units: Array<{ unit: unknown; unitId?: string; sourceRevision?: string }>;
  staleUnitIds: string[];
};

type KnowledgeSuccess = { ok: true; data: KnowledgeDetail };
type ApiFailure = { ok: false; error?: string; message?: string; issues?: string[] };

const STATUS_LABELS: Record<MagazineKnowledgeArticle["intelligence"]["reviewStatus"], string> = {
  unreviewed: "미검토",
  needs_revision: "수정 필요",
  approved: "승인",
  rejected: "반려",
};

const ELIGIBILITY_LABELS: Record<MagazineKnowledgeArticle["intelligence"]["eligibility"], string> = {
  none: "대상 아님",
  candidate: "후보",
  qualified: "승격 가능",
};

function splitRefs(value: string) {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}

function responseMessage(payload: ApiFailure) {
  return payload.issues?.join(" ") || payload.message || payload.error || "요청을 처리하지 못했습니다.";
}

export function IntelligenceReviewConsole() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData } = useUserData();
  const [postId, setPostId] = useState("");
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [eligibility, setEligibility] = useState<MagazineKnowledgeArticle["intelligence"]["eligibility"]>("candidate");
  const [reviewStatus, setReviewStatus] = useState<MagazineKnowledgeArticle["intelligence"]["reviewStatus"]>("unreviewed");
  const [reviewerId, setReviewerId] = useState("");
  const [reviewMemo, setReviewMemo] = useState("");
  const [primaryPatternRefs, setPrimaryPatternRefs] = useState("");
  const [secondaryPatternRefs, setSecondaryPatternRefs] = useState("");
  const [proofRefs, setProofRefs] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useAuthCheck();

  useEffect(() => {
    if (!isLoggedIn) {
      router.push("/login?next=/admin/magazine/intelligence");
      return;
    }
    if (userData && !userData.roles?.includes("administrator")) router.push("/");
  }, [isLoggedIn, router, userData]);

  const loadArticle = async () => {
    const normalizedPostId = postId.trim();
    if (!/^\d+$/.test(normalizedPostId) || Number(normalizedPostId) < 1) {
      setMessage({ tone: "error", text: "유효한 WordPress postId를 입력하세요." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/magazine/knowledge-articles?postId=${encodeURIComponent(normalizedPostId)}&includeRenewal=true`, {
        cache: "no-store",
      });
      const payload = await response.json() as KnowledgeSuccess | ApiFailure;
      if (!response.ok || !payload.ok) throw new Error(responseMessage(payload as ApiFailure));
      const nextDetail = payload.data;
      setDetail(nextDetail);
      setEligibility(nextDetail.article.intelligence.eligibility);
      setReviewStatus(nextDetail.article.intelligence.reviewStatus);
      setReviewerId(nextDetail.article.intelligence.reviewedBy || userData?.uid || "");
      setReviewMemo(nextDetail.article.intelligence.reviewMemo);
      setPrimaryPatternRefs(nextDetail.article.intelligence.primaryPatternRefs.join("\n"));
      setSecondaryPatternRefs(nextDetail.article.intelligence.secondaryPatternRefs.join("\n"));
      setProofRefs(nextDetail.article.intelligence.amuProofRefs.join("\n"));
    } catch (error) {
      setDetail(null);
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Knowledge 기사를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  };

  const saveReview = useCallback(async () => {
    if (!detail) return;
    const reviewer = reviewerId.trim();
    if (reviewStatus !== "unreviewed" && !reviewer) {
      setMessage({ tone: "error", text: "승인·반려·수정 필요 판정에는 검토자 ID가 필요합니다." });
      return;
    }
    if (eligibility === "qualified" && reviewStatus !== "approved") {
      setMessage({ tone: "error", text: "qualified 승격은 approved 검토와 함께만 저장할 수 있습니다." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/magazine/knowledge-articles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: detail.article.source.postId,
          expectedRevision: detail.revision,
          intelligence: {
            eligibility,
            reviewStatus,
            reviewedAt: reviewStatus === "unreviewed" ? null : new Date().toISOString(),
            reviewedBy: reviewStatus === "unreviewed" ? null : reviewer,
            reviewMemo: reviewMemo.trim(),
            primaryPatternRefs: splitRefs(primaryPatternRefs),
            secondaryPatternRefs: splitRefs(secondaryPatternRefs),
            amuProofRefs: splitRefs(proofRefs),
          },
        }),
      });
      const payload = await response.json() as { ok: true; data: KnowledgeDetail } | ApiFailure;
      if (!response.ok || !payload.ok) throw new Error(responseMessage(payload as ApiFailure));
      setDetail(payload.data);
      setMessage({ tone: "success", text: "사람 검토 결과를 저장했습니다. 공개 노출은 별도 자격 게이트를 통과해야 합니다." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "검토 결과를 저장하지 못했습니다." });
    } finally {
      setSaving(false);
    }
  }, [detail, eligibility, primaryPatternRefs, proofRefs, reviewMemo, reviewStatus, reviewerId, secondaryPatternRefs]);

  if (!isLoggedIn || (userData && !userData.roles?.includes("administrator"))) return null;

  return (
    <div className={cn(PAGE_LAYOUT_CLASS, THEME_OVERRIDE_CLASS)}>
      <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8" aria-labelledby="intelligence-review-title">
        <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-secondary-text">Magazine / AIR-801</p>
            <h1 id="intelligence-review-title" className="text-2xl font-bold text-primary-text">Article Intelligence 검토</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary-text">
              완료 기사에서 추출된 후보·근거를 확인하고 사람 판정을 기록합니다. 이 화면은 Pattern 자동 승격, Proof 생성, 발행을 수행하지 않습니다.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-secondary-text" role="status">
            <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Writer isolation / CAS enabled</span>
          </div>
        </header>

        <section className="mb-6 rounded-xl border border-border bg-surface p-4" aria-labelledby="article-lookup-title">
          <div className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 id="article-lookup-title" className="font-semibold text-primary-text">기사 조회</h2>
          </div>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); void loadArticle(); }}>
            <label className="flex-1 text-sm font-medium text-primary-text">
              WordPress postId
              <input
                value={postId}
                onChange={(event) => setPostId(event.target.value)}
                inputMode="numeric"
                placeholder="예: 1234"
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-secondary-text/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-describedby="post-id-help"
              />
            </label>
            <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              조회
            </button>
          </form>
          <p id="post-id-help" className="mt-2 text-xs text-secondary-text">원문 본문은 이 화면과 추출 handoff에 전달하지 않습니다.</p>
        </section>

        {message && (
          <div className={cn("mb-6 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm", message.tone === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-destructive/40 bg-destructive/10 text-destructive")} role="alert" aria-live="polite">
            {message.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{message.text}</span>
          </div>
        )}

        {!detail ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-secondary-text">조회할 기사를 입력하세요.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
            <div className="min-w-0 space-y-6">
              <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="article-summary-title">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id="article-summary-title" className="font-semibold text-primary-text">기사 projection</h2>
                    <p className="mt-1 break-all text-xs text-secondary-text">{detail.article.contentId} · source revision {detail.sourceRevision}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-border px-2.5 py-1 text-secondary-text">추출: {detail.article.intelligence.extractionStatus}</span>
                    <span className="rounded-full border border-border px-2.5 py-1 text-secondary-text">검토: {STATUS_LABELS[detail.article.intelligence.reviewStatus]}</span>
                  </div>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-background p-3"><dt className="text-xs text-secondary-text">주제</dt><dd className="mt-1 font-medium text-primary-text">{detail.article.primaryQuestion}</dd></div>
                  <div className="rounded-lg bg-background p-3"><dt className="text-xs text-secondary-text">현재 자격</dt><dd className="mt-1 font-medium text-primary-text">{ELIGIBILITY_LABELS[detail.article.intelligence.eligibility]}</dd></div>
                  <div className="rounded-lg bg-background p-3"><dt className="text-xs text-secondary-text">외부 근거</dt><dd className="mt-1 font-medium text-primary-text">{detail.article.intelligence.externalEvidenceLevel}</dd></div>
                  <div className="rounded-lg bg-background p-3"><dt className="text-xs text-secondary-text">최근 갱신</dt><dd className="mt-1 font-medium text-primary-text">{formatDate(detail.updatedAt)}</dd></div>
                </dl>
              </section>

              <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="candidate-title">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 id="candidate-title" className="font-semibold text-primary-text">Pattern 후보</h2>
                    <p className="mt-1 text-xs text-secondary-text">후보는 pending 상태로만 표시되며 Registry에 자동 저장되지 않습니다.</p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-secondary-text">{detail.article.intelligence.candidateItems.length} candidates</span>
                </div>
                {detail.article.intelligence.candidateItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-secondary-text">Pattern 후보 없음. zero-pattern 결과로 처리할 수 있습니다.</div>
                ) : (
                  <div className="space-y-3">
                    {detail.article.intelligence.candidateItems.map((candidate) => (
                      <article key={candidate.id} className="rounded-lg border border-border/70 bg-background p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-primary-text"><span>{candidate.id}</span><span className="rounded-full bg-muted/50 px-2 py-1 text-secondary-text">{candidate.intelligenceType}</span></div>
                          <span className="text-xs text-secondary-text">evidence {candidate.sourceRefs.length}</span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-primary-text">{candidate.statement}</p>
                        <p className="mt-2 border-l-2 border-border pl-3 text-xs leading-5 text-secondary-text">{candidate.articleSpan}</p>
                        {candidate.limitations.length > 0 && <p className="mt-2 text-xs text-secondary-text">제한: {candidate.limitations.join(" · ")}</p>}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="evidence-title">
                <h2 id="evidence-title" className="font-semibold text-primary-text">Evidence / Counter-evidence</h2>
                <div className="mt-3 space-y-2">
                  {detail.article.intelligence.evidenceRefs.length === 0 ? <p className="text-sm text-secondary-text">기사 레벨 Evidence가 없습니다.</p> : detail.article.intelligence.evidenceRefs.map((evidence: KnowledgeEvidenceRef) => (
                    <div key={evidence.id} className="rounded-lg border border-border/70 bg-background p-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-primary-text">{evidence.id}</span><span className="text-xs text-secondary-text">{evidence.claimStatus} · {evidence.sourceType}</span></div>
                      <p className="mt-1 text-primary-text">{evidence.supports}</p>
                      <p className="mt-1 break-all text-xs text-secondary-text">{evidence.sourceRef}</p>
                    </div>
                  ))}
                  {detail.article.counterExamples.length > 0 && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">Counter-evidence: {detail.article.counterExamples.join(" · ")}</p>}
                </div>
                <p className="mt-3 text-xs text-secondary-text">표시된 Evidence는 registry proof가 아니며, Proof 승격에는 별도 검토가 필요합니다.</p>
              </section>
            </div>

            <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
              <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="review-form-title">
                <div className="mb-4">
                  <h2 id="review-form-title" className="font-semibold text-primary-text">사람 검토 판정</h2>
                  <p className="mt-1 text-xs leading-5 text-secondary-text">저장 시 현재 revision을 CAS로 확인합니다. 다른 관리자가 먼저 저장했다면 최신 기사를 다시 조회하세요.</p>
                </div>
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-primary-text">Eligibility<select value={eligibility} onChange={(event) => setEligibility(event.target.value as typeof eligibility)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30">{Object.entries(ELIGIBILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label} ({value})</option>)}</select></label>
                  <label className="block text-sm font-medium text-primary-text">Review status<select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as typeof reviewStatus)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label} ({value})</option>)}</select></label>
                  <label className="block text-sm font-medium text-primary-text">검토자 ID<input value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" placeholder="사람 검토자 식별자" /></label>
                  <label className="block text-sm font-medium text-primary-text">Review memo<textarea value={reviewMemo} onChange={(event) => setReviewMemo(event.target.value)} rows={4} className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" placeholder="판정 근거와 제한 조건" /></label>
                  <label className="block text-sm font-medium text-primary-text">Primary Pattern refs<textarea value={primaryPatternRefs} onChange={(event) => setPrimaryPatternRefs(event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" placeholder="Registry ID를 줄바꿈으로 입력" /></label>
                  <label className="block text-sm font-medium text-primary-text">Secondary Pattern refs<textarea value={secondaryPatternRefs} onChange={(event) => setSecondaryPatternRefs(event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" placeholder="Registry ID를 줄바꿈으로 입력" /></label>
                  <label className="block text-sm font-medium text-primary-text">Proof refs (기존 참조만)<textarea value={proofRefs} onChange={(event) => setProofRefs(event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" placeholder="자동 생성하지 않음" /></label>
                  <button type="button" onClick={() => void saveReview()} disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    검토 결과 저장
                  </button>
                </div>
                <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-secondary-text">마지막으로 읽은 revision: <span className="break-all font-mono">{detail.revision}</span></p>
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
