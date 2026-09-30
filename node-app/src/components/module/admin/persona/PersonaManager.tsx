"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Badge, Input, Textarea, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Preloader, dialog } from "@amu-labs/ui";
import { toast } from "sonner";
import type { PersonaFormValuesType, SystemPersonaUsageType } from "types/ai";
import { SYSTEM_PERSONA_USAGE_OPTIONS, normalizeSystemPersonaUsageType } from "types/ai";
import type { IUniverse } from "types/game";
import { PersonaEditor } from "components/module/persona/PersonaEditor";
import { getAllPersonas, savePersona, deletePersona } from "libs/api/universe/persona";
import { listSystemPersonas, upsertSystemPersona, deleteSystemPersona } from "libs/api/universe/systemPersonas";
import { getUniverseList } from "libs/api/universe";
import { THEME_OVERRIDE_CLASS } from "utils/theme";
import { cn } from "utils/common";
import { logger } from "utils/log";
import { normalizeKey } from "utils/normalize";
import { useUserData } from "hooks/auth";
import { Lang, lang } from "components/module/i18n";
import { Plus } from "lucide-react";

type PersonaSystemPrompt = {
  key: string;
  title: string;
  category?: string;
  summary?: string;
  enabled: boolean;
  forUniverses?: SystemPersonaUsageType;
  prompt: string;
  universeId?: string | null;
  personaPid?: string | null;
};

interface PromptManagerProps {
  universeId?: string; // 초기값 설정 시 persona DB 컬렉션명(universeId) 지정
  availableUniverses?: IUniverse[];
}

