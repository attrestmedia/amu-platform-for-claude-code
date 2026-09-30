"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, Save, Shield } from "lucide-react";
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@amu-labs/ui";
import fetchClient from "libs/api/fetchClient";
import { lang } from "components/module/i18n";
import { toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { toast } from "sonner";
import { getMarketingOperatorErrorMessage } from "./MarketingOpsUtils";
import { MARKETING_TAB_HEADER_CLASS, REVIEW_PANEL_CARD_CLASS, REVIEW_PANEL_SUBTLE_CLASS } from "./MarketingOpsConstants";

const API = "/marketing/ads/keywords";

type KeywordStrategyForm = {
  productId: string;
  channelProductNo: string;
  productRevision: string;
  productName: string;
  sourceFingerprint: string;
  campaignId: string;
  landingUrl: string;
  seedKeywords: string;
  negativeKeywords: string;
  providers: "both" | "naver_ads" | "google_ads";
};

type KeywordStrategyData = {
  policy?: UnknownRecord | null;
  plans?: UnknownRecord[];
  analysis?: UnknownRecord | null;
};

const EMPTY_FORM: KeywordStrategyForm = {
  productId: "",
  channelProductNo: "",
  productRevision: "",
  productName: "",
  sourceFingerprint: "",
  campaignId: "",
  landingUrl: "",
  seedKeywords: "",
  negativeKeywords: "",
  providers: "both",
};

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function statusLabel(value: unknown) {
  const status = toSafeString(value);
  if (status === "setup_required") return "설정 필요";
  if (status === "draft_ready") return "초안 준비";
  if (status === "review_ready") return "검토 가능";
  if (status === "awaiting_data") return "데이터 대기";
  return status || "미확인";
}

function providerLabel(value: string) {
  return value === "naver_ads" ? "Naver Ads" : "Google Ads";
}

function readAnalysis(response: unknown) {
  const root = toUnknownRecord(response);
  return toUnknownRecord(toUnknownRecord(root.data).analysis);
}

export function MarketingKeywordStrategyPanel({ universeId }: { universeId?: string }) {
  const safeUniverseId = toSafeString(universeId);
  const [form, setForm] = useState<KeywordStrategyForm>(EMPTY_FORM);
  const [data, setData] = useState<KeywordStrategyData | null>(null);
  const [analysis, setAnalysis] = useState<UnknownRecord | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!safeUniverseId) return setData(null);
    setBusy("load");
    try {
      const response = await fetchClient.get<{ data?: KeywordStrategyData }>(API, { params: { universeId: safeUniverseId } });
      setData(response.data?.data || null);
    } catch (error) {
      toast.error(getMarketingOperatorErrorMessage(error, lang({ ko: "키워드 전략을 불러오지 못했습니다.", en: "Failed to load keyword strategy." })));
    } finally {
      setBusy("");
    }
  }, [safeUniverseId]);

  useEffect(() => {
    // 기존 Marketing Ops 패널과 동일하게 유니버스 변경 시 서버 원장을 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const post = async (action: string, payload: UnknownRecord = {}) => {
    setBusy(action);
    try {
      const response = await fetchClient.post(API, { action, universeId: safeUniverseId, ...payload });
      const responseData = toUnknownRecord(response.data);
      const nextAnalysis = readAnalysis(response.data);
      if (nextAnalysis.schemaVersion) setAnalysis(nextAnalysis);
      toast.success(action === "approve_plan" ? "키워드 계획을 승인했습니다." : "키워드 전략 작업을 저장했습니다.");
      await load();
      return responseData;
    } catch (error) {
      toast.error(getMarketingOperatorErrorMessage(error, lang({ ko: "키워드 전략 작업에 실패했습니다.", en: "Keyword strategy operation failed." })));
      return null;
    } finally {
      setBusy("");
    }
  };

  const inputPayload = {
    product: {
      productId: form.productId,
      channelProductNo: form.channelProductNo,
      productRevision: form.productRevision,
      productName: form.productName,
      sourceFingerprint: form.sourceFingerprint,
      campaignId: form.campaignId,
      landingUrl: form.landingUrl,
    },
    seedKeywords: lines(form.seedKeywords),
    negativeKeywords: lines(form.negativeKeywords),
    providers: form.providers,
  };

  const preview = () => void post("preview", inputPayload).then((result) => {
    const next = readAnalysis(result);
    if (next.schemaVersion) setAnalysis(next);
  });

  const savePlan = () => void post("save_plan", inputPayload);

  const inspectPlan = async (planId: unknown) => {
    const safePlanId = toSafeString(planId);
    if (!safePlanId) return;
    setBusy("inspect_plan");
    try {
      const response = await fetchClient.get<{ data?: KeywordStrategyData }>(API, {
        params: { universeId: safeUniverseId, planId: safePlanId },
      });
      setAnalysis(toUnknownRecord(response.data?.data?.analysis));
    } catch (error) {
      toast.error(getMarketingOperatorErrorMessage(error, "저장된 키워드 성과를 불러오지 못했습니다."));
    } finally {
      setBusy("");
    }
  };

  const savedPlans = data?.plans || [];
  const policy = toUnknownRecord(data?.policy);
  const criteria = toUnknownRecord(policy.advertisingCriteria);
  const strategyMissing = !toSafeString(criteria.targetAudience) || !toSafeString(criteria.offer);

  if (!safeUniverseId) {
    return <p className="text-sm text-secondary-text">유니버스를 선택하면 상품별 키워드 전략을 작성할 수 있습니다.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className={MARKETING_TAB_HEADER_CLASS}>
          <div>
            <p className="font-mono text-xs text-muted-text">S7 · Product keyword loop</p>
            <h4 className="text-base font-semibold text-primary-text">상품별 광고 키워드 전략</h4>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-secondary-text">
              상품 source snapshot과 campaign lineage를 기준으로 Naver·Google 키워드 초안을 만들고, 사람 승인 후 광고 draft에 연결합니다.
              provider 조회·예산 변경·자동 확장은 이 화면에서 실행하지 않습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-secondary-text" aria-label="S7 operating rules">
            <span className="rounded-full border border-border px-2 py-1">롱테일 기본</span>
            <span className="rounded-full border border-border px-2 py-1">7d / 28d</span>
            <span className="rounded-full border border-border px-2 py-1">draft-only</span>
          </div>
        </div>
        <div className={REVIEW_PANEL_SUBTLE_CLASS}>
          현재 상품·발행·광고 성과 원장이 없으면 검색량, 경쟁, 입찰가, 전환을 추정하지 않고 <strong>not_collected</strong>로 남깁니다.
          기존 광고 기준의 타깃과 offer가 필요합니다.
        </div>
      </section>

      <section className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Label label="상품 ID (필수 lineage)">
            <Input value={form.productId} onChange={(e) => setForm((prev) => ({ ...prev, productId: e.target.value }))} />
          </Label>
          <Label label="채널 상품번호 (필수 lineage)">
            <Input value={form.channelProductNo} onChange={(e) => setForm((prev) => ({ ...prev, channelProductNo: e.target.value }))} />
          </Label>
          <Label label="상품 revision (필수 lineage)">
            <Input value={form.productRevision} onChange={(e) => setForm((prev) => ({ ...prev, productRevision: e.target.value }))} placeholder="예: 2026-09-09-v1" />
          </Label>
          <Label label="상품명">
            <Input value={form.productName} onChange={(e) => setForm((prev) => ({ ...prev, productName: e.target.value }))} />
          </Label>
          <Label label="source fingerprint (필수 lineage)">
            <Input value={form.sourceFingerprint} onChange={(e) => setForm((prev) => ({ ...prev, sourceFingerprint: e.target.value }))} />
          </Label>
          <Label label="campaign ID (필수 lineage)">
            <Input value={form.campaignId} onChange={(e) => setForm((prev) => ({ ...prev, campaignId: e.target.value }))} />
          </Label>
          <Label label="상품 landing URL (필수 lineage)">
            <Input value={form.landingUrl} onChange={(e) => setForm((prev) => ({ ...prev, landingUrl: e.target.value }))} placeholder="https://..." />
          </Label>
          <Label label="광고 provider">
            <Select value={form.providers} onValueChange={(value) => setForm((prev) => ({ ...prev, providers: value as KeywordStrategyForm["providers"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Naver + Google</SelectItem>
                <SelectItem value="naver_ads">Naver Ads</SelectItem>
                <SelectItem value="google_ads">Google Ads</SelectItem>
              </SelectContent>
            </Select>
          </Label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Label label="seed keyword (한 줄에 하나)">
            <Textarea rows={4} value={form.seedKeywords} onChange={(e) => setForm((prev) => ({ ...prev, seedKeywords: e.target.value }))} placeholder="상품 문제·사용 상황 중심의 seed" />
          </Label>
          <Label label="negative keyword (한 줄에 하나)">
            <Textarea rows={4} value={form.negativeKeywords} onChange={(e) => setForm((prev) => ({ ...prev, negativeKeywords: e.target.value }))} placeholder="금지어·무관 의도·상표 검토 대상" />
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={preview} disabled={!!busy}>
            <Eye className="icon-xxs" /> 미리보기
          </Button>
          <Button size="sm" onClick={savePlan} disabled={!!busy}>
            <Save className="icon-xxs" /> 전략 draft 저장
          </Button>
        </div>
      </section>

      <section className={REVIEW_PANEL_CARD_CLASS} aria-labelledby="s7-strategy-readiness">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h5 id="s7-strategy-readiness" className="font-semibold text-primary-text">광고 기준 readiness</h5>
            <p className="mt-1 text-xs text-secondary-text">기존 광고 적합도 기준의 타깃 audience와 offer를 상품 계획에 상속합니다.</p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-xs ${strategyMissing ? "border-accent/40 text-accent" : "border-border text-secondary-text"}`}>
            {strategyMissing ? "target / offer 설정 필요" : `criteria v${toSafeString(criteria.version) || "0"} 준비`}
          </span>
        </div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-text">목표</dt><dd className="mt-1 text-primary-text">{toSafeString(criteria.objective) || "미설정"}</dd></div>
          <div><dt className="text-xs text-muted-text">타깃</dt><dd className="mt-1 text-primary-text">{toSafeString(criteria.targetAudience) || "미설정"}</dd></div>
          <div><dt className="text-xs text-muted-text">offer</dt><dd className="mt-1 text-primary-text">{toSafeString(criteria.offer) || "미설정"}</dd></div>
          <div><dt className="text-xs text-muted-text">landing</dt><dd className="mt-1 break-all text-primary-text">{toSafeString(criteria.landingPage) || "상품 landing 입력 필요"}</dd></div>
        </dl>
      </section>

      {analysis ? <KeywordAnalysisPreview analysis={analysis} /> : null}

      <section className="space-y-3">
        <div className={MARKETING_TAB_HEADER_CLASS}>
          <div>
            <h5 className="font-semibold text-primary-text">저장된 keyword plan</h5>
            <p className="mt-1 text-xs text-secondary-text">승인된 plan만 광고 draft의 Keyword plan ID로 연결할 수 있습니다.</p>
          </div>
        </div>
        {savedPlans.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-border text-xs text-secondary-text"><tr><th className="py-2">Plan</th><th>상품/캠페인</th><th>Provider</th><th>상태</th><th className="text-right">작업</th></tr></thead>
              <tbody>
                {savedPlans.map((item) => {
                  const lineage = toUnknownRecord(item.lineage);
                  const status = toSafeString(item.status);
                  return (
                    <tr key={toSafeString(item.planId)} className="border-b border-border/70 align-top">
                      <td className="py-3 font-mono text-xs">{toSafeString(item.planId).slice(0, 20)}…</td>
                      <td><div className="text-primary-text">{toSafeString(lineage.productName) || toSafeString(lineage.productId) || "상품 미설정"}</div><div className="text-xs text-secondary-text">{toSafeString(item.campaignId) || "campaign 미설정"}</div></td>
                      <td>{toSafeString(item.provider)}</td>
                      <td>{statusLabel(status)}</td>
                      <td className="text-right"><div className="flex flex-wrap justify-end gap-2">{status === "draft" ? <Button size="xs" variant="outline" onClick={() => void post("approve_plan", { planId: item.planId })} disabled={!!busy}><CheckCircle2 className="icon-xxs" /> 승인</Button> : status === "approved" ? <span className="inline-flex items-center gap-1 text-xs text-secondary-text"><Shield className="icon-xxs" /> draft 연결 가능</span> : null}<Button size="xs" variant="ghost" onClick={() => void inspectPlan(item.planId)} disabled={!!busy}>성과 분석</Button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className={REVIEW_PANEL_SUBTLE_CLASS}>아직 저장된 plan이 없습니다. 미리보기 후 draft를 저장하세요.</div>}
      </section>
    </div>
  );
}

function KeywordAnalysisPreview({ analysis }: { analysis: UnknownRecord }) {
  const providers = toUnknownRecord(analysis.providers);
  const improvement = toUnknownRecord(analysis.improvement);
  const measurement = toUnknownRecord(analysis.measurement);
  return (
    <section className="space-y-3" aria-labelledby="s7-analysis-preview">
      <div className={MARKETING_TAB_HEADER_CLASS}>
        <div>
          <h5 id="s7-analysis-preview" className="font-semibold text-primary-text">전략 초안 미리보기</h5>
          <p className="mt-1 text-xs text-secondary-text">상태: {statusLabel(analysis.status)} · 입력된 실측 행: {toSafeString(measurement.rows) || "0"}</p>
        </div>
        <span className="rounded-full border border-border px-2 py-1 text-xs text-secondary-text">예측 없음 · draft-only</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {["naver_ads", "google_ads"].map((provider) => {
          const plan = toUnknownRecord(providers[provider]);
          const candidates = Array.isArray(plan.candidates) ? plan.candidates : [];
          return (
            <div key={provider} className={REVIEW_PANEL_CARD_CLASS}>
              <div className="flex items-start justify-between gap-2"><h6 className="font-semibold text-primary-text">{providerLabel(provider)}</h6><span className="text-xs text-secondary-text">{statusLabel(plan.status)}</span></div>
              <p className="mt-1 text-xs text-secondary-text">{toSafeString(plan.note) || "provider 실측 대기"}</p>
              <ul className="mt-3 space-y-1 text-sm text-primary-text">
                {candidates.slice(0, 6).map((candidate, index) => {
                  const item = toUnknownRecord(candidate);
                  return <li key={`${provider}-${index}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-1"><span>{toSafeString(item.keyword)}</span><span className="text-xs text-secondary-text">{toSafeString(item.intent)} · {toSafeString(item.evidenceStatus)}</span></li>;
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className={REVIEW_PANEL_SUBTLE_CLASS}>
        <strong>다음 행동:</strong> {toSafeString(improvement.primaryNextAction) || "7일 snapshot 수집 후 검토"}<br />
        {toSafeString(measurement.conversionValueNote)}
      </div>
    </section>
  );
}
