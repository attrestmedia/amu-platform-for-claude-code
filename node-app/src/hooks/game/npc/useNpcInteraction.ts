import { useCallback, useMemo } from "react";
import type { NpcSpriteType, NpcActionType, IExtendedNpcData, ITextureRefs, DirectionFacingType } from "types/game";
import {
  buildDirectionTexturesFromSprite,
  calculateDirectionToTarget,
  getOppositeDirection,
  getSpriteIdleDirection,
  hasSpriteSheet,
  pickDirectionTexture,
} from "utils/game";
import { logger } from "utils/log";
import { useGameContext } from "contexts/GameContext";
import { useNpcActionStore } from "store/game";

/**
 * @docHint
 * @purpose useNpcInteraction 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-npc
 * @scope stage-interaction
 */

interface UseNpcInteractionProps {
  protagonistRef: React.RefObject<NpcSpriteType | null>;
  protagonistBaseYRef: React.RefObject<number | null>;
  texturesRef: React.RefObject<ITextureRefs>;
  userSize: number;
  npcSize: number;
  onNpcAction?: (npcData: NpcActionType, protagonistPos?: { x: number; y: number }) => void;
}

export function useNpcInteraction({
  protagonistRef,
  protagonistBaseYRef,
  texturesRef,
  userSize,
  npcSize,
  onNpcAction,
}: UseNpcInteractionProps) {
  const { dispatch } = useGameContext();

  // NPC 방향 계산 헬퍼
  const calculateNpcDirection = useCallback(
    (
      npcX: number,
      npcY: number,
      protagonistX: number,
      protagonistY: number,
      fallback: DirectionFacingType = "down",
    ): DirectionFacingType => calculateDirectionToTarget(npcX, npcY, protagonistX, protagonistY, fallback),
    [],
  );

  // NPC 스프라이트 텍스처 변경 함수
  const updateNpcFacingDirection = useCallback(
    async (npc: NpcSpriteType, direction: DirectionFacingType): Promise<void> => {
      if (npc.currentDirection === direction) return;

      const rawData = npc.data;
      if (!rawData) return;

      const persona: IExtendedNpcData =
        (rawData.persona as IExtendedNpcData) || (rawData as unknown as IExtendedNpcData);
      if (!hasSpriteSheet(persona?.sprite)) return;

      try {
        const npcKey = persona.pid || rawData.id || "unknown-npc";
        let directionTextures = texturesRef.current?.npcs?.get(npcKey)?.sprite;

        if (!directionTextures) {
          directionTextures = await buildDirectionTexturesFromSprite(persona.sprite, true);
          if (texturesRef.current) {
            const nextMap = new Map(texturesRef.current.npcs);
            nextMap.set(npcKey, { sprite: directionTextures });
            texturesRef.current = { ...texturesRef.current, npcs: nextMap };
          }
        }

        const texture = pickDirectionTexture(directionTextures, direction, 0);
        if (!texture) return;

        npc.texture = texture;
        npc.currentDirection = direction;

        logger.log(`NPC ${persona.name || persona.pid} 방향 변경: ${direction}`);
      } catch (error) {
        logger.warn(`Failed to update NPC texture for direction ${direction}:`, error);
      }
    },
    [texturesRef],
  );

  // NPC와 상호작용하는 함수
  const handleNpcInteraction = useCallback(
    (npc: NpcSpriteType, protagonistX?: number, protagonistY?: number): void => {
      if (!npc.data || !protagonistRef.current || protagonistBaseYRef.current === null) return;

      // NPC 액션 스토어에서 상호작용 진행 중 여부 확인
      const { isActionOpen, isInteractionProcessing } = useNpcActionStore.getState();
      if (isActionOpen || isInteractionProcessing) return; // 이미 액션 진행 중이면 무시

      // Context를 통해 방향 상태 초기화
      dispatch({ type: "SET_KEYBOARD_DIRECTION", payload: null });

      const npcCenterX = npc.__logicalPosition ? npc.x : npc.x + npcSize / 2;
      const npcCenterY = npc.__logicalPosition ? npc.y : npc.y + npcSize / 2;
      const protCenterX =
        protagonistX ??
        (protagonistRef.current.__logicalPosition
          ? protagonistRef.current.x
          : protagonistRef.current.x + userSize / 2);
      const protCenterY =
        protagonistY ??
        (protagonistRef.current.__logicalPosition
          ? protagonistBaseYRef.current
          : protagonistBaseYRef.current + userSize / 2);
      const rawData = npc.data as unknown as IExtendedNpcData | undefined;
      const npcPersona: IExtendedNpcData | undefined = npc.data?.persona ?? rawData;
      const currentNpcDirection = (npc.currentDirection ||
        npc.data?.direction ||
        getSpriteIdleDirection(npcPersona?.sprite)) as DirectionFacingType;

      const npcDirection = calculateNpcDirection(npcCenterX, npcCenterY, protCenterX, protCenterY, currentNpcDirection);

      updateNpcFacingDirection(npc, npcDirection).catch(logger.error);

      // 프로타고니스트 방향 변경
      if (protagonistRef.current) {
        const protagonistDirection = getOppositeDirection(npcDirection);

        protagonistRef.current.data = {
          ...protagonistRef.current.data,
          direction: protagonistDirection,
        };

        const spriteMap = texturesRef.current?.protagonist?.sprite;
        const frames = spriteMap?.[protagonistDirection];

        if (frames && frames.length > 0) {
          // 상호작용 시에는 첫 프레임만 사용 (정면 응답 느낌)
          protagonistRef.current.texture = frames[0];
        }
      }

      logger.log("npc interaction data => ", npc.data);

      // 상호작용 콜백 실행
      if (onNpcAction) {
        if (protagonistRef.current) {
          onNpcAction(npc.data as NpcActionType, {
            x: protCenterX,
            y: protCenterY,
          });
        } else {
          onNpcAction(npc.data as NpcActionType);
        }
      }
    },
    [
      calculateNpcDirection,
      updateNpcFacingDirection,
      protagonistRef,
      protagonistBaseYRef,
      texturesRef,
      userSize,
      npcSize,
      onNpcAction,
      dispatch,
    ],
  );

  // 메시지 제거 헬퍼 함수
  const removeNpcMessage = useCallback((npc: NpcSpriteType): void => {
    // 이름 라벨이 아닌 다른 메시지만 제거
    const children = npc.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      // 이제 npc-name-text 라벨만 체크하면 됨
      if (child.label && child.label !== "npc-name-text") {
        npc.removeChild(child);
      }
    }
  }, []);

  return useMemo(
    () => ({
      calculateNpcDirection,
      updateNpcFacingDirection,
      handleNpcInteraction,
      removeNpcMessage,
    }),
    [calculateNpcDirection, updateNpcFacingDirection, handleNpcInteraction, removeNpcMessage],
  );
}
