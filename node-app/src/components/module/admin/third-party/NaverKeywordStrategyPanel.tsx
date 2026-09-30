"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import fetchClient from "libs/api/fetchClient";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button, Label, Input, SegmentedControl, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { toast } from "sonner";
import { LineChart, Plus, RefreshCw, Save, Star, Trash2 } from "lucide-react";
import { DEFAULT_ANCHOR_KEYWORD, type MarketingKeywordClusterScope } from "consts/marketing/keywordCluster";
import { DEFAULT_MARKETING_UPLOAD_POLICY } from "consts/marketing/uploadPolicy";
import { extractApiErrorMessage, toUnknownRecord } from "utils/common/typeUtils";
import { cn } from "utils/common";
import { MARKETING_TAB_HEADER_CLASS } from "./marketing-operations/MarketingOpsConstants";

/**
 * @docHint
 * @purpose Marketing Ops 키워드 전략 탭 — 기본 앵커 설정 + 클러스터 원장 + 키워드 프로필 + 데이터랩 비교 실행
 * @process keyword-profiles API 조회 → 설정/클러스터/프로필 CRUD → 프로필 기준 트렌드 비교 → 대표 키워드 확정
 * @domain marketing
 * @scope admin-ui
 */

const KEYWORD_PROFILES_API = "/marketing/keyword-profiles";
const KEYWORD_TREND_API = "/marketing/keyword-profiles/trend";
const MAX_COMPARE_CANDIDATES = 4; // datalab 5그룹 제한: 앵커 1 + 후보 4

type KeywordSettings = {
  defaultAnchorKeyword: string;
  defaultLookbackDays: number;
  defaultTimeUnit: "date" | "week" | "month";
  defaultDevice: "all" | "pc" | "mo";
  marketingCriteria: MarketingCriteria;
};

type MarketingCriteria = {
  goal: string;
  targetPersona: string;
  funnel: "TOFU" | "MOFU" | "BOFU" | "mixed";
  primaryConversion: string;
  coreMessage: string;
  requiredTopicsText: string;
  excludedTopicsText: string;
  threadsGuidance: string;
  instagramGuidance: string;
  linkedinGuidance: string;
  naverBlogGuidance: string;
  uploadPolicy: Record<
    string,
    {
      weekdayDailyCap: number;
      weekendDailyCap: number;
      weeklyCap: number;
      minGapHours: number;
      preferredHoursText: string;
    }
  >;
  version: number;
};

const DEFAULT_UPLOAD_POLICY = Object.fromEntries(
  Object.entries(DEFAULT_MARKETING_UPLOAD_POLICY).map(([channel, policy]) => [
    channel,
    {
      ...policy,
      preferredHoursText: policy.preferredHours.join(", "),
    },
  ]),
) as MarketingCriteria["uploadPolicy"];

const DEFAULT_MARKETING_CRITERIA: MarketingCriteria = {
  goal: "",
  targetPersona: "",
  funnel: "mixed",
  primaryConversion: "",
  coreMessage: "",
  requiredTopicsText: "",
  excludedTopicsText: "",
  threadsGuidance: "",
  instagramGuidance: "",
  linkedinGuidance: "",
  naverBlogGuidance: "",
  uploadPolicy: DEFAULT_UPLOAD_POLICY,
  version: 0,
};

const MARKETING_FUNNEL_OPTIONS = [
  {
    value: "TOFU",
    label: {
      ko: "TOFU · 인지도",
      en: "TOFU · Awareness",
    },
    description: {
      ko: "새로운 잠재 고객에게 문제와 브랜드를 알리고 유입을 만듭니다.",
      en: "Build awareness and attract new potential customers.",
    },
  },
  {
    value: "MOFU",
    label: {
      ko: "MOFU · 관심 및 검토",
      en: "MOFU · Consideration",
    },
    description: {
      ko: "관심 고객에게 정보, 비교, 사례를 제공해 선택을 돕습니다.",
      en: "Help interested customers evaluate solutions through insights and comparisons.",
    },
  },
  {
    value: "BOFU",
    label: {
      ko: "BOFU · 전환",
      en: "BOFU · Conversion",
    },
    description: {
      ko: "구매, 가입, 문의, 데모 신청과 같은 직접 전환을 유도합니다.",
      en: "Drive direct actions such as purchases, sign-ups, inquiries, or demos.",
    },
  },
  {
    value: "mixed",
    label: {
      ko: "mixed · 혼합",
      en: "Mixed · Full funnel",
    },
    description: {
      ko: "인지부터 검토와 전환까지 여러 고객 여정 단계를 함께 다룹니다.",
      en: "Cover multiple stages from awareness to consideration and conversion.",
    },
  },
] satisfies ReadonlyArray<{
  value: MarketingCriteria["funnel"];
  label: { ko: string; en: string };
  description: { ko: string; en: string };
}>;

type KeywordCluster = {
  clusterKey: string;
  clusterScope: MarketingKeywordClusterScope;
  label: { ko: string; en: string };
  sortOrder: number;
  enabled: boolean;
  status: string;
};

type KeywordProfile = {
  profileKey: string;
  name: string;
  clusterKey: string;
  clusterScope: MarketingKeywordClusterScope;
  anchorKeyword?: string;
  anchorChangedAt?: string;
  seedKeywords: string[];
  negativeKeywords: string[];
  selectedKeyword?: string;
  selectedReason?: string;
  campaignId?: string;
  note?: string;
  enabled: boolean;
  status: string;
};

type TrendRow = {
  keyword: string;
  anchorIndex: number;
  momentum: number;
  seasonality: string;
  fromCache?: boolean;
};

type TrendContext = {
  anchorKeyword: string;
  timeUnit: string;
  startDate: string;
  endDate: string;
  profileKey: string;
};

type ProfileDraft = {
  profileKey: string;
  name: string;
  clusterKey: string;
  anchorKeyword: string;
  seedKeywordsText: string;
  negativeKeywordsText: string;
  campaignId: string;
  note: string;
  enabled: boolean;
};

const DEFAULT_SETTINGS: KeywordSettings = {
  defaultAnchorKeyword: DEFAULT_ANCHOR_KEYWORD,
  defaultLookbackDays: 90,
  defaultTimeUnit: "month",
  defaultDevice: "all",
  marketingCriteria: DEFAULT_MARKETING_CRITERIA,
};

const EMPTY_PROFILE_DRAFT: ProfileDraft = {
  profileKey: "",
  name: "",
  clusterKey: "",
  anchorKeyword: "",
  seedKeywordsText: "",
  negativeKeywordsText: "",
  campaignId: "",
  note: "",
  enabled: true,
};

const EMPTY_CLUSTER_DRAFT = {
  clusterKey: "",
  clusterScope: "strategy" as MarketingKeywordClusterScope,
  labelKo: "",
  labelEn: "",
};

function splitKeywordsText(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,]/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function seasonalityLabel(value: string) {
  switch (value) {
    case "rising":
      return lang({ ko: "상승", en: "Rising" });
    case "declining":
      return lang({ ko: "하락", en: "Declining" });
    case "seasonal":
      return lang({ ko: "시즌성", en: "Seasonal" });
    case "spike":
      return lang({ ko: "스파이크", en: "Spike" });
    case "evergreen":
      return lang({ ko: "에버그린", en: "Evergreen" });
    default:
      return value || "-";
  }
}

