"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Key, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Input,
  Label,
  Preloader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@amu-labs/ui";
import { SubHeader } from "components/module/common";
import { Lang, lang, useLocalize } from "components/module/i18n";
import { OAuthAppCredentialsPanel } from "components/module/admin/third-party/marketing-operations/OAuthAppCredentialsPanel";
import { useAuthCheck, useUserData } from "hooks/auth";
import fetchClient from "libs/api/fetchClient";
import { useAuthStore } from "store/auth";
import type { PlatformCredentialDefinition, PlatformCredentialStatusItem } from "types/secure/platformCredentials";
import { QWEN_MODEL_STUDIO_MIGRATION_REASON } from "types/secure/platformCredentials";
import { formatCredentialResetDate, resolveCredentialFieldPlaceholder } from "utils/admin/platformCredentialDisplay";
import { cn } from "utils/common";
import { toErrorMessage } from "utils/common/typeUtils";
import { PAGE_LAYOUT_CLASS, THEME_OVERRIDE_CLASS } from "utils/theme";

type CredentialListResponse = {
  success: boolean;
  data: {
    definitions: PlatformCredentialDefinition[];
    statuses: PlatformCredentialStatusItem[];
  };
};

type CredentialAction = "save" | "verify" | "activate" | "disable" | "migrate";
type DraftMap = Record<string, Record<string, string>>;

// 이 목록의 키로 그룹을 만든다(Object.keys). 새 category를 여기에 넣지 않으면
// 정의를 추가해도 화면에 섹션이 아예 렌더되지 않는다 — test/tradingCredentialDefinitions.test.ts가 이를 고정한다.
const CATEGORY_LABELS = {
  ai: { ko: "AI 공급자", en: "AI providers" },
  integration: { ko: "플랫폼 연동", en: "Platform integrations" },
  messaging: { ko: "메시징", en: "Messaging" },
  stock_image: { ko: "스톡 이미지 검색", en: "Stock image search" },
  trading: { ko: "거래 연동", en: "Trading" },
} as const;

function statusBadge(status?: PlatformCredentialStatusItem["latestStatus"]) {
  if (status === "active") return { variant: "primary" as const, text: { ko: "활성", en: "Active" } };
  if (status === "pending") return { variant: "accent" as const, text: { ko: "검증 대기", en: "Pending" } };
  if (status === "disabled") return { variant: "muted" as const, text: { ko: "비활성", en: "Disabled" } };
  return { variant: "outlineMuted" as const, text: { ko: "미등록", en: "Not configured" } };
}

