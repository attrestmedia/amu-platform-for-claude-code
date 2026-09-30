"use client";

import { useState } from "react";
import { Button, Badge, dialog } from "@amu-labs/ui";
import type { IUniverse } from "types/game";
import fetchClient from "libs/api/fetchClient";
import { logger } from "utils/log";
import { Edit, Eye, EyeOff, Trash2, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { useGlobalStore } from "store/global";
import { cn } from "utils/common";

interface UniverseManagerProps {
  universes: IUniverse[];
  onEdit: (universe: IUniverse) => void;
  onRefresh: () => void;
}

export function UniverseManager({ universes, onEdit, onRefresh }: UniverseManagerProps) {
  const currentLanguage = useGlobalStore((state) => state.language);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 유니버스 삭제
  const handleDelete = async (universe: IUniverse) => {
    if (!(await dialog.confirm({ variant: "danger", message: `"${universe.name}" 유니버스를 삭제하시겠습니까?` }))) return;

    try {
      setDeletingId(universe.id);
      // DELETE API 호출
      await fetchClient.delete(`/universe/${universe.id}`);
      logger.log(`유니버스 삭제 완료: ${universe.id}`);
      onRefresh();
    } catch (error) {
      logger.error("유니버스 삭제 실패:", error);
      void dialog.alert({ variant: "danger", message: "유니버스 삭제에 실패했습니다." });
    } finally {
      setDeletingId(null);
    }
  };

  // 유니버스 활성화 토글
  const handleToggleEnabled = async (universe: IUniverse) => {
    try {
      setTogglingId(universe.id);
      const updatedUniverse = { ...universe, enabled: !universe.enabled };

      await fetchClient.post("/universe", updatedUniverse);
      logger.log(`유니버스 상태 변경: ${universe.id} -> ${updatedUniverse.enabled}`);
      onRefresh();
    } catch (error) {
      logger.error("유니버스 상태 변경 실패:", error);
      void dialog.alert({ variant: "danger", message: "유니버스 상태 변경에 실패했습니다." });
    } finally {
      setTogglingId(null);
    }
  };

  if (universes.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground mb-4">등록된 유니버스가 없습니다.</p>
        <p className="text-sm text-muted-foreground">
          우측 상단의 "유니버스 추가" 버튼을 클릭하여 새 유니버스를 생성해보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {universes.map((universe) => (
        <div key={universe.id} className="overflow-hidden">
          {/* 썸네일 이미지 */}
          <div className={cn("relative bg-muted pt-[56%]", !universe.enabled && "grayscale-90")}>
            {universe.thumbnail ? (
              <Image
                src={universe.thumbnail}
                alt={universe.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                unoptimized
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <ImageIcon className="text-muted-foreground" size={48} />
              </div>
            )}

            {/* 상태 배지 */}
            <div className="absolute top-2 right-2">
              <Badge variant={universe.enabled ? "primary" : "neutral"} size="sm" className="shadow-sm">
                {universe.enabled ? "활성" : "비활성"}
              </Badge>
            </div>
          </div>

          {/* 컨텐츠 */}
          <div className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="inline-flex items-center gap-1 font-semibold">
                <span className="text-primary font-bold">{universe.order + 1}.</span>
                <span>{universe.name}</span>
              </h3>
              <div className="inline-flex gap-1">
                <Badge variant="outline" size="xs">
                  {universe.id}
                </Badge>
                <Badge variant="outline" size="xs">
                  {universe.type}
                </Badge>
              </div>
            </div>

            {/* 설명 */}
            <div className="space-y-2 mb-4">
              <div>
                <div
                  className="text-sm line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: universe.description[currentLanguage] }}
                />
              </div>
            </div>

            {/* 액션 버튼들 */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(universe)}>
                <Edit className="icon-xs" />
                편집
              </Button>

              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => handleToggleEnabled(universe)}
                disabled={togglingId === universe.id}
                loading={togglingId === universe.id}
              >
                {universe.enabled ? <EyeOff className="icon-xs" /> : <Eye className="icon-xs" />}
              </Button>

              <Button
                variant="destructive"
                size="icon-sm"
                onClick={() => handleDelete(universe)}
                disabled={deletingId === universe.id}
                loading={deletingId === universe.id}
              >
                <Trash2 className="icon-xs" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