export function NaverKeywordStrategyPanel({
  universeId,
  universeOptions = [],
}: {
  universeId?: string;
  universeOptions?: { id: string; name: string }[];
}) {
  const scopedUniverseId = String(universeId ?? "").trim();
  // 상위 "대상 유니버스 선택"이 전체 범위일 때 첫 유니버스를 임의로 고르지 않는다.
  // 자동 선택하면 화면 상단은 "전체 유니버스"인데 특정 유니버스의 정책이 열려, 다른 유니버스 정책을 덮어쓸 수 있다.
  const [selectedUniverseId, setSelectedUniverseId] = useState(scopedUniverseId);
  const targetUniverseId = scopedUniverseId || selectedUniverseId;

  const [settings, setSettings] = useState<KeywordSettings>(DEFAULT_SETTINGS);
  const [uploadPolicyPersisted, setUploadPolicyPersisted] = useState(false);
  const [clusters, setClusters] = useState<KeywordCluster[]>([]);
  const [profiles, setProfiles] = useState<KeywordProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");

  const [clusterDraft, setClusterDraft] = useState(EMPTY_CLUSTER_DRAFT);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE_DRAFT);
  const [editingProfileKey, setEditingProfileKey] = useState("");
  const [editingOriginalAnchor, setEditingOriginalAnchor] = useState("");

  const [compareProfileKey, setCompareProfileKey] = useState("");
  const [trendRows, setTrendRows] = useState<TrendRow[]>([]);
  const [trendContext, setTrendContext] = useState<TrendContext | null>(null);
  const [selectedKeywordDraft, setSelectedKeywordDraft] = useState("");
  const [selectedReasonDraft, setSelectedReasonDraft] = useState("");

  const enabledClusters = useMemo(() => clusters.filter((cluster) => cluster.enabled), [clusters]);
  const compareProfile = useMemo(
    () => profiles.find((profile) => profile.profileKey === compareProfileKey) ?? null,
    [profiles, compareProfileKey],
  );
  const compareAnchor =
    compareProfile?.anchorKeyword?.trim() || settings.defaultAnchorKeyword.trim() || DEFAULT_ANCHOR_KEYWORD;

  const load = useCallback(async () => {
    if (!targetUniverseId) return;
    try {
      setLoading(true);
      // 유니버스가 바뀌면 이전 유니버스의 비교 결과가 남지 않도록 함께 초기화한다.
      setCompareProfileKey("");
      setTrendRows([]);
      setTrendContext(null);
      const response = await fetchClient.get(
        `${KEYWORD_PROFILES_API}?universeId=${encodeURIComponent(targetUniverseId)}`,
      );
      const data = toUnknownRecord(response.data?.data);
      const nextSettings = toUnknownRecord(data.settings);
      const criteria = toUnknownRecord(nextSettings.marketingCriteria);
      const channelGuidance = toUnknownRecord(criteria.channelGuidance);
      const uploadPolicy = toUnknownRecord(criteria.uploadPolicy);
      const uploadPolicyChannels = toUnknownRecord(uploadPolicy.channels);
      setUploadPolicyPersisted(Object.keys(uploadPolicyChannels).length > 0);
      const normalizedUploadPolicy = Object.fromEntries(
        Object.entries(DEFAULT_UPLOAD_POLICY).map(([channel, defaults]) => {
          const value = toUnknownRecord(uploadPolicyChannels[channel]);
          const preferredHours = Array.isArray(value.preferredHours) ? value.preferredHours : [];
          return [
            channel,
            {
              weekdayDailyCap: Number(value.weekdayDailyCap ?? defaults.weekdayDailyCap),
              weekendDailyCap: Number(value.weekendDailyCap ?? defaults.weekendDailyCap),
              weeklyCap: Number(value.weeklyCap ?? defaults.weeklyCap),
              minGapHours: Number(value.minGapHours ?? defaults.minGapHours),
              preferredHoursText: preferredHours.length ? preferredHours.join(", ") : defaults.preferredHoursText,
            },
          ];
        }),
      );
      setSettings({
        defaultAnchorKeyword: String(nextSettings.defaultAnchorKeyword ?? DEFAULT_SETTINGS.defaultAnchorKeyword),
        defaultLookbackDays: Number(nextSettings.defaultLookbackDays ?? DEFAULT_SETTINGS.defaultLookbackDays),
        defaultTimeUnit: (nextSettings.defaultTimeUnit as KeywordSettings["defaultTimeUnit"]) || "month",
        defaultDevice: (nextSettings.defaultDevice as KeywordSettings["defaultDevice"]) || "all",
        marketingCriteria: {
          goal: String(criteria.goal ?? ""),
          targetPersona: String(criteria.targetPersona ?? ""),
          funnel: (criteria.funnel as MarketingCriteria["funnel"]) || "mixed",
          primaryConversion: String(criteria.primaryConversion ?? ""),
          coreMessage: String(criteria.coreMessage ?? ""),
          requiredTopicsText: Array.isArray(criteria.requiredTopics) ? criteria.requiredTopics.join("\n") : "",
          excludedTopicsText: Array.isArray(criteria.excludedTopics) ? criteria.excludedTopics.join("\n") : "",
          threadsGuidance: String(channelGuidance.threads ?? ""),
          instagramGuidance: String(channelGuidance.instagram ?? ""),
          linkedinGuidance: String(channelGuidance.linkedin ?? ""),
          naverBlogGuidance: String(channelGuidance.naver_blog ?? ""),
          uploadPolicy: normalizedUploadPolicy,
          version: Number(criteria.version || 0),
        },
      });
      setClusters(Array.isArray(data.clusters) ? (data.clusters as KeywordCluster[]) : []);
      setProfiles(Array.isArray(data.profiles) ? (data.profiles as KeywordProfile[]) : []);
    } catch (error) {
      void dialog.alert({
        variant: "danger",
        message: extractApiErrorMessage(
          error,
          lang({ ko: "키워드 전략 로드에 실패했습니다.", en: "Failed to load keyword strategy." }),
        ),
      });
    } finally {
      setLoading(false);
    }
  }, [targetUniverseId]);

  useEffect(
    function loadKeywordStrategyOnMount() {
      // 동기 setState(cascading render) 방지 — 로드는 microtask로 지연 실행
      void Promise.resolve().then(load);
    },
    [load],
  );

  const changeUniverse = (nextUniverseId: string) => {
    setSelectedUniverseId(nextUniverseId);
    setCompareProfileKey("");
    setTrendRows([]);
    setTrendContext(null);
  };

  const saveSettings = async () => {
    if (!targetUniverseId) return;
    try {
      setBusyKey("settings");
      await fetchClient.post(KEYWORD_PROFILES_API, { kind: "settings", universeId: targetUniverseId, ...settings });
      toast.success(lang({ ko: "기본 앵커 설정을 저장했습니다.", en: "Default anchor settings saved." }));
      await load();
    } catch (error) {
      void dialog.alert({
        variant: "danger",
        message: extractApiErrorMessage(
          error,
          lang({ ko: "설정 저장에 실패했습니다.", en: "Failed to save settings." }),
        ),
      });
    } finally {
      setBusyKey("");
    }
  };

  const saveMarketingCriteria = async () => {
    if (!targetUniverseId) return;
    const criteria = settings.marketingCriteria;
    if (!criteria.goal.trim() || !criteria.targetPersona.trim()) {
      toast.error(
        lang({ ko: "마케팅 목표와 타깃 페르소나는 필수입니다.", en: "Goal and target persona are required." }),
      );
      return;
    }
    try {
      setBusyKey("marketing-criteria");
      await fetchClient.post(KEYWORD_PROFILES_API, {
        kind: "settings",
        universeId: targetUniverseId,
        marketingCriteria: {
          goal: criteria.goal,
          targetPersona: criteria.targetPersona,
          funnel: criteria.funnel,
          primaryConversion: criteria.primaryConversion,
          coreMessage: criteria.coreMessage,
          requiredTopics: splitKeywordsText(criteria.requiredTopicsText),
          excludedTopics: splitKeywordsText(criteria.excludedTopicsText),
          channelGuidance: {
            threads: criteria.threadsGuidance,
            instagram: criteria.instagramGuidance,
            linkedin: criteria.linkedinGuidance,
            naver_blog: criteria.naverBlogGuidance,
          },
          uploadPolicy: {
            channels: Object.fromEntries(
              Object.entries(criteria.uploadPolicy).map(([channel, policy]) => [
                channel,
                {
                  ...policy,
                  preferredHours: policy.preferredHoursText
                    .split(",")
                    .map(Number)
                    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23),
                },
              ]),
            ),
          },
        },
      });
      toast.success(lang({ ko: "마케팅 적합도 기준을 저장했습니다.", en: "Marketing fit criteria saved." }));
      await load();
    } catch (error) {
      toast.error(
        extractApiErrorMessage(
          error,
          lang({ ko: "마케팅 기준 저장에 실패했습니다.", en: "Failed to save marketing criteria." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  const saveCluster = async () => {
    if (!targetUniverseId || !clusterDraft.clusterKey.trim()) return;
    try {
      setBusyKey("cluster");
      await fetchClient.post(KEYWORD_PROFILES_API, {
        kind: "cluster",
        universeId: targetUniverseId,
        clusterKey: clusterDraft.clusterKey,
        clusterScope: clusterDraft.clusterScope,
        labelKo: clusterDraft.labelKo,
        labelEn: clusterDraft.labelEn,
        enabled: true,
      });
      toast.success(lang({ ko: "클러스터를 저장했습니다.", en: "Cluster saved." }));
      setClusterDraft(EMPTY_CLUSTER_DRAFT);
      await load();
    } catch (error) {
      void dialog.alert({
        variant: "danger",
        message: extractApiErrorMessage(
          error,
          lang({ ko: "클러스터 저장에 실패했습니다.", en: "Failed to save cluster." }),
        ),
      });
    } finally {
      setBusyKey("");
    }
  };

  const toggleCluster = async (cluster: KeywordCluster, enabled: boolean) => {
    if (!targetUniverseId) return;
    try {
      await fetchClient.post(KEYWORD_PROFILES_API, {
        kind: "cluster",
        universeId: targetUniverseId,
        clusterKey: cluster.clusterKey,
        clusterScope: cluster.clusterScope,
        labelKo: cluster.label?.ko,
        labelEn: cluster.label?.en,
        enabled,
      });
      await load();
    } catch (error) {
      toast.error(
        extractApiErrorMessage(error, lang({ ko: "클러스터 변경에 실패했습니다.", en: "Failed to update cluster." })),
      );
    }
  };

  const removeCluster = async (cluster: KeywordCluster) => {
    if (!targetUniverseId) return;
    const usingCount = profiles.filter(
      (profile) => profile.enabled && profile.clusterKey === cluster.clusterKey,
    ).length;
    const confirmed = await dialog.confirm({
      variant: "danger",
      message:
        usingCount > 0
          ? lang({
              ko: `${usingCount}개 프로필이 이 클러스터를 사용 중입니다. 비활성(soft delete)하시겠어요?`,
              en: `${usingCount} profile(s) use this cluster. Deactivate (soft delete)?`,
            })
          : lang({ ko: "이 클러스터를 비활성(soft delete)하시겠어요?", en: "Deactivate this cluster (soft delete)?" }),
    });
    if (!confirmed) return;
    try {
      await fetchClient.delete(
        `${KEYWORD_PROFILES_API}?universeId=${encodeURIComponent(targetUniverseId)}&kind=cluster&clusterKey=${encodeURIComponent(cluster.clusterKey)}`,
      );
      toast.success(lang({ ko: "클러스터를 비활성화했습니다.", en: "Cluster deactivated." }));
      await load();
    } catch (error) {
      toast.error(
        extractApiErrorMessage(error, lang({ ko: "클러스터 삭제에 실패했습니다.", en: "Failed to delete cluster." })),
      );
    }
  };

  const startEditProfile = (profile: KeywordProfile) => {
    setEditingProfileKey(profile.profileKey);
    setEditingOriginalAnchor(String(profile.anchorKeyword ?? "").trim());
    setProfileDraft({
      profileKey: profile.profileKey,
      name: profile.name,
      clusterKey: profile.clusterKey,
      anchorKeyword: String(profile.anchorKeyword ?? ""),
      seedKeywordsText: (profile.seedKeywords ?? []).join("\n"),
      negativeKeywordsText: (profile.negativeKeywords ?? []).join("\n"),
      campaignId: String(profile.campaignId ?? ""),
      note: String(profile.note ?? ""),
      enabled: profile.enabled,
    });
  };

  const resetProfileDraft = () => {
    setEditingProfileKey("");
    setEditingOriginalAnchor("");
    setProfileDraft(EMPTY_PROFILE_DRAFT);
  };

  const saveProfile = async () => {
    if (!targetUniverseId || !profileDraft.profileKey.trim()) return;

    const nextAnchor = profileDraft.anchorKeyword.trim();
    if (editingProfileKey && nextAnchor !== editingOriginalAnchor) {
      const confirmed = await dialog.confirm({
        variant: "danger",
        message: lang({
          ko: "앵커를 변경하면 기존 트렌드 지수와 단절되어 이전 비교 결과와 직접 비교할 수 없습니다. 계속할까요?",
          en: "Changing the anchor breaks continuity with previous trend indices. Continue?",
        }),
      });
      if (!confirmed) return;
    }

    const cluster = enabledClusters.find((item) => item.clusterKey === profileDraft.clusterKey);
    try {
      setBusyKey("profile");
      await fetchClient.post(KEYWORD_PROFILES_API, {
        kind: "profile",
        universeId: targetUniverseId,
        profileKey: profileDraft.profileKey,
        name: profileDraft.name,
        clusterKey: profileDraft.clusterKey,
        clusterScope: cluster?.clusterScope ?? "strategy",
        anchorKeyword: nextAnchor,
        seedKeywords: splitKeywordsText(profileDraft.seedKeywordsText),
        negativeKeywords: splitKeywordsText(profileDraft.negativeKeywordsText),
        campaignId: profileDraft.campaignId,
        note: profileDraft.note,
        enabled: profileDraft.enabled,
      });
      toast.success(lang({ ko: "프로필을 저장했습니다.", en: "Profile saved." }));
      resetProfileDraft();
      await load();
    } catch (error) {
      void dialog.alert({
        variant: "danger",
        message: extractApiErrorMessage(
          error,
          lang({ ko: "프로필 저장에 실패했습니다.", en: "Failed to save profile." }),
        ),
      });
    } finally {
      setBusyKey("");
    }
  };

  const removeProfile = async (profile: KeywordProfile) => {
    if (!targetUniverseId) return;
    const confirmed = await dialog.confirm({
      variant: "danger",
      message: lang({ ko: "이 프로필을 비활성(soft delete)하시겠어요?", en: "Deactivate this profile (soft delete)?" }),
    });
    if (!confirmed) return;
    try {
      await fetchClient.delete(
        `${KEYWORD_PROFILES_API}?universeId=${encodeURIComponent(targetUniverseId)}&profileKey=${encodeURIComponent(profile.profileKey)}`,
      );
      toast.success(lang({ ko: "프로필을 비활성화했습니다.", en: "Profile deactivated." }));
      if (compareProfileKey === profile.profileKey) {
        setCompareProfileKey("");
        setTrendRows([]);
        setTrendContext(null);
      }
      await load();
    } catch (error) {
      toast.error(
        extractApiErrorMessage(error, lang({ ko: "프로필 삭제에 실패했습니다.", en: "Failed to delete profile." })),
      );
    }
  };

  const runTrendCompare = async (force: boolean) => {
    if (!targetUniverseId || !compareProfile) return;
    const candidates = (compareProfile.seedKeywords ?? []).slice(0, MAX_COMPARE_CANDIDATES);
    if (candidates.length === 0) {
      toast.error(lang({ ko: "프로필에 seed 키워드가 없습니다.", en: "The profile has no seed keywords." }));
      return;
    }
    if (force) {
      const confirmed = await dialog.confirm({
        variant: "danger",
        message: lang({
          ko: "캐시를 무시하고 재수집하면 네이버 API 호출량(quota)을 소모합니다. 계속할까요?",
          en: "Forcing a refresh consumes Naver API quota. Continue?",
        }),
      });
      if (!confirmed) return;
    }
    try {
      setBusyKey(force ? "trend:force" : "trend");
      const response = await fetchClient.post(KEYWORD_TREND_API, {
        universeId: targetUniverseId,
        profileKey: compareProfile.profileKey,
        candidateKeywords: candidates,
        force,
      });
      const data = toUnknownRecord(response.data?.data);
      setTrendRows(Array.isArray(data.results) ? (data.results as TrendRow[]) : []);
      setTrendContext({
        anchorKeyword: String(data.anchorKeyword ?? compareAnchor),
        timeUnit: String(data.timeUnit ?? "month"),
        startDate: String(data.startDate ?? ""),
        endDate: String(data.endDate ?? ""),
        profileKey: compareProfile.profileKey,
      });
      setSelectedKeywordDraft(String(compareProfile.selectedKeyword ?? ""));
      setSelectedReasonDraft(String(compareProfile.selectedReason ?? ""));
    } catch (error) {
      void dialog.alert({
        variant: "danger",
        message: extractApiErrorMessage(
          error,
          lang({ ko: "트렌드 비교에 실패했습니다.", en: "Trend comparison failed." }),
        ),
      });
    } finally {
      setBusyKey("");
    }
  };

  const saveSelectedKeyword = async () => {
    if (!targetUniverseId || !compareProfile || !selectedKeywordDraft.trim()) return;
    try {
      setBusyKey("selected");
      // 부분 upsert가 다른 필드를 초기화하지 않도록 현재 프로필 값을 함께 전송한다.
      await fetchClient.post(KEYWORD_PROFILES_API, {
        kind: "profile",
        universeId: targetUniverseId,
        profileKey: compareProfile.profileKey,
        name: compareProfile.name,
        clusterKey: compareProfile.clusterKey,
        clusterScope: compareProfile.clusterScope,
        anchorKeyword: String(compareProfile.anchorKeyword ?? ""),
        seedKeywords: compareProfile.seedKeywords ?? [],
        negativeKeywords: compareProfile.negativeKeywords ?? [],
        campaignId: String(compareProfile.campaignId ?? ""),
        note: String(compareProfile.note ?? ""),
        enabled: compareProfile.enabled,
        selectedKeyword: selectedKeywordDraft.trim(),
        selectedReason: selectedReasonDraft.trim(),
      });
      toast.success(lang({ ko: "대표 키워드를 저장했습니다.", en: "Primary keyword saved." }));
      await load();
    } catch (error) {
      toast.error(
        extractApiErrorMessage(
          error,
          lang({ ko: "대표 키워드 저장에 실패했습니다.", en: "Failed to save primary keyword." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  const universeSelector =
    !scopedUniverseId && universeOptions.length > 0 ? (
      <Select value={selectedUniverseId} onValueChange={(value) => changeUniverse(String(value))}>
        <SelectTrigger size="sm" className="w-44">
          <SelectValue placeholder={lang({ ko: "유니버스 선택", en: "Select universe" })} />
        </SelectTrigger>
        <SelectContent>
          {universeOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name} ({option.id})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  if (!targetUniverseId) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-secondary-text">
          <Lang
            text={{
              ko: "키워드 전략은 유니버스 단위로 관리됩니다. 대상 유니버스를 선택하면 해당 유니버스의 마케팅 기준과 업로드 정책이 열립니다.",
              en: "Keyword strategy is managed per universe. Select a target universe to open its marketing criteria and upload policy.",
            }}
          />
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col text-primary-text">
      <div className={MARKETING_TAB_HEADER_CLASS}>
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-text">05 · Keyword Strategy</span>
          <h4 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
            <Lang text={{ ko: "네이버 키워드 전략", en: "Naver keyword strategy" }} />
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xxs font-normal text-secondary-text">
              {targetUniverseId}
            </span>
          </h4>
          <p className="mt-1 text-xxs text-secondary-text">
            <Lang
              text={{
                ko: "anchorIndex는 앵커 키워드 대비 상대 지수이며 절대 검색량이 아닙니다. 같은 앵커 안에서만 비교하세요.",
                en: "anchorIndex is relative to the anchor keyword, not absolute volume. Compare only within the same anchor.",
              }}
            />
          </p>
        </div>
        <div className="flex items-center gap-2">
          {universeSelector}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("icon-xxs", loading && "animate-spin")} />
            <Lang text={{ ko: "새로고침", en: "Refresh" }} className="sr-only" />
          </Button>
        </div>
      </div>

      <Accordion
        type="multiple"
        defaultValue={["marketing-criteria", "upload-policy", "keyword-settings", "keyword-compare"]}
        className="flex flex-col gap-4"
      >
        <AccordionItem value="marketing-criteria" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <span className="flex items-center gap-2">
              <Lang text={{ ko: "마케팅 적합도 기준", en: "Marketing fit criteria" }} />
              <Badge variant="outline" size="xs">
                v{settings.marketingCriteria.version}
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pt-3">
            <p className="text-xxs text-secondary-text">
              <Lang
                text={{
                  ko: "JOB과 에이전트가 콘텐츠의 목표·대상·채널·CTA 적합도를 평가할 때 사용하는 유니버스 기준입니다.",
                  en: "Universe criteria used by jobs and agents to evaluate goal, audience, channel, and CTA fit.",
                }}
              />
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label label={lang({ ko: "마케팅 목표 (필수)", en: "Marketing goal (required)" })}>
                <Textarea
                  rows={3}
                  value={settings.marketingCriteria.goal}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      marketingCriteria: { ...prev.marketingCriteria, goal: e.target.value },
                    }))
                  }
                  placeholder={lang({ ko: "마케팅 목표 (필수)", en: "Marketing goal (required)" })}
                />
              </Label>

              <Label label={lang({ ko: "타깃 페르소나 (필수)", en: "Target persona (required)" })}>
                <Textarea
                  rows={3}
                  value={settings.marketingCriteria.targetPersona}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      marketingCriteria: { ...prev.marketingCriteria, targetPersona: e.target.value },
                    }))
                  }
                  placeholder={lang({ ko: "타깃 페르소나 (필수)", en: "Target persona (required)" })}
                />
              </Label>

              <Label label={lang({ ko: "마케팅 퍼널", en: "Marketing Funnel" })}>
                <Select
                  value={settings.marketingCriteria.funnel}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      marketingCriteria: {
                        ...prev.marketingCriteria,
                        funnel: value as MarketingCriteria["funnel"],
                      },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent className="min-w-[280px]">
                    {MARKETING_FUNNEL_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        textValue={lang(option.label)}
                        className="py-2"
                      >
                        <span className="flex min-w-0 flex-col items-start gap-0.5 pr-3">
                          <span className="text-xs font-medium text-primary-text">{lang(option.label)}</span>

                          <span className="whitespace-normal text-left text-xxs leading-relaxed text-secondary-text">
                            {lang(option.description)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>

              <Label label={lang({ ko: "주요 전환 목표", en: "Primary conversion" })}>
                <Input
                  value={settings.marketingCriteria.primaryConversion}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      marketingCriteria: { ...prev.marketingCriteria, primaryConversion: e.target.value },
                    }))
                  }
                  placeholder={lang({ ko: "주요 전환 목표", en: "Primary conversion" })}
                />
              </Label>

              <Label label={lang({ ko: "핵심 메시지", en: "Core message" })}>
                <Textarea
                  rows={3}
                  value={settings.marketingCriteria.coreMessage}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      marketingCriteria: { ...prev.marketingCriteria, coreMessage: e.target.value },
                    }))
                  }
                  placeholder={lang({ ko: "핵심 메시지", en: "Core message" })}
                />
              </Label>

              <div className="grid gap-2 sm:grid-cols-2">
                <Label label={lang({ ko: "필수 주제 · 줄바꿈", en: "Required topics · one per line" })}>
                  <Textarea
                    rows={3}
                    value={settings.marketingCriteria.requiredTopicsText}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        marketingCriteria: { ...prev.marketingCriteria, requiredTopicsText: e.target.value },
                      }))
                    }
                    placeholder={lang({ ko: "필수 주제 · 줄바꿈", en: "Required topics · one per line" })}
                  />
                </Label>

                <Label label={lang({ ko: "제외 주제 · 줄바꿈", en: "Excluded topics · one per line" })}>
                  <Textarea
                    rows={3}
                    value={settings.marketingCriteria.excludedTopicsText}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        marketingCriteria: { ...prev.marketingCriteria, excludedTopicsText: e.target.value },
                      }))
                    }
                    placeholder={lang({ ko: "제외 주제 · 줄바꿈", en: "Excluded topics · one per line" })}
                  />
                </Label>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["threadsGuidance", "Threads"],
                  ["instagramGuidance", "Instagram"],
                  ["linkedinGuidance", "LinkedIn"],
                  ["naverBlogGuidance", "Naver Blog"],
                ] as const
              ).map(([key, label]) => (
                <Label key={key} label={`${label} ${lang({ ko: "채널 기준", en: "channel guidance" })}`}>
                  <Textarea
                    rows={3}
                    value={settings.marketingCriteria[key]}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        marketingCriteria: { ...prev.marketingCriteria, [key]: e.target.value },
                      }))
                    }
                    placeholder={`${label} ${lang({ ko: "채널 기준", en: "channel guidance" })}`}
                  />
                </Label>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                size="xs"
                onClick={() => void saveMarketingCriteria()}
                disabled={busyKey === "marketing-criteria"}
              >
                <Save className="icon-xxs" />
                <Lang text={{ ko: "마케팅 기준 저장", en: "Save marketing criteria" }} />
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 업로드 정책은 적합도 판정이 아니라 발행 스케줄 규칙이라 별도 패널로 둔다. 저장은 마케팅 기준과 같은 원장을 쓴다. */}
        <AccordionItem value="upload-policy" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <span className="flex items-center gap-2">
              <Lang text={{ ko: "채널별 추천 업로드 정책", en: "Recommended upload policy by channel" }} />
              <Badge variant="outline" size="xs">
                <Lang
                  text={
                    uploadPolicyPersisted
                      ? { ko: "명시적 정책 저장됨", en: "Explicit policy saved" }
                      : { ko: "기본값 사용 중", en: "Using fallback defaults" }
                  }
                />
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pt-3">
            <div className="space-y-2">
              {!uploadPolicyPersisted ? (
                <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Lang
                    text={{
                      ko: "현재 값은 코드 기본값입니다. 아래 값을 확인한 뒤 ‘마케팅 기준 저장’을 눌러 Marketing Ops 원장에 명시적으로 저장해 주세요.",
                      en: "These are code defaults. Review them and click Save marketing criteria to persist an explicit Marketing Ops policy.",
                    }}
                  />
                </p>
              ) : null}
              <p className="text-xxs text-secondary-text">
                <Lang
                  text={{
                    ko: "추천일은 이 정책과 검수/발행 전체 큐를 기준으로 계산되며 화면 필터의 영향을 받지 않습니다. 주간 제한 0은 제한 없음입니다.",
                    en: "Recommendations use this policy and the full review queue, independent of UI filters. A weekly cap of 0 means unlimited.",
                  }}
                />
              </p>
              <p className="text-xxs text-secondary-text">
                <Lang
                  text={{
                    ko: "추천 시간은 이 목록 안에서 콘텐츠 주제·키워드별 실측 성과(부족하면 채널 벤치마크)로 결정되며, 검수 목록에 처음 올라온 시점에 고정되어 이후 변경되지 않습니다. 여기서 시간을 빼면 신규 추천에만 반영됩니다.",
                    en: "The recommended hour is chosen within this list by measured performance for the content topic (falling back to channel benchmarks). It is pinned when the job first enters review and never re-computed. Removing an hour here affects new recommendations only.",
                  }}
                />
              </p>
              {Object.entries(settings.marketingCriteria.uploadPolicy).map(([channel, policy]) => (
                <div key={channel} className="flex gap-4 rounded-md bg-muted/20 p-2">
                  <span className="text-xs font-medium sm:flex sm:items-center sm:justify-center sm:w-full sm:max-w-[6rem]">
                    {channel}
                  </span>
                  <div className="flex-1 grid gap-2 sm:grid-cols-4">
                    {(["weekdayDailyCap", "weekendDailyCap", "weeklyCap", "minGapHours"] as const).map((key) => (
                      <label key={key} className="space-y-1 text-xxs text-secondary-text">
                        <span>
                          {lang({
                            ko: {
                              weekdayDailyCap: "평일 일 cap",
                              weekendDailyCap: "주말 일 cap",
                              weeklyCap: "주간 cap",
                              minGapHours: "최소 간격(시)",
                            }[key],
                            en: {
                              weekdayDailyCap: "Weekday cap",
                              weekendDailyCap: "Weekend cap",
                              weeklyCap: "Weekly cap",
                              minGapHours: "Min gap (h)",
                            }[key],
                          })}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          value={policy[key]}
                          onChange={(event) =>
                            setSettings((prev) => ({
                              ...prev,
                              marketingCriteria: {
                                ...prev.marketingCriteria,
                                uploadPolicy: {
                                  ...prev.marketingCriteria.uploadPolicy,
                                  [channel]: {
                                    ...prev.marketingCriteria.uploadPolicy[channel],
                                    [key]: Number(event.target.value),
                                  },
                                },
                              },
                            }))
                          }
                        />
                      </label>
                    ))}
                    <label className="space-y-1 text-xxs text-secondary-text sm:col-span-4">
                      <span>
                        <Lang
                          text={{ ko: "추천 시간(0~23, 쉼표 구분)", en: "Preferred hours (0–23, comma-separated)" }}
                        />
                      </span>
                      <Input
                        value={policy.preferredHoursText}
                        placeholder={lang({ ko: "예: 9, 12, 18", en: "Example: 9, 12, 18" })}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            marketingCriteria: {
                              ...prev.marketingCriteria,
                              uploadPolicy: {
                                ...prev.marketingCriteria.uploadPolicy,
                                [channel]: {
                                  ...prev.marketingCriteria.uploadPolicy[channel],
                                  preferredHoursText: event.target.value,
                                },
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                size="xs"
                onClick={() => void saveMarketingCriteria()}
                disabled={busyKey === "marketing-criteria"}
              >
                <Save className="icon-xxs" />
                <Lang text={{ ko: "마케팅 기준 저장", en: "Save marketing criteria" }} />
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* A. 기본 설정 */}
        <AccordionItem value="keyword-settings" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <Lang text={{ ko: "기본 앵커 설정", en: "Default anchor settings" }} />
          </AccordionTrigger>
          <AccordionContent className="pt-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-secondary-text">
                  <Lang text={{ ko: "기본 앵커 키워드", en: "Default anchor keyword" }} />
                </label>
                <Input
                  value={settings.defaultAnchorKeyword}
                  onChange={(e) => setSettings((prev) => ({ ...prev, defaultAnchorKeyword: e.target.value }))}
                  placeholder={DEFAULT_ANCHOR_KEYWORD}
                />
                <p className="mt-1 text-xxs text-secondary-text">
                  <Lang
                    text={{
                      ko: "변경하면 기존 트렌드 지수와 단절되므로 가급적 고정하세요.",
                      en: "Changing this breaks continuity with previous indices — keep it stable.",
                    }}
                  />
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-secondary-text">
                  <Lang text={{ ko: "비교 기간(일)", en: "Lookback (days)" }} />
                </label>
                <SegmentedControl
                  value={String(settings.defaultLookbackDays)}
                  options={[
                    { value: "30", label: lang({ ko: "30일", en: "30d" }) },
                    { value: "90", label: lang({ ko: "90일", en: "90d" }) },
                  ]}
                  onValueChange={(value) =>
                    setSettings((prev) => ({ ...prev, defaultLookbackDays: Number(value) || 90 }))
                  }
                  appearance="solid"
                  ariaLabel={lang({ ko: "비교 기간", en: "Lookback" })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-secondary-text">
                  <Lang text={{ ko: "집계 단위", en: "Time unit" }} />
                </label>
                <SegmentedControl
                  value={settings.defaultTimeUnit}
                  options={[
                    { value: "month", label: lang({ ko: "월", en: "Month" }) },
                    { value: "week", label: lang({ ko: "주", en: "Week" }) },
                    { value: "date", label: lang({ ko: "일", en: "Day" }) },
                  ]}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      defaultTimeUnit: (value as KeywordSettings["defaultTimeUnit"]) || "month",
                    }))
                  }
                  appearance="solid"
                  ariaLabel={lang({ ko: "집계 단위", en: "Time unit" })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-secondary-text">
                  <Lang text={{ ko: "디바이스", en: "Device" }} />
                </label>
                <SegmentedControl
                  value={settings.defaultDevice}
                  options={[
                    { value: "all", label: lang({ ko: "전체", en: "All" }) },
                    { value: "mo", label: lang({ ko: "모바일", en: "Mobile" }) },
                    { value: "pc", label: "PC" },
                  ]}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      defaultDevice: (value as KeywordSettings["defaultDevice"]) || "all",
                    }))
                  }
                  appearance="solid"
                  ariaLabel={lang({ ko: "디바이스", en: "Device" })}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="outline" size="xs" onClick={() => void saveSettings()} disabled={busyKey === "settings"}>
                <Save className="icon-xxs" />
                <span>{lang({ ko: "설정 저장", en: "Save settings" })}</span>
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* B. 클러스터 관리 */}
        <AccordionItem value="keyword-clusters" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <span className="flex items-center gap-1.5">
              <Lang text={{ ko: "클러스터 관리", en: "Clusters" }} />
              <Badge variant="outline" size="xs">
                {clusters.filter((cluster) => cluster.enabled).length}
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-3">
            <p className="mb-2 text-xxs text-secondary-text">
              <Lang
                text={{
                  ko: "전략 클러스터는 제품 전환과 연결된 캠페인 축, 토픽 클러스터는 매거진/블로그 주제 분류입니다.",
                  en: "Strategy clusters drive product conversion campaigns; topic clusters classify magazine/blog subjects.",
                }}
              />
            </p>
            <ul className="flex flex-col gap-1.5">
              {clusters.map((cluster) => (
                <li
                  key={cluster.clusterKey}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5",
                    !cluster.enabled && "opacity-50",
                  )}
                >
                  <Badge variant={cluster.clusterScope === "strategy" ? "primary" : "secondary"} size="xs">
                    {cluster.clusterScope === "strategy"
                      ? lang({ ko: "전략", en: "Strategy" })
                      : lang({ ko: "토픽", en: "Topic" })}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    <span className="font-medium">{lang(cluster.label)}</span>
                    <span className="ml-1.5 font-mono text-xxs text-muted-text">{cluster.clusterKey}</span>
                    {cluster.status === "deprecated" ? (
                      <Badge variant="outline" size="xs" className="ml-1.5">
                        deprecated
                      </Badge>
                    ) : null}
                  </span>
                  <Switch
                    checked={cluster.enabled}
                    onCheckedChange={(checked) => void toggleCluster(cluster, checked)}
                    aria-label={lang({ ko: "클러스터 사용", en: "Enable cluster" })}
                  />
                  <Button variant="blank" size="xs" onClick={() => void removeCluster(cluster)}>
                    <Trash2 className="icon-xxs text-red-400" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-md border border-dashed border-slate-200 p-2.5 sm:grid-cols-4">
              <Input
                value={clusterDraft.clusterKey}
                onChange={(e) => setClusterDraft((prev) => ({ ...prev, clusterKey: e.target.value }))}
                placeholder={lang({ ko: "key (영문 slug)", en: "key (ascii slug)" })}
              />
              <Input
                value={clusterDraft.labelKo}
                onChange={(e) => setClusterDraft((prev) => ({ ...prev, labelKo: e.target.value }))}
                placeholder={lang({ ko: "라벨(한글)", en: "Label (ko)" })}
              />
              <SegmentedControl
                value={clusterDraft.clusterScope}
                options={[
                  { value: "strategy", label: lang({ ko: "전략", en: "Strategy" }) },
                  { value: "topic", label: lang({ ko: "토픽", en: "Topic" }) },
                ]}
                onValueChange={(value) =>
                  setClusterDraft((prev) => ({ ...prev, clusterScope: value === "topic" ? "topic" : "strategy" }))
                }
                appearance="solid"
                ariaLabel={lang({ ko: "클러스터 구분", en: "Cluster scope" })}
              />
              <Button
                variant="outline"
                size="xs"
                onClick={() => void saveCluster()}
                disabled={busyKey === "cluster" || !clusterDraft.clusterKey.trim()}
              >
                <Plus className="icon-xxs" />
                <span>{lang({ ko: "클러스터 추가", en: "Add cluster" })}</span>
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* C. 키워드 프로필 */}
        <AccordionItem value="keyword-profiles" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <span className="flex items-center gap-1.5">
              <Lang text={{ ko: "키워드 프로필", en: "Keyword profiles" }} />
              <Badge variant="outline" size="xs">
                {profiles.filter((profile) => profile.enabled).length}
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-3">
            <ul className="flex flex-col gap-1.5">
              {profiles.map((profile) => (
                <li
                  key={profile.profileKey}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5",
                    !profile.enabled && "opacity-50",
                  )}
                >
                  <Badge variant="secondary" size="xs" className="shrink-0 font-mono">
                    {profile.clusterKey}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    <span className="font-medium">{profile.name}</span>
                    {profile.anchorKeyword ? (
                      <span className="ml-1.5 text-xxs text-muted-text">
                        {lang({ ko: "앵커", en: "anchor" })}: {profile.anchorKeyword}
                      </span>
                    ) : null}
                    {profile.selectedKeyword ? (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-xxs text-amber-600">
                        <Star className="icon-xxs" />
                        {profile.selectedKeyword}
                      </span>
                    ) : null}
                  </span>
                  <Button variant="outline" size="xs" onClick={() => startEditProfile(profile)}>
                    {lang({ ko: "편집", en: "Edit" })}
                  </Button>
                  <Button variant="blank" size="xs" onClick={() => void removeProfile(profile)}>
                    <Trash2 className="icon-xxs text-red-400" />
                  </Button>
                </li>
              ))}
              {profiles.length === 0 ? (
                <li className="rounded-md border border-dashed border-slate-200 px-2.5 py-3 text-center text-xs text-secondary-text">
                  <Lang
                    text={{ ko: "아직 프로필이 없습니다. 아래에서 추가하세요.", en: "No profiles yet. Add one below." }}
                  />
                </li>
              ) : null}
            </ul>

            <div className="mt-3 flex flex-col gap-2 rounded-md border border-dashed border-slate-200 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {editingProfileKey ? (
                    <Lang
                      text={{ ko: `프로필 편집: ${editingProfileKey}`, en: `Edit profile: ${editingProfileKey}` }}
                    />
                  ) : (
                    <Lang text={{ ko: "프로필 추가", en: "Add profile" }} />
                  )}
                </span>
                {editingProfileKey ? (
                  <Button variant="blank" size="xs" onClick={resetProfileDraft}>
                    {lang({ ko: "새 프로필로 전환", en: "Switch to new" })}
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  value={profileDraft.profileKey}
                  disabled={Boolean(editingProfileKey)}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, profileKey: e.target.value }))}
                  placeholder={lang({ ko: "profileKey (영문 slug)", en: "profileKey (ascii slug)" })}
                />
                <Input
                  value={profileDraft.name}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={lang({ ko: "프로필 이름", en: "Profile name" })}
                />
                <Select
                  value={profileDraft.clusterKey}
                  onValueChange={(value) => setProfileDraft((prev) => ({ ...prev, clusterKey: String(value) }))}
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder={lang({ ko: "클러스터 선택", en: "Select cluster" })} />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledClusters.map((cluster) => (
                      <SelectItem key={cluster.clusterKey} value={cluster.clusterKey}>
                        [
                        {cluster.clusterScope === "strategy"
                          ? lang({ ko: "전략", en: "Strategy" })
                          : lang({ ko: "토픽", en: "Topic" })}
                        ] {lang(cluster.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div>
                  <Input
                    value={profileDraft.anchorKeyword}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, anchorKeyword: e.target.value }))}
                    placeholder={lang({
                      ko: "앵커 override (비우면 기본 앵커)",
                      en: "Anchor override (blank = default)",
                    })}
                  />
                  {editingProfileKey && profileDraft.anchorKeyword.trim() !== editingOriginalAnchor ? (
                    <p className="mt-0.5 text-xxs text-red-500">
                      <Lang
                        text={{
                          ko: "앵커 변경 시 기존 지수와 단절됩니다.",
                          en: "Changing the anchor breaks continuity with previous indices.",
                        }}
                      />
                    </p>
                  ) : null}
                </div>
                <Textarea
                  value={profileDraft.seedKeywordsText}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, seedKeywordsText: e.target.value }))}
                  placeholder={lang({
                    ko: "seed 키워드 (줄바꿈/쉼표 구분, 최대 20)",
                    en: "Seed keywords (newline/comma, max 20)",
                  })}
                  rows={3}
                />
                <Textarea
                  value={profileDraft.negativeKeywordsText}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, negativeKeywordsText: e.target.value }))}
                  placeholder={lang({ ko: "제외 키워드 (선택)", en: "Negative keywords (optional)" })}
                  rows={3}
                />
                <Input
                  value={profileDraft.campaignId}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, campaignId: e.target.value }))}
                  placeholder={lang({ ko: "campaignId (선택)", en: "campaignId (optional)" })}
                />
                <Input
                  value={profileDraft.note}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder={lang({ ko: "메모 (선택)", en: "Note (optional)" })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-secondary-text">
                  <Switch
                    checked={profileDraft.enabled}
                    onCheckedChange={(checked) => setProfileDraft((prev) => ({ ...prev, enabled: checked }))}
                    aria-label={lang({ ko: "프로필 사용", en: "Enable profile" })}
                  />
                  <Lang text={{ ko: "사용", en: "Enabled" }} />
                </label>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => void saveProfile()}
                  disabled={busyKey === "profile" || !profileDraft.profileKey.trim()}
                >
                  <Save className="icon-xxs" />
                  <span>{lang({ ko: "프로필 저장", en: "Save profile" })}</span>
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* D. 데이터랩 비교 실행 */}
        <AccordionItem value="keyword-compare" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <Lang text={{ ko: "데이터랩 비교 실행", en: "Datalab comparison" }} />
          </AccordionTrigger>
          <AccordionContent className="pt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={compareProfileKey}
                onValueChange={(value) => {
                  setCompareProfileKey(String(value));
                  setTrendRows([]);
                  setTrendContext(null);
                }}
              >
                <SelectTrigger size="sm" className="sm:w-64">
                  <SelectValue placeholder={lang({ ko: "비교할 프로필 선택", en: "Select profile to compare" })} />
                </SelectTrigger>
                <SelectContent>
                  {profiles
                    .filter((profile) => profile.enabled)
                    .map((profile) => (
                      <SelectItem key={profile.profileKey} value={profile.profileKey}>
                        [{profile.clusterKey}] {profile.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => void runTrendCompare(false)}
                  disabled={!compareProfile || busyKey.startsWith("trend")}
                >
                  <LineChart className="icon-xxs" />
                  <span>{lang({ ko: "비교 실행 (캐시 우선)", en: "Compare (cache first)" })}</span>
                </Button>
                <Button
                  variant="blank"
                  size="xs"
                  onClick={() => void runTrendCompare(true)}
                  disabled={!compareProfile || busyKey.startsWith("trend")}
                  className="inline-flex items-center gap-1.5 text-secondary-text"
                >
                  <RefreshCw className={cn("icon-xxs", busyKey === "trend:force" && "animate-spin")} />
                  <span>{lang({ ko: "강제 재수집", en: "Force refresh" })}</span>
                </Button>
              </div>
            </div>
            {compareProfile ? (
              <p className="mt-1.5 text-xxs text-secondary-text">
                <Lang text={{ ko: "앵커", en: "Anchor" }} />: <span className="font-medium">{compareAnchor}</span>
                {" · "}
                <Lang
                  text={{
                    ko: `seed 상위 ${MAX_COMPARE_CANDIDATES}개까지 1회에 비교합니다 (데이터랩 5그룹 제한).`,
                    en: `Compares up to ${MAX_COMPARE_CANDIDATES} seed keywords per run (Datalab 5-group limit).`,
                  }}
                />
              </p>
            ) : null}

            {trendContext && trendRows.length > 0 ? (
              <div className="mt-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xxs text-secondary-text">
                  <Badge variant="primary" size="xs">
                    {lang({ ko: "앵커", en: "Anchor" })}: {trendContext.anchorKeyword}
                  </Badge>
                  <span>
                    {trendContext.startDate} ~ {trendContext.endDate} · {trendContext.timeUnit}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-xxs text-muted-text">
                        <th className="py-1.5 pr-2 font-medium">{lang({ ko: "키워드", en: "Keyword" })}</th>
                        <th className="py-1.5 pr-2 font-medium">anchorIndex</th>
                        <th className="py-1.5 pr-2 font-medium">{lang({ ko: "모멘텀", en: "Momentum" })}</th>
                        <th className="py-1.5 pr-2 font-medium">{lang({ ko: "시즌성", en: "Seasonality" })}</th>
                        <th className="py-1.5 pr-2 font-medium">{lang({ ko: "출처", en: "Source" })}</th>
                        <th className="py-1.5 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {trendRows.map((row) => (
                        <tr key={row.keyword} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2 font-medium">{row.keyword}</td>
                          <td className="py-1.5 pr-2 font-mono">{Number(row.anchorIndex ?? 0).toFixed(1)}</td>
                          <td
                            className={cn(
                              "py-1.5 pr-2 font-mono",
                              Number(row.momentum) > 0
                                ? "text-emerald-600"
                                : Number(row.momentum) < 0
                                  ? "text-red-500"
                                  : "",
                            )}
                          >
                            {Number(row.momentum ?? 0) > 0 ? "+" : ""}
                            {Number(row.momentum ?? 0).toFixed(1)}
                          </td>
                          <td className="py-1.5 pr-2">{seasonalityLabel(String(row.seasonality ?? ""))}</td>
                          <td className="py-1.5 pr-2">
                            <Badge variant={row.fromCache ? "secondary" : "primary"} size="xs">
                              {row.fromCache ? lang({ ko: "캐시", en: "Cache" }) : lang({ ko: "신규", en: "Fresh" })}
                            </Badge>
                          </td>
                          <td className="py-1.5 text-right">
                            <Button
                              variant={selectedKeywordDraft === row.keyword ? "primary" : "outline"}
                              size="xs"
                              onClick={() => setSelectedKeywordDraft(row.keyword)}
                            >
                              <Star className="icon-xxs" />
                              <span>{lang({ ko: "대표", en: "Primary" })}</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={selectedReasonDraft}
                    onChange={(e) => setSelectedReasonDraft(e.target.value)}
                    placeholder={lang({ ko: "선정 사유 (예: 상승 추세 + 전환 직결)", en: "Selection reason" })}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void saveSelectedKeyword()}
                    disabled={busyKey === "selected" || !selectedKeywordDraft.trim()}
                  >
                    <Save className="icon-xxs" />
                    <span>
                      {lang({ ko: "대표 키워드 저장", en: "Save primary keyword" })}
                      {selectedKeywordDraft ? `: ${selectedKeywordDraft}` : ""}
                    </span>
                  </Button>
                </div>
              </div>
            ) : null}
          </AccordionContent>
        </AccordionItem>

        {/* E. 활용 이력 (요약) */}
        <AccordionItem value="keyword-history" className="rounded-lg border border-slate-200 bg-white px-3">
          <AccordionTrigger border className="text-sm font-semibold text-slate-900 hover:no-underline">
            <Lang text={{ ko: "활용 이력", en: "Usage history" }} />
          </AccordionTrigger>
          <AccordionContent className="pt-3">
            <ul className="flex flex-col gap-1.5">
              {profiles
                .filter((profile) => profile.selectedKeyword)
                .map((profile) => (
                  <li
                    key={profile.profileKey}
                    className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium">{profile.name}</span>
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-600">
                      <Star className="icon-xxs" />
                      {profile.selectedKeyword}
                    </span>
                    {profile.selectedReason ? (
                      <span className="ml-1.5 text-xxs text-secondary-text">— {profile.selectedReason}</span>
                    ) : null}
                    {profile.anchorChangedAt ? (
                      <span className="ml-1.5 text-xxs text-muted-text">
                        ({lang({ ko: "앵커 변경", en: "anchor changed" })}:{" "}
                        {String(profile.anchorChangedAt).slice(0, 10)})
                      </span>
                    ) : null}
                  </li>
                ))}
              {profiles.every((profile) => !profile.selectedKeyword) ? (
                <li className="rounded-md border border-dashed border-slate-200 px-2.5 py-3 text-center text-xs text-secondary-text">
                  <Lang
                    text={{
                      ko: "확정된 대표 키워드가 아직 없습니다. 비교 실행 후 대표 키워드를 저장하면 여기에 누적됩니다.",
                      en: "No primary keywords confirmed yet. Run a comparison and save one to see it here.",
                    }}
                  />
                </li>
              ) : null}
            </ul>
            <p className="mt-2 text-xxs text-muted-text">
              <Lang
                text={{
                  ko: "콘텐츠별 상세 이력(job asset 연동)은 에이전트 파이프라인의 validation_report에 기록됩니다.",
                  en: "Per-content history (job assets) is recorded in the agent pipeline's validation_report.",
                }}
              />
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

export default NaverKeywordStrategyPanel;
