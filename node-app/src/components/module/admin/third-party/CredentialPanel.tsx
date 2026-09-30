"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import fetchClient from "libs/api/fetchClient";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { toast } from "sonner";
import { logger } from "utils/log";
import { AlertCircle, CheckCircle2, Trash2, Plus } from "lucide-react";
import { GITLAB_BASE } from "consts/thirdparty/gitlab";
import { getInstagramGraphBase, resolveInstagramAuthMode } from "consts/thirdparty/instagram";
import { CredentialProviderEnums } from "types/thirdparty/providers";
import type { CredentialProviderType } from "types/thirdparty/providers";
import type { CredentialFormStateType } from "types/ui";
import type { UniverseBasePath } from "types/game";
import {
  extractApiErrorMessage,
  pickArray,
  pickString,
  toSafeString,
  toUnknownRecord,
  type UnknownRecord,
} from "utils/common/typeUtils";

type Provider = CredentialProviderType;

interface CredentialPanelProps {
  universeId: string;
  provider: Provider;
  onReadyChange?: (ready: boolean) => void;
  onExtrasChange?: (extras: UnknownRecord | undefined) => void;
  hideStatusBadge?: boolean;
}

type ProviderStatus = {
  ok: boolean;
  exists?: boolean;
  missing?: string[];
  updatedAt?: string;
  extras?: UnknownRecord;
};

// Secret Key를 사용하는 Provider 목록
const SECRET_PROVIDERS: Provider[] = CredentialProviderEnums;

type ProviderStatusState = {
  status: ProviderStatus | null;
  loaded: boolean;
};

type CredentialStatusLoadResult = {
  status: ProviderStatus | null;
  preferredBasePath: UniverseBasePath;
};

type ScopedState<T> = {
  scopeKey: string;
  value: T;
};

const createEmptyCredentialForm = (): CredentialFormStateType => ({
  clientId: "",
  clientSecret: "",
  extras: {},
});

const createInitialProviderStatusState = (): ProviderStatusState => ({
  status: null,
  loaded: false,
});

const createInitialPreferredBasePath = (): UniverseBasePath => "store";

const createInitialEditMode = () => false;
type GoogleAdsSecretForm = { clientSecret: string; refreshToken: string; developerToken: string };
const createEmptyGoogleAdsSecretForm = (): GoogleAdsSecretForm => ({ clientSecret: "", refreshToken: "", developerToken: "" });

function useScopedState<T>(scopeKey: string, createInitialValue: () => T): [T, Dispatch<SetStateAction<T>>] {
  const [scopedState, setScopedState] = useState<ScopedState<T>>(() => ({
    scopeKey,
    value: createInitialValue(),
  }));

  const value = scopedState.scopeKey === scopeKey ? scopedState.value : createInitialValue();

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (nextValue) => {
      setScopedState((prev) => {
        const prevValue = prev.scopeKey === scopeKey ? prev.value : createInitialValue();
        const resolvedValue = typeof nextValue === "function" ? (nextValue as (value: T) => T)(prevValue) : nextValue;

        return {
          scopeKey,
          value: resolvedValue,
        };
      });
    },
    [createInitialValue, scopeKey],
  );

  return [value, setValue];
}

