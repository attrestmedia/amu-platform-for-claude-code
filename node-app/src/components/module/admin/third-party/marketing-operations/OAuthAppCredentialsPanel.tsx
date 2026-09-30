"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Preloader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toUnknownRecord } from "utils/common/typeUtils";
import { toast } from "sonner";

/**
 * @docHint
 * @purpose 통합 관리자용 글로벌 OAuth App ID/Secret 관리 UI
 * @process 비밀값 제외 상태 조회 → provider 선택 → 새 값만 입력 → 관리자 API 암호화 저장 → readiness 재조회
 * @domain marketing-auth
 * @scope admin-ui
 */

const PROVIDERS = ["threads", "instagram", "google"] as const;
type OAuthAppProvider = (typeof PROVIDERS)[number];

type CredentialStatus = {
  provider: OAuthAppProvider;
  exists: boolean;
  ready: boolean;
  missing: string[];
  configured: {
    clientId: boolean;
    clientSecret: boolean;
    developerToken: boolean;
  };
  source: "database" | "environment" | "missing";
  updatedAt: string | null;
};

const PROVIDER_LABEL: Record<OAuthAppProvider, string> = {
  threads: "Threads",
  instagram: "Instagram",
  google: "Google Analytics / Ads",
};

const STORED_CREDENTIAL_MASK = "●●●●●●●●●●●●";

function parseStatuses(raw: unknown): CredentialStatus[] {
  const data = toUnknownRecord(raw);
  const list = Array.isArray(data.credentials) ? data.credentials : [];
  return list.flatMap((entry) => {
    const row = toUnknownRecord(entry);
    const provider = String(row.provider || "") as OAuthAppProvider;
    if (!PROVIDERS.includes(provider)) return [];
    const source = ["database", "environment", "missing"].includes(String(row.source))
      ? (String(row.source) as CredentialStatus["source"])
      : "missing";
    return [{
      provider,
      exists: row.exists === true,
      ready: row.ready === true,
      missing: Array.isArray(row.missing) ? row.missing.map(String).filter(Boolean) : [],
      configured: {
        clientId: toUnknownRecord(row.configured).clientId === true,
        clientSecret: toUnknownRecord(row.configured).clientSecret === true,
        developerToken: toUnknownRecord(row.configured).developerToken === true,
      },
      source,
      updatedAt: row.updatedAt ? String(row.updatedAt) : null,
    }];
  });
}

export function OAuthAppCredentialsPanel() {
  const [provider, setProvider] = useState<OAuthAppProvider>("threads");
  const [statuses, setStatuses] = useState<CredentialStatus[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [developerToken, setDeveloperToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetchClient.get("/marketing/oauth-app-credentials");
      setStatuses(parseStatuses(response.data?.data));
    } catch {
      toast.error(lang({ ko: "OAuth 앱 자격증명 상태를 불러오지 못했습니다.", en: "Could not load OAuth app credential status." }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 외부 credential API 상태를 최초 마운트에서 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
  }, [loadStatus]);

  const status = useMemo(() => statuses.find((item) => item.provider === provider), [provider, statuses]);

  const handleProviderChange = (value: string | string[]) => {
    const next = (Array.isArray(value) ? value[0] : value) as OAuthAppProvider;
    if (!PROVIDERS.includes(next)) return;
    setProvider(next);
    setClientId("");
    setClientSecret("");
    setDeveloperToken("");
  };

  const handleSave = async () => {
    const firstDatabaseSave = !status?.exists;
    if (firstDatabaseSave && (!clientId.trim() || !clientSecret.trim())) {
      toast.error(lang({ ko: "최초 저장에는 App ID와 App Secret이 모두 필요합니다.", en: "App ID and App Secret are required for the first save." }));
      return;
    }
    if (!clientId.trim() && !clientSecret.trim() && !developerToken.trim()) {
      toast.error(lang({ ko: "변경할 값을 입력해 주세요.", en: "Enter at least one value to update." }));
      return;
    }

    try {
      setSaving(true);
      const response = await fetchClient.post("/marketing/oauth-app-credentials", {
        provider,
        ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        ...(developerToken.trim() ? { developerToken: developerToken.trim() } : {}),
      });
      setStatuses(parseStatuses(response.data?.data));
      setClientId("");
      setClientSecret("");
      setDeveloperToken("");
      toast.success(lang({ ko: "OAuth 앱 자격증명을 암호화 저장했습니다.", en: "OAuth app credentials were encrypted and saved." }));
    } catch {
      toast.error(lang({ ko: "OAuth 앱 자격증명을 저장하지 못했습니다.", en: "Could not save OAuth app credentials." }));
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel = status?.source === "database"
    ? lang({ ko: "글로벌 DB", en: "Global database" })
    : status?.source === "environment"
      ? lang({ ko: "환경 변수 fallback", en: "Environment fallback" })
      : lang({ ko: "미설정", en: "Not configured" });

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-primary-text">
            <Lang text={{ ko: "플랫폼 OAuth 앱 자격증명", en: "Platform OAuth app credentials" }} />
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-secondary-text">
            <Lang text={{
              ko: "모든 유니버스가 공유하는 App ID와 App Secret입니다. 사용자 ID·Access Token 자격증명과 분리되며 통합 관리자만 변경할 수 있습니다.",
              en: "App IDs and App Secrets shared by every universe. They are separate from user IDs and access tokens and can only be changed by administrators.",
            }} />
          </p>
        </div>
        {loading ? <Preloader variant="spin" size="sm" /> : (
          <span className={`text-xs font-medium ${status?.ready ? "text-emerald-600" : "text-amber-600"}`}>
            {status?.ready ? lang({ ko: "준비됨", en: "Ready" }) : lang({ ko: "설정 필요", en: "Needs configuration" })}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-secondary-text">
            <Lang text={{ ko: "공급자", en: "Provider" }} />
          </label>
          <Select size="sm" value={provider} onValueChange={handleProviderChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((item) => <SelectItem key={item} value={item}>{PROVIDER_LABEL[item]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-secondary-text">App ID / OAuth Client ID</label>
          <Input
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            autoComplete="off"
            placeholder={status?.configured.clientId ? STORED_CREDENTIAL_MASK : "App ID"}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-secondary-text">App Secret / OAuth Client Secret</label>
          <Input
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            autoComplete="new-password"
            placeholder={status?.configured.clientSecret ? STORED_CREDENTIAL_MASK : "App Secret"}
          />
        </div>
        {provider === "google" ? (
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-secondary-text">Google Ads Developer Token</label>
            <Input
              type="password"
              value={developerToken}
              onChange={(event) => setDeveloperToken(event.target.value)}
              autoComplete="new-password"
              placeholder={status?.configured.developerToken ? STORED_CREDENTIAL_MASK : "Developer Token"}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-secondary-text">
        <p>
          <Lang text={{ ko: "현재 소스", en: "Current source" }} />: {sourceLabel}
          {status?.updatedAt ? ` · ${new Date(status.updatedAt).toLocaleString()}` : ""}
          {status?.missing.length ? ` · missing: ${status.missing.join(", ")}` : ""}
        </p>
        <Button size="sm" onClick={handleSave} disabled={saving || loading}>
          {saving ? <Preloader variant="spin" size="sm" /> : <Lang text={{ ko: "암호화 저장", en: "Save encrypted" }} />}
        </Button>
      </div>
    </section>
  );
}

export default OAuthAppCredentialsPanel;
