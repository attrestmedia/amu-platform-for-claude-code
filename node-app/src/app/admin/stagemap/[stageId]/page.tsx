"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import type { IStageDoc } from "types/game/stage-doc";
import { useRouter, useSearchParams } from "next/navigation";
import { StageMapEditor } from "components/module/admin/stage/StageMapEditor";
import { getStageById, updateStage } from "libs/api/game/stageAdminClient";
import { logger } from "utils/log";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { toErrorMessage } from "utils/common";
import { setUniverseDefaultStage } from "libs/api/universe";

interface PageProps {
  params: { stageId: string };
}

export default function StageMapEditorPage({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { stageId } = params;

  const isReadOnly = useMemo(() => {
    const mode = (searchParams.get("mode") || "").toLowerCase();
    const ro = (searchParams.get("ro") || "").toLowerCase();
    return mode === "view" || mode === "readonly" || ro === "1" || ro === "true";
  }, [searchParams]);

  const [stageDoc, setStageDoc] = useState<IStageDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState(false);

  const replaceMode = useCallback(
    (nextReadOnly: boolean) => {
      // client page라 window 사용 OK
      const url = new URL(window.location.href);
      if (nextReadOnly) {
        url.searchParams.set("mode", "view");
      } else {
        url.searchParams.delete("mode");
        url.searchParams.delete("ro");
      }
      router.replace(url.pathname + url.search);
    },
    [router],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const doc = await getStageById(stageId);
        if (!mounted) return;
        setStageDoc(doc);
      } catch (e) {
        logger.error("[AdminStageMapEditor] StageDoc 로드 실패:", e);
        if (!mounted) return;
        setErrorMsg(toErrorMessage(e, "StageDoc을 불러오는 중 오류가 발생했습니다."));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [stageId]);

  const handleSave = async (doc: IStageDoc) => {
    try {
      const mongoId = (doc as IStageDoc & { _id?: unknown })._id || stageId;
      await updateStage(String(mongoId), { ...doc });
      setStageDoc(doc);
    } catch (e) {
      logger.error("[AdminStageMapEditor] StageDoc 저장 실패:", e);
      throw e;
    }
  };

  const handleSetDefaultMap = async () => {
    if (!stageDoc || stageDoc.ownerType !== "universe" || !stageDoc.ownerId) return;
    setSettingDefault(true);
    try {
      await setUniverseDefaultStage(stageDoc.ownerId, {
        stageId: stageDoc.stageId,
        stageName: stageDoc.stageName,
        usageType: stageDoc.usageType,
        mode: "normal",
        layoutVersion: `stage-doc-v${stageDoc.coordinateContractVersion}`,
      });
      toast.success(
        lang({
          ko: `${stageDoc.ownerId} 유니버스의 기본 맵으로 설정했습니다.`,
          en: `Set as the default map for universe ${stageDoc.ownerId}.`,
        }),
      );
    } catch (error) {
      logger.error("[AdminStageMapEditor] 기본 맵 설정 실패:", error);
      toast.error(lang({ ko: "유니버스 기본 맵 설정에 실패했습니다.", en: "Failed to set the universe default map." }));
    } finally {
      setSettingDefault(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-sm">스테이지 맵 정보를 불러오는 중입니다...</div>;
  }

  if (errorMsg || !stageDoc) {
    return (
      <div className="p-4">
        <div className="mb-2 text-sm text-red-500">{errorMsg ?? "StageDoc을 찾을 수 없습니다."}</div>
        <Button size="sm" onClick={() => router.back()}>
          뒤로가기
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* 상단 모드 바 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <Lang text={{ ko: "뒤로", en: "Back" }} />
          </Button>
          <div className="font-semibold">
            {stageDoc.stageId} / {stageDoc.stageName}
          </div>
          {isReadOnly && <div className="text-xs px-2 py-1 rounded bg-muted">READ ONLY</div>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stageDoc.ownerType === "universe" && stageDoc.ownerId ? (
            <Button variant="outline" size="sm" disabled={settingDefault} onClick={() => void handleSetDefaultMap()}>
              <MapPin className="size-4" />
              <Lang text={{ ko: settingDefault ? "설정 중..." : "유니버스 기본 맵", en: settingDefault ? "Setting..." : "Set as universe map" }} />
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => replaceMode(!isReadOnly)}>
            {isReadOnly ? (
              <Lang text={{ ko: "편집 모드", en: "Edit Mode" }} />
            ) : (
              <Lang text={{ ko: "읽기 전용", en: "Read Only" }} />
            )}
          </Button>
        </div>
      </div>

      <StageMapEditor stageDoc={stageDoc} readOnly={isReadOnly} onSave={isReadOnly ? undefined : handleSave} />
    </div>
  );
}
