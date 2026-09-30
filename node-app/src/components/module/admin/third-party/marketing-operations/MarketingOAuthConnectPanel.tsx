"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Preloader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toUnknownRecord } from "utils/common/typeUtils";
import { toSafeString } from "src/utils/common";
import { toast } from "sonner";
import { OAuthPermissionGuide } from "./OAuthPermissionGuide";

/**
 * @docHint
 * @purpose 사용자 OAuth 간편 연결 패널(연결 상태 조회 + 계정 연결/해제)
 * @process status 조회 → 연결 목록 표시 → start(top-level 이동)/disconnect(fetch) 트리거
 * @domain marketing
 * @scope admin-ui
 */

export const OAUTH_CONNECT_PROVIDERS = ["instagram", "threads", "google_analytics", "google_ads"] as const;
export type OAuthConnectProvider = (typeof OAUTH_CONNECT_PROVIDERS)[number];

export function isOAuthConnectProvider(value: string): value is OAuthConnectProvider {
  return (OAUTH_CONNECT_PROVIDERS as readonly string[]).includes(value);
}

const PROVIDER_CONNECT_LABEL: Record<OAuthConnectProvider, { ko: string; en: string }> = {
  instagram: { ko: "Instagram 계정 연결", en: "Connect Instagram" },
  threads: { ko: "Threads 계정 연결", en: "Connect Threads" },
  google_analytics: { ko: "Google로 연결", en: "Connect with Google" },
  google_ads: { ko: "Google로 연결", en: "Connect with Google" },
};

type OAuthConnectionRow = {
  provider: string;
  providerAccountId: string;
  displayName: string;
  scope: string[];
  connectionStatus: string;
  expiresAt: string | null;
  updatedAt: string | null;
  expired: boolean;
  accessTokenExpired: boolean;
  canRefresh: boolean;
  tokenHealth: string;
  lastValidationErrorCode: string;
  isActive: boolean;
  selectedResourceId: string;
  selectedResourceName: string;
  scopeAssessment: {
    missingScopes: string[];
    optionalMissingScopes: string[];
    requirements: Array<{
      scope: string;
      required: boolean;
      label: { ko: string; en: string };
      purpose: { ko: string; en: string };
    }>;
  };
};

type OAuthResource = { id: string; name: string; type: string };

function parseConnectionRows(raw: unknown): OAuthConnectionRow[] {
  const payload = toUnknownRecord(raw);
  const list = Array.isArray(payload.connections) ? payload.connections : [];
  return list.map((entry) => {
    const row = toUnknownRecord(entry);
    const scopeAssessment = toUnknownRecord(row.scopeAssessment);
    return {
      provider: toSafeString(row.provider),
      providerAccountId: toSafeString(row.providerAccountId),
      displayName: toSafeString(row.displayName),
      scope: Array.isArray(row.scope) ? row.scope.map(toSafeString).filter(Boolean) : [],
      connectionStatus: toSafeString(row.connectionStatus) || "connected",
      expiresAt: row.expiresAt ? toSafeString(row.expiresAt) : null,
      updatedAt: row.updatedAt ? toSafeString(row.updatedAt) : null,
      expired: Boolean(row.expired),
      accessTokenExpired: Boolean(row.accessTokenExpired ?? row.expired),
      canRefresh: row.canRefresh === true,
      tokenHealth: toSafeString(row.tokenHealth) || (row.expired ? "reauth_required" : "valid"),
      lastValidationErrorCode: toSafeString(row.lastValidationErrorCode),
      isActive: row.isActive === true,
      selectedResourceId: toSafeString(row.selectedResourceId),
      selectedResourceName: toSafeString(row.selectedResourceName),
      scopeAssessment: {
        missingScopes: Array.isArray(scopeAssessment.missingScopes)
          ? scopeAssessment.missingScopes.map(toSafeString).filter(Boolean)
          : [],
        optionalMissingScopes: Array.isArray(scopeAssessment.optionalMissingScopes)
          ? scopeAssessment.optionalMissingScopes.map(toSafeString).filter(Boolean)
          : [],
        requirements: Array.isArray(scopeAssessment.requirements)
          ? scopeAssessment.requirements.map((item) => {
              const requirement = toUnknownRecord(item);
              const label = toUnknownRecord(requirement.label);
              const purpose = toUnknownRecord(requirement.purpose);
              return {
                scope: toSafeString(requirement.scope),
                required: requirement.required === true,
                label: { ko: toSafeString(label.ko), en: toSafeString(label.en) },
                purpose: { ko: toSafeString(purpose.ko), en: toSafeString(purpose.en) },
              };
            }).filter((requirement) => requirement.scope)
          : [],
      },
    };
  });
}