// PersonaManager: 페르소나 등록/편집 (PersonaEditor)
// - 선택된 페르소나에 귀속된 시스템 페르소나 프롬프트 편집
// - 최고 관리자는 유니버스를 선택해서 다른 유니버스의 페르소나도 관리 가능
export function PersonaManager({ universeId, availableUniverses }: PromptManagerProps) {
  const [universes, setUniverses] = useState<IUniverse[]>(availableUniverses || []);
  const [currentUniverseId, setCurrentUniverseId] = useState<string>(universeId || availableUniverses?.[0]?.id || "");

  // 내부적으로 실제로 사용할 유니버스 ID
  const effectiveUniverseId = currentUniverseId || universeId || "";
  const isAdministrator = useUserData().isAdministrator;

  const [personas, setPersonas] = useState<PersonaFormValuesType[]>([]);
  const [filtered, setFiltered] = useState<PersonaFormValuesType[]>([]);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  const [editing, setEditing] = useState<PersonaFormValuesType | null>(null);
  const [savingPersona, setSavingPersona] = useState(false);

  const [sysPrompt, setSysPrompt] = useState<PersonaSystemPrompt | null>(null);
  const [loadingSysPrompt, setLoadingSysPrompt] = useState(false);
  const [savingSysPrompt, setSavingSysPrompt] = useState(false);

  const [shareTargetUniverseId, setShareTargetUniverseId] = useState<string>("");
  const [duplicating, setDuplicating] = useState(false);

  const resolvePersonaUniverseId = useCallback(
    (persona?: PersonaFormValuesType | null) => String(persona?.universeId || effectiveUniverseId || "").trim(),
    [effectiveUniverseId],
  );

  useEffect(
    function syncUniversesFromAvailableProp() {
      if (!availableUniverses?.length) return;

      // 부모로부터 받은 availableUniverses prop을 내부 state로 동기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUniverses(availableUniverses);
      setCurrentUniverseId((prev) => {
        if (prev && availableUniverses.some((item) => item.id === prev)) return prev;
        return universeId || availableUniverses[0]?.id || "";
      });
    },
    [availableUniverses, universeId],
  );

  // 0) 유니버스 목록 로드 (최고 관리자는 여기서 유니버스를 선택)
  useEffect(() => {
    if (availableUniverses?.length) return;

    let alive = true;

    (async () => {
      try {
        const list = await getUniverseList({ enabledOnly: false, sortByOrder: true });
        if (!alive) return;
        setUniverses(list);

        // 초기 유니버스가 비어 있으면 첫 번째 유니버스로 설정
        setCurrentUniverseId((prev) => prev || universeId || list[0]?.id || "");
      } catch (e) {
        logger.error("[PersonaManager] 유니버스 목록 조회 실패:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [availableUniverses, universeId]);

  // 1) 페르소나 목록 로드
  const fetchPersonas = useCallback(
    async (targetUniverseId?: string) => {
      const uid = targetUniverseId || effectiveUniverseId;

      if (!uid) {
        logger.warn("[PersonaManager] universeId가 설정되지 않아 페르소나를 불러올 수 없습니다.");
        return;
      }

      setLoadingList(true);
      try {
        const rows = (await getAllPersonas(uid)) as unknown as PersonaFormValuesType[];
        setPersonas(rows);

        // 현재 편집 중인 페르소나 동기화
        setEditing((current) => {
          if (!current) return rows[0] || null;
          return rows.find((persona) => persona.pid === current.pid) || current;
        });
      } catch (e) {
        logger.error("[PersonaManager] 페르소나 목록 조회 실패:", e);
      } finally {
        setLoadingList(false);
      }
    },
    [effectiveUniverseId],
  );

  // 유니버스가 바뀔 때마다 해당 유니버스의 페르소나 목록 로드
  useEffect(
    function reloadPersonasOnUniverseChange() {
      if (!effectiveUniverseId) return;

      // 유니버스 변경 시 상태 초기화 후 외부 API에서 페르소나 fetch
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPersonas([]);
      setFiltered([]);
      setEditing(null);
      setSysPrompt(null);
      setSearch("");

      fetchPersonas(effectiveUniverseId);
    },
    [effectiveUniverseId, fetchPersonas],
  );

  // 검색 필터
  useEffect(
    function syncFilteredFromSearch() {
      const q = search.trim().toLowerCase();
      if (!q) {
        // 검색어 변경(외부 입력)에 따라 파생 리스트 동기화
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFiltered(personas);
        return;
      }
      setFiltered(
        personas.filter((p) => {
          const name = (p.name || "").toLowerCase();
          const pid = (p.pid || "").toLowerCase();
          return name.includes(q) || pid.includes(q);
        }),
      );
    },
    [search, personas],
  );

  // 리스트에서 페르소나 선택
  const handleSelectPersona = (p: PersonaFormValuesType) => {
    setEditing(p);
  };
  const selectedPersona = editing?.pid ? personas.find((persona) => persona.pid === editing.pid) || editing : null;

  // 신규 페르소나 생성
  const handleCreatePersona = () => {
    const initialUniverseId = effectiveUniverseId || universes[0]?.id || "";

    const empty: PersonaFormValuesType = {
      personaType: "human",
      pid: "",
      universeId: initialUniverseId,
      systemPersonaKey: "",
      name: "",
      age: "",
      appearance: "",
      background: "",
      personality: "",
      summary: "",
      profiles: { default: [] },
      sprite: null,
    } as PersonaFormValuesType;

    setEditing(empty);
    setSysPrompt(null);
  };

  // 페르소나 저장
  const handleSavePersona = async () => {
    if (!editing) return;

    if (!editing.name?.trim()) {
      void dialog.alert("이름은 필수입니다.");
      return;
    }

    const targetUniverseId = resolvePersonaUniverseId(editing);

    if (!targetUniverseId) {
      void dialog.alert("페르소나를 저장할 유니버스를 선택해 주세요.");
      return;
    }

    setSavingPersona(true);
    try {
      const nextEditing =
        editing.universeId === targetUniverseId ? editing : { ...editing, universeId: targetUniverseId };
      const saved = (await savePersona({
        collectionName: targetUniverseId,
        data: nextEditing,
      })) as unknown as PersonaFormValuesType;

      if (targetUniverseId === effectiveUniverseId) {
        setPersonas((prev) => {
          const exists = prev.some((p) => p.pid === saved.pid);
          if (exists) return prev.map((p) => (p.pid === saved.pid ? saved : p));
          return [saved, ...prev];
        });
      } else {
        setCurrentUniverseId(targetUniverseId);
        setSearch("");
      }
      setEditing(saved);

      // 새로 생성된 경우 pid 발급 후 system persona도 로드
      if (!editing.pid && saved.pid) {
        await loadSystemPrompt(saved);
      }

      toast.success("페르소나가 저장되었습니다.");
    } catch (e) {
      logger.error("[PromptManager] 페르소나 저장 실패:", e);
      void dialog.alert({ variant: "danger", message: "페르소나 저장 중 오류가 발생했습니다." });
    } finally {
      setSavingPersona(false);
    }
  };

  // 페르소나 삭제 - 백엔드에서 system_personas 같이 삭제
  const handleDeletePersona = async () => {
    if (!editing?.pid) {
      void dialog.alert("저장된 페르소나만 삭제할 수 있습니다.");
      return;
    }
    const targetUniverseId = resolvePersonaUniverseId(editing);

    if (!targetUniverseId) {
      void dialog.alert("유니버스가 선택되지 않았습니다.");
      return;
    }
    if (
      !(await dialog.confirm({
        variant: "danger",
        message: "해당 페르소나를 삭제할까요? 연결된 시스템 페르소나 프롬프트도 함께 삭제됩니다.",
      }))
    ) {
      return;
    }

    try {
      await deletePersona({ collectionName: targetUniverseId, pid: editing.pid });

      setPersonas((prev) => prev.filter((p) => p.pid !== editing.pid));
      setEditing(null);
      setSysPrompt(null);
      toast.success("페르소나가 삭제되었습니다.");
    } catch (e) {
      logger.error("[PromptManager] 페르소나 삭제 실패:", e);
      void dialog.alert({ variant: "danger", message: "페르소나 삭제 중 오류가 발생했습니다." });
    }
  };

  // 2) 선택된 페르소나의 시스템 페르소나 프롬프트 로드
  const loadSystemPrompt = useCallback(
    async (persona: PersonaFormValuesType) => {
      if (!persona?.pid) {
        setSysPrompt(null);
        return;
      }

      const scopedUniverseId = resolvePersonaUniverseId(persona); // 항상 현재 유니버스로 스코프

      setLoadingSysPrompt(true);
      try {
        const rows = await listSystemPersonas({
          enabled: undefined,
          universeId: scopedUniverseId,
          personaPid: persona.pid,
        });

        if (rows.length > 0) {
          const r = rows[0];
          setSysPrompt({
            key: r.key,
            title: r.title || persona.name || r.key,
            category: r.category ?? "core",
            summary: r.summary || "",
            enabled: !!r.enabled,
            forUniverses: normalizeSystemPersonaUsageType(r.forUniverses),
            prompt: r.prompt || "",
            universeId: r.universeId ?? persona.universeId ?? scopedUniverseId,
            personaPid: r.personaPid ?? persona.pid,
          });
        } else {
          // 캐릭터 전용 system persona가 없으면 기본 초기화 설정
          setSysPrompt({
            key: "",
            title: `${persona.name || ""}`,
            category: "",
            summary: "",
            enabled: true,
            forUniverses: "game",
            prompt: "",
            universeId: persona.universeId || scopedUniverseId,
            personaPid: persona.pid,
          });
        }
      } catch (e) {
        logger.error("[PromptManager] 시스템 페르소나 로드 실패:", e);
        setSysPrompt(null);
      } finally {
        setLoadingSysPrompt(false);
      }
    },
    [resolvePersonaUniverseId],
  );

  // 편집 대상 페르소나 변경 시 system persona 같이 로드
  useEffect(
    function loadSysPromptForEditing() {
      if (selectedPersona?.pid) {
        loadSystemPrompt(selectedPersona);
      }
    },
    [loadSystemPrompt, selectedPersona],
  );

  // 3) 시스템 페르소나 프롬프트 저장 / 삭제
  const handleSaveSystemPrompt = async () => {
    if (!editing || !editing.pid) {
      void dialog.alert("먼저 페르소나를 저장한 뒤 시스템 페르소나 프롬프트를 등록할 수 있습니다.");
      return;
    }
    if (!sysPrompt) {
      void dialog.alert("저장할 시스템 페르소나 데이터가 없습니다.");
      return;
    }

    if (!sysPrompt.prompt.trim()) {
      if (!(await dialog.confirm("프롬프트 내용이 비어 있습니다. 계속 진행할까요?"))) return;
    }

    const scopedUniverseId = resolvePersonaUniverseId(editing);

    if (!scopedUniverseId) {
      void dialog.alert("유니버스가 선택되지 않았습니다.");
      return;
    }

    setSavingSysPrompt(true);
    try {
      // key는 persona.systemPersonaKey > sysPrompt.key > fallback 순
      const rawKey =
        (editing.systemPersonaKey as string | undefined) || sysPrompt.key || `${scopedUniverseId}-${editing.pid}`;
      const key = normalizeKey(rawKey);

      const payload = {
        key,
        title: sysPrompt.title || editing.name || key,
        category: sysPrompt.category || "core",
        summary: sysPrompt.summary || "",
        prompt: sysPrompt.prompt || "",
        forUniverses: normalizeSystemPersonaUsageType(sysPrompt.forUniverses),
        enabled: sysPrompt.enabled !== false,
        universeId: (sysPrompt.universeId ?? editing.universeId ?? scopedUniverseId) || null,
        personaPid: editing.pid,
      };

      const saved = await upsertSystemPersona(payload);

      setSysPrompt((prev) => ({
        ...(prev || payload),
        key: saved.key,
        title: saved.title,
        category: saved.category,
        summary: saved.summary || "",
        prompt: saved.prompt || "",
        enabled: saved.enabled,
        forUniverses: normalizeSystemPersonaUsageType(saved.forUniverses),
        universeId: saved.universeId,
        personaPid: saved.personaPid,
      }));

      // persona.systemPersonaKey가 비어 있으면 동기화
      if (!editing.systemPersonaKey) {
        setEditing((prev) =>
          prev
            ? ({
                ...prev,
                systemPersonaKey: saved.key,
              } as PersonaFormValuesType)
            : prev,
        );
      }

      toast.success("시스템 페르소나 프롬프트가 저장되었습니다.");
    } catch (e) {
      logger.error("[PromptManager] 시스템 페르소나 저장 실패:", e);
      void dialog.alert({ variant: "danger", message: "시스템 페르소나 프롬프트 저장 중 오류가 발생했습니다." });
    } finally {
      setSavingSysPrompt(false);
    }
  };

  const handleDeleteSystemPrompt = async () => {
    if (!sysPrompt?.key) {
      void dialog.alert("삭제할 시스템 페르소나 키가 없습니다.");
      return;
    }
    if (
      !(await dialog.confirm({
        variant: "danger",
        message: "이 페르소나에 연결된 시스템 페르소나 프롬프트를 삭제할까요?",
      }))
    )
      return;

    try {
      await deleteSystemPersona(sysPrompt.key);
      // 삭제 후에는 다시 기본 상태로 초기화
      if (editing?.pid) {
        await loadSystemPrompt({ ...editing });
      } else {
        setSysPrompt(null);
      }
      toast.success("시스템 페르소나 프롬프트가 삭제되었습니다.");
    } catch (e) {
      logger.error("[PromptManager] 시스템 페르소나 삭제 실패:", e);
      void dialog.alert({ variant: "danger", message: "시스템 페르소나 프롬프트 삭제 중 오류가 발생했습니다." });
    }
  };

  // 특정 유니버스의 페르소나를 복제
  const handleDuplicateToUniverse = async () => {
    if (!editing) {
      void dialog.alert("먼저 복제할 페르소나를 선택해 주세요.");
      return;
    }
    if (!shareTargetUniverseId) {
      void dialog.alert("대상 유니버스를 선택해 주세요.");
      return;
    }
    const sourceUniverseId = resolvePersonaUniverseId(editing);

    if (shareTargetUniverseId === sourceUniverseId) {
      void dialog.alert("현재 유니버스와 다른 유니버스를 선택해 주세요.");
      return;
    }

    try {
      setDuplicating(true);

      // 1) 원본 페르소나 데이터 기반으로 복제용 payload 생성
      const { _id: _sourcePersonaId, ...editingWithoutId } = editing as PersonaFormValuesType & { _id?: string };
      const cloneData: PersonaFormValuesType = {
        ...editingWithoutId,
        pid: "", // 새 pid 발급 유도
        universeId: shareTargetUniverseId,
        systemPersonaKey: "", // system persona는 새로 설정
      };

      const saved = (await savePersona({
        collectionName: shareTargetUniverseId,
        data: cloneData,
      })) as unknown as PersonaFormValuesType;

      // 2) (선택) system persona도 같이 복제하고 싶다면
      if (sysPrompt && sysPrompt.prompt.trim()) {
        const key = normalizeKey(`${shareTargetUniverseId}-${saved.pid}`);
        await upsertSystemPersona({
          key,
          title: sysPrompt.title || saved.name || key,
          category: sysPrompt.category || "core",
          summary: sysPrompt.summary || "",
          prompt: sysPrompt.prompt,
          forUniverses: normalizeSystemPersonaUsageType(sysPrompt.forUniverses),
          enabled: sysPrompt.enabled !== false,
          universeId: shareTargetUniverseId,
          personaPid: saved.pid,
        });
      }

      toast.success(`'${editing.name}' 캐릭터가 '${shareTargetUniverseId}' 유니버스로 복제되었습니다.`);
    } catch (e) {
      logger.error("[PersonaManager] 캐릭터 복제 실패:", e);
      void dialog.alert({ variant: "danger", message: "캐릭터 복제 중 오류가 발생했습니다." });
    } finally {
      setDuplicating(false);
    }
  };

  // 4) 렌더링
  return (
    <div className={cn("flex h-full flex-col gap-6 p-2", THEME_OVERRIDE_CLASS)}>
      {/* 상단: 유니버스 선택 + 검색 + 액션 */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        {/* 유니버스 선택 */}
        {universes.length > 0 && (
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-gray-700">
              <Lang text={{ ko: "유니버스 선택", en: "Select Universe" }} />
            </label>
            <Select
              value={effectiveUniverseId}
              onValueChange={(v) => {
                setCurrentUniverseId(v as string);
                setSearch("");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="유니버스 선택" />
              </SelectTrigger>
              <SelectContent>
                {universes.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                    <span className="ml-2 text-xs text-gray-400">({u.id})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 검색 */}
        <div className="flex-1 space-y-2">
          <label className="text-xs font-medium text-gray-700">
            <Lang text={{ ko: "페르소나 검색", en: "Search Persona" }} />
          </label>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 또는 PID로 검색"
              className="flex-1"
            />
            <Button variant="outline" onClick={() => fetchPersonas()}>
              <Lang text={{ ko: "새로고침", en: "Refresh" }} />
            </Button>
          </div>
        </div>

        {/* 새 페르소나 추가 */}
        <Button onClick={handleCreatePersona}>
          <Plus className="mr-2" size={16} />
          <Lang text={{ ko: "새 페르소나", en: "New Persona" }} />
        </Button>
      </div>

      {/* 메인 컨텐츠 영역 */}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* 좌측: 페르소나 목록 */}
        <div className="flex w-full flex-col rounded-xl border border-border/70 bg-gradient-to-br from-background/80 to-surface shadow-sm lg:w-80 xl:w-96">
          <div className="rounded-t-xl border-b border-border/70 bg-background/80 p-4">
            <h3 className="font-semibold text-base">
              <Lang text={{ ko: "페르소나 목록", en: "Persona List" }} />
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              <Lang
                text={{
                  ko: `총 ${filtered.length}개`,
                  en: `Total ${filtered.length}`,
                }}
              />
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loadingList ? (
              <div className="py-12 flex justify-center">
                <Preloader variant="spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-500">
                  <Lang text={{ ko: "등록된 페르소나가 없습니다", en: "No personas found" }} />
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((p) => (
                  <li key={p.pid || p.name}>
                    <Button
                      variant={editing?.pid === p.pid ? "primary" : "outline"}
                      onClick={() => handleSelectPersona(p)}
                      noWrap={false}
                      className="h-auto w-full flex-col gap-1 items-start"
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="font-medium truncate text-base">{p.name || "(이름 없음)"}</div>
                        {p.personaType && (
                          <Badge variant="outline" size="xs">
                            {p.personaType}
                          </Badge>
                        )}
                      </div>
                      <div
                        className={`text-xxs mt-1 truncate ${
                          editing?.pid === p.pid ? "text-blue-100" : "text-gray-500"
                        }`}
                      >
                        PID: {p.pid || "(미발급)"}
                      </div>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 우측: 에디터 영역 */}
        <div className="flex-1 flex flex-col gap-6 min-w-0 overflow-y-auto">
          {/* 페르소나 프로필 에디터 */}
          <div className="rounded-xl border border-border/70 bg-surface shadow-sm">
            <div className="border-b border-border/70 bg-gradient-to-r from-background/80 to-surface p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">
                  <Lang text={{ ko: "페르소나 정보", en: "Persona Information" }} />
                </h3>
                {editing?.pid && (
                  <span className="text-xs bg-gray-100 px-3 py-1 rounded-full">
                    PID: <code className="font-mono">{editing.pid}</code>
                  </span>
                )}
              </div>
            </div>

            <div className="p-6">
              {editing ? (
                <>
                  <PersonaEditor
                    value={editing}
                    universeOptions={universes}
                    canViewInternalIds={Boolean(isAdministrator)}
                    onChange={(next) => {
                      setEditing(next);
                    }}
                  />
                  <div className="mt-6 pt-6 border-t flex justify-between gap-3">
                    <Button variant="destructive" onClick={handleDeletePersona} disabled={!editing.pid}>
                      <Lang text={{ ko: "페르소나 삭제", en: "Delete Persona" }} />
                    </Button>
                    <Button onClick={handleSavePersona} disabled={savingPersona}>
                      {savingPersona ? (
                        <Lang text={{ ko: "저장 중...", en: "Saving..." }} />
                      ) : (
                        <Lang text={{ ko: "페르소나 저장", en: "Save Persona" }} />
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-gray-500">
                    <Lang
                      text={{
                        ko: "좌측에서 페르소나를 선택하거나 새로 생성해 주세요",
                        en: "Please select a persona from the list or create a new one",
                      }}
                    />
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 시스템 페르소나 프롬프트 */}
          <div className="rounded-xl border border-border/70 bg-surface shadow-sm">
            <div className="border-b border-border/70 bg-gradient-to-r from-background/80 to-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    <Lang
                      text={{
                        ko: "시스템 페르소나 프롬프트",
                        en: "System Persona Prompt",
                      }}
                    />
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    <Lang
                      text={{
                        ko: "선택된 페르소나에만 귀속되는 전용 프롬프트입니다",
                        en: "Dedicated prompt for the selected persona only",
                      }}
                    />
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {!editing || !editing.pid ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500">
                    <Lang
                      text={{
                        ko: "먼저 페르소나를 저장한 후 시스템 프롬프트를 설정할 수 있습니다",
                        en: "Please save the persona first to configure system prompt",
                      }}
                    />
                  </p>
                </div>
              ) : loadingSysPrompt && !sysPrompt ? (
                <div className="py-12 flex justify-center">
                  <Preloader variant="spin" />
                </div>
              ) : sysPrompt ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">
                        <Lang text={{ ko: "제목", en: "Title" }} />
                      </label>
                      <Input
                        value={sysPrompt.title}
                        onChange={(e) => setSysPrompt({ ...sysPrompt, title: e.target.value })}
                        placeholder="프롬프트 제목"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">
                        <Lang text={{ ko: "카테고리", en: "Category" }} />
                      </label>
                      <Input
                        value={sysPrompt.category || ""}
                        onChange={(e) => setSysPrompt({ ...sysPrompt, category: e.target.value || "core" })}
                        placeholder="예: storytelling, npc, core"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">
                        <Lang text={{ ko: "요약", en: "Summary" }} />
                      </label>
                      <Textarea
                        rows={3}
                        value={sysPrompt.summary || ""}
                        onChange={(e) => setSysPrompt({ ...sysPrompt, summary: e.target.value })}
                        placeholder={String(
                          lang({
                            ko: "사용자에게 보여줄 핵심 성격/역할 요약",
                            en: "Short summary of the persona shown to users",
                          }),
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">
                        <Lang text={{ ko: "적용 대상", en: "For Universes" }} />
                      </label>
                      <Select
                        value={normalizeSystemPersonaUsageType(sysPrompt.forUniverses)}
                        onValueChange={(v) => setSysPrompt({ ...sysPrompt, forUniverses: v as SystemPersonaUsageType })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYSTEM_PERSONA_USAGE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Switch
                      checked={sysPrompt.enabled}
                      onCheckedChange={(v) => setSysPrompt({ ...sysPrompt, enabled: v })}
                    />
                    <span className="text-sm font-medium">
                      <Lang text={{ ko: "활성화", en: "Enabled" }} />
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">
                      <Lang text={{ ko: "프롬프트 내용", en: "Prompt Content" }} />
                    </label>
                    <Textarea
                      rows={12}
                      value={sysPrompt.prompt}
                      onChange={(e) => setSysPrompt({ ...sysPrompt, prompt: e.target.value })}
                      placeholder="이 캐릭터의 말투, 가치관, 행동 규칙 등을 상세히 정의하세요..."
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      <Lang
                        text={{
                          ko: "캐릭터의 성격, 말투, 행동 패턴을 구체적으로 작성하면 더 일관된 대화가 가능합니다",
                          en: "Detailed descriptions of personality, speech patterns, and behaviors enable more consistent conversations",
                        }}
                      />
                    </p>
                  </div>

                  <div className="pt-4 border-t flex justify-between gap-3">
                    <Button variant="outline" onClick={handleDeleteSystemPrompt} disabled={!sysPrompt.key}>
                      <Lang text={{ ko: "프롬프트 삭제", en: "Delete Prompt" }} />
                    </Button>
                    <Button onClick={handleSaveSystemPrompt} disabled={savingSysPrompt}>
                      {savingSysPrompt ? (
                        <Lang text={{ ko: "저장 중...", en: "Saving..." }} />
                      ) : (
                        <Lang text={{ ko: "프롬프트 저장", en: "Save Prompt" }} />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500">
                    <Lang
                      text={{
                        ko: "시스템 페르소나 정보를 불러오지 못했습니다",
                        en: "Failed to load system persona information",
                      }}
                    />
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 캐릭터 복제 섹션 (최고 관리자용) */}
          {editing && isAdministrator && (
            <div className="rounded-xl border bg-surface shadow-sm p-6">
              <h4 className="font-semibold text-base mb-4">
                <Lang
                  text={{
                    ko: "다른 유니버스로 복제",
                    en: "Duplicate to Another Universe",
                  }}
                />
              </h4>
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-medium text-gray-700">
                    <Lang text={{ ko: "대상 유니버스", en: "Target Universe" }} />
                  </label>
                  <Select value={shareTargetUniverseId} onValueChange={(v) => setShareTargetUniverseId(v as string)}>
                    <SelectTrigger>
                      <SelectValue placeholder="유니버스 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {universes
                        .filter((u) => u.id !== (editing.universeId || effectiveUniverseId))
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                            <span className="ml-2 text-xs text-gray-400">({u.id})</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  disabled={!shareTargetUniverseId || duplicating}
                  onClick={handleDuplicateToUniverse}
                >
                  {duplicating ? (
                    <Lang text={{ ko: "복제 중...", en: "Duplicating..." }} />
                  ) : (
                    <Lang text={{ ko: "복제 실행", en: "Duplicate" }} />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                <Lang
                  text={{
                    ko: "원본 캐릭터의 모든 설정을 유지한 채 대상 유니버스에 새로운 캐릭터로 복제합니다",
                    en: "Duplicates all character settings to the target universe as a new character",
                  }}
                />
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
