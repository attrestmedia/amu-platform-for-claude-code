"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { toast } from "sonner";

type LinkedInStatus = {
  exists: boolean;
  appReady: boolean;
  memberId: string;
  displayName: string;
  expired: boolean;
  expiresAt: string;
  updatedAt: string;
  appUpdatedAt: string;
  appCredentialChangedAfterToken: boolean;
  scopes: string[];
  postAnalytics: boolean;
  profileAnalytics: boolean;
};

function parseStatus(raw: unknown): LinkedInStatus {
  const status = toUnknownRecord(raw);
  const capabilities = toUnknownRecord(status.capabilities);
  return {
    exists: status.exists === true,
    appReady: status.appReady === true,
    memberId: toSafeString(status.memberId),
    displayName: toSafeString(status.displayName),
    expired: status.expired === true,
    expiresAt: toSafeString(status.expiresAt),
    updatedAt: toSafeString(status.updatedAt),
    appUpdatedAt: toSafeString(status.appUpdatedAt),
    appCredentialChangedAfterToken: status.appCredentialChangedAfterToken === true,
    scopes: Array.isArray(status.scope) ? status.scope.map(toSafeString).filter(Boolean) : [],
    postAnalytics: capabilities.postAnalytics === true,
    profileAnalytics: capabilities.profileAnalytics === true,
  };
}

function formatStatusDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function LinkedInConnectPanel({ universeId }: { universeId: string }) {
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!universeId) return;
    try {
      setLoading(true);
      const response = await fetchClient.get(
        `/marketing/linkedin/member-auth/status?universeId=${encodeURIComponent(universeId)}`,
      );
      setStatus(parseStatus(response.data?.data));
    } finally {
      setLoading(false);
    }
  }, [universeId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const connect = () => {
    window.location.href = `/api/marketing/linkedin/member-auth/start?universeId=${encodeURIComponent(universeId)}`;
  };

  const disconnect = async () => {
    try {
      setBusy(true);
      await fetchClient.post("/marketing/linkedin/member-auth/disconnect", { universeId });
      toast.success(lang({ ko: "LinkedIn 연결을 해제했습니다.", en: "LinkedIn disconnected." }));
      await loadStatus();
    } catch {
      toast.error(lang({ ko: "LinkedIn 연결 해제에 실패했습니다.", en: "Failed to disconnect LinkedIn." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-background/60 p-4 text-primary-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold"><Lang text={{ ko: "간편 연결", en: "Quick connect" }} /></p>
            {status?.exists && !status.expired && <Badge variant="outline"><Lang text={{ ko: "연결됨", en: "Connected" }} /></Badge>}
            {status?.expired && <Badge variant="outline" className="border-amber-400/40 text-amber-600"><Lang text={{ ko: "재연결 필요", en: "Reauth required" }} /></Badge>}
          </div>
          <p className="mt-1 text-xs text-secondary-text">
            {status?.displayName || status?.memberId || lang({ ko: "LinkedIn 회원 계정으로 연결합니다.", en: "Connect with a LinkedIn member account." })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Preloader variant="spin" size="sm" />}
          <Button size="sm" onClick={connect} disabled={!status?.appReady || busy}>
            <Lang text={status?.exists ? { ko: "다시 연결", en: "Reconnect" } : { ko: "LinkedIn 연결", en: "Connect LinkedIn" }} />
          </Button>
          {status?.exists && <Button size="sm" variant="outline" onClick={disconnect} disabled={busy}><Lang text={{ ko: "연결 해제", en: "Disconnect" }} /></Button>}
        </div>
      </div>
      {status && !status.appReady && (
        <p className="mt-3 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Lang text={{ ko: "LinkedIn 앱 설정이 준비되지 않았습니다. 운영자에게 문의해 주세요.", en: "The LinkedIn app is not configured. Contact an administrator." }} />
        </p>
      )}
      {status?.exists && (
        <div className="mt-3 grid gap-2 rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-secondary-text md:grid-cols-2">
          <p><Lang text={{ ko: "앱 자격증명 업데이트", en: "App credential updated" }} />: {formatStatusDate(status.appUpdatedAt)}</p>
          <p><Lang text={{ ko: "회원 토큰 업데이트", en: "Member token updated" }} />: {formatStatusDate(status.updatedAt)}</p>
          <p><Lang text={{ ko: "회원 토큰 만료", en: "Member token expires" }} />: {formatStatusDate(status.expiresAt)}</p>
          <p><Lang text={{ ko: "분석 권한", en: "Analytics permissions" }} />: {status.postAnalytics && status.profileAnalytics ? "ready" : "not approved"}</p>
          <p className="md:col-span-2"><Lang text={{ ko: "승인 범위", en: "Granted scopes" }} />: {status.scopes.join(", ") || "-"}</p>
        </div>
      )}
      {status?.appCredentialChangedAfterToken && (
        <p className="mt-3 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Lang
            text={{
              ko: "OAuth Client Secret은 회원 access token보다 최근에 변경됐습니다. Client Secret 저장만으로 회원 토큰의 만료일과 권한은 갱신되지 않으므로 ‘다시 연결’을 완료해 주세요.",
              en: "The OAuth Client Secret changed after the member access token. Saving the client secret does not renew the member token or its scopes; complete Reconnect.",
            }}
          />
        </p>
      )}
    </section>
  );
}
