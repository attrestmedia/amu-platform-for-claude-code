"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { IStageDoc, IUniverse } from "types/game";
import { StageMapEditor } from "components/module/admin/stage/StageMapEditor";
import { getStageDefinition } from "libs/api/universe/stageClient";
import { listStages, updateStage } from "libs/api/game/stageAdminClient";
import { getUniverseList } from "libs/api/universe/universeClient";
import { useUniverseAdminAccess } from "hooks/admin/useUniverseAdminAccess";
import { logger } from "utils/log";
import { Button } from "@amu-labs/ui";
import { toErrorMessage } from "utils/common";

interface PageProps {
  params: { universeId: string; stageId: string };
}

// 일반 유저용 스테이지 맵 에디터
export default function UniverseStageMapEditorPage({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { universeId, stageId } = params;
  const isPreviewMode = useMemo(() => {
    const mode = (searchParams.get("mode") || "").toLowerCase();
    return mode === "view" || mode === "preview" || searchParams.get("ro") === "1";
  }, [searchParams]);

  const [stageDoc, setStageDoc] = useState<IStageDoc | null>(null);
  const [mongoStageId, setMongoStageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [universe, setUniverse] = useState<IUniverse | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (isPreviewMode) {
          const [publicDefinition, adminList] = await Promise.allSettled([
            getStageDefinition(universeId, stageId),
            listStages({ domain: "stage", stageId, pageSize: 1 }),
          ]);
          const fallback = adminList.status === "fulfilled" ? adminList.value.data[0] : null;
          // 관리자 생성 맵은 아직 Universe.stages에 연결되지 않았을 수 있으므로
          // 정확한 stageId를 조회한 Admin 결과를 우선한다. 일반 공개 맵은 public 결과로 폴백한다.
          const previewDoc = fallback || (publicDefinition.status === "fulfilled" ? publicDefinition.value : null);
          if (!previewDoc) throw new Error("stage_preview_not_found");
          if (!mounted) return;
          setStageDoc(previewDoc);
          return;
        }

        const [universeList, docFromUniverse] = await Promise.all([
          getUniverseList({ enabledOnly: false, sortByOrder: false }),
          getStageDefinition(universeId, stageId),
        ]);

        if (!mounted) return;

        // 2) universeId에 해당하는 IUniverse 하나 찾기
        const foundUniverse = universeList.find((u) => u.id === universeId) || null;

        setStageDoc(docFromUniverse);
        setUniverse(foundUniverse);

        // StageAdmin 컬렉션에서 _id 찾기
        try {
          const list = await listStages({
            stageId: docFromUniverse.stageId,
            stageName: docFromUniverse.stageName,
            domain: docFromUniverse.domain,
          });
          const match = list.data[0] as (IStageDoc & { _id?: unknown }) | undefined;
          if (match && match._id) {
            setMongoStageId(String(match._id));
          }
        } catch (e) {
          logger.warn("[UniverseStageMapEditor] StageAdmin 목록 조회 실패(무시 가능):", e);
        }
      } catch (e) {
        logger.error("[UniverseStageMapEditor] StageDoc 로드 실패:", e);
        if (!mounted) return;
        setErrorMsg(toErrorMessage(e, "스테이지 정의를 불러오는 중 오류가 발생했습니다."));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isPreviewMode, universeId, stageId]);

  // 유니버스 관리자 권한 체크
  const { editableUniverses, isAdministrator } = useUniverseAdminAccess(universe ? [universe] : []);
  const canEditThisUniverse = useMemo(
    () => isAdministrator || editableUniverses.some((u) => u.id === universeId),
    [isAdministrator, editableUniverses, universeId],
  );

  const handleSave = async (doc: IStageDoc) => {
    if (!mongoStageId) {
      logger.warn("[UniverseStageMapEditor] mongoStageId 가 없어 저장을 건너뜁니다.");
      return;
    }
    await updateStage(mongoStageId, {
      ...doc,
    });
    setStageDoc(doc);
  };

  if (loading) {
    return <div className="p-4 text-sm">유니버스 스테이지 맵을 불러오는 중입니다...</div>;
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
    <div className="p-4">
      <StageMapEditor
        stageDoc={stageDoc}
        readOnly={isPreviewMode || !canEditThisUniverse}
        onSave={!isPreviewMode && canEditThisUniverse ? handleSave : undefined}
      />
    </div>
  );
}
