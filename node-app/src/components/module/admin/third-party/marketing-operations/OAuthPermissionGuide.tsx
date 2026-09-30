import { ExternalLink } from "lucide-react";
import { Lang } from "components/module/i18n";

type ScopeRequirement = {
  scope: string;
  required: boolean;
  label: { ko: string; en: string };
  purpose: { ko: string; en: string };
};

const GOOGLE_GUIDE = {
  google_analytics: {
    resourceStep: {
      ko: "연결한 Google 계정을 GA4 관리 → 속성 액세스 관리에 추가하고 최소 뷰어 역할을 부여하세요.",
      en: "Add the connected Google account in GA4 Admin → Property access management with at least Viewer role.",
    },
    finalStep: {
      ko: "재연결 후 운영 대상에서 조회할 GA4 속성을 선택하세요.",
      en: "After reconnecting, select the GA4 property to query.",
    },
    docsUrl: "https://support.google.com/analytics/answer/9305788",
  },
  google_ads: {
    resourceStep: {
      ko: "연결한 Google 계정을 대상 Google Ads 고객 또는 상위 관리자 계정(MCC)의 사용자로 추가하세요.",
      en: "Add the connected Google account as a user of the target Google Ads customer or parent manager account.",
    },
    finalStep: {
      ko: "플랫폼의 Google Ads Developer Token 승인 상태를 확인한 뒤 접근 가능한 고객 ID를 선택하세요.",
      en: "Verify the platform Google Ads developer token, then select an accessible customer ID.",
    },
    docsUrl: "https://developers.google.com/google-ads/api/docs/oauth/user-authentication",
  },
} as const;

export function OAuthPermissionGuide({
  provider,
  missingScopes,
  requirements,
}: {
  provider: string;
  missingScopes: string[];
  requirements: ScopeRequirement[];
}) {
  const guide = provider === "google_analytics" || provider === "google_ads" ? GOOGLE_GUIDE[provider] : null;
  const missingRequirements = requirements.filter((requirement) => missingScopes.includes(requirement.scope));

  return (
    <div className="w-full rounded-md border border-red-300/60 bg-red-50/70 p-3 text-xs text-slate-700">
      <p className="font-semibold text-red-700">
        <Lang text={{ ko: "어떤 권한이 부족한가요?", en: "Which permission is missing?" }} />
      </p>
      {missingRequirements.length ? (
        <ul className="mt-2 space-y-2">
          {missingRequirements.map((requirement) => (
            <li key={requirement.scope}>
              <p className="font-medium text-slate-900"><Lang text={requirement.label} /></p>
              <p><Lang text={requirement.purpose} /></p>
              <code className="mt-1 block break-all text-[10px] text-slate-500">{requirement.scope}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2">
          <Lang
            text={{
              ko: "Google이 부여한 scope를 확인할 수 없거나 연결 당시의 권한 정보가 오래되었습니다.",
              en: "The granted scopes are unavailable or the stored permission state is stale.",
            }}
          />
        </p>
      )}

      <ol className="mt-3 list-decimal space-y-1 pl-4">
        <li>
          <Lang
            text={{
              ko: "권한 다시 연결을 누르고 표시되는 필수 권한을 모두 허용하세요.",
              en: "Choose Reconnect and approve every required permission shown by Google.",
            }}
          />
        </li>
        {guide ? <li><Lang text={guide.resourceStep} /></li> : null}
        {guide ? <li><Lang text={guide.finalStep} /></li> : null}
      </ol>

      {guide ? (
        <a
          href={guide.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
        >
          <Lang text={{ ko: "Google 공식 권한 가이드", en: "Google permission guide" }} />
          <ExternalLink className="icon-xxs" />
        </a>
      ) : null}
    </div>
  );
}
