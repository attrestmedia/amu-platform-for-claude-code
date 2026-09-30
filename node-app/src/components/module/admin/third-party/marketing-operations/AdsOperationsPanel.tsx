"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Pause, Play, RefreshCw, Shield } from "lucide-react";
import { Button, Label, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toast } from "sonner";
import { toErrorLike, toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { normalizeAdvertisingCriteriaList } from "consts/marketing/advertisingCriteria";
import { getMarketingOperatorErrorMessage } from "./MarketingOpsUtils";
import { MARKETING_TAB_HEADER_CLASS } from "./MarketingOpsConstants";

const API = "/marketing/ads";
type AdsData = {
  policy?: UnknownRecord | null;
  drafts?: UnknownRecord[];
  executions?: UnknownRecord[];
  performance?: { summary?: UnknownRecord; items?: UnknownRecord[] };
  credentials?: Record<string, UnknownRecord>;
};
type DraftForm = {
  provider: "naver_ads" | "google_ads";
  name: string;
  landingUrl: string;
  dailyBudget: string;
  adGroupName: string;
  defaultBid: string;
  businessChannelId: string;
  headlines: string;
  descriptions: string;
  keywords: string;
  keywordPlanId: string;
  campaignId: string;
};
type AdvertisingCriteriaForm = {
  objective: "awareness" | "traffic" | "leads" | "sales";
  targetAudience: string;
  offer: string;
  landingPage: string;
  requiredClaims: string;
  prohibitedClaims: string;
  requiredDisclosures: string;
  measurementPlan: string;
  version: number;
};
const EMPTY_DRAFT: DraftForm = {
  provider: "google_ads",
  name: "",
  landingUrl: "",
  dailyBudget: "",
  adGroupName: "",
  defaultBid: "",
  businessChannelId: "",
  headlines: "",
  descriptions: "",
  keywords: "",
  keywordPlanId: "",
  campaignId: "",
};
const EMPTY_ADVERTISING_CRITERIA: AdvertisingCriteriaForm = {
  objective: "traffic",
  targetAudience: "",
  offer: "",
  landingPage: "",
  requiredClaims: "",
  prohibitedClaims: "",
  requiredDisclosures: "",
  measurementPlan: "",
  version: 0,
};
const formatNumber = (value: unknown) => Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const ADS_CREDENTIAL_FAILURE_GUIDANCE: Record<string, string> = {
  CREDENTIALS_INCOMPLETE: "저장된 필수 자격증명 필드를 다시 확인하세요.",
  AUTH_FAILED: "OAuth Client와 Refresh Token의 사용자·scope를 확인하세요.",
  DEVELOPER_TOKEN_INVALID: "Developer Token의 운영 계정 접근 등급을 확인하세요.",
  API_PROJECT_ACCESS_DENIED: "Developer Token과 Google Cloud Project의 API 연결을 확인하세요.",
  OAUTH_LOGIN_CUSTOMER_ACCESS_DENIED: "Refresh Token 사용자를 Login Customer 계정 사용자로 추가하세요.",
  LOGIN_CUSTOMER_ID_REQUIRED: "대상 계정을 관리하는 MCC의 Login Customer ID를 입력하세요.",
  LOGIN_CUSTOMER_TARGET_NOT_LINKED: "Login Customer와 대상 Customer의 관리자 연결을 확인하세요.",
  CUSTOMER_MISMATCH: "Refresh Token 사용자와 Customer 계정 계층을 확인하세요.",
  CUSTOMER_NOT_ENABLED: "대상 광고 계정을 재활성화하거나 활성 Customer ID로 교체하세요.",
  ACCOUNT_SETUP_INCOMPLETE: "Google Ads 가입과 API 이용약관 설정을 완료하세요.",
  NETWORK: "외부 API 연결 상태를 확인한 뒤 다시 시도하세요.",
};

function credentialFailureGuidance(code: unknown, fallback?: unknown) {
  const safeCode = toSafeString(code);
  return ADS_CREDENTIAL_FAILURE_GUIDANCE[safeCode] || toSafeString(fallback) || "자격증명과 계정 상태를 확인하세요.";
}

function credentialMissingLabel(value: unknown) {
  const missing = toSafeString(value);
  if (missing === "customerId") return lang({ ko: "Google Ads 고객 선택", en: "Select Google Ads customer" });
  if (missing === "oauthReauthorization") return lang({ ko: "Google 계정 재연결", en: "Reconnect Google account" });
  if (missing === "oauthTokenRefresh") return lang({ ko: "OAuth 토큰 갱신", en: "Refresh OAuth token" });
  if (missing === "oauthScope") return lang({ ko: "Google Ads API 권한", en: "Google Ads API permission" });
  if (missing === "https://www.googleapis.com/auth/adwords") return lang({ ko: "Google Ads API(adwords) 권한", en: "Google Ads API (adwords) permission" });
  return missing;
}

export function AdsOperationsPanel({ universeId }: { universeId?: string }) {
  const safeUniverseId = toSafeString(universeId);
  const [data, setData] = useState<AdsData | null>(null);
  const [busy, setBusy] = useState("");
  const [credentialChecks, setCredentialChecks] = useState<Record<string, UnknownRecord>>({});
  const [policy, setPolicy] = useState({
    executionEnabled: false,
    dailyAmount: "",
    monthlyAmount: "",
    currency: "KRW",
    domains: "",
  });
  const [advertisingCriteria, setAdvertisingCriteria] = useState<AdvertisingCriteriaForm>(EMPTY_ADVERTISING_CRITERIA);
  const [draft, setDraft] = useState<DraftForm>(EMPTY_DRAFT);

  const load = useCallback(async () => {
    if (!safeUniverseId) return setData(null);
    setBusy("load");
    try {
      const response = await fetchClient.get<{ data?: AdsData }>(API, {
        params: { universeId: safeUniverseId, days: 30 },
      });
      const next = response.data?.data || null;
      setData(next);
      const saved = toUnknownRecord(next?.policy);
      const cap = toUnknownRecord(saved.spendCap);
      const criteria = toUnknownRecord(saved.advertisingCriteria);
      setPolicy({
        executionEnabled: saved.executionEnabled === true,
        dailyAmount: toSafeString(cap.dailyAmount),
        monthlyAmount: toSafeString(cap.monthlyAmount),
        currency: toSafeString(cap.currency) || "KRW",
        domains: Array.isArray(saved.allowedLandingDomains)
          ? saved.allowedLandingDomains.map(toSafeString).join(", ")
          : "",
      });
      setAdvertisingCriteria({
        objective: (toSafeString(criteria.objective) as AdvertisingCriteriaForm["objective"]) || "traffic",
        targetAudience: toSafeString(criteria.targetAudience),
        offer: toSafeString(criteria.offer),
        landingPage: toSafeString(criteria.landingPage),
        requiredClaims: Array.isArray(criteria.requiredClaims)
          ? criteria.requiredClaims.map(toSafeString).join("\n")
          : "",
        prohibitedClaims: Array.isArray(criteria.prohibitedClaims)
          ? criteria.prohibitedClaims.map(toSafeString).join("\n")
          : "",
        requiredDisclosures: Array.isArray(criteria.requiredDisclosures)
          ? criteria.requiredDisclosures.map(toSafeString).join("\n")
          : "",
        measurementPlan: toSafeString(criteria.measurementPlan),
        version: Number(criteria.version || 0),
      });
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "광고 운영 정보를 불러오지 못했습니다.", en: "Failed to load ads operations." }),
        ),
      );
    } finally {
      setBusy("");
    }
  }, [safeUniverseId]);

  useEffect(
    function loadAdsOperationsWhenUniverseChanges() {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load();
    },
    [load],
  );

  const post = async (action: string, payload: UnknownRecord = {}) => {
    setBusy(action);
    try {
      const response = await fetchClient.post(API, { action, universeId: safeUniverseId, ...payload });
      toast.success(lang({ ko: "처리가 완료되었습니다.", en: "Completed." }));
      await load();
      return response.data;
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(error, lang({ ko: "광고 작업에 실패했습니다.", en: "Ads operation failed." })),
      );
      return null;
    } finally {
      setBusy("");
    }
  };

  const savePolicy = () =>
    post("update_policy", {
      executionEnabled: policy.executionEnabled,
      dailyAmount: Number(policy.dailyAmount),
      monthlyAmount: Number(policy.monthlyAmount),
      currency: policy.currency,
      allowedLandingDomains: policy.domains,
    });

  const saveAdvertisingCriteria = () =>
    post("update_advertising_criteria", {
      advertisingCriteria: {
        ...advertisingCriteria,
        requiredClaims: normalizeAdvertisingCriteriaList(advertisingCriteria.requiredClaims),
        prohibitedClaims: normalizeAdvertisingCriteriaList(advertisingCriteria.prohibitedClaims),
        requiredDisclosures: normalizeAdvertisingCriteriaList(advertisingCriteria.requiredDisclosures),
      },
    });

  const validateCredential = async (provider: "naver_ads" | "google_ads") => {
    setBusy("validate_credentials");
    try {
      const response = await fetchClient.post(API, {
        action: "validate_credentials",
        universeId: safeUniverseId,
        provider,
      });
      const result = toUnknownRecord(toUnknownRecord(response.data).data);
      setCredentialChecks((prev) => ({ ...prev, [provider]: result }));
      toast.success(
        lang({ ko: `${provider} 자격 증명 검증에 성공했습니다.`, en: `${provider} credentials verified.` }),
      );
    } catch (error) {
      // 검증 실패는 409로 반환되며 분류 코드/메시지가 body.data에 들어 있다. 일반 오류 토스트 대신 코드를 그대로 보여준다.
      const failure = toUnknownRecord(toUnknownRecord(toUnknownRecord(toErrorLike(error).response).data).data);
      if (Object.keys(failure).length) {
        setCredentialChecks((prev) => ({ ...prev, [provider]: failure }));
        toast.error(
          `${provider} 검증 실패: ${toSafeString(failure.code) || "UNKNOWN"} — ${credentialFailureGuidance(failure.code, failure.message)}`,
        );
      } else {
        toast.error(
          getMarketingOperatorErrorMessage(
            error,
            lang({ ko: "자격 증명 검증에 실패했습니다.", en: "Credential validation failed." }),
          ),
        );
      }
    } finally {
      setBusy("");
      await load();
    }
  };

  const createDraft = async () => {
    const result = await post("create_draft", {
      draft: {
        provider: draft.provider,
        name: draft.name,
        landingUrl: draft.landingUrl,
        campaign: { name: draft.name, dailyBudget: Number(draft.dailyBudget) },
        adGroup: {
          name: draft.adGroupName,
          defaultBid: Number(draft.defaultBid),
          businessChannelId: draft.businessChannelId,
        },
        creative: {
          headlines: draft.headlines
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          descriptions: draft.descriptions
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          finalUrl: draft.landingUrl,
        },
        keywords: draft.keywords
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((text) => ({ text, matchType: "EXACT" })),
        keywordPlanId: draft.keywordPlanId,
        campaignId: draft.campaignId,
      },
    });
    if (result) setDraft(EMPTY_DRAFT);
  };

  const summary = toUnknownRecord(data?.performance?.summary);
  const drafts = useMemo(() => data?.drafts || [], [data?.drafts]);

  if (!safeUniverseId)
    return (
      <p className="text-sm text-secondary-text">
        <Lang text={{ ko: "광고 운영 유니버스를 선택하세요.", en: "Select a universe." }} />
      </p>
    );

  return (
    <div className="space-y-6">
      <section className="space-y-3 border-b border-border pb-5">
        <div className={MARKETING_TAB_HEADER_CLASS}>
          <div>
            <p className="font-mono text-xs text-muted-text">
              Advertising fit criteria · v{advertisingCriteria.version}
            </p>
            <h4 className="text-base font-semibold text-primary-text">
              <Lang text={{ ko: "광고 적합도 기준", en: "Advertising fit criteria" }} />
            </h4>
            <p className="mt-1 text-xs text-secondary-text">
              <Lang
                text={{
                  ko: "콘텐츠를 유료 광고 소재로 재사용할 수 있는지 AI가 평가할 때 사용하는 기준입니다.",
                  en: "Criteria used by AI to evaluate reuse as paid advertising creative.",
                }}
              />
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => void saveAdvertisingCriteria()}
            disabled={!!busy || !advertisingCriteria.targetAudience.trim() || !advertisingCriteria.offer.trim()}
          >
            <Shield className="icon-xxs" />
            <Lang text={{ ko: "광고 기준 저장", en: "Save ad criteria" }} />
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Label label={lang({ ko: "광고 목적", en: "Advertising Purposes" })}>
            <Select
              value={advertisingCriteria.objective}
              onValueChange={(value) =>
                setAdvertisingCriteria((prev) => ({
                  ...prev,
                  objective: value as AdvertisingCriteriaForm["objective"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="awareness">
                  <Lang text={{ ko: "인지", en: "Awareness" }} />
                </SelectItem>
                <SelectItem value="traffic">
                  <Lang text={{ ko: "트래픽", en: "Traffic" }} />
                </SelectItem>
                <SelectItem value="leads">
                  <Lang text={{ ko: "리드", en: "Leads" }} />
                </SelectItem>
                <SelectItem value="sales">
                  <Lang text={{ ko: "판매", en: "Sales" }} />
                </SelectItem>
              </SelectContent>
            </Select>
          </Label>

          <Label label={lang({ ko: "기준 랜딩 페이지", en: "Reference landing page" })}>
            <Input
              value={advertisingCriteria.landingPage}
              onChange={(e) => setAdvertisingCriteria((prev) => ({ ...prev, landingPage: e.target.value }))}
              placeholder={lang({ ko: "기준 랜딩 페이지", en: "Reference landing page" })}
            />
          </Label>

          <Label label={lang({ ko: "타깃 오디언스 (필수)", en: "Target audience (required)" })}>
            <Textarea
              rows={3}
              value={advertisingCriteria.targetAudience}
              onChange={(e) => setAdvertisingCriteria((prev) => ({ ...prev, targetAudience: e.target.value }))}
              placeholder={lang({ ko: "타깃 오디언스 (필수)", en: "Target audience (required)" })}
            />
          </Label>

          <Label label={lang({ ko: "제안·오퍼 (필수)", en: "Offer (required)" })}>
            <Textarea
              rows={3}
              value={advertisingCriteria.offer}
              onChange={(e) => setAdvertisingCriteria((prev) => ({ ...prev, offer: e.target.value }))}
              placeholder={lang({ ko: "제안·오퍼 (필수)", en: "Offer (required)" })}
            />
          </Label>

          <Label label={lang({ ko: "필수 주장 · 줄바꿈", en: "Required claims · one per line" })}>
            <Textarea
              rows={3}
              value={advertisingCriteria.requiredClaims}
              onChange={(e) => setAdvertisingCriteria((prev) => ({ ...prev, requiredClaims: e.target.value }))}
              placeholder={lang({ ko: "필수 주장 · 줄바꿈", en: "Required claims · one per line" })}
            />
          </Label>

          <Label label={lang({ ko: "금지 표현 · 줄바꿈", en: "Prohibited claims · one per line" })}>
            <Textarea
              rows={3}
              value={advertisingCriteria.prohibitedClaims}
              onChange={(e) => setAdvertisingCriteria((prev) => ({ ...prev, prohibitedClaims: e.target.value }))}
              placeholder={lang({ ko: "금지 표현 · 줄바꿈", en: "Prohibited claims · one per line" })}
            />
          </Label>

          <Label label={lang({ ko: "필수 고지 · 줄바꿈", en: "Required disclosures · one per line" })}>
            <Textarea
              rows={3}
              value={advertisingCriteria.requiredDisclosures}
              onChange={(e) => setAdvertisingCriteria((prev) => ({ ...prev, requiredDisclosures: e.target.value }))}
              placeholder={lang({ ko: "필수 고지 · 줄바꿈", en: "Required disclosures · one per line" })}
            />
          </Label>
          <p className="text-xxs text-secondary-text md:col-span-2">
            <Lang
              text={{
                ko: "각 항목은 줄바꿈으로만 구분합니다. 문장 안의 쉼표는 그대로 보존됩니다.",
                en: "Separate items with line breaks only. Commas inside a sentence are preserved.",
              }}
            />
          </p>

          <Label
            label={lang({ ko: "측정 계획 (UTM·전환 이벤트 등)", en: "Measurement plan (UTM, conversion events)" })}
          >
            <Textarea
              rows={3}
              value={advertisingCriteria.measurementPlan}
              onChange={(e) => setAdvertisingCriteria((prev) => ({ ...prev, measurementPlan: e.target.value }))}
              placeholder={lang({
                ko: "측정 계획 (UTM·전환 이벤트 등)",
                en: "Measurement plan (UTM, conversion events)",
              })}
            />
          </Label>
        </div>
      </section>

      <section className="space-y-3 border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-text">Ads execution policy</p>
            <h4 className="text-base font-semibold text-primary-text">
              <Lang text={{ ko: "광고 집행 제어", en: "Ads execution control" }} />
            </h4>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-primary-text">
            <span>{policy.executionEnabled ? "집행 경로 허용" : "집행 경로 차단"}</span>
            <Switch
              checked={policy.executionEnabled}
              onCheckedChange={(checked) => setPolicy((prev) => ({ ...prev, executionEnabled: checked }))}
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Label label={lang({ ko: "일일 상한", en: "Daily Limit" })}>
            <Input
              type="number"
              min="0"
              value={policy.dailyAmount}
              onChange={(e) => setPolicy((prev) => ({ ...prev, dailyAmount: e.target.value }))}
              placeholder="일일 상한"
            />
          </Label>

          <Label label={lang({ ko: "월간 상한", en: "Monthly Limit" })}>
            <Input
              type="number"
              min="0"
              value={policy.monthlyAmount}
              onChange={(e) => setPolicy((prev) => ({ ...prev, monthlyAmount: e.target.value }))}
              placeholder="월간 상한"
            />
          </Label>

          <Label label="KRW">
            <Input
              value={policy.currency}
              onChange={(e) => setPolicy((prev) => ({ ...prev, currency: e.target.value }))}
              placeholder="KRW"
            />
          </Label>

          <Label label="Domains">
            <Input
              value={policy.domains}
              onChange={(e) => setPolicy((prev) => ({ ...prev, domains: e.target.value }))}
              placeholder="allmyuniverse.com, example.com"
            />
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void savePolicy()} disabled={!!busy}>
            <Shield className="icon-xxs" />
            정책 저장
          </Button>
          {(["naver_ads", "google_ads"] as const).map((provider) => (
            <Button
              key={provider}
              size="sm"
              variant="outline"
              onClick={() => void validateCredential(provider)}
              disabled={!!busy}
            >
              <CheckCircle2 className="icon-xxs" />
              {provider} 검증
            </Button>
          ))}
        </div>
        <div className="grid gap-2 text-xs text-secondary-text md:grid-cols-2">
          {(["naver_ads", "google_ads"] as const).map((provider) => {
            const fresh = toUnknownRecord(credentialChecks[provider]);
            const stored = toUnknownRecord(data?.credentials?.[provider]);
            const missing = Array.isArray(stored.missing) ? stored.missing.map(toSafeString).filter(Boolean) : [];
            const freshCode = toSafeString(fresh.code);
            const freshMessage = credentialFailureGuidance(freshCode, fresh.message);
            const requestId = toSafeString(fresh.requestId || stored.lastValidationRequestId);
            const details = toUnknownRecord(fresh.details);
            const hierarchyStatus = toSafeString(details.hierarchyStatus);
            const authMode = toSafeString(stored.authMode) || "legacy";
            const selectedResource = toSafeString(stored.selectedResourceName || stored.selectedResourceId);
            return (
              <div key={provider} className="space-y-1 border-l-2 border-border pl-3">
                <p>
                  <strong className="text-primary-text">{provider}</strong>
                  {" · "}
                  {authMode === "oauth"
                    ? stored.ready === true
                      ? `${lang({ ko: "OAuth 연결 준비됨", en: "OAuth ready" })}${selectedResource ? ` · ${selectedResource}` : ""}`
                      : `${lang({ ko: "OAuth 연결됨 · 조치 필요", en: "OAuth connected · action required" })}: ${missing.map(credentialMissingLabel).join(", ") || lang({ ko: "상태 확인", en: "Check status" })}`
                    : stored.exists !== true
                      ? lang({ ko: "수동 credential 미등록", en: "Manual credential not registered" })
                      : stored.ready === true
                        ? lang({ ko: "수동 credential 필수 필드 준비됨", en: "Manual credential fields ready" })
                        : `${lang({ ko: "누락", en: "Missing" })}: ${missing.map(credentialMissingLabel).join(", ") || "-"}`}
                </p>
                {authMode === "oauth" ? (
                  <p className="text-muted-text">
                    {lang({ ko: "연결 계정", en: "Connected account" })}: {toSafeString(stored.displayName) || "-"} · {lang({ ko: "고객 ID", en: "Customer ID" })}: {toSafeString(stored.selectedResourceId) || lang({ ko: "미선택", en: "Not selected" })}
                  </p>
                ) : null}
                <p>
                  마지막 검증: {toSafeString(stored.lastValidationStatus) || "-"}
                  {toSafeString(stored.lastValidationCode) ? ` (${toSafeString(stored.lastValidationCode)})` : ""}
                  {" · "}
                  {toSafeString(stored.lastValidatedAt) || "-"}
                </p>
                {Object.keys(fresh).length ? (
                  <p className={fresh.ok === true ? "text-primary-text" : "text-red-500"}>
                    방금 검증: {fresh.ok === true ? "정상" : freshCode || "실패"}
                    {fresh.ok !== true ? ` — ${freshMessage}` : ""}
                    {hierarchyStatus ? ` · 계정 상태 ${hierarchyStatus}` : ""}
                  </p>
                ) : null}
                {requestId ? <p className="font-mono text-xxs text-muted-text">request-id: {requestId}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 border-b border-border pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-text">30d performance</p>
            <h4 className="text-base font-semibold text-primary-text">광고 성과</h4>
          </div>
          <Button size="sm" variant="outline" onClick={() => void post("collect_performance")} disabled={!!busy}>
            <RefreshCw className={`icon-xxs ${busy === "collect_performance" ? "animate-spin" : ""}`} />
            성과 수집
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["비용", summary.cost],
            ["노출", summary.impressions],
            ["클릭", summary.clicks],
            ["전환", summary.conversions],
            ["ROAS", `${(Number(summary.roas || 0) * 100).toFixed(1)}%`],
          ].map(([label, value]) => (
            <div key={String(label)} className="border-l-2 border-border pl-3">
              <p className="text-xs text-secondary-text">{String(label)}</p>
              <p className="text-lg font-semibold text-primary-text">
                {typeof value === "string" && value.endsWith("%") ? value : formatNumber(value)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 border-b border-border pb-5">
        <h4 className="text-base font-semibold text-primary-text">광고 초안 작성</h4>
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            value={draft.provider}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, provider: value as DraftForm["provider"] }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google_ads">Google Ads</SelectItem>
              <SelectItem value="naver_ads">Naver Ads</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="캠페인 이름"
          />
          <Input
            value={draft.landingUrl}
            onChange={(e) => setDraft((prev) => ({ ...prev, landingUrl: e.target.value }))}
            placeholder="https://..."
          />
          <Input
            type="number"
            value={draft.dailyBudget}
            onChange={(e) => setDraft((prev) => ({ ...prev, dailyBudget: e.target.value }))}
            placeholder="일일 예산"
          />
          <Input
            value={draft.adGroupName}
            onChange={(e) => setDraft((prev) => ({ ...prev, adGroupName: e.target.value }))}
            placeholder="광고그룹 이름"
          />
          <Input
            type="number"
            value={draft.defaultBid}
            onChange={(e) => setDraft((prev) => ({ ...prev, defaultBid: e.target.value }))}
            placeholder="기본 입찰가"
          />
          {draft.provider === "naver_ads" ? (
            <Input
              value={draft.businessChannelId}
              onChange={(e) => setDraft((prev) => ({ ...prev, businessChannelId: e.target.value }))}
              placeholder="Naver 비즈니스 채널 ID"
            />
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Textarea
            rows={4}
            value={draft.headlines}
            onChange={(e) => setDraft((prev) => ({ ...prev, headlines: e.target.value }))}
            placeholder="제목, 한 줄에 하나"
          />
          <Textarea
            rows={4}
            value={draft.descriptions}
            onChange={(e) => setDraft((prev) => ({ ...prev, descriptions: e.target.value }))}
            placeholder="설명, 한 줄에 하나"
          />
          <Textarea
            rows={4}
            value={draft.keywords}
            onChange={(e) => setDraft((prev) => ({ ...prev, keywords: e.target.value }))}
            placeholder="키워드, 한 줄에 하나"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Label label="Keyword plan ID (선택)">
            <Input
              value={draft.keywordPlanId}
              onChange={(e) => setDraft((prev) => ({ ...prev, keywordPlanId: e.target.value }))}
              placeholder="승인된 keyword_plan_..."
            />
          </Label>
          <Label label="Campaign ID (선택)">
            <Input
              value={draft.campaignId}
              onChange={(e) => setDraft((prev) => ({ ...prev, campaignId: e.target.value }))}
              placeholder="상품·콘텐츠와 공유하는 campaignId"
            />
          </Label>
        </div>
        <Button size="sm" onClick={() => void createDraft()} disabled={!!busy}>
          초안 저장 및 검증
        </Button>
      </section>

      <section className="space-y-3">
        <h4 className="text-base font-semibold text-primary-text">초안과 집행 상태</h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs text-secondary-text">
              <tr>
                <th className="py-2">이름</th>
                <th>Provider</th>
                <th>상태</th>
                <th>예산</th>
                <th>검증</th>
                <th className="text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((item) => {
                const validation = toUnknownRecord(item.validation);
                const campaign = toUnknownRecord(item.campaign);
                const status = toSafeString(item.status);
                return (
                  <tr key={toSafeString(item.draftId)} className="border-b border-border/70">
                    <td className="py-3 font-medium text-primary-text">{toSafeString(item.name)}</td>
                    <td>{toSafeString(item.provider)}</td>
                    <td>{status}</td>
                    <td>{formatNumber(campaign.dailyBudget)}</td>
                    <td>
                      {validation.valid
                        ? "통과"
                        : Array.isArray(validation.issues)
                          ? validation.issues.join(", ")
                          : "미통과"}
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        {status === "draft" && validation.valid === true ? (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => void post("approve_draft", { draftId: item.draftId })}
                            disabled={!!busy}
                          >
                            <CheckCircle2 className="icon-xxs" />
                            승인
                          </Button>
                        ) : null}
                        {status === "approved" ? (
                          <Button
                            size="xs"
                            onClick={() => void post("execute_draft", { draftId: item.draftId })}
                            disabled={!!busy || !policy.executionEnabled}
                          >
                            <Play className="icon-xxs" />
                            Paused 생성
                          </Button>
                        ) : null}
                        {status === "paused_created" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-secondary-text">
                            <Pause className="icon-xxs" />
                            외부 활성화 대기
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {(data?.executions || []).length ? (
        <section className="space-y-3">
          <h4 className="text-base font-semibold text-primary-text">집행 원장</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-xs text-secondary-text">
                <tr>
                  <th className="py-2">Execution</th>
                  <th>Provider</th>
                  <th>상태</th>
                  <th>외부 리소스</th>
                  <th>오류</th>
                  <th>실행자</th>
                </tr>
              </thead>
              <tbody>
                {(data?.executions || []).map((item) => {
                  const externalIds = toUnknownRecord(item.externalIds);
                  const externalSummary = Object.entries(externalIds)
                    .map(([key, value]) => `${key}:${toSafeString(value)}`)
                    .filter((entry) => !entry.endsWith(":"))
                    .join(" · ");
                  return (
                    <tr key={toSafeString(item.executionId)} className="border-b border-border/70 align-top">
                      <td className="py-3 font-mono text-xs">{toSafeString(item.executionId).slice(0, 16)}…</td>
                      <td>{toSafeString(item.provider)}</td>
                      <td>{toSafeString(item.status)}</td>
                      <td className="max-w-[240px] break-all text-xs text-secondary-text">{externalSummary || "-"}</td>
                      <td className="max-w-[280px] break-all text-xs text-red-500">
                        {toSafeString(item.error).slice(0, 200) || "-"}
                      </td>
                      <td className="text-xs">{toSafeString(item.executedBy) || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