export function MarketingOAuthConnectPanel({
  universeId,
  provider,
  onConnectionChange,
}: {
  universeId: string;
  provider: OAuthConnectProvider;
  onConnectionChange?: (connected: boolean) => void;
}) {
  const [connections, setConnections] = useState<OAuthConnectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [appReady, setAppReady] = useState(true);
  const [resources, setResources] = useState<OAuthResource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState("");

  const loadStatus = useCallback(async () => {
    if (!universeId) {
      setConnections([]);
      return;
    }
    try {
      setLoading(true);
      const response = await fetchClient.get(
        `/marketing/oauth/${provider}/status?universeId=${encodeURIComponent(universeId)}`,
      );
      const rows = parseConnectionRows(response.data?.data);
      setAppReady(response.data?.data?.appReady !== false);
      setConnections(rows);
      onConnectionChange?.(
        rows.some(
          (row) =>
            row.connectionStatus === "connected" &&
            row.tokenHealth !== "reauth_required" &&
            row.tokenHealth !== "refresh_failed",
        ),
      );
      if (
        rows.some(
          (row) => row.connectionStatus === "selection_required" && row.tokenHealth !== "refresh_failed",
        )
      ) {
        try {
          const resourceResponse = await fetchClient.get(
            `/marketing/oauth/${provider}/resources?universeId=${encodeURIComponent(universeId)}`,
          );
          const rawResources = Array.isArray(resourceResponse.data?.data?.resources)
            ? resourceResponse.data.data.resources
            : [];
          setResources(
            rawResources
              .map((entry: unknown) => {
                const resource = toUnknownRecord(entry);
                return { id: toSafeString(resource.id), name: toSafeString(resource.name), type: toSafeString(resource.type) };
              })
              .filter((resource: OAuthResource) => resource.id),
          );
        } catch {
          setResources([]);
          toast.error(lang({ ko: "선택 가능한 운영 대상을 불러오지 못했습니다.", en: "Could not load available resources." }));
        }
      } else {
        setResources([]);
      }
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, [onConnectionChange, provider, universeId]);

  useEffect(
    function fetchStatusOnMount() {
      // 외부 API에서 연결 상태 fetch — 내부 state 동기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadStatus();
    },
    [loadStatus],
  );

  const startConnect = () => {
    if (!universeId) return;
    // OAuth는 top-level 네비게이션이 필요 (콜백이 /admin으로 다시 리다이렉트)
    window.location.href = `/api/marketing/oauth/${provider}/start?universeId=${encodeURIComponent(universeId)}`;
  };

  const disconnect = async (providerAccountId?: string) => {
    if (!universeId) return;
    const key = providerAccountId || "__all__";
    try {
      setBusyKey(key);
      await fetchClient.post(`/marketing/oauth/${provider}/disconnect`, {
        universeId,
        ...(providerAccountId ? { providerAccountId } : {}),
      });
      toast.success(lang({ ko: "연결을 해제했습니다.", en: "Disconnected." }));
      await loadStatus();
    } catch {
      toast.error(lang({ ko: "연결 해제에 실패했습니다.", en: "Failed to disconnect." }));
    } finally {
      setBusyKey("");
    }
  };

  const selectResource = async () => {
    if (!universeId || !selectedResourceId) return;
    try {
      setBusyKey("__select__");
      await fetchClient.post(`/marketing/oauth/${provider}/select`, { universeId, resourceId: selectedResourceId });
      toast.success(lang({ ko: "운영 대상을 선택했습니다.", en: "Resource selected." }));
      setSelectedResourceId("");
      await loadStatus();
    } catch {
      toast.error(lang({ ko: "운영 대상 선택에 실패했습니다.", en: "Failed to select resource." }));
    } finally {
      setBusyKey("");
    }
  };

  const activeConnections = connections.filter((row) => row.isActive && row.connectionStatus !== "disconnected");
  const hasConnection = activeConnections.length > 0;

  return (
    <section className="rounded-lg border border-border bg-background/60 p-4 text-primary-text">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            <Lang text={{ ko: "간편 연결 (권장)", en: "Quick connect (recommended)" }} />
          </p>
          <p className="mt-0.5 text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "계정으로 로그인하면 서비스가 필요한 권한과 토큰 갱신을 안전하게 관리합니다.",
                en: "Sign in and the service securely manages permissions and token renewal.",
              }}
            />
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Preloader variant="spin" size="sm" />}
          <Button size="sm" onClick={startConnect} disabled={!universeId || !appReady}>
            <Lang text={hasConnection ? { ko: "다른 계정 연결", en: "Connect another" } : PROVIDER_CONNECT_LABEL[provider]} />
          </Button>
        </div>
      </div>

      {!appReady && (
        <p className="mb-3 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Lang
            text={{
              ko: "서비스 OAuth 앱 설정이 아직 준비되지 않았습니다. 운영자에게 문의해 주세요.",
              en: "The service OAuth app is not configured yet. Contact an administrator.",
            }}
          />
        </p>
      )}

      {hasConnection ? (
        <ul className="flex flex-col gap-2">
          {activeConnections.map((row) => (
            <li
              key={row.providerAccountId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {row.displayName || row.providerAccountId}
                  </span>
                  {row.connectionStatus === "connected" && row.tokenHealth === "valid" && (
                    <Badge variant="outline" className="border-accent/30 bg-accent/15 text-primary-text">
                      <Lang text={{ ko: "연결됨", en: "Connected" }} />
                    </Badge>
                  )}
                  {row.connectionStatus === "connected" && row.tokenHealth === "refreshable" && (
                    <Badge variant="outline" className="border-accent/30 bg-accent/15 text-primary-text">
                      <Lang text={{ ko: "자동 갱신 가능", en: "Auto-renewal available" }} />
                    </Badge>
                  )}
                  {row.tokenHealth === "refresh_failed" && (
                    <Badge variant="outline" className="border-amber-400/40 text-amber-600">
                      <Lang text={{ ko: "토큰 갱신 확인 필요", en: "Token refresh needs attention" }} />
                    </Badge>
                  )}
                  {row.connectionStatus === "reauth_required" && (
                    <Badge variant="outline" className="border-amber-400/40 text-amber-600">
                      <Lang text={{ ko: "재연결 필요", en: "Reauth required" }} />
                    </Badge>
                  )}
                  {row.connectionStatus === "permission_missing" && (
                    <Badge variant="outline" className="border-red-400/40 text-red-500">
                      <Lang text={{ ko: "권한 부족", en: "Permission missing" }} />
                    </Badge>
                  )}
                  {row.connectionStatus === "selection_required" && (
                    <Badge variant="outline" className="border-blue-400/40 text-blue-600">
                      <Lang text={{ ko: "운영 대상 선택 필요", en: "Select a resource" }} />
                    </Badge>
                  )}
                </div>
                {row.displayName && (
                  <p className="mt-0.5 truncate text-xxs text-secondary-text">{row.providerAccountId}</p>
                )}
                {row.selectedResourceId && (
                  <p className="mt-0.5 truncate text-xxs text-secondary-text">
                    {row.selectedResourceName || row.selectedResourceId}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {row.tokenHealth === "refresh_failed" && (
                  <Button size="sm" variant="outline" onClick={() => void loadStatus()} disabled={loading}>
                    <Lang text={{ ko: "상태 다시 확인", en: "Check again" }} />
                  </Button>
                )}
                {(row.connectionStatus === "reauth_required" || row.connectionStatus === "permission_missing") && (
                  <Button size="sm" variant="outline" onClick={startConnect}>
                    <Lang text={{ ko: "권한 다시 연결", en: "Reconnect" }} />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => disconnect(row.providerAccountId)}
                  disabled={busyKey === row.providerAccountId}
                >
                  <Lang text={{ ko: "연결 해제", en: "Disconnect" }} />
                </Button>
              </div>
              {row.connectionStatus === "permission_missing" ? (
                <OAuthPermissionGuide
                  provider={provider}
                  missingScopes={row.scopeAssessment.missingScopes}
                  requirements={row.scopeAssessment.requirements}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-surface/60 px-3 py-3 text-xs text-secondary-text">
          <Lang
            text={{
              ko: "아직 연결된 계정이 없습니다. 계정을 연결하면 사용자가 직접 시크릿 키를 입력하지 않아도 됩니다.",
              en: "No account connected yet. Connecting lets users skip manual secret entry.",
            }}
          />
        </p>
      )}

      {activeConnections.some((row) => row.connectionStatus === "selection_required") && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-blue-300/50 bg-blue-50/60 p-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-medium text-slate-800">
              <Lang text={{ ko: "사용할 운영 대상", en: "Resource to use" }} />
            </p>
            <Select
              size="sm"
              value={selectedResourceId}
              onValueChange={(value) => setSelectedResourceId(Array.isArray(value) ? value[0] || "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={lang({ ko: "속성 또는 고객 ID 선택", en: "Select a property or customer" })} />
              </SelectTrigger>
              <SelectContent>
                {resources.map((resource) => (
                  <SelectItem key={resource.id} value={resource.id}>
                    {resource.name} ({resource.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={selectResource} disabled={!selectedResourceId || busyKey === "__select__"}>
            <Lang text={{ ko: "선택 완료", en: "Confirm" }} />
          </Button>
        </div>
      )}
    </section>
  );
}

export default MarketingOAuthConnectPanel;
