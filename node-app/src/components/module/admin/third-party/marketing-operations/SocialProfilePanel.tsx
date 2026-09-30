"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Badge, Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toast } from "sonner";
import { toSafeString } from "utils/common/typeUtils";

type SocialProfile = {
  channel: "threads" | "instagram" | "linkedin" | "naver_blog";
  status: "fetched" | "partial" | "manual" | "not_connected" | "unsupported" | "failed";
  capability: "full_profile" | "identity_profile" | "manual_profile" | "not_available";
  permissions?: {
    canPublish: boolean;
    canCollectPostAnalytics: boolean;
    canCollectProfileAnalytics: boolean;
  };
  profile?: {
    username?: string;
    displayName?: string;
    biography?: string;
    website?: string;
    profileUrl?: string;
    followers?: number;
    mediaCount?: number;
  };
  reason?: string;
};

const CHANNEL_LABEL: Record<SocialProfile["channel"], string> = {
  threads: "Threads",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  naver_blog: "Naver Blog",
};

function statusText(item: SocialProfile) {
  if (item.status === "fetched") return lang({ ko: "API 조회 완료", en: "Fetched" });
  if (item.channel === "linkedin" && item.status === "partial") {
    return lang({ ko: "식별 프로필 정상", en: "Identity profile ready" });
  }
  if (item.channel === "naver_blog" && item.status === "manual") {
    return lang({ ko: "수동 운영", en: "Manual operation" });
  }
  if (item.status === "not_connected") return lang({ ko: "연결 필요", en: "Not connected" });
  if (item.status === "unsupported") return lang({ ko: "API 미지원", en: "API unavailable" });
  return lang({ ko: "조회 실패", en: "Failed" });
}

function reasonText(item: SocialProfile) {
  if (item.reason === "linkedin_openid_profile_does_not_include_about_or_experience") {
    return lang({
      ko: "LinkedIn OIDC는 이름·사진 중심의 식별 정보만 제공합니다. 소개·전체 경력은 현재 API 수집 대상이 아닙니다.",
      en: "LinkedIn OIDC provides identity fields such as name and photo; about and full experience are not available here.",
    });
  }
  if (item.reason === "naver_blog_official_profile_and_analytics_api_unavailable") {
    return lang({
      ko: "공식 블로그 프로필·내부 성과 API가 없어 저장된 blogId로 공개 블로그 링크만 제공합니다.",
      en: "No official profile or internal analytics API is available; this card uses the saved blogId for the public link.",
    });
  }
  if (item.reason === "naver_blog_id_missing") {
    return lang({ ko: "Naver Blog 자격증명에 blogId를 저장하세요.", en: "Save blogId in the Naver Blog credential." });
  }
  return toSafeString(item.reason);
}

export function SocialProfilePanel({ universeId }: { universeId: string }) {
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!universeId) return;
    setLoading(true);
    try {
      const response = await fetchClient.get<{ data?: { fetchedAt?: string; profiles?: SocialProfile[] } }>(
        "/marketing/social-profiles",
        { params: { universeId } },
      );
      setProfiles(response.data?.data?.profiles || []);
      setFetchedAt(toSafeString(response.data?.data?.fetchedAt));
    } catch {
      toast.error(lang({ ko: "소셜 프로필을 조회하지 못했습니다.", en: "Failed to fetch social profiles." }));
    } finally {
      setLoading(false);
    }
  }, [universeId]);

  useEffect(() => {
    // 저장된 provider 연결 상태를 화면 진입 시 한 번 조회한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-primary-text"><Lang text={{ ko: "운영 프로필 점검", en: "Live profile check" }} /></h2>
          <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "저장된 자격증명으로 각 채널 API를 직접 조회합니다. 토큰과 이메일은 반환하지 않습니다.", en: "Fetch profiles directly with stored credentials. Tokens and email addresses are never returned." }} /></p>
        </div>
        <Button variant="outline" size="xs" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "icon-xxs animate-spin" : "icon-xxs"} />
          <Lang text={{ ko: "프로필 새로고침", en: "Refresh profiles" }} />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {profiles.map((item) => (
          <article key={item.channel} className="rounded-lg border border-border/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">{CHANNEL_LABEL[item.channel]}</strong>
              <Badge variant={item.status === "fetched" || item.status === "partial" ? "outlinePrimary" : "outline"} size="xs">
                {statusText(item)}
              </Badge>
            </div>
            {item.profile ? (
              <div className="mt-2 space-y-1 text-xs text-secondary-text">
                <p>{item.profile.displayName || item.profile.username || "-"}{item.profile.username ? ` · @${item.profile.username}` : ""}</p>
                {item.profile.biography ? <p className="whitespace-pre-wrap">{item.profile.biography}</p> : null}
                {typeof item.profile.followers === "number" ? <p>{item.profile.followers.toLocaleString()} followers · {(item.profile.mediaCount || 0).toLocaleString()} media</p> : null}
                {item.profile.profileUrl ? <a className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" href={item.profile.profileUrl} target="_blank" rel="noopener noreferrer"><Lang text={{ ko: "프로필 열기", en: "Open profile" }} /><ExternalLink className="icon-xxs" /></a> : null}
              </div>
            ) : null}
            {item.channel === "linkedin" && item.permissions ? (
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge size="xs" variant={item.permissions.canPublish ? "outlinePrimary" : "outline"}>
                  {lang({ ko: `게시 ${item.permissions.canPublish ? "가능" : "권한 없음"}`, en: `Publish ${item.permissions.canPublish ? "ready" : "missing"}` })}
                </Badge>
                <Badge size="xs" variant={item.permissions.canCollectPostAnalytics ? "outlinePrimary" : "outline"}>
                  {lang({ ko: `게시물 분석 ${item.permissions.canCollectPostAnalytics ? "가능" : "승인 필요"}`, en: `Post analytics ${item.permissions.canCollectPostAnalytics ? "ready" : "approval needed"}` })}
                </Badge>
                <Badge size="xs" variant={item.permissions.canCollectProfileAnalytics ? "outlinePrimary" : "outline"}>
                  {lang({ ko: `프로필 분석 ${item.permissions.canCollectProfileAnalytics ? "가능" : "승인 필요"}`, en: `Profile analytics ${item.permissions.canCollectProfileAnalytics ? "ready" : "approval needed"}` })}
                </Badge>
              </div>
            ) : null}
            {item.reason ? <p className="mt-2 text-[11px] leading-5 text-muted-text">{reasonText(item)}</p> : null}
          </article>
        ))}
      </div>
      {fetchedAt ? <p className="mt-3 text-[10px] text-muted-text">{new Date(fetchedAt).toLocaleString()}</p> : null}
    </section>
  );
}
