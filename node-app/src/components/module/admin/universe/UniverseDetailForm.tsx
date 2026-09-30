"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSystemPersonas } from "libs/api/universe";
import { Button, Input, Textarea, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsList, TabsTrigger, TabsContent, dialog } from "@amu-labs/ui";
import type { IUniverse, ICommerceSettings, IGameSettings, IUniverseMetadata } from "types/game";
import type { SystemPersonaUsageType } from "types/ai";
import { normalizeSystemPersonaUsageType } from "types/ai";
import { Plus, Save, Settings, X } from "lucide-react";
import { cn, pickArray, pickString, toUnknownRecord } from "utils/common";
import { THEME_OVERRIDE_CLASS } from "utils/theme";
import { useUserData } from "hooks/auth";
import { StoreKnowledgeEditor } from "../StoreKnowledgeEditor";
import { GAME_CONSTANTS as GC } from "consts/game";
import { OPENAI_DEFAULT_TTS_SPEED } from "consts/ai";
import { CredentialPanel, MarketingCredentialPanelGroup, MarketingOperationsPanel } from "../third-party";
import { Lang } from "components/module/i18n";

type DetailValue = {
  settings: { commerce?: ICommerceSettings; game?: IGameSettings };
  metadata: IUniverseMetadata;
};

export function UniverseDetailForm({
  universes,
  selectedUniverse,
  value,
  onChange,
  onSubmit, // 상세 데이터 저장 핸들러
  onStageSave, // 스테이지 저장 핸들러
  onNaverCredentialStatusChange,
}: {
  universes: IUniverse[];
  selectedUniverse: string;
  value: DetailValue;
  onChange: (next: DetailValue) => void;
  onSubmit: (next: DetailValue) => Promise<void>;
  onStageSave: (nextStages: IUniverse["stages"]) => Promise<void>;
  onNaverCredentialStatusChange?: (status: { ready: boolean; storeId?: string; storefrontOpen?: boolean }) => void;
}) {
  const { isAdministrator } = useUserData();

  //Tab 컨트롤
  const [activeTab, setActiveTab] = useState<"meta" | "commerce" | "stages" | "game" | "marketing">("meta");
  const [marketingCredentialSettingsOpen, setMarketingCredentialSettingsOpen] = useState(false);
  const naverCredentialStatusRef = useRef<{ ready: boolean; storeId?: string; storefrontOpen?: boolean }>({
    ready: false,
    storeId: "",
  });

  const updateNaverCredentialStatus = (
    patch: Partial<{ ready: boolean; storeId?: string; storefrontOpen?: boolean }>,
  ) => {
    const next = { ...naverCredentialStatusRef.current, ...patch };
    naverCredentialStatusRef.current = next;
    onNaverCredentialStatusChange?.(next);
  };

  // 공용 업데이트 유틸
  const updateMetadata = (patch: Partial<IUniverseMetadata>) =>
    onChange({ ...value, metadata: { ...(value.metadata || {}), ...patch } });

  const updateVoiceConfig = (patch: Partial<NonNullable<IUniverseMetadata["voiceConfig"]>>) =>
    updateMetadata({
      voiceConfig: {
        ...(value.metadata?.voiceConfig || {}),
        ...patch,
      },
    });

  const updateCommerce = (patch: Partial<ICommerceSettings>) =>
    onChange({
      ...value,
      settings: { ...value.settings, commerce: { ...(value.settings.commerce || {}), ...patch } },
    });

  const updateGame = (patch: Partial<IGameSettings>) =>
    onChange({ ...value, settings: { ...value.settings, game: { ...(value.settings.game || {}), ...patch } } });

  // 빈 문자열/NaN 방지
  const toNum = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const ensureBlockSize = (): { width: number; height: number } => {
    const cur = value.settings?.commerce?.blockSize;
    const w = typeof cur?.width === "number" ? cur.width : 120;
    const h = typeof cur?.height === "number" ? cur.height : 120;
    return { width: w, height: h };
  };

  // 게임 맵 사이즈 보정: 값이 없거나 잘못된 경우 안전한 기본값 제공
  const ensureMapSize = (): { width: number; height: number } => {
    const cur = value.settings?.game?.mapSize;
    const w = typeof cur?.width === "number" ? cur.width : 1600;
    const h = typeof cur?.height === "number" ? cur.height : 1200;
    return { width: w, height: h };
  };

  // 스폰 포인트 보정: 값이 없거나 잘못된 경우 안전한 기본값 제공
  const ensureSpawn = (): { x: number; y: number } => {
    const cur = value.settings?.game?.spawnPoint;
    const x = typeof cur?.x === "number" ? cur.x : 100;
    const y = typeof cur?.y === "number" ? cur.y : 100;
    return { x, y };
  };

  type CommercePersonaOption = {
    key: string;
    title: string;
    forUniverses?: SystemPersonaUsageType;
  };

  // DB에서 커머스 전용 페르소나 타입 가져오기
  const {
    data: personaOptions,
    isLoading: isPersonaLoading,
    error: personaError,
  } = useQuery({
    queryKey: ["system-persona-options", "game"],
    queryFn: async () => {
      const raw = pickArray(await listSystemPersonas({ enabled: true }));
      const normalized: CommercePersonaOption[] = raw
        .map((it) => {
          const rec = toUnknownRecord(it);
          const key = pickString(rec.key);
          return {
            key,
            title: pickString(rec.title) || key,
            forUniverses: normalizeSystemPersonaUsageType(
              typeof rec.forUniverses === "string" ? rec.forUniverses : null,
            ),
          };
        })
        .filter((o) => o.key && (o.forUniverses === "game" || o.forUniverses === "all"));

      // 타이틀 기준 정렬
      normalized.sort((a, b) => (a.title || a.key).localeCompare(b.title || b.key));
      return normalized;
    },
    staleTime: 5 * 60 * 1000,
    retry: 0, // 폴백 없이 실패 시 바로 에러
  });
  const isPersonaEmpty = !isPersonaLoading && !personaError && (personaOptions?.length ?? 0) === 0;

  // 현재 저장된 DB 키
  const selectedPersonaKey: string = (value.metadata?.defaultSalesPersonaType as string) || "";
  const safePersonaValue = useMemo(() => {
    if (!selectedPersonaKey) return "";
    return personaOptions?.some((o) => o.key === selectedPersonaKey) ? selectedPersonaKey : "";
  }, [personaOptions, selectedPersonaKey]);

  // Stages 라이트 에디터
  const currentUniverse = useMemo(
    () => universes.find((u) => u.id === selectedUniverse) || null,
    [universes, selectedUniverse],
  );
  const [stageLocal, setStageLocal] = useState(
    currentUniverse?.stages && currentUniverse.stages.length > 0
      ? currentUniverse.stages
      : [{ stageId: GC.FALLBACK.STAGE_ID, stageName: GC.FALLBACK.STAGE_NAME }],
  );

  const addStage = () => setStageLocal((prev) => [...prev, { stageId: "", stageName: "" }]);
  const removeStage = (idx: number) => {
    if ((stageLocal?.length || 0) <= 1) {
      void dialog.alert("최소 1개의 스테이지는 필요합니다.");
      return;
    }
    setStageLocal((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateStage = (idx: number, key: "stageId" | "stageName", v: string) =>
    setStageLocal((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: v } : s)));

  const handleStageSave = async () => {
    await onStageSave(stageLocal);
  };

  // 유니버스가 바뀔 때 탭을 초기화 (메타데이터로) — setState는 동기 트래킹으로
  const [trackedUniverseForTab, setTrackedUniverseForTab] = useState(selectedUniverse);
  if (trackedUniverseForTab !== selectedUniverse) {
    setTrackedUniverseForTab(selectedUniverse);
    setActiveTab("meta");
  }

  // ref 갱신은 render purity 위반이라 effect 분리 (setState 없음 → set-state-in-effect 미해당)
  useEffect(() => {
    naverCredentialStatusRef.current = { ready: false, storeId: "" };
  }, [selectedUniverse]);

  // 스테이지 로컬 상태 동기화 — effect 회피, 동기 트래킹
  const stagesRef = currentUniverse?.stages;
  const [trackedStagesRef, setTrackedStagesRef] = useState(stagesRef);
  const [trackedUniverseForStages, setTrackedUniverseForStages] = useState(selectedUniverse);
  if (trackedStagesRef !== stagesRef || trackedUniverseForStages !== selectedUniverse) {
    setTrackedStagesRef(stagesRef);
    setTrackedUniverseForStages(selectedUniverse);
    setStageLocal(
      stagesRef && stagesRef.length > 0
        ? stagesRef
        : [{ stageId: GC.FALLBACK.STAGE_ID, stageName: GC.FALLBACK.STAGE_NAME }],
    );
  }

  // 어드민이 아닐 때 강제 변경 (안전 가드) — effect 회피, 동기 트래킹
  const [trackedAdmin, setTrackedAdmin] = useState(isAdministrator);
  const [trackedActiveTabForAdmin, setTrackedActiveTabForAdmin] = useState(activeTab);
  if (trackedAdmin !== isAdministrator || trackedActiveTabForAdmin !== activeTab) {
    setTrackedAdmin(isAdministrator);
    setTrackedActiveTabForAdmin(activeTab);
    if (!isAdministrator && activeTab === "game") {
      setActiveTab("meta");
    }
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      className={cn("space-y-6", THEME_OVERRIDE_CLASS)}
    >
      {/* 탭 바 */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start bg-transparent [&>button]:whitespace-nowrap [&>button]:px-4 md:[&>button]:px-5">
          <TabsTrigger value="meta">메타데이터</TabsTrigger>
          <TabsTrigger value="commerce">커머스</TabsTrigger>
          {isAdministrator && <TabsTrigger value="game">게임</TabsTrigger>}
          <TabsTrigger value="stages">스테이지</TabsTrigger>
          <TabsTrigger value="marketing">마케팅 운영</TabsTrigger>
        </TabsList>
      </div>

      {/* 1) Metadata */}
      <TabsContent value="meta" className="space-y-6">
        <section>
          <StoreKnowledgeEditor
            value={value?.metadata?.storeKnowledge}
            onChange={(next) =>
              onChange({
                ...value,
                metadata: {
                  ...(value?.metadata || {}),
                  storeKnowledge: next,
                },
              })
            }
          />
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 text-primary-text">
          <h3 className="font-semibold mb-3">메타데이터</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">brandKnowledgeKey</label>
              <ul className="text-xs text-gray-600 my-2">
                <li>
                  각 브랜드마다 고유한 상품 지식, 브랜드 스토리, 특성 등을 구분하고 브랜드별로 차별화된 응답을 제공할 때
                  필요한 지식을 선택적으로 활용하기 위한 키로 멀티 브랜드 환경에서 각 브랜드의 컨텍스트에 맞는 AI
                  페르소나를 구현
                </li>
                <li>브랜드별 지식 구분: promptStore에서 각 브랜드의 고유한 지식 데이터를 식별하는 브랜드 지식 키 </li>
                <li>컨텍스트 매핑: 특정 유니버스나 브랜드에 맞는 AI 응답을 위한 지식 참조 키</li>
                <li>지식 관리: 브랜드별로 분리된 지식 데이터베이스 관리를 위한 식별자</li>
              </ul>
              <Input
                value={value.metadata?.brandKnowledgeKey || ""}
                onChange={(e) => updateMetadata({ brandKnowledgeKey: e.target.value })}
                placeholder="예: brand:amustore"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">defaultSalesPersonaType</label>

              <ul className="text-xs text-gray-600 my-2">
                <li>
                  이 목록은 **DB에서 관리되는 시스템 페르소나** 중 All 또는 All My Universe 적용 대상을 기준으로
                  표시됩니다.
                </li>
                <li>유니버스가 커머스 타입일 때, 선택한 타입이 스토어 응대 톤/전략에 우선 적용됩니다.</li>
                <li>목록은 관리자 페이지/설정(DB)에서 자유롭게 추가/변경할 수 있습니다.</li>
              </ul>

              <Select
                value={safePersonaValue}
                onValueChange={(v) => updateMetadata({ defaultSalesPersonaType: v as unknown as string })}
                disabled={isPersonaLoading || !personaOptions || personaOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isPersonaLoading
                        ? "불러오는 중..."
                        : personaError
                          ? "로드 실패"
                          : isPersonaEmpty
                            ? "데이터 없음"
                            : "선택"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {personaOptions?.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.title || opt.key}
                    </SelectItem>
                  )) ?? null}
                </SelectContent>
              </Select>

              {/* DB 실패/빈 목록일 때, 간단 메시지 + 저장된 값만 읽기 표시 */}
              {isPersonaEmpty && (
                <div className="mt-2 rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">데이터 없음</div>
              )}
              {personaError && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  로드 실패: 관리자에게 문의하세요.
                </div>
              )}
              {(!personaOptions || personaOptions.length === 0) && selectedPersonaKey && (
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">현재 저장된 값</div>
                  <Input value={selectedPersonaKey} readOnly />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={Boolean(value.metadata?.chatEnabled ?? true)}
                onCheckedChange={(c) => updateMetadata({ chatEnabled: c })}
                id="md-chat"
              />
              <label htmlFor="md-chat">채팅 활성화</label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={Boolean(value.metadata?.voiceEnabled)}
                onCheckedChange={(c) => updateMetadata({ voiceEnabled: c })}
                id="md-voice"
              />
              <label htmlFor="md-voice">보이스 활성화</label>
            </div>

            <div className="rounded-xl border border-dashed border-border bg-background/70 p-4 md:col-span-2">
              <div className="mb-3">
                <p className="text-sm font-semibold text-gray-900">voiceConfig</p>
                <p className="mt-1 text-xs leading-5 text-gray-600">
                  1차 OpenAI 음성 MVP 운영값입니다. 비워두면 서버 기본값을 사용합니다.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm mb-1">defaultLocale</label>
                  <Input
                    value={value.metadata?.voiceConfig?.defaultLocale || ""}
                    onChange={(e) => updateVoiceConfig({ defaultLocale: e.target.value })}
                    placeholder="ko"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">defaultTtsModel</label>
                  <Input
                    value={value.metadata?.voiceConfig?.defaultTtsModel || ""}
                    onChange={(e) => updateVoiceConfig({ defaultTtsModel: e.target.value })}
                    placeholder="gpt-4o-mini-tts"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">defaultTtsSpeed</label>
                  <Input
                    type="number"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={value.metadata?.voiceConfig?.defaultTtsSpeed ?? OPENAI_DEFAULT_TTS_SPEED}
                    onChange={(e) =>
                      updateVoiceConfig({
                        defaultTtsSpeed: Math.min(4, Math.max(0.25, toNum(e.target.value, OPENAI_DEFAULT_TTS_SPEED))),
                      })
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">defaultSttModel</label>
                  <Input
                    value={value.metadata?.voiceConfig?.defaultSttModel || ""}
                    onChange={(e) => updateVoiceConfig({ defaultSttModel: e.target.value })}
                    placeholder="gpt-4o-mini-transcribe"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">maxInputSeconds</label>
                  <Input
                    type="number"
                    value={value.metadata?.voiceConfig?.maxInputSeconds ?? 60}
                    onChange={(e) => updateVoiceConfig({ maxInputSeconds: Math.max(5, toNum(e.target.value, 60)) })}
                  />
                </div>

                <div className="flex items-center gap-2 md:col-span-2">
                  <Switch
                    checked={Boolean(value.metadata?.voiceConfig?.autoplayAssistant ?? true)}
                    onCheckedChange={(checked) => updateVoiceConfig({ autoplayAssistant: checked })}
                    id="md-voice-autoplay"
                  />
                  <label htmlFor="md-voice-autoplay">assistant 음성 자동 재생</label>
                </div>

                <div className="flex items-center gap-2 md:col-span-2">
                  <Switch
                    checked={Boolean(value.metadata?.voiceConfig?.voiceSyncDisplay ?? true)}
                    onCheckedChange={(checked) => updateVoiceConfig({ voiceSyncDisplay: checked })}
                    id="md-voice-sync-display"
                  />
                  <label htmlFor="md-voice-sync-display">음성 준비 후 assistant 텍스트 표시</label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={Boolean(value.metadata?.multilingualSupport ?? true)}
                onCheckedChange={(c) => updateMetadata({ multilingualSupport: c })}
                id="md-i18n"
              />
              <label htmlFor="md-i18n">다국어 지원</label>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm mb-1">customPrompts (줄바꿈으로 분리)</label>
              <Textarea
                rows={3}
                value={(value.metadata?.customPrompts || []).join("\n")}
                onChange={(e) => updateMetadata({ customPrompts: e.target.value.split("\n").filter(Boolean) })}
                placeholder="각 줄에 하나씩 입력"
              />
            </div>
          </div>
        </section>
      </TabsContent>

      {/* 2) Settings - Commerce */}
      <TabsContent value="commerce" className="space-y-6">
        {currentUniverse?.type === "commerce" ? (
          <section className="rounded-xl border border-border bg-surface p-4 text-primary-text">
            <div className="mb-4">
              <h3 className="font-semibold">
                <Lang text={{ ko: "네이버 스마트스토어 연동", en: "Naver Smart Store Integration" }} />
              </h3>
              <p className="mt-1 text-sm leading-6 text-secondary-text">
                <Lang
                  text={{
                    ko: "Application ID, Secret SALT, 스토어 ID를 저장하면 스마트스토어 운영 버튼과 스토어 링크가 활성화됩니다.",
                    en: "Save the Application ID, Secret SALT, and store ID to enable Smart Store operations and links.",
                  }}
                />
              </p>
            </div>
            <CredentialPanel
              universeId={selectedUniverse}
              provider="naver"
              onReadyChange={(ready) => updateNaverCredentialStatus({ ready })}
              onExtrasChange={(extras) =>
                updateNaverCredentialStatus({ storeId: String(extras?.storeId || "").trim() })
              }
            />
          </section>
        ) : null}

        {currentUniverse?.typeSpecific?.showroom?.enabled ? (
          <section className="rounded-xl border border-border bg-surface p-4 text-primary-text">
            <h3 className="font-semibold mb-3">
              <Lang text={{ ko: "쇼룸 설정", en: "Showroom Settings" }} />
            </h3>
            <p className="mb-4 text-sm leading-6 text-secondary-text">
              <Lang
                text={{
                  ko: "통합 어드민에서 쇼룸 공개가 켜진 유니버스에만 표시되는 레거시 플레이 쇼룸 배치 설정입니다.",
                  en: "Legacy play-showroom placement settings shown only when showroom publishing is enabled in the unified admin.",
                }}
              />
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm mb-1">blockSize.width</label>
                <Input
                  type="number"
                  value={ensureBlockSize().width}
                  onChange={(e) => {
                    const curr = ensureBlockSize();
                    updateCommerce({ blockSize: { width: toNum(e.target.value, curr.width), height: curr.height } });
                  }}
                />
              </div>

              <div>
                <label className="block text-sm mb-1">blockSize.height</label>
                <Input
                  type="number"
                  value={ensureBlockSize().height}
                  onChange={(e) => {
                    const curr = ensureBlockSize();
                    updateCommerce({ blockSize: { width: curr.width, height: toNum(e.target.value, curr.height) } });
                  }}
                />
              </div>
            </div>
          </section>
        ) : null}
      </TabsContent>

      {/* 3) Settings - Game (필요 시 간단 입력 + JSON 보관) */}
      {isAdministrator && (
        <TabsContent value="game" className="space-y-6">
          <section className="rounded-xl border border-border bg-surface p-4 text-primary-text">
            <h3 className="font-semibold mb-3">게임 설정</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm mb-1">mapSize.width</label>
                <ul className="text-xs text-gray-600 my-2">
                  <li>캐릭터 이동 가능 영역 제한</li>
                  <li>카메라 뷰포트 범위 설정</li>
                </ul>
                <Input
                  type="number"
                  value={ensureMapSize().width}
                  onChange={(e) => {
                    const curr = ensureMapSize();
                    updateGame({ mapSize: { width: toNum(e.target.value, curr.width), height: curr.height } });
                  }}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">mapSize.height</label>
                <ul className="text-xs text-gray-600 my-2">
                  <li>캐릭터 이동 가능 영역 제한</li>
                  <li>카메라 뷰포트 범위 설정</li>
                </ul>
                <Input
                  type="number"
                  value={ensureMapSize().height}
                  onChange={(e) => {
                    const curr = ensureMapSize();
                    updateGame({ mapSize: { width: curr.width, height: toNum(e.target.value, curr.height) } });
                  }}
                />
              </div>

              <div>
                <label className="block text-sm mb-1">spawnPoint.x</label>
                <ul className="text-xs text-gray-600 my-2">
                  <li>플레이어가 게임에 처음 입장할 때의 시작 위치</li>
                </ul>
                <Input
                  type="number"
                  value={ensureSpawn().x}
                  onChange={(e) => {
                    const curr = ensureSpawn();
                    updateGame({ spawnPoint: { x: toNum(e.target.value, curr.x), y: curr.y } });
                  }}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">spawnPoint.y</label>
                <ul className="text-xs text-gray-600 my-2">
                  <li>플레이어가 게임에 처음 입장할 때의 시작 위치</li>
                </ul>
                <Input
                  type="number"
                  value={ensureSpawn().y}
                  onChange={(e) => {
                    const curr = ensureSpawn();
                    updateGame({ spawnPoint: { x: curr.x, y: toNum(e.target.value, curr.y) } });
                  }}
                />
              </div>

              <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">obstacles (JSON)</label>
                  <ul className="text-xs text-gray-600 my-2">
                    <li>게임 내 충돌 가능한 오브젝트들의 배치 정보</li>
                  </ul>
                  <Textarea
                    rows={4}
                    value={JSON.stringify(value.settings?.game?.obstacles || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value || "{}");
                        updateGame({ obstacles: parsed });
                      } catch {
                        // 파싱 실패 시 무시 (입력 도중 에러로 값이 날아가지 않도록)
                      }
                    }}
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">roads (JSON)</label>
                  <ul className="text-xs text-gray-600 my-2">
                    <li>게임 내 도로 네트워크와 통행 경로 정보</li>
                  </ul>
                  <Textarea
                    rows={4}
                    value={JSON.stringify(value.settings?.game?.roads || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value || "{}");
                        updateGame({ roads: parsed });
                      } catch {}
                    }}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </section>
        </TabsContent>
      )}

      {/* 5) Stages (라이트 편집) */}
      <TabsContent value="stages" className="space-y-6">
        <section className="rounded-xl border border-border bg-surface p-4 text-primary-text">
          <h3 className="font-semibold mb-3">스테이지</h3>
          <div className="space-y-3">
            {stageLocal.map((s, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input
                  placeholder="stageId (예: modern, alien)"
                  value={s.stageId}
                  onChange={(e) => updateStage(idx, "stageId", e.target.value)}
                />
                <Input
                  placeholder="stageName (예: mono-city, blue-universe)"
                  value={s.stageName}
                  onChange={(e) => updateStage(idx, "stageName", e.target.value)}
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => removeStage(idx)}>
                    <X size={14} /> 제거
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <Button variant="outline" onClick={addStage}>
                <Plus size={14} /> 추가
              </Button>
              <Button onClick={handleStageSave}>
                <Save size={14} /> 스테이지 저장
              </Button>
            </div>
            <p className="text-xs text-gray-500">※ 스테이지 저장은 **유니버스 데이터**에 반영됩니다.</p>
          </div>
        </section>
      </TabsContent>

      {/* 6) Marketing Operations */}
      <TabsContent value="marketing" className="space-y-6">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-primary-text md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="font-semibold">
              <Lang text={{ ko: "마케팅 운영", en: "Marketing Operations" }} />
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              <Lang
                text={{
                  ko: "현재 유니버스의 채널 자격 증명, 콘텐츠 queue 등록, worker 실행, draft 검수를 이 화면에서 처리합니다.",
                  en: "Manage channel credentials, content queueing, worker runs, and draft reviews for this universe.",
                }}
              />
            </p>
          </div>
          <Button variant="outline" onClick={() => setMarketingCredentialSettingsOpen(true)}>
            <Settings size={14} />
            <span>
              <Lang text={{ ko: "자격 증명 표시 설정", en: "Credential display settings" }} />
            </span>
          </Button>
        </div>

        <Tabs defaultValue="credentials" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto rounded-lg md:w-auto">
            <TabsTrigger value="credentials">
              <Lang text={{ ko: "마케팅 자동화 자격증명", en: "Marketing automation credentials" }} />
            </TabsTrigger>
            <TabsTrigger value="operations">
              <Lang text={{ ko: "마케팅 운영 패널", en: "Marketing operations panel" }} />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="credentials" className="mt-0">
            <MarketingCredentialPanelGroup
              universeId={selectedUniverse}
              isGlobalAdmin={isAdministrator}
              settingsOpen={marketingCredentialSettingsOpen}
              onSettingsOpenChange={setMarketingCredentialSettingsOpen}
            />
          </TabsContent>

          <TabsContent value="operations" className="mt-0">
            <MarketingOperationsPanel
              universeId={selectedUniverse}
              isGlobalAdmin={isAdministrator}
              studioPresentation="embedded"
            />
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* 7) 저장 */}
      <div className="pt-2 border-t">
        <Button onClick={() => onSubmit(value)}>
          <Save size={16} />
          <span>상세 데이터 저장</span>
        </Button>
      </div>
    </Tabs>
  );
}