export function CredentialPanel({
  universeId,
  provider,
  onReadyChange,
  onExtrasChange,
  hideStatusBadge = false,
}: CredentialPanelProps) {
  const credentialScopeKey = useMemo(() => `${universeId || "__empty__"}:${provider}`, [provider, universeId]);
  const [statusState, setStatusState] = useScopedState<ProviderStatusState>(
    credentialScopeKey,
    createInitialProviderStatusState,
  );
  const [preferredBasePath, setPreferredBasePath] = useScopedState<UniverseBasePath>(
    credentialScopeKey,
    createInitialPreferredBasePath,
  );
  const [form, setForm] = useScopedState<CredentialFormStateType>(credentialScopeKey, createEmptyCredentialForm);
  const [editMode, setEditMode] = useScopedState<boolean>(credentialScopeKey, createInitialEditMode);
  const [googleAdsSecrets, setGoogleAdsSecrets] = useScopedState<GoogleAdsSecretForm>(credentialScopeKey, createEmptyGoogleAdsSecretForm);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingBasePath, setSavingBasePath] = useState(false);
  const [tokenClock] = useState(() => Date.now());

  const status = statusState.status;
  const loadingCredentialStatus = loadingStatus || !statusState.loaded;

  const setStatus = useCallback(
    (nextStatus: ProviderStatus | null) => {
      setStatusState({
        status: nextStatus,
        loaded: true,
      });
    },
    [setStatusState],
  );

  // 부모 콜백은 최신 참조만 보관, provider/universeId 변경 effect의 deps를 오염시키지 않음
  const onReadyChangeRef = useRef(onReadyChange);
  const onExtrasChangeRef = useRef(onExtrasChange);

  useEffect(
    function syncParentCallbacks() {
      onReadyChangeRef.current = onReadyChange;
      onExtrasChangeRef.current = onExtrasChange;
    },
    [onReadyChange, onExtrasChange],
  );

  const providerLabel = useMemo(() => {
    switch (provider) {
      case "naver":
        return "네이버 커머스 API 자격증명";
      case "gitlab":
        return "GitLab 연동 자격증명";
      case "threads":
        return "Threads 발행 자격증명";
      case "instagram":
        return "Instagram 마케팅 자격증명";
      case "linkedin":
        return "LinkedIn 마케팅 자격증명";
      case "naver_blog":
        return "네이버 블로그 마케팅 자격증명";
      case "naver_ads":
        return "네이버 검색광고 자격증명";
      case "google_ads":
        return "Google Ads 자격증명";
      case "google_analytics":
        return "Google Analytics(GA4) 성과 수집 자격증명";
      case "naver_datalab":
        return "네이버 데이터랩/검색 API 자격증명";
      case "slack":
        return "Slack 운영 알림 자격증명";
      case "email":
        return "이메일 발송 자격증명";
      case "agent":
        return "에이전트 운영 권한";
      default:
        return `${provider} 자격증명`;
    }
  }, [provider]);

  const providerDescription = useMemo(() => {
    switch (provider) {
      case "naver":
        return [
          "네이버 커머스 애플리케이션 ID와 bcrypt salt 형식의 Secret을 입력하세요.",
          "Secret는 NAVER 콘솔에서 발급받은 SALT 값($2a$... 형태)입니다.",
          "스토어 ID는 스마트스토어 URL의 상점 식별자입니다. (예: https://smartstore.naver.com/스토어ID)",
        ];
      case "gitlab":
        return [
          "GitLab Personal Access Token 기반으로 커밋 내역을 조회합니다.",
          "Access Token에는 최소 read_api 권한이 필요합니다.",
          "여러 GitLab 프로젝트를 extras.projects에 등록해 멀티 프로젝트 구성을 할 수 있습니다.",
        ];
      case "threads":
        return [
          "Threads 자동 발행용 Threads User ID와 장기 access token을 저장합니다.",
          "I4의 worker publish_threads 단계 및 운영툴 수동 발행과 연결되며, MARKETING_DRY_RUN=false일 때 실제 발행합니다.",
        ];
      case "instagram":
        return [
          "Instagram Login으로 발급한 Professional 계정 ID와 User Access Token을 저장합니다.",
          "발행에는 instagram_business_basic, instagram_business_content_publish 권한이 필요합니다.",
          "Graph endpoint는 인증 방식에 따라 서버가 고정하며 MARKETING_DRY_RUN=false일 때 실제 발행합니다.",
        ];
      case "linkedin":
        return [
          "LinkedIn은 현재 draft 생성, 복사, 외부 발행, 완료 체크 중심의 반자동 채널입니다.",
          "향후 API 발행을 연결할 때는 Community Management API용 OAuth Client ID/Secret과 조직 메타를 사용합니다.",
          "Access Token은 만료되는 사용자 토큰이므로 이 슬롯에 직접 저장하지 않습니다.",
        ];
      case "naver_blog":
        return [
          "네이버 블로그는 현재 draft 생성, 제목/본문 복사, 운영자 직접 발행, 완료 체크 흐름으로 사용합니다.",
          "공개 글쓰기 API 자동 발행이 안정적으로 연결된 상태가 아니므로 blogId/categoryId는 목적지 메타와 후속 연동 준비용입니다.",
        ];
      case "naver_ads":
        return [
          "API License, Secret Key, Customer ID를 사용해 검색광고 조회와 paused-first 집행을 수행합니다.",
          "실제 집행 경로는 Marketing Ops 광고 탭의 관리자 스위치와 지출 상한으로 제어합니다.",
        ];
      case "google_ads":
        return [
          "OAuth Client ID와 아래 3개 비밀 필드를 입력하면 서버가 암호화 JSON으로 조립해 저장합니다.",
          "Refresh Token과 Developer Token은 extras가 아닌 암호화 secret 슬롯에만 저장됩니다.",
        ];
      case "google_analytics":
        return [
          "GA4 Data API로 일별 성과 스냅샷을 수집하기 위한 서비스 계정 자격증명 슬롯입니다.",
          "Secret에는 Google Cloud 서비스 계정 키 JSON 전체를 붙여넣으세요. client_email/private_key를 자동으로 추출합니다.",
          "Property ID는 여러 개를 등록할 수 있습니다. 예: magazine=311756914, app=488820875",
          "브라우저 gtag Measurement ID는 간편 연결 화면의 유니버스별 마케팅 설정에서 별도로 관리합니다.",
          "해당 서비스 계정 이메일을 GA4 속성에 Viewer(뷰어) 권한으로 추가해야 수집이 동작합니다.",
          "수집 사용 스위치가 꺼져 있으면 스냅샷 수집이 전면 중지됩니다.",
        ];
      case "naver_datalab":
        return [
          "네이버 데이터랩(검색어트렌드)과 검색(블로그) API 호출용 자격증명 슬롯입니다.",
          "네이버 디벨로퍼 애플리케이션의 Client ID/Secret을 입력하세요. (사용 API에 검색, 데이터랩이 등록된 앱)",
          "기본 앵커 키워드(데이터랩 상대 지수의 기준선)는 Marketing Ops의 키워드 전략 탭 > 기본 앵커 설정에서 관리합니다.",
          "수집 사용 스위치가 꺼져 있으면 트렌드 조회/후보 검증/순위 추적이 전면 중지됩니다.",
        ];
      case "slack":
        return [
          "운영 알림 전송용 Slack incoming webhook 자격증명 슬롯입니다.",
          "I4에서 queue 등록, 검수 대기, Threads 발행 성공/실패 알림에 실제 연결되어 있습니다.",
        ];
      case "email":
        return [
          "승인 요청 및 운영 알림 메일 발송용 자격증명 슬롯입니다.",
          "현재 provider adapter가 연결되지 않은 admin-only 준비 슬롯입니다.",
        ];
      case "agent":
        return [
          "Codex 같은 에이전트가 이 유니버스의 마케팅 queue를 조작할 수 있는지 결정합니다.",
          "AGENT_API_KEY 인증 후 AGENT_UID 사용자의 DB role이 아래 허용 역할에 포함될 때만 동작합니다.",
          "worker polling은 자동 실행하지 않고 MCP 수동 호출로만 열어 둡니다.",
        ];
      default:
        return [];
    }
  }, [provider]);

  // extras는 provider별로 shape이 달라 동적 키 접근이 필요하므로 UnknownRecord로 좁힘
  const extras = (form.extras || {}) as UnknownRecord;
  const isSecretProvider = SECRET_PROVIDERS.includes(provider);
  const isAgentProvider = provider === "agent";
  const supportsPreferredBasePath = provider === "naver";
  const ready = !!status && !!status.ok;
  const showReadonly = isSecretProvider && ready && !editMode && !isAgentProvider;

  const setExtra = (key: string, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      extras: {
        ...(prev.extras || {}),
        [key]: value,
      },
    }));
  };

  const fetchCredentialStatus = useCallback(async (): Promise<CredentialStatusLoadResult | null> => {
    if (!universeId) return null;

    const [credentialRes, universeRes] = await Promise.all([
      fetchClient.get(`/universe/${universeId}/credentials`),
      fetchClient.get(`/universe/${universeId}`),
    ]);
    const raw = credentialRes.data?.data ?? {};
    const nextBasePath =
      (universeRes.data?.data?.typeSpecific?.routing?.preferredBasePath as UniverseBasePath | undefined) || "store";

    let s: ProviderStatus | null = null;

    if (raw) {
      // 1) 맵 형태 { naver: {...}, gitlab: {...} }
      const rawRecord = toUnknownRecord(raw);
      if (rawRecord[provider]) {
        const r = toUnknownRecord(rawRecord[provider]);
        const exists = Boolean(r.exists);
        const readyValue =
          typeof r.ready !== "undefined"
            ? Boolean(r.ready)
            : exists || Boolean(r.ok ?? r.ready ?? r.valid ?? r.configured);
        s = {
          ok: readyValue,
          exists,
          missing: (r.missing ?? r.missingFields) as string[] | undefined,
          updatedAt: (r.updatedAt ?? r.updated_at ?? r.lastUpdatedAt) as string | undefined,
          extras: r.extras ? toUnknownRecord(r.extras) : undefined,
        };
      }
      // 2) 배열 형태 [{ provider: "naver", ok: true, ... }]
      else if (Array.isArray(raw)) {
        const found = (raw as unknown[]).map(toUnknownRecord).find((r) => r.provider === provider);
        if (found) {
          const exists = Boolean(found.exists);
          const readyValue =
            typeof found.ready !== "undefined"
              ? Boolean(found.ready)
              : exists || Boolean(found.ok ?? found.ready ?? found.valid ?? found.configured);
          s = {
            ok: readyValue,
            exists,
            missing: (found.missing ?? found.missingFields) as string[] | undefined,
            updatedAt: (found.updatedAt ?? found.updated_at ?? found.lastUpdatedAt) as string | undefined,
            extras: found.extras ? toUnknownRecord(found.extras) : undefined,
          };
        }
      }
    }

    return {
      status: s,
      preferredBasePath: nextBasePath,
    };
  }, [provider, universeId]);

  const applyCredentialStatus = useCallback(
    (result: CredentialStatusLoadResult | null) => {
      const nextStatus = result?.status ?? null;

      setStatus(nextStatus);
      setPreferredBasePath(result?.preferredBasePath ?? "store");

      if (provider === "agent") {
        const current = (nextStatus?.extras || {}) as UnknownRecord;
        setForm((prev) => ({
          ...prev,
          extras: {
            enabled: current.enabled ?? false,
            allowedRoles: Array.isArray(current.allowedRoles)
              ? (current.allowedRoles as unknown[]).join(",")
              : (current.allowedRoles ?? "administrator"),
            allowIntelligenceRead: current.allowIntelligenceRead ?? true,
            allowIntelligenceWrite: current.allowIntelligenceWrite ?? false,
            allowEnqueueContent: current.allowEnqueueContent ?? true,
            allowPollWorker: current.allowPollWorker ?? true,
            allowChannelAction: current.allowChannelAction ?? true,
            allowStrategyWrite: current.allowStrategyWrite ?? true,
            allowAdsRead: current.allowAdsRead ?? false,
          },
        }));
      }

      // GA / naver_datalab도 not-ready(미설정) 상태에서 편집 폼이 바로 열리므로,
      // agent와 동일하게 서버 값으로 form.extras를 시딩해야 토글/필드가 저장값을 반영하고
      // enabled만 켜서 저장할 때 기존 properties가 덮여 사라지지 않는다.
      if (provider === "google_analytics") {
        const current = (nextStatus?.extras || {}) as UnknownRecord;
        const properties = Array.isArray(current.properties)
          ? current.properties
          : current.propertyId
            ? [{ role: "default", propertyId: current.propertyId }]
            : [];
        setForm((prev) => ({
          ...prev,
          extras: {
            enabled: current.enabled ?? false,
            properties,
          },
        }));
      }

      if (provider === "naver_datalab") {
        const current = (nextStatus?.extras || {}) as UnknownRecord;
        setForm((prev) => ({
          ...prev,
          extras: {
            enabled: current.enabled ?? false,
            // legacy fallback 값 보존용 passthrough — 편집 UI는 키워드 전략 탭(기본 앵커 설정)으로 이관
            ...(current.anchorKeyword ? { anchorKeyword: current.anchorKeyword } : {}),
          },
        }));
      }

      const isReady = !!nextStatus && !!nextStatus.ok;
      onReadyChangeRef.current?.(isReady);
      onExtrasChangeRef.current?.(nextStatus?.extras);
    },
    [provider, setForm, setPreferredBasePath, setStatus],
  );

  const handleCredentialStatusError = useCallback(
    (error: unknown) => {
      logger.error("[CredentialPanel] 상태 조회 실패:", error);
      setStatus(null);
      onReadyChangeRef.current?.(false);
      onExtrasChangeRef.current?.(undefined);
    },
    [setStatus],
  );

  const loadStatus = useCallback(async () => {
    if (!universeId) return;

    try {
      setLoadingStatus(true);
      const result = await fetchCredentialStatus();
      applyCredentialStatus(result);
    } catch (error) {
      handleCredentialStatusError(error);
    } finally {
      setLoadingStatus(false);
    }
  }, [applyCredentialStatus, fetchCredentialStatus, handleCredentialStatusError, universeId]);

  useEffect(
    function fetchCredentialStatusWhenProviderChanges() {
      let cancelled = false;

      // 새 provider/universeId로 바뀌면 부모에는 즉시 미준비 상태를 알림
      onReadyChangeRef.current?.(false);
      onExtrasChangeRef.current?.(undefined);

      void (async () => {
        try {
          const result = await fetchCredentialStatus();
          if (cancelled) return;
          applyCredentialStatus(result);
        } catch (error) {
          if (cancelled) return;
          handleCredentialStatusError(error);
        }
      })();

      return () => {
        cancelled = true;
      };
    },
    [applyCredentialStatus, fetchCredentialStatus, handleCredentialStatusError],
  );

  const handleSave = async () => {
    if (!universeId) return;

    try {
      setSaving(true);

      const payload: { provider: Provider; extras: UnknownRecord; clientId?: string; clientSecret?: string } = {
        provider,
        extras: form.extras || {},
      };

      // 공란이면 기존 값 유지
      if (form.clientId.trim()) payload.clientId = form.clientId.trim();
      if (form.clientSecret.trim()) payload.clientSecret = form.clientSecret.trim();
      if (provider === "google_ads") {
        const values = Object.values(googleAdsSecrets).map((value) => value.trim());
        if (values.some(Boolean) && !values.every(Boolean)) {
          void dialog.alert({ variant: "danger", message: "Google Ads 비밀 필드 3개를 모두 입력하세요." });
          return;
        }
        if (values.every(Boolean)) payload.clientSecret = JSON.stringify({
          clientSecret: googleAdsSecrets.clientSecret.trim(),
          refreshToken: googleAdsSecrets.refreshToken.trim(),
          developerToken: googleAdsSecrets.developerToken.trim(),
        });
      }
      if (isAgentProvider) {
        payload.clientId ||= "agent-marketing-permission";
        payload.clientSecret ||= "agent-marketing-permission";
      }

      await fetchClient.post(`/universe/${universeId}/credentials`, payload);

      toast.success("자격증명이 저장되었습니다.");

      await loadStatus();
      setEditMode(false);
      setForm((prev) => ({
        ...prev,
        clientId: "",
        clientSecret: "",
      }));
      setGoogleAdsSecrets(createEmptyGoogleAdsSecretForm());
    } catch (error) {
      logger.error("[CredentialPanel] 저장 실패:", error);
      void dialog.alert({ variant: "danger", message: extractApiErrorMessage(error, "자격증명 저장에 실패했습니다.") });
      onReadyChangeRef.current?.(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferredBasePath = async () => {
    if (!universeId || !supportsPreferredBasePath) return;

    try {
      setSavingBasePath(true);
      await fetchClient.post(`/universe/${universeId}/routing`, {
        preferredBasePath,
      });
      toast.success(`기본 경로가 /${preferredBasePath} 로 저장되었습니다.`);
      await loadStatus();
    } catch (error) {
      logger.error("[CredentialPanel] 기본 경로 저장 실패:", error);
      void dialog.alert({
        variant: "danger",
        message: extractApiErrorMessage(error, "기본 경로 저장에 실패했습니다."),
      });
    } finally {
      setSavingBasePath(false);
    }
  };

  const clientIdLabel = useMemo(() => {
    switch (provider) {
      case "naver":
        return "Application ID (clientId)";
      case "gitlab":
        return "Client ID / 사용자 ID";
      case "threads":
        return "Threads User ID";
      case "instagram":
        return "Instagram User ID";
      case "linkedin":
        return "LinkedIn OAuth Client ID";
      case "naver_blog":
        return "Client ID";
      case "naver_ads":
        return "API License (X-API-KEY)";
      case "google_ads":
        return "OAuth Client ID";
      case "google_analytics":
        return "서비스 계정 이메일 (client_email)";
      case "naver_datalab":
        return "네이버 앱 Client ID";
      case "slack":
        return "App ID / Bot ID / Webhook Label";
      case "email":
        return "Provider Key / Username";
      case "agent":
        return "Agent Permission Key";
      default:
        return "clientId";
    }
  }, [provider]);

  const clientSecretLabel = useMemo(() => {
    switch (provider) {
      case "naver":
        return "Application Secret SALT (clientSecret)";
      case "gitlab":
        return "Personal Access Token (clientSecret)";
      case "threads":
        return "Access Token (clientSecret)";
      case "instagram":
        return "Access Token (clientSecret)";
      case "linkedin":
        return "LinkedIn OAuth Client Secret";
      case "naver_blog":
        return "Client Secret";
      case "naver_ads":
        return "Secret Key (서명용)";
      case "google_ads":
        return "OAuth / Developer 비밀 필드";
      case "google_analytics":
        return "서비스 계정 키 JSON 전체 (clientSecret)";
      case "naver_datalab":
        return "네이버 앱 Client Secret";
      case "slack":
        return "Incoming Webhook URL";
      case "email":
        return "Provider Secret / Password";
      case "agent":
        return "Agent Permission Secret";
      default:
        return "clientSecret";
    }
  }, [provider]);

  const formatUpdatedAt = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString();
    } catch {
      return iso;
    }
  };

  const getTokenExpiryState = (rawExpiresAt?: unknown) => {
    const expiresAt = toSafeString(rawExpiresAt);
    if (!expiresAt) return null;
    const time = new Date(expiresAt).getTime();
    if (Number.isNaN(time)) return null;
    const daysLeft = Math.ceil((time - tokenClock) / 86_400_000);
    const tone = daysLeft <= 0 ? "red" : daysLeft <= 7 ? "orange" : daysLeft <= 15 ? "yellow" : "green";

    return {
      daysLeft,
      tone,
      label: daysLeft <= 0 ? "만료됨" : `D-${daysLeft}`,
      className:
        tone === "green"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
          : tone === "yellow"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
            : tone === "orange"
              ? "border-orange-500/40 bg-orange-500/10 text-orange-700"
              : "border-destructive/40 bg-destructive/10 text-destructive",
    };
  };

  // Secret Provider 편집 시작 시 extras 초기값 구성
  const buildInitialExtrasForEdit = (): UnknownRecord => {
    const current = (status?.extras || {}) as UnknownRecord;

    if (provider === "gitlab") {
      const baseUrl = current.baseUrl ?? GITLAB_BASE;
      const defaultBranch = current.defaultBranch ?? "main";
      const projects = pickArray(current.projects);

      const normalizedProjects = projects
        .map((entry) => {
          const p = toUnknownRecord(entry);
          return {
            key: p.key ? String(p.key) : "",
            projectId: p.projectId ? String(p.projectId) : "",
            baseUrl: p.baseUrl ? String(p.baseUrl) : "",
            defaultBranch: p.defaultBranch ? String(p.defaultBranch) : "",
          };
        })
        .filter((p) => p.key && p.projectId);

      return {
        baseUrl,
        defaultBranch,
        defaultProjectKey: current.defaultProjectKey ?? (normalizedProjects[0]?.key || ""),
        projects: normalizedProjects,
      };
    }

    if (provider === "naver") {
      return {
        storeId: current.storeId ?? "",
      };
    }

    if (provider === "threads") {
      return {
        username: current.username ?? "",
        appId: current.appId ?? "",
        graphBaseUrl: current.graphBaseUrl ?? "",
        tokenIssuedAt: current.tokenIssuedAt ?? "",
        tokenExpiresAt: current.tokenExpiresAt ?? "",
        tokenRefreshDueAt: current.tokenRefreshDueAt ?? "",
        lastRefreshStatus: current.lastRefreshStatus ?? "",
      };
    }

    if (provider === "instagram") {
      return {
        username: current.username ?? "",
        authMode: resolveInstagramAuthMode(current.authMode, current.graphBaseUrl),
        metaAppId: current.metaAppId ?? current.appId ?? "",
        instagramAppId: current.instagramAppId ?? "",
        tokenIssuedAt: current.tokenIssuedAt ?? "",
        tokenExpiresAt: current.tokenExpiresAt ?? "",
        tokenRefreshDueAt: current.tokenRefreshDueAt ?? "",
        lastRefreshStatus: current.lastRefreshStatus ?? "",
        lastValidatedAt: current.lastValidatedAt ?? "",
        lastValidationStatus: current.lastValidationStatus ?? "",
        validatedAccountId: current.validatedAccountId ?? "",
        validatedUsername: current.validatedUsername ?? "",
      };
    }

    if (provider === "linkedin") {
      return {
        organizationId: current.organizationId ?? "",
        authorUrn: current.authorUrn ?? "",
      };
    }

    if (provider === "naver_blog") {
      return {
        blogId: current.blogId ?? "",
        categoryId: current.categoryId ?? "",
      };
    }

    if (provider === "naver_ads") {
      return {
        customerId: current.customerId ?? "",
      };
    }

    if (provider === "google_ads") {
      return {
        customerId: current.customerId ?? "",
        loginCustomerId: current.loginCustomerId ?? "",
      };
    }

    if (provider === "google_analytics") {
      const properties = Array.isArray(current.properties)
        ? current.properties
        : current.propertyId
          ? [{ role: "default", propertyId: current.propertyId }]
          : [];
      return {
        enabled: current.enabled ?? false,
        properties,
      };
    }

    if (provider === "naver_datalab") {
      return {
        enabled: current.enabled ?? false,
        // legacy fallback 값 보존용 passthrough — 편집 UI는 키워드 전략 탭(기본 앵커 설정)으로 이관
        ...(current.anchorKeyword ? { anchorKeyword: current.anchorKeyword } : {}),
      };
    }

    if (provider === "slack") {
      return {
        channel: current.channel ?? "",
      };
    }

    if (provider === "email") {
      return {
        fromEmail: current.fromEmail ?? "",
        replyTo: current.replyTo ?? "",
      };
    }

    if (provider === "agent") {
      return {
        enabled: current.enabled ?? false,
        allowedRoles: Array.isArray(current.allowedRoles)
          ? (current.allowedRoles as unknown[]).join(",")
          : (current.allowedRoles ?? "administrator"),
        allowIntelligenceRead: current.allowIntelligenceRead ?? true,
        allowIntelligenceWrite: current.allowIntelligenceWrite ?? false,
        allowEnqueueContent: current.allowEnqueueContent ?? true,
        allowPollWorker: current.allowPollWorker ?? true,
        allowChannelAction: current.allowChannelAction ?? true,
        allowStrategyWrite: current.allowStrategyWrite ?? true,
        allowAdsRead: current.allowAdsRead ?? false,
      };
    }

    return { ...current };
  };

  const handleStartEdit = () => {
    if (!isSecretProvider) return;
    setForm((prev) => ({
      ...prev,
      // ID / Secret 은 새로 입력하는 값만 반영
      clientId: "",
      clientSecret: "",
      extras: buildInitialExtrasForEdit(),
    }));
    setEditMode(true);
    setGoogleAdsSecrets(createEmptyGoogleAdsSecretForm());
  };

  const handleCancelEdit = () => {
    setForm((prev) => ({
      ...prev,
      clientId: "",
      clientSecret: "",
      extras: {},
    }));
    setEditMode(false);
    setGoogleAdsSecrets(createEmptyGoogleAdsSecretForm());
  };

  // extras 필드 렌더링 (읽기/편집 공용)
  const renderExtrasFields = (readOnly: boolean) => {
    // GitLab extras (baseUrl / defaultBranch / defaultProjectKey / projects[])
    if (provider === "gitlab") {
      const base = (readOnly ? status?.extras || {} : extras || {}) as UnknownRecord;

      const baseUrlVal = pickString(base.baseUrl) || GITLAB_BASE;
      const defaultBranchVal = pickString(base.defaultBranch) || "main";
      const defaultProjectKeyVal = pickString(base.defaultProjectKey);

      type GitlabProjectRow = { key: string; projectId: string; baseUrl: string; defaultBranch: string };
      const projects: GitlabProjectRow[] = Array.isArray(base.projects)
        ? (base.projects as GitlabProjectRow[])
        : base.projectId
          ? [
              {
                key: String(base.defaultProjectKey || "default"),
                projectId: String(base.projectId),
                baseUrl: String(base.baseUrl || ""),
                defaultBranch: String(base.defaultBranch || ""),
              },
            ]
          : [];

      const handleProjectChange = (idx: number, field: keyof GitlabProjectRow, value: string) => {
        setForm((prev) => {
          const prevExtras = prev.extras || {};
          const prevProjects: GitlabProjectRow[] = Array.isArray(prevExtras.projects)
            ? [...(prevExtras.projects as GitlabProjectRow[])]
            : [];
          const existing = prevProjects[idx] || ({} as Partial<GitlabProjectRow>);
          const target: GitlabProjectRow = {
            key: existing.key ?? "",
            projectId: existing.projectId ?? "",
            baseUrl: existing.baseUrl ?? "",
            defaultBranch: existing.defaultBranch ?? "",
          };
          target[field] = value;
          prevProjects[idx] = target;
          return {
            ...prev,
            extras: { ...prevExtras, projects: prevProjects },
          };
        });
      };

      const handleAddProject = () => {
        setForm((prev) => {
          const prevExtras = prev.extras || {};
          const prevProjects: GitlabProjectRow[] = Array.isArray(prevExtras.projects)
            ? [...(prevExtras.projects as GitlabProjectRow[])]
            : [];
          prevProjects.push({
            key: "",
            projectId: "",
            baseUrl: "",
            defaultBranch: "",
          });
          return {
            ...prev,
            extras: { ...prevExtras, projects: prevProjects },
          };
        });
      };

      const handleRemoveProject = (idx: number) => {
        setForm((prev) => {
          const prevExtras = prev.extras || {};
          const prevProjects: GitlabProjectRow[] = Array.isArray(prevExtras.projects)
            ? [...(prevExtras.projects as GitlabProjectRow[])]
            : [];
          prevProjects.splice(idx, 1);
          return {
            ...prev,
            extras: { ...prevExtras, projects: prevProjects },
          };
        });
      };

      const handleBaseFieldChange = (field: "baseUrl" | "defaultBranch" | "defaultProjectKey", value: string) => {
        if (readOnly) return;
        setExtra(field, value);
      };

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs mb-1">Base URL (baseUrl)</label>
              <Input
                value={readOnly ? baseUrlVal : pickString(extras.baseUrl) || baseUrlVal}
                disabled={readOnly}
                readOnly={readOnly}
                onChange={readOnly ? undefined : (e) => handleBaseFieldChange("baseUrl", e.target.value)}
              />
              <p className="text-xxs text-secondary-text mt-1">미입력 시 {GITLAB_BASE}가 사용됩니다.</p>
            </div>
            <div>
              <label className="block text-xs mb-1">기본 브랜치 (defaultBranch)</label>
              <Input
                value={readOnly ? defaultBranchVal : pickString(extras.defaultBranch) || defaultBranchVal}
                disabled={readOnly}
                readOnly={readOnly}
                onChange={readOnly ? undefined : (e) => handleBaseFieldChange("defaultBranch", e.target.value)}
                placeholder="예: main / master / develop"
              />
              <p className="text-xxs text-secondary-text mt-1">
                프로젝트별 defaultBranch가 없을 때 사용하는 공통 기본 브랜치입니다.
              </p>
            </div>
            <div>
              <label className="block text-xs mb-1">기본 프로젝트 키 (별칭)</label>
              <Input
                value={readOnly ? defaultProjectKeyVal : pickString(extras.defaultProjectKey) || defaultProjectKeyVal}
                disabled={readOnly}
                readOnly={readOnly}
                onChange={readOnly ? undefined : (e) => handleBaseFieldChange("defaultProjectKey", e.target.value)}
                placeholder="예: amu-app"
              />
              <p className="text-xxs text-secondary-text mt-1">
                projectKey를 지정하지 않았을 때 사용되는 기본 프로젝트 키 (별칭)입니다.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1">프로젝트 목록 (projects)</label>
            <p className="text-xxs text-secondary-text mb-2">
              여러 GitLab 프로젝트를 key/projectId로 등록할 수 있습니다. key는 커밋 조회 시 projectKey로 사용됩니다.
            </p>

            <div className="space-y-2">
              {projects.map((p, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[1.2fr,1.6fr,1.2fr,auto] gap-2 items-center">
                  <div>
                    <label className="block text-xxs mb-1">key</label>
                    <Input
                      value={p.key || ""}
                      disabled={readOnly}
                      readOnly={readOnly}
                      onChange={readOnly ? undefined : (e) => handleProjectChange(idx, "key", e.target.value)}
                      placeholder="예: amu-app"
                    />
                  </div>
                  <div>
                    <label className="block text-xxs mb-1">projectId</label>
                    <Input
                      value={p.projectId || ""}
                      disabled={readOnly}
                      readOnly={readOnly}
                      onChange={readOnly ? undefined : (e) => handleProjectChange(idx, "projectId", e.target.value)}
                      placeholder="예: 12345678 또는 full/path"
                    />
                  </div>
                  <div>
                    <label className="block text-xxs mb-1">기본 브랜치</label>
                    <Input
                      value={p.defaultBranch || ""}
                      disabled={readOnly}
                      readOnly={readOnly}
                      onChange={readOnly ? undefined : (e) => handleProjectChange(idx, "defaultBranch", e.target.value)}
                      placeholder="비우면 공통 defaultBranch 사용"
                    />
                  </div>

                  {!readOnly && (
                    <div className="flex items-end pb-1">
                      <Button
                        variant="blank"
                        onClick={() => handleRemoveProject(idx)}
                        className="h-7 w-7 text-red-500"
                        title="프로젝트 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {!readOnly && (
                <Button size="sm" variant="outline" onClick={handleAddProject}>
                  <Plus className="w-3 h-3" />
                  프로젝트 추가
                </Button>
              )}

              {readOnly && projects.length === 0 && (
                <div className="text-xxs text-secondary-text">
                  등록된 프로젝트가 없습니다. 기본 projectId/branch 설정만 사용합니다.
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Naver extras (storeId)
    if (provider === "naver") {
      const base = (status?.extras || {}) as { storeId?: string };
      const source = readOnly
        ? {
            storeId: base.storeId ?? "",
          }
        : {
            storeId: toSafeString(extras.storeId),
          };

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">스토어 ID (storeId)</label>
            <Input
              value={source.storeId}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("storeId", e.target.value)}
              placeholder="예: amu-store"
            />
            <p className="text-xxs text-secondary-text mt-1">
              스마트스토어 URL의 상점명 부분을 입력하세요. (예: https://smartstore.naver.com/
              <strong>스토어ID</strong>)
            </p>
          </div>
        </div>
      );
    }

    if (provider === "threads" || provider === "instagram") {
      const base = (status?.extras || {}) as {
        username?: string;
        appId?: string;
        graphBaseUrl?: string;
        authMode?: string;
        metaAppId?: string;
        instagramAppId?: string;
        tokenIssuedAt?: string;
        tokenExpiresAt?: string;
        tokenRefreshDueAt?: string;
        lastRefreshStatus?: string;
        lastValidatedAt?: string;
        lastValidationStatus?: string;
        validatedAccountId?: string;
        validatedUsername?: string;
      };
      const source = readOnly
        ? {
            username: base.username ?? "",
            appId: base.appId ?? "",
            graphBaseUrl: base.graphBaseUrl ?? "",
            authMode: resolveInstagramAuthMode(base.authMode, base.graphBaseUrl),
            metaAppId: base.metaAppId ?? base.appId ?? "",
            instagramAppId: base.instagramAppId ?? "",
            tokenIssuedAt: base.tokenIssuedAt ?? "",
            tokenExpiresAt: base.tokenExpiresAt ?? "",
            tokenRefreshDueAt: base.tokenRefreshDueAt ?? "",
            lastRefreshStatus: base.lastRefreshStatus ?? "",
            lastValidatedAt: base.lastValidatedAt ?? "",
            lastValidationStatus: base.lastValidationStatus ?? "",
            validatedAccountId: base.validatedAccountId ?? "",
            validatedUsername: base.validatedUsername ?? "",
          }
        : {
            username: pickString(extras.username),
            appId: toSafeString(extras.appId),
            graphBaseUrl: pickString(extras.graphBaseUrl),
            authMode: resolveInstagramAuthMode(extras.authMode, extras.graphBaseUrl),
            metaAppId: pickString(extras.metaAppId || extras.appId),
            instagramAppId: pickString(extras.instagramAppId),
            tokenIssuedAt: pickString(extras.tokenIssuedAt),
            tokenExpiresAt: pickString(extras.tokenExpiresAt),
            tokenRefreshDueAt: pickString(extras.tokenRefreshDueAt),
            lastRefreshStatus: pickString(extras.lastRefreshStatus),
            lastValidatedAt: pickString(extras.lastValidatedAt),
            lastValidationStatus: pickString(extras.lastValidationStatus),
            validatedAccountId: pickString(extras.validatedAccountId),
            validatedUsername: pickString(extras.validatedUsername),
          };
      const tokenState = getTokenExpiryState(source.tokenExpiresAt);

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tokenState ? (
            <div className="md:col-span-2">
              <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${tokenState.className}`}>
                토큰 만료 {tokenState.label}
              </span>
            </div>
          ) : null}
          <div>
            <label className="block text-xs mb-1">
              {provider === "threads" ? "Threads 사용자명 (username)" : "Instagram 사용자명 (username)"}
            </label>
            <Input
              value={source.username}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("username", e.target.value)}
              placeholder="예: allmyuniverse_com"
            />
            <p className="text-xxs text-secondary-text mt-1">운영 표시와 계정 확인용 메타입니다.</p>
          </div>
          {provider === "instagram" ? (
            <>
              <div>
                <label className="block text-xs mb-1">
                  <Lang text={{ ko: "인증 방식", en: "Authentication mode" }} />
                </label>
                <Select
                  value={source.authMode}
                  onValueChange={
                    readOnly
                      ? undefined
                      : (value) => setExtra("authMode", Array.isArray(value) ? value[0] || "instagram_login" : value)
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram_login">Instagram Login</SelectItem>
                    <SelectItem value="facebook_login">Facebook Login</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xxs text-secondary-text mt-1">
                  {lang({
                    ko: "현재 Meta 화면의 ‘토큰 생성’ 방식은 Instagram Login입니다.",
                    en: "The token generated from the current Meta screen uses Instagram Login.",
                  })}
                </p>
              </div>
              <div>
                <label className="block text-xs mb-1">
                  <Lang text={{ ko: "Meta App ID", en: "Meta App ID" }} />
                </label>
                <Input
                  value={source.metaAppId}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={readOnly ? undefined : (e) => setExtra("metaAppId", e.target.value)}
                  placeholder="Meta 앱의 App ID"
                />
                <p className="text-xxs text-secondary-text mt-1">
                  {lang({ ko: "상위 Meta 앱을 추적하는 운영 메타입니다.", en: "Operational metadata for the parent Meta app." })}
                </p>
              </div>
              <div>
                <label className="block text-xs mb-1">
                  <Lang text={{ ko: "Instagram App ID", en: "Instagram App ID" }} />
                </label>
                <Input
                  value={source.instagramAppId}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={readOnly ? undefined : (e) => setExtra("instagramAppId", e.target.value)}
                  placeholder="Instagram API 설정 화면의 앱 ID"
                />
                <p className="text-xxs text-secondary-text mt-1">
                  {lang({ ko: "Instagram Login token을 발급한 앱 ID입니다.", en: "The app ID that issued the Instagram Login token." })}
                </p>
              </div>
              <div>
                <label className="block text-xs mb-1">
                  <Lang text={{ ko: "Graph endpoint", en: "Graph endpoint" }} />
                </label>
                <Input value={getInstagramGraphBase(source.authMode)} disabled readOnly />
                <p className="text-xxs text-secondary-text mt-1">
                  {lang({ ko: "보안을 위해 서버가 인증 방식별 endpoint를 고정합니다.", en: "The server pins this endpoint for the selected authentication mode." })}
                </p>
              </div>
              {source.lastValidationStatus ? (
                <div className="md:col-span-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-secondary-text">
                  <p>
                    {lang({ ko: "최근 계정 검증", en: "Latest account validation" })}: {source.lastValidationStatus}
                    {source.lastValidatedAt ? ` · ${formatUpdatedAt(source.lastValidatedAt)}` : ""}
                  </p>
                  {source.validatedAccountId || source.validatedUsername ? (
                    <p className="mt-1">
                      {source.validatedUsername || "-"} · {source.validatedAccountId || "-"}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs mb-1">Threads App ID (appId)</label>
                <Input
                  value={source.appId}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={readOnly ? undefined : (e) => setExtra("appId", e.target.value)}
                  placeholder="Threads App ID"
                />
                <p className="text-xxs text-secondary-text mt-1">토큰 발급 출처를 추적하기 위한 메타입니다.</p>
              </div>
              <div>
                <label className="block text-xs mb-1">Graph Base URL (graphBaseUrl)</label>
                <Input
                  value={source.graphBaseUrl}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={readOnly ? undefined : (e) => setExtra("graphBaseUrl", e.target.value)}
                  placeholder="비우면 기본 Threads Graph URL"
                />
                <p className="text-xxs text-secondary-text mt-1">특정 버전 URL을 강제할 때만 입력하세요.</p>
              </div>
            </>
          )}
          <div>
            <label className="block text-xs mb-1">Token issued at</label>
            <Input
              type="datetime-local"
              value={source.tokenIssuedAt}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("tokenIssuedAt", e.target.value)}
            />
            <p className="text-xxs text-secondary-text mt-1">장기 토큰 발급일을 기록합니다.</p>
          </div>
          <div>
            <label className="block text-xs mb-1">Token expires at</label>
            <Input
              type="datetime-local"
              value={source.tokenExpiresAt}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("tokenExpiresAt", e.target.value)}
            />
            <p className="text-xxs text-secondary-text mt-1">만료일 카운트다운과 수집 위험 표시 기준입니다.</p>
          </div>
          <div>
            <label className="block text-xs mb-1">Refresh due at</label>
            <Input
              type="datetime-local"
              value={source.tokenRefreshDueAt}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("tokenRefreshDueAt", e.target.value)}
            />
            <p className="text-xxs text-secondary-text mt-1">권장 갱신 시작일입니다. 보통 만료 15일 전으로 둡니다.</p>
          </div>
          <div>
            <label className="block text-xs mb-1">Last refresh status</label>
            <Input
              value={source.lastRefreshStatus}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("lastRefreshStatus", e.target.value)}
              placeholder="success / failed / manual_required"
            />
            <p className="text-xxs text-secondary-text mt-1">최근 갱신 결과를 운영 메모로 남깁니다.</p>
          </div>
        </div>
      );
    }

    if (provider === "linkedin") {
      const base = (status?.extras || {}) as {
        organizationId?: string;
        authorUrn?: string;
        profileSlug?: string;
        companySlug?: string;
      };
      const source = readOnly
        ? {
            organizationId: base.organizationId ?? "",
            authorUrn: base.authorUrn ?? "",
            profileSlug: base.profileSlug ?? "",
            companySlug: base.companySlug ?? "",
          }
        : {
            organizationId: toSafeString(extras.organizationId),
            authorUrn: pickString(extras.authorUrn),
            profileSlug: pickString(extras.profileSlug),
            companySlug: pickString(extras.companySlug),
          };

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">회사 페이지 조직 ID (organizationId)</label>
            <Input
              value={source.organizationId}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("organizationId", e.target.value)}
              placeholder="예: 123456"
            />
            <p className="text-xxs text-secondary-text mt-1">
              향후 Community Management API로 회사 페이지에 발행할 때 사용할 조직 ID입니다.
            </p>
          </div>
          <div>
            <label className="block text-xs mb-1">작성자 URN (authorUrn)</label>
            <Input
              value={source.authorUrn}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("authorUrn", e.target.value)}
              placeholder="예: urn:li:organization:123456"
            />
            <p className="text-xxs text-secondary-text mt-1">
              회사 페이지 발행 시 보통 urn:li:organization:조직ID 형식으로 사용합니다.
            </p>
          </div>
          <div>
            <label className="block text-xs mb-1">개인 프로필 슬러그 (profileSlug)</label>
            <Input
              value={source.profileSlug}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("profileSlug", e.target.value)}
              placeholder="예: allmyuniverse"
            />
            <p className="text-xxs text-secondary-text mt-1">
              https://www.linkedin.com/in/<strong>슬러그</strong> 형식의 공개 프로필 이동에 사용합니다.
            </p>
          </div>
          <div>
            <label className="block text-xs mb-1">회사 페이지 슬러그 (companySlug)</label>
            <Input
              value={source.companySlug}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("companySlug", e.target.value)}
              placeholder="예: all-my-universe"
            />
            <p className="text-xxs text-secondary-text mt-1">
              https://www.linkedin.com/company/<strong>슬러그</strong> 형식의 공개 회사 페이지 이동에 사용합니다.
            </p>
          </div>
        </div>
      );
    }

    if (provider === "naver_blog") {
      const base = (status?.extras || {}) as { blogId?: string; categoryId?: string };
      const source = readOnly
        ? {
            blogId: base.blogId ?? "",
            categoryId: base.categoryId ?? "",
          }
        : {
            blogId: pickString(extras.blogId),
            categoryId: toSafeString(extras.categoryId),
          };

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">블로그 ID (blogId)</label>
            <Input
              value={source.blogId}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("blogId", e.target.value)}
              placeholder="예: allmyuniverse"
            />
            <p className="text-xxs text-secondary-text mt-1">반자동 발행 대상 블로그를 구분하는 운영 메타입니다.</p>
          </div>
          <div>
            <label className="block text-xs mb-1">카테고리 ID (categoryId)</label>
            <Input
              value={source.categoryId}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("categoryId", e.target.value)}
              placeholder="선택 입력"
            />
            <p className="text-xxs text-secondary-text mt-1">카테고리 고정 발행을 준비할 때만 입력하세요.</p>
          </div>
        </div>
      );
    }

    if (provider === "naver_ads") {
      const base = (status?.extras || {}) as { customerId?: string };
      const source = readOnly ? { customerId: base.customerId ?? "" } : { customerId: toSafeString(extras.customerId) };

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">Customer ID (customerId)</label>
            <Input
              value={source.customerId}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("customerId", e.target.value)}
              placeholder="예: 123456"
            />
            <p className="text-xxs text-secondary-text mt-1">검색광고 광고 계정 Customer ID입니다.</p>
          </div>
        </div>
      );
    }

    if (provider === "google_ads") {
      const base = (status?.extras || {}) as { customerId?: string; loginCustomerId?: string };
      const source = readOnly
        ? {
            customerId: base.customerId ?? "",
            loginCustomerId: base.loginCustomerId ?? "",
          }
        : {
            customerId: toSafeString(extras.customerId),
            loginCustomerId: toSafeString(extras.loginCustomerId),
          };

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">Customer ID (customerId)</label>
            <Input
              value={source.customerId}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("customerId", e.target.value)}
              placeholder="예: 123-456-7890"
            />
            <p className="text-xxs text-secondary-text mt-1">광고 운영 대상 Google Ads 계정 ID입니다.</p>
          </div>
          <div>
            <label className="block text-xs mb-1">Login Customer ID (loginCustomerId)</label>
            <Input
              value={source.loginCustomerId}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("loginCustomerId", e.target.value)}
              placeholder="MCC 사용 시 입력"
            />
            <p className="text-xxs text-secondary-text mt-1">매니저 계정 경유 시 필요한 로그인 고객 ID입니다.</p>
          </div>
        </div>
      );
    }

    if (provider === "google_analytics" || provider === "naver_datalab") {
      const base = (status?.extras || {}) as {
        enabled?: boolean;
        propertyId?: string;
        properties?: unknown[];
      };
      const formatProperties = (value: unknown) => {
        if (typeof value === "string") return value;
        if (Array.isArray(value) && value.length > 0) return JSON.stringify(value, null, 2);
        return "";
      };
      const source = readOnly
        ? {
            enabled: Boolean(base.enabled),
            properties:
              formatProperties(base.properties) ||
              (base.propertyId ? formatProperties([{ role: "default", propertyId: base.propertyId }]) : ""),
          }
        : {
            enabled: Boolean(extras.enabled),
            properties: formatProperties(extras.properties),
          };
      const isGa = provider === "google_analytics";
      const placeholderForGa = [
        `[\n`,
        `\t{ "propertyId": "311756914", "propertyKey": "magazine", "role": "magazine", "label": "allmyuniverse.com" },\n`,
        `\t{ "propertyId": "488820875", "propertyKey": "app", "role": "app", "label": "app.allmyuniverse.com" }\n`,
        `]`,
      ].join("");

      return (
        <div className="space-y-3 rounded-lg border border-border bg-background/70 px-3 py-3">
          <label className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-sm text-primary-text">
            <span>
              <span className="block font-medium text-primary-text">
                {isGa ? "GA4 성과 수집 사용" : "네이버 데이터랩/검색 수집 사용"}
              </span>
              <span className="block text-xxs text-secondary-text">
                {isGa
                  ? "꺼져 있으면 GA4 스냅샷 수집과 성과 조회가 전면 중지됩니다."
                  : "꺼져 있으면 키워드 트렌드 조회, 후보 검증, 순위 추적이 전면 중지됩니다."}
              </span>
            </span>
            <Switch
              checked={source.enabled}
              disabled={readOnly}
              onCheckedChange={readOnly ? undefined : (checked) => setExtra("enabled", checked)}
            />
          </label>

          {isGa ? (
            <div>
              <label className="block text-xs mb-1">GA4 수집 속성 목록 (properties)</label>
              <textarea
                value={source.properties}
                disabled={readOnly}
                readOnly={readOnly}
                onChange={readOnly ? undefined : (e) => setExtra("properties", e.target.value)}
                className="min-h-40 w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-primary-text outline-none focus:border-primary disabled:opacity-60"
                placeholder={placeholderForGa}
              />
              <p className="text-xxs text-secondary-text mt-1">
                여러 GA4 Property를 JSON 배열로 등록합니다. <code>role</code>은 성과 조회의 propertyKey로 사용됩니다.
                브라우저 gtag ID는 간편 연결 화면의 유니버스별 마케팅 설정에서 관리합니다.
              </p>
            </div>
          ) : (
            <p className="text-xxs text-secondary-text">
              기본 앵커 키워드(데이터랩 상대 지수의 기준선)는 Marketing Ops의 <strong>키워드 전략</strong> 탭 &gt; 기본
              앵커 설정에서 관리합니다.
            </p>
          )}
        </div>
      );
    }

    if (provider === "slack") {
      const base = (status?.extras || {}) as { channel?: string };
      const source = readOnly
        ? {
            channel: base.channel ?? "",
          }
        : {
            channel: pickString(extras.channel),
          };

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">Slack 채널 라벨 (channel)</label>
            <Input
              value={source.channel}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("channel", e.target.value)}
              placeholder="예: #marketing-ops"
            />
            <p className="text-xxs text-secondary-text mt-1">
              실제 전송은 webhook URL 기준으로 수행하고, channel 값은 운영 표시용 메타로만 사용됩니다.
            </p>
          </div>
        </div>
      );
    }

    if (provider === "email") {
      const base = (status?.extras || {}) as { fromEmail?: string; replyTo?: string };
      const source = readOnly
        ? {
            fromEmail: base.fromEmail ?? "",
            replyTo: base.replyTo ?? "",
          }
        : {
            fromEmail: pickString(extras.fromEmail),
            replyTo: pickString(extras.replyTo),
          };

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">발신 이메일 (fromEmail)</label>
            <Input
              value={source.fromEmail}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("fromEmail", e.target.value)}
              placeholder="예: ops@example.com"
            />
            <p className="text-xxs text-secondary-text mt-1">후속 email adapter 연결 시 사용할 발신자입니다.</p>
          </div>
          <div>
            <label className="block text-xs mb-1">회신 이메일 (replyTo)</label>
            <Input
              value={source.replyTo}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("replyTo", e.target.value)}
              placeholder="선택 입력"
            />
            <p className="text-xxs text-secondary-text mt-1">운영 회신을 받을 주소가 다를 때만 입력하세요.</p>
          </div>
        </div>
      );
    }

    if (provider === "agent") {
      const base = (status?.extras || {}) as {
        enabled?: boolean;
        allowedRoles?: string[] | string;
        allowIntelligenceRead?: boolean;
        allowIntelligenceWrite?: boolean;
        allowEnqueueContent?: boolean;
        allowPollWorker?: boolean;
        allowChannelAction?: boolean;
        allowStrategyWrite?: boolean;
        allowAdsRead?: boolean;
      };
      const source = readOnly
        ? {
            enabled: Boolean(base.enabled),
            allowedRoles: Array.isArray(base.allowedRoles)
              ? base.allowedRoles.join(",")
              : String(base.allowedRoles || "administrator"),
            allowIntelligenceRead: base.allowIntelligenceRead !== false,
            allowIntelligenceWrite: base.allowIntelligenceWrite === true,
            allowEnqueueContent: base.allowEnqueueContent !== false,
            allowPollWorker: base.allowPollWorker !== false,
            allowChannelAction: base.allowChannelAction !== false,
            allowStrategyWrite: base.allowStrategyWrite !== false,
            allowAdsRead: base.allowAdsRead === true,
          }
        : {
            enabled: Boolean(extras.enabled),
            allowedRoles: Array.isArray(extras.allowedRoles)
              ? extras.allowedRoles.join(",")
              : String(extras.allowedRoles || "administrator"),
            allowIntelligenceRead: extras.allowIntelligenceRead !== false,
            allowIntelligenceWrite: extras.allowIntelligenceWrite === true,
            allowEnqueueContent: extras.allowEnqueueContent !== false,
            allowPollWorker: extras.allowPollWorker !== false,
            allowChannelAction: extras.allowChannelAction !== false,
            allowStrategyWrite: extras.allowStrategyWrite !== false,
            allowAdsRead: extras.allowAdsRead === true,
          };

      return (
        <div className="space-y-3 rounded-lg border border-border bg-background/70 px-3 py-3">
          <label className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-sm text-primary-text">
            <span>
              <span className="block font-medium text-primary-text">에이전트 마케팅 운영 허용</span>
              <span className="block text-xxs text-secondary-text">
                꺼져 있으면 agent key가 유효해도 이 유니버스의 마케팅 API를 사용할 수 없습니다.
              </span>
            </span>
            <Switch
              checked={source.enabled}
              disabled={readOnly}
              onCheckedChange={readOnly ? undefined : (checked) => setExtra("enabled", checked)}
            />
          </label>

          <div>
            <label className="block text-xs mb-1">허용 역할 (allowedRoles)</label>
            <Input
              value={source.allowedRoles}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={readOnly ? undefined : (e) => setExtra("allowedRoles", e.target.value)}
              placeholder="administrator,editor"
            />
            <p className="mt-1 text-xxs text-secondary-text">
              AGENT_UID 사용자의 DB roles 중 하나가 여기에 포함되어야 합니다. 쉼표로 구분합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {[
              ["allowIntelligenceRead", "Pattern·실험 조회"],
              ["allowIntelligenceWrite", "실험 계획·결과 쓰기"],
              ["allowEnqueueContent", "queue 등록"],
              ["allowPollWorker", "worker 수동 실행"],
              ["allowChannelAction", "반자동 채널 처리"],
              ["allowStrategyWrite", "마케팅 전략 수정"],
              ["allowAdsRead", "광고 조회"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-2 text-xs text-primary-text"
              >
                <span>{label}</span>
                <Switch
                  size="xs"
                  checked={Boolean((source as UnknownRecord)[key])}
                  disabled={readOnly}
                  onCheckedChange={readOnly ? undefined : (checked) => setExtra(key, checked)}
                />
              </label>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3 text-primary-text">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-sm">{providerLabel}</h4>
            {!hideStatusBadge &&
              (loadingCredentialStatus ? (
                <span className="inline-flex items-center text-xs text-muted-foreground">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  상태 확인 중...
                </span>
              ) : ready ? (
                <span className="inline-flex items-center text-xs text-primary-text">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  준비됨
                </span>
              ) : (
                <span className="inline-flex items-center text-xs text-secondary-text">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  미설정
                </span>
              ))}
          </div>
          {providerDescription.length > 0 && (
            <ul className="mt-1 text-xxs text-secondary-text space-y-0.5">
              {providerDescription.map((line, idx) => (
                <li key={idx}>• {line}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {/* Secret Provider: 설정 완료 시 편집 버튼 노출 */}
          {isSecretProvider && ready && !isAgentProvider && (
            <div className="mt-1 flex gap-2">
              {editMode ? (
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  편집 취소
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={handleStartEdit}>
                  자격증명 편집
                </Button>
              )}
            </div>
          )}

          {status?.updatedAt && (
            <p className="text-xxs text-muted-foreground">최종 업데이트: {formatUpdatedAt(status.updatedAt)}</p>
          )}
        </div>
      </div>

      {/* ====== 본문 폼 영역 ====== */}

      {showReadonly ? (
        // Secret Provider + 설정 완료 + 보기 모드 → 값 숨김 + extras readonly
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1">{clientIdLabel}</label>
              <Input value="(저장됨 - 값은 보안상 표시되지 않습니다)" disabled readOnly className="text-xs" />
              <p className="text-xxs text-secondary-text mt-1">
                기존 clientId는 서버에만 저장되어 있으며, UI에서는 다시 확인할 수 없습니다.
              </p>
            </div>

            <div>
              <label className="block text-xs mb-1">{clientSecretLabel}</label>
              <Input type="password" value="••••••••••" disabled readOnly className="text-xs" />
              <p className="text-xxs text-secondary-text mt-1">
                Secret 값은 암호화되어 저장되며, 다시 조회할 수 없습니다. 변경 시 새 값을 입력하세요.
              </p>
            </div>
          </div>

          {/* Provider별 extras를 readonly로 표시 */}
          {renderExtrasFields(true)}
        </div>
      ) : (
        // 편집 모드 / 미설정 상태 공통 폼
        <>
          {!isAgentProvider && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* clientId */}
              <div>
                <label className="block text-xs mb-1">{clientIdLabel}</label>
                <Input
                  value={form.clientId}
                  onChange={(e) => setForm((prev) => ({ ...prev, clientId: e.target.value }))}
                  placeholder={
                    Boolean(status?.exists) && !status?.missing?.includes("clientId")
                      ? "●●●●●●●●●●  저장됨 · 변경하려면 새 값 입력"
                      : "필요 시 입력 (기존 값은 보안상 표시되지 않습니다)"
                  }
                />
                {provider === "instagram" ? (
                  <p className="mt-1 text-xxs text-secondary-text">
                    {lang({
                      ko: "Meta 개발자 화면의 계정 숫자가 아니라, Instagram 설정 → 웹사이트 권한 → 앱 및 웹사이트에서 연결된 앱의 사용자 ID를 입력하세요.",
                      en: "Enter the app-linked user ID from Instagram Settings → Website permissions → Apps and websites, not the account number shown in Meta for Developers.",
                    })}
                  </p>
                ) : null}
              </div>

              {provider !== "google_ads" && (
                <div>
                  <label className="block text-xs mb-1">{clientSecretLabel}</label>
                  <Input
                    type="password"
                    value={form.clientSecret}
                    onChange={(e) => setForm((prev) => ({ ...prev, clientSecret: e.target.value }))}
                    placeholder={
                      Boolean(status?.exists) && !status?.missing?.includes("clientSecret")
                        ? "●●●●●●●●●●  저장됨 · 변경하려면 새 값 입력"
                        : "기존 값은 보안상 표시되지 않습니다"
                    }
                  />
                </div>
              )}
            </div>
          )}

          {provider === "google_ads" && !isAgentProvider && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {([
                ["clientSecret", "OAuth Client Secret"],
                ["refreshToken", "OAuth Refresh Token"],
                ["developerToken", "Google Ads Developer Token"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs mb-1">{label}</label>
                  <Input
                    type="password"
                    value={googleAdsSecrets[key]}
                    onChange={(e) => setGoogleAdsSecrets((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={status?.exists ? "저장됨 · 변경 시 3개 모두 입력" : "필수 입력"}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Provider별 extras (편집 모드) */}
          {renderExtrasFields(false)}
        </>
      )}

      {/* 하단 버튼 */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={loadStatus} disabled={loadingCredentialStatus || saving}>
          상태 다시 확인
        </Button>
        {/* Secret Provider + 설정완료 + 보기 모드일 때는 저장 버튼 숨김 */}
        {!showReadonly && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "자격증명 저장"}
          </Button>
        )}
      </div>

      {supportsPreferredBasePath && (
        <div className="rounded-default border border-border bg-background/70 px-3 py-3 space-y-2">
          <div>
            <p className="text-xs font-medium text-primary-text">기본 공개 경로</p>
            <p className="text-xxs text-secondary-text mt-1">
              현재 기본값은 <strong>/store</strong> 입니다. 필요하면 아래에서 직접 변경할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["store", "play"] as UniverseBasePath[]).map((basePath) => {
              const active = preferredBasePath === basePath;
              return (
                <Button
                  key={basePath}
                  size="sm"
                  variant={active ? "primary" : "outline"}
                  onClick={() => setPreferredBasePath(basePath)}
                  disabled={savingBasePath}
                >
                  기본 경로를 {basePath}로 설정
                </Button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSavePreferredBasePath} disabled={savingBasePath}>
              {savingBasePath ? "경로 저장 중..." : "기본 경로 저장"}
            </Button>
          </div>
        </div>
      )}

      {status?.missing && status.missing.length > 0 && (
        <div className="mt-2 rounded-default bg-muted/30 border border-border-hover/60 px-3 py-2">
          <p className="text-xxs text-secondary-text mb-1">다음 필드가 아직 설정되지 않았습니다:</p>
          <ul className="text-xxs text-secondary-text list-disc pl-4">
            {status.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CredentialPanel;