export function PlatformCredentialsShell() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData } = useUserData();
  const { language } = useLocalize();
  const [definitions, setDefinitions] = useState<PlatformCredentialDefinition[]>([]);
  const [statuses, setStatuses] = useState<PlatformCredentialStatusItem[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<{ key: string; action: CredentialAction } | null>(null);

  useAuthCheck();

  useEffect(() => {
    if (!isLoggedIn) router.push("/login?next=/admin/credentials");
    if (userData && !userData.roles?.includes("administrator")) router.push("/");
  }, [isLoggedIn, router, userData]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchClient.get<CredentialListResponse>("/admin/platform-credentials");
      setDefinitions(response.data.data.definitions);
      setStatuses(response.data.data.statuses);
    } catch {
      toast.error(
        lang({ ko: "플랫폼 자격증명 상태를 불러오지 못했습니다.", en: "Could not load platform credentials." }),
      );
      setDefinitions([]);
      setStatuses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && userData?.roles?.includes("administrator")) {
      // 외부 관리자 API에서 상태를 로드하여 화면 상태를 동기화한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load();
    }
  }, [isLoggedIn, load, userData]);

  const statusByKey = useMemo(() => new Map(statuses.map((status) => [status.credentialKey, status])), [statuses]);

  const grouped = useMemo(
    () =>
      (Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((category) => ({
        category,
        definitions: definitions.filter((definition) => definition.category === category),
      })),
    [definitions],
  );

  const setDraft = (credentialKey: string, fieldKey: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [credentialKey]: { ...(current[credentialKey] || {}), [fieldKey]: value },
    }));
  };

  const runAction = async (
    action: CredentialAction,
    definition: PlatformCredentialDefinition,
    status?: PlatformCredentialStatusItem,
  ) => {
    if (action === "migrate") {
      const confirmed = window.confirm(
        lang({
          ko: "기존 QwenCloud PAYG 키를 현재 버전에서 읽어 Model Studio Singapore PAYG용 새 pending/unverified 버전으로 이관할까요? 원본 버전은 유지되고 새 버전은 활성화되지 않습니다.",
          en: "Create a new pending/unverified Model Studio Singapore PAYG version from the existing QwenCloud PAYG key? The source version stays unchanged and the new version will not be activated.",
        }),
      );
      if (!confirmed) return;
    }
    if (action === "disable") {
      const confirmed = window.confirm(
        lang(
          definition.disableConfirmation || {
            ko: `${definition.label.ko} 활성 자격증명을 비활성화할까요? 관련 기능은 즉시 중단됩니다.`,
            en: `Disable the active ${definition.label.en} credential? Related features will stop immediately.`,
          },
        ),
      );
      if (!confirmed) return;
    }

    const migrationEligibility = status?.qwenMigrationEligibility;
    const version = action === "migrate" ? migrationEligibility?.sourceVersion : status?.latestVersion;
    if (
      action === "migrate" &&
      (migrationEligibility?.eligible !== true ||
        migrationEligibility.reasonCode !== "ready" ||
        !Number.isSafeInteger(migrationEligibility.sourceVersion) ||
        (migrationEligibility.sourceVersion ?? 0) < 1)
    ) {
      return;
    }
    if ((action === "verify" || action === "activate" || action === "migrate") && !version) return;
    setRunning({ key: definition.key, action });
    try {
      await fetchClient.post("/admin/platform-credentials", {
        action,
        credentialKey: definition.key,
        ...(action === "save" ? { payload: drafts[definition.key] || {} } : {}),
        ...(action === "migrate" && version
          ? { sourceVersion: version, reasonCode: QWEN_MODEL_STUDIO_MIGRATION_REASON }
          : version
            ? { version }
            : {}),
      });
      if (action === "save") {
        setDrafts((current) => ({ ...current, [definition.key]: {} }));
        toast.success(
          lang({ ko: "새 pending 버전을 암호화 저장했습니다.", en: "Saved a new encrypted pending version." }),
        );
      } else if (action === "verify") {
        toast.success(
          lang({ ko: "공급자 자격증명 검증에 성공했습니다.", en: "Provider credential verification succeeded." }),
        );
      } else if (action === "activate") {
        toast.success(lang({ ko: "검증된 버전을 활성화했습니다.", en: "Activated the verified version." }));
      } else if (action === "migrate") {
        toast.success(lang({ ko: "새 Model Studio PAYG pending 버전을 만들었습니다.", en: "Created a new pending Model Studio PAYG version." }));
      } else {
        toast.success(lang({ ko: "활성 자격증명을 비활성화했습니다.", en: "Disabled the active credential." }));
      }
      await load();
    } catch (error) {
      toast.error(
        toErrorMessage(error) || lang({ ko: "자격증명 작업에 실패했습니다.", en: "Credential action failed." }),
      );
      await load();
    } finally {
      setRunning(null);
    }
  };

  if (loading || !isLoggedIn || !userData) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return (
    <div className={PAGE_LAYOUT_CLASS}>
      <div className={cn("container mx-auto max-w-5xl p-4", THEME_OVERRIDE_CLASS)}>
        <SubHeader
          align="start"
          className="mb-6"
          backAction={{
            link: "/admin",
            label: lang({ ko: "관리자 홈", en: "Admin home" }),
          }}
          icon={<Key className="text-primary" size={20} />}
          title={<Lang text={{ ko: "플랫폼 자격증명", en: "Platform credentials" }} />}
          description={
            <Lang
              text={{
                ko: "플랫폼 전역 API 키와 OAuth 앱 자격증명을 통합 관리합니다. 유니버스별 계정 연결과 운영 대상은 Marketing Ops에서 분리 관리됩니다.",
                en: "Manage platform-wide API keys and OAuth app credentials. Universe account connections and resources are managed separately in Marketing Ops.",
              }}
            />
          }
          right={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              aria-label={lang({ ko: "새로고침", en: "Refresh" })}
            >
              <RefreshCw size={14} />
              <Lang text={{ ko: "새로고침", en: "Refresh" }} />
            </Button>
          }
        />

        <div className="mb-6 flex items-start gap-3 rounded-xl bg-primary/5 p-4 text-sm text-secondary-text">
          <Shield className="mt-0.5 shrink-0 text-primary" size={18} />
          <p>
            <Lang
              text={{
                ko: "저장된 값은 다시 표시되지 않으며 API 응답·감사 로그에도 원문을 남기지 않습니다. 이 화면의 OAuth 앱 자격증명은 모든 유니버스가 공유하고, 각 유니버스의 계정 토큰과 선택 자원은 Marketing Ops에만 표시됩니다.",
                en: "Saved values are never shown again or written to API responses and audit logs. OAuth app credentials here are shared by every universe, while universe account tokens and selected resources only appear in Marketing Ops.",
              }}
            />
          </p>
        </div>

        <div className="space-y-8">
          <OAuthAppCredentialsPanel />

          {grouped.map(({ category, definitions: categoryDefinitions }) => (
            <section key={category}>
              <h2 className="mb-3 text-base font-semibold text-primary-text">
                <Lang text={CATEGORY_LABELS[category]} />
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {categoryDefinitions.map((definition) => {
                  const status = statusByKey.get(definition.key);
                  const badge = statusBadge(status?.latestStatus);
                  const draft = drafts[definition.key] || {};
                  const isRunning = running?.key === definition.key;
                  const canSave = definition.fields.every((field) => Boolean(draft[field.key]?.trim()));
                  const isVerified = status?.latestVerificationStatus === "valid";
                  const canVerify =
                    status?.latestStatus === "pending" && !isVerified && !definition.verificationUnavailable;
                  const canActivate =
                    status?.latestStatus === "pending" &&
                    isVerified &&
                    !definition.verificationUnavailable &&
                    !definition.activationUnavailable;
                  const migrationEligibility = status?.qwenMigrationEligibility;
                  const canMigrateQwen =
                    definition.key === "ai.qwen.default" &&
                    migrationEligibility?.eligible === true &&
                    migrationEligibility.reasonCode === "ready" &&
                    Number.isSafeInteger(migrationEligibility.sourceVersion) &&
                    (migrationEligibility.sourceVersion ?? 0) > 0;
                  const isActive = Boolean(status?.activeVersion);
                  const hasVerifiedReplacement =
                    isActive && canActivate && status?.activeVersion !== status?.latestVersion;
                  const resetDate = formatCredentialResetDate(status?.resetAt, language);

                  return (
                    <article key={definition.key} className="rounded-xl border border-border bg-surface p-4">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-primary-text">
                            <Lang text={definition.label} />
                          </h3>
                          <p className="mt-1 text-xs text-secondary-text whitespace-pre-line">
                            <Lang text={definition.description} />
                          </p>
                        </div>
                        <Badge variant={badge.variant} size="xs" className="whitespace-nowrap">
                          <Lang text={badge.text} />
                        </Badge>
                      </div>

                      {definition.notice ? (
                        // 카드의 토글만 보면 "켜면 동작한다"로 읽힌다. 그 해석이 틀린 자격증명에만 붙는 고정 안내다.
                        <div
                          role="note"
                          className="mb-4 flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xxs leading-relaxed text-secondary-text"
                        >
                          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                          <p className="whitespace-pre-line">
                            <Lang text={definition.notice} />
                          </p>
                        </div>
                      ) : null}

                      <div className="space-y-3">
                        {definition.fields.map((field) => {
                          const inputId = `platform-credential-${definition.key}-${field.key}`;
                          const placeholder = resolveCredentialFieldPlaceholder({
                            configuredFields: status?.configuredFields,
                            fieldKey: field.key,
                            emptyLabel: lang({ ko: "필수 값 입력", en: "Enter required value" }),
                          });

                          return (
                            <Label
                              key={field.key}
                              htmlFor={inputId}
                              label={<Lang text={field.label} />}
                              labelClassName="text-xs"
                            >
                              {field.options ? (
                                <Select
                                  value={draft[field.key] || ""}
                                  onValueChange={(value) =>
                                    setDraft(definition.key, field.key, typeof value === "string" ? value : "")
                                  }
                                >
                                  <SelectTrigger id={inputId} className="min-h-11 w-full">
                                    <SelectValue placeholder={placeholder} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {field.options.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        <Lang text={option.label} />
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  id={inputId}
                                  className="min-h-11"
                                  type={field.secret ? "password" : "text"}
                                  allowPasswordReveal={false}
                                  size="sm"
                                  autoComplete="off"
                                  value={draft[field.key] || ""}
                                  onChange={(event) => setDraft(definition.key, field.key, event.target.value)}
                                  placeholder={placeholder}
                                />
                              )}
                            </Label>
                          );
                        })}
                      </div>

                      <div className="mt-4 text-xxs text-muted-text">
                        {status?.activeVersion ? `active v${status.activeVersion}` : "active —"}
                        {" · "}
                        {status?.latestVersion ? `latest v${status.latestVersion}` : "latest —"}
                        {status?.lastVerificationCode ? ` · ${status.lastVerificationCode}` : ""}
                        {resetDate ? (
                          <>
                            {" · "}
                            <Lang text={{ ko: "재설정일", en: "Reset date" }} />: {resetDate}
                          </>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {canMigrateQwen ? (
                          <Button
                            size="xs"
                            variant="outlineSecondary"
                            disabled={isRunning}
                            loading={isRunning && running.action === "migrate"}
                            onClick={() => void runAction("migrate", definition, status)}
                          >
                            <Lang text={{ ko: "Model Studio PAYG pending 이관", en: "Migrate to Model Studio PAYG (pending)" }} />
                          </Button>
                        ) : null}
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={!canSave || isRunning}
                          loading={isRunning && running.action === "save"}
                          onClick={() => void runAction("save", definition, status)}
                        >
                          <Lang
                            text={
                              definition.verificationUnavailable
                                ? { ko: "미검증 상태로 저장", en: "Save as unverified" }
                                : { ko: "검증할 새 값 저장", en: "Save new value for verification" }
                            }
                          />
                        </Button>
                        <Button
                          size="xs"
                          variant="outlineSecondary"
                          disabled={!canVerify || isRunning}
                          loading={isRunning && running.action === "verify"}
                          onClick={() => void runAction("verify", definition, status)}
                        >
                          <Lang
                            text={
                              definition.verificationUnavailable
                                ? { ko: "조회 검증 불가", en: "Read-only verification unavailable" }
                                : isVerified
                                  ? { ko: "검증 완료", en: "Verified" }
                                  : { ko: "검증하기", en: "Verify" }
                            }
                          />
                        </Button>
                        {hasVerifiedReplacement && (
                          <Button
                            size="xs"
                            loading={isRunning && running.action === "activate"}
                            disabled={isRunning}
                            onClick={() => void runAction("activate", definition, status)}
                          >
                            <Lang text={{ ko: "검증된 값 적용", en: "Apply verified value" }} />
                          </Button>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          <span className="text-xs text-secondary-text">
                            <Lang
                              text={isActive ? { ko: "활성화됨", en: "Enabled" } : { ko: "비활성화됨", en: "Disabled" }}
                            />
                          </span>
                          <Switch
                            size="xs"
                            checked={isActive}
                            disabled={isRunning || (!isActive && !canActivate)}
                            onCheckedChange={(checked) =>
                              void runAction(checked ? "activate" : "disable", definition, status)
                            }
                            aria-label={lang({
                              ko: `${definition.label.ko} 활성 상태`,
                              en: `${definition.label.en} active state`,
                            })}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
