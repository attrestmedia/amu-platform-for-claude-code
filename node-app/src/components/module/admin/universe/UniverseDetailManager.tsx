"use client";

import { useState, useEffect } from "react";
import type { IUniverse, ICommerceSettings, IGameSettings, IUniverseMetadata } from "types/game";
import fetchClient from "libs/api/fetchClient";
import { logger } from "utils/log";
import { Info } from "lucide-react";
import { useUserData } from "hooks/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, dialog } from "@amu-labs/ui";
import { toast } from "sonner";
import { UniverseDetailForm } from "./UniverseDetailForm";
import { GAME_CONSTANTS as GC } from "consts/game";
import { sanitizeStoreKnowledge } from "utils/commerce/storeKnowledgeUtils";
import { extractApiErrorMessage } from "utils/common";

interface UniverseDetailManagerProps {
  universes: IUniverse[];
  selectedUniverse: string | null;
  onSelectUniverse?: (universeId: string | null) => void;
  lockSelection?: boolean; // 상단 셀렉트 숨기기
  onNaverCredentialStatusChange?: (status: { ready: boolean; storeId?: string; storefrontOpen?: boolean }) => void;
}

type DetailDataType = {
  settings: { commerce?: ICommerceSettings; game?: IGameSettings };
  metadata: IUniverseMetadata;
};

export function UniverseDetailManager({
  universes,
  selectedUniverse,
  onSelectUniverse,
  lockSelection = false,
  onNaverCredentialStatusChange,
}: UniverseDetailManagerProps) {
  const { userData } = useUserData();

  // 유니버스 상세 데이터 상태
  const [detailData, setDetailData] = useState<DetailDataType>({
    settings: {},
    metadata: {},
  });
  const [loading, setLoading] = useState(false);

  // 선택된 유니버스의 상세 데이터 로드 (effect 내부에 inline → 호이스팅 이슈 회피)
  useEffect(() => {
    if (!selectedUniverse) return;
    let cancelled = false;

    const fetchUniverseDetails = async (universeId: string) => {
      try {
        setLoading(true);
        const response = await fetchClient.get(`/universe/${universeId}/details`);
        if (cancelled) return;

        if (response.data.success && response.data.data) {
          const d = response.data.data;
          setDetailData({
            settings: d.settings || {},
            metadata: (d.metadata || {}) as IUniverseMetadata,
          });
        } else {
          setDetailData({ settings: {}, metadata: {} });
        }
      } catch (error) {
        if (!cancelled) logger.error("유니버스 상세 데이터 조회 실패:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchUniverseDetails(selectedUniverse);

    return () => {
      cancelled = true;
    };
  }, [selectedUniverse]);

  // 유니버스 운영 메타데이터를 저장
  const handlePersist = async (snapshot: {
    settings: { commerce?: ICommerceSettings; game?: IGameSettings };
    metadata: IUniverseMetadata;
  }) => {
    if (!selectedUniverse) return;

    try {
      // 불변성 유지용 깊은 복제
      const payload =
        typeof structuredClone === "function" ? structuredClone(snapshot) : JSON.parse(JSON.stringify(snapshot));

      // 스마트스토어 구조화 메타데이터에서는 빈 항목/미완성 FAQ를 저장 전에 제거한다.
      const storeKnowledge = payload?.metadata?.storeKnowledge;
      if (storeKnowledge) {
        const sanitized = sanitizeStoreKnowledge(storeKnowledge);
        if (sanitized) payload.metadata.storeKnowledge = sanitized;
        else delete payload.metadata.storeKnowledge;
      }

      if (payload?.settings?.commerce) {
        const blockSize = payload.settings.commerce.blockSize;
        payload.settings.commerce = blockSize ? { blockSize } : {};
      }

      await fetchClient.post(`/universe/${selectedUniverse}/details`, payload);

      // 성공 시 내부 상태 동기화
      setDetailData(payload);
      toast.success("저장되었습니다.");
    } catch (error: unknown) {
      logger.error("유니버스 상세 데이터 저장 실패:", error);
      void dialog.alert({ variant: "danger", message: extractApiErrorMessage(error, "저장에 실패했습니다.") });
      throw error; // 호출 측(다이얼로그)에서 닫기 여부 제어
    }
  };

  // 스테이지 저장 핸들러
  const handleStageSave = async (nextStages: IUniverse["stages"]) => {
    const target = universes.find((u) => u.id === selectedUniverse);
    if (!target) {
      void dialog.alert({ variant: "danger", message: "유니버스를 찾을 수 없습니다." });
      return;
    }

    try {
      const payload = {
        ...target,
        stages: nextStages || [{ stageId: GC.FALLBACK.STAGE_ID, stageName: GC.FALLBACK.STAGE_NAME }],
      };
      await fetchClient.post("/universe", payload);
      toast.success("스테이지가 저장되었습니다.");
    } catch (e: unknown) {
      logger.error("스테이지 저장 실패:", e);
      void dialog.alert({ variant: "danger", message: extractApiErrorMessage(e, "스테이지 저장에 실패했습니다.") });
    }
  };

  return (
    <div className="space-y-6">
      {/* 유니버스 선택 */}
      {!lockSelection && (
        // 드롭다운 표시
        <div className="flex items-center gap-4">
          <label className="font-semibold">유니버스 선택:</label>
          <Select value={selectedUniverse || ""} onValueChange={(v) => onSelectUniverse?.(v as string)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="유니버스를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {universes.map((universe) => (
                <SelectItem key={universe.id} value={universe.id}>
                  {universe.name} ({universe.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 편집 가능한 유니버스가 없을 때 메시지 표시 */}
      {universes.length === 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            <Info className="inline w-4 h-4 mr-1" />
            편집 권한이 있는 유니버스가 없습니다. 관리자에게 문의하여 권한을 요청하세요.
          </p>
        </div>
      )}

      {/* 권한 안내 메시지 */}
      {!userData?.roles?.includes("administrator") && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            <Info className="inline w-4 h-4 mr-1" />
            커머스 타입 유니버스 중 이메일 주소가 관리자로 등록된 유니버스만 편집할 수 있습니다.
          </p>
        </div>
      )}

      {selectedUniverse && !loading && (
        <UniverseDetailForm
          universes={universes}
          selectedUniverse={selectedUniverse}
          value={detailData}
          onChange={setDetailData}
          onSubmit={handlePersist}
          onStageSave={handleStageSave}
          onNaverCredentialStatusChange={onNaverCredentialStatusChange}
        />
      )}
    </div>
  );
}
