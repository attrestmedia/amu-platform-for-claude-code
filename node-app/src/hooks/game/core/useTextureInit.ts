import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { type IBlockImage, type INpcImage, type ITextureRefs, type IExtendedNpcData } from "types/game";
import { logger } from "utils/log";
import { buildDirectionTexturesFromSprite, hasSpriteSheet, textureManager } from "utils/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import { useGameStore } from "store/game";

/**
 * @docHint
 * @purpose useTextureInit 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-texture
 * @scope global
 */

interface UseTextureInitProps {
  user: IExtendedNpcData; // 주인공 캐릭터 페르소나 스냅샷
  npcs: INpcImage[]; // 스테이지용 NPC 목록 (각각 persona를 포함)
  blocks: IBlockImage[];
}

interface TextureLoadingStatus {
  total: number;
  loaded: number;
  failed: number;
  isComplete: boolean;
  progress: number; // 0-100 진행률
}

/**
 * 게임에 필요한 텍스처를 효율적으로 초기화하는 훅
 * - 주인공, NPC, 장애물 텍스처를 최적화된 방식으로 로드
 * - 로딩 상태를 실시간으로 추적
 * - 텍스처 로드 결과를 zustand 스토어에 저장
 */
export function useTextureInit({ user, npcs, blocks }: UseTextureInitProps) {
  const [loadingStatus, setLoadingStatus] = useState<TextureLoadingStatus>({
    total: 0,
    loaded: 0,
    failed: 0,
    isComplete: false,
    progress: 0,
  });

  const setTextures = useGameStore((state) => state.setTextures);

  // rAF로 상태 업데이트 묶기
  const isMountedRef = useRef(true);
  const rafIdRef = useRef<number | null>(null);
  const pendingStatusRef = useRef<TextureLoadingStatus | null>(null);
  const lastProgressRef = useRef<number>(-1);
  const MIN_PROGRESS_STEP = 1; // 1% 미만 변화는 무시

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // 다음 페이로드를 큐에 담고, 프레임당 한 번만 setState
  const queueStatusUpdate = useCallback((next: TextureLoadingStatus) => {
    if (!isMountedRef.current) return;

    if (!next.isComplete && Math.abs(next.progress - lastProgressRef.current) < MIN_PROGRESS_STEP) {
      return;
    }

    pendingStatusRef.current = next;

    if (rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (!isMountedRef.current || !pendingStatusRef.current) return;
        lastProgressRef.current = pendingStatusRef.current.progress;
        setLoadingStatus(pendingStatusRef.current);
        pendingStatusRef.current = null;
      });
    }
  }, []);

  // 입력 세트가 바뀌면 내부 캐시도 무효화
  const cacheKey = useMemo(() => {
    const spriteUrls = [
      hasSpriteSheet(user.sprite) ? user.sprite.url : null,
      ...npcs.map((npc) => (hasSpriteSheet(npc.persona?.sprite) ? npc.persona.sprite!.url : null)),
    ].filter(Boolean) as string[];
    const blockPaths = blocks.map((b) => b.path).filter(Boolean);

    return [...new Set([...spriteUrls, ...blockPaths])].sort().join("|");
  }, [user, npcs, blocks]);

  // cacheKey 변경 시 진행 상태 리셋 — setState는 render-time prev 비교로 회피, ref mutation은 effect에서 처리
  const [prevCacheKey, setPrevCacheKey] = useState(cacheKey);
  if (prevCacheKey !== cacheKey) {
    setPrevCacheKey(cacheKey);
    setLoadingStatus({ total: 0, loaded: 0, failed: 0, isComplete: false, progress: 0 });
  }
  useEffect(() => {
    // 새 입력 세트면 진행률 추적만 리셋 (공유 result 캐시는 제거됨)
    lastProgressRef.current = -1;
  }, [cacheKey]);

  /**
   * 텍스처 프리로드 함수
   * - 주인공, NPC, 장애물 텍스처를 배치 방식으로 로드
   * - 로딩 진행 상황을 실시간 추적
   * - 메모리 최적화를 위한 우선순위 관리
   */
  // 공유 promise/result 캐시 없이 매 호출 독립 실행한다.
  // GameStage와 useGameInit이 각각 호출하므로 이전엔 inflight/result ref를 공유했지만,
  // cacheKey 리셋·finally 정리와 겹쳐 한쪽 await가 null을 받는 레이스로 게임 초기화가 중단됐다(P3 결함).
  // textureManager가 URL 단위로 캐싱하므로 독립 실행해도 중복 네트워크 로드는 없다.
  const preloadTextures = useCallback(async (): Promise<ITextureRefs | null> => {
    {
      let loadedCount = 0;
      let failedCount = 0;

      try {
        const spriteUrls = [
          hasSpriteSheet(user.sprite) ? user.sprite.url : null,
          ...npcs.map((npc) => (hasSpriteSheet(npc.persona?.sprite) ? npc.persona.sprite!.url : null)),
        ].filter(Boolean) as string[];
        const blockTexturePaths = blocks.map((block) => block.path).filter(Boolean) as string[];

        const initialUniquePaths = [...new Set([...spriteUrls, ...blockTexturePaths])];
        const totalCount = initialUniquePaths.length;
        const seen = new Set<string>();

        const countIfFirst = (path: string | null | undefined, ok: boolean) => {
          if (!path || seen.has(path)) return;
          seen.add(path);
          if (ok) loadedCount++;
          else failedCount++;
        };

        setLoadingStatus({ total: totalCount, loaded: 0, failed: 0, isComplete: false, progress: 0 });
        logger.log(`🖼️ 텍스처 프리로딩 시작: 총 ${totalCount}개`);

        const textureRefs: ITextureRefs = {
          protagonist: {
            sprite: null,
            profiles: null,
          },
          npcs: new Map(),
          obstacles: [],
        };

        const progressPayload = (isComplete = false): TextureLoadingStatus => ({
          total: totalCount,
          loaded: loadedCount,
          failed: failedCount,
          isComplete,
          progress: totalCount ? Math.min(100, Math.round((loadedCount / totalCount) * 100)) : 100,
        });

        const BATCH_SIZE = 10;

        for (let i = 0; i < initialUniquePaths.length; i += BATCH_SIZE) {
          const batch = initialUniquePaths.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (path) => {
              try {
                const texture = await textureManager.getTexture(path, path === user.sprite?.url);
                countIfFirst(path, !!texture);
              } catch (error) {
                logger.warn(`⚠️ 텍스처 로드 실패: ${path}`, error);
                countIfFirst(path, false);
              }
            }),
          );

          queueStatusUpdate(progressPayload(false));
          await new Promise((resolve) => setTimeout(resolve, GC.INTERVALS.PRELOAD_DELAY));
        }

        if (hasSpriteSheet(user.sprite)) {
          try {
            textureRefs.protagonist.sprite = await buildDirectionTexturesFromSprite(user.sprite, true);
          } catch (error) {
            logger.warn("⚠️ 주인공 스프라이트 시트 생성 실패:", error);
          }
        }

        for (const npc of npcs) {
          const sprite = npc.persona?.sprite;
          if (!hasSpriteSheet(sprite)) continue;

          try {
            const npcSprite = await buildDirectionTexturesFromSprite(sprite, false);
            textureRefs.npcs.set(npc.persona.pid || sprite.url, { sprite: npcSprite });
          } catch (error) {
            logger.warn(`⚠️ NPC '${npc.persona.name}' 스프라이트 시트 생성 실패:`, error);
          }
        }

        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
          if (!block.path) continue;

          try {
            const texture = await textureManager.getTexture(block.path);
            if (texture) {
              textureRefs.obstacles[i] = texture;
            }
          } catch (error) {
            logger.warn(`⚠️ 장애물 '${block.name}' 텍스처 로드 실패:`, error);
          }
        }

        setLoadingStatus({ ...progressPayload(true), isComplete: true, progress: 100 });
        setTextures(textureRefs);
        return textureRefs;
      } catch (error) {
        logger.error("❌ 텍스처 로드 중 심각한 오류 발생:", error);
        setLoadingStatus((prev) => ({ ...prev, isComplete: true, progress: 100 }));
        return null;
      }
    }
  }, [user, npcs, blocks, setTextures, queueStatusUpdate]);

  return {
    preloadTextures,
    loadingStatus,
  };
}
