import { useCallback } from "react";
import { Text } from "pixi.js";
import type { IExtendedNpcData, NpcSpriteType, ITextureRefs } from "types/game";
import { logger } from "utils/log";
import {
  buildDirectionTexturesFromSprite,
  createCharacterNameContainer,
  destroyDirectionTextureMap,
  getSpriteIdleDirection,
  hasSpriteSheet,
  pickDirectionTexture,
  textureManager,
} from "utils/game";
import { useNicknameManager } from "../input";
import { GAME_CONSTANTS as GC } from "consts/game";

/**
 * @docHint
 * @purpose useProtagonistUpdate 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-character
 * @scope stage-runtime
 */

interface UseProtagonistUpdateProps {
  protagonistRef: React.RefObject<NpcSpriteType | null>;
  texturesRef: React.RefObject<ITextureRefs>;
  userSize: number;
  // 선택적: 텍스처가 업데이트될 때 호출될 콜백
  onTexturesUpdated?: () => void;
}

// 프로타고니스트 텍스처 업데이트를 처리하는 훅
export function useProtagonistUpdate({
  protagonistRef,
  texturesRef,
  userSize,
  onTexturesUpdated,
}: UseProtagonistUpdateProps) {
  const { getDisplayName } = useNicknameManager();

  // 주인공 이름만 업데이트하는 함수
  const updateProtagonistName = useCallback(
    (newNickname?: string): void => {
      if (!protagonistRef.current) return;

      try {
        // 기존 이름 컨테이너 찾기
        const existingNameContainer = protagonistRef.current.nameContainer;

        if (existingNameContainer) {
          // 기존 컨테이너에서 텍스트 업데이트
          const nameText = existingNameContainer.children[0];
          if (nameText && nameText instanceof Text) {
            // 별명이 있으면 별명 사용, 없으면 기존 이름 사용
            const currentCharacterName = protagonistRef.current.data?.persona?.name || "";
            const displayName = newNickname || currentCharacterName;

            nameText.text = displayName;
            logger.log(`🔄 주인공 이름 실시간 업데이트: ${displayName}`);
          }
        } else {
          logger.warn("주인공 이름 컨테이너를 찾을 수 없습니다.");
        }
      } catch (error) {
        logger.error("주인공 이름 업데이트 중 오류:", error);
      }
    },
    [protagonistRef],
  );

  // 주인공 이름 컨테이너 업데이트 함수
  const updateProtagonistNameContainer = useCallback(
    (characterData: IExtendedNpcData): void => {
      if (!protagonistRef.current || !characterData.name) return;

      try {
        // 현재 캐릭터의 별명 확인
        const nickname = getDisplayName(characterData);
        const displayName = nickname || characterData.name;

        // 기존 이름 컨테이너 찾기
        const existingNameContainer = protagonistRef.current.nameContainer;

        if (existingNameContainer) {
          // 기존 컨테이너에서 텍스트만 업데이트
          const nameText = existingNameContainer.children[0];
          if (nameText && nameText instanceof Text) {
            nameText.text = displayName;
            logger.log(`🔄 주인공 이름 업데이트: ${displayName}`);
          }
        } else {
          // 이름 컨테이너가 없으면 공통 함수로 새로 생성
          logger.warn("주인공 이름 컨테이너가 없어 새로 생성합니다.");

          const stageContainer = protagonistRef.current.parent;
          if (stageContainer) {
            const nameContainer = createCharacterNameContainer({
              stageContainer,
              label: "protagonist-name",
              name: displayName,
              x: protagonistRef.current.x,
              y: protagonistRef.current.y,
              size: userSize,
              color: GC.UI.USER_TEXT_COLOR,
              zIndex: GC.STAGE.Z_INDEX.NPC_NAME, // 기존 3과 동일 레벨로 사용
            });

            protagonistRef.current.nameContainer = nameContainer;
          }
        }
      } catch (error) {
        logger.error("주인공 이름 컨테이너 업데이트 중 오류:", error);
      }
    },
    [userSize, protagonistRef, getDisplayName],
  );

  // 프로타고니스트 텍스처 업데이트 함수
  const updateProtagonistTexture = useCallback(
    async (characterData: IExtendedNpcData): Promise<void> => {
      if (!characterData.pid) {
        logger.error("캐릭터 데이터에 pid가 없습니다.");
        return Promise.reject("Invalid character data");
      }

      try {
        logger.log(`프로타고니스트 텍스처 업데이트 시작: ${characterData.name} (${characterData.pid})`);

        if (!hasSpriteSheet(characterData.sprite)) {
          logger.error("프로타고니스트 스프라이트 시트를 찾을 수 없습니다.", {
            pid: characterData.pid,
            sprite: characterData.sprite,
          });
          throw new Error("protagonist sprite sheet not found");
        }

        textureManager.removeFromCache(characterData.sprite.url);
        const directionTextures = await buildDirectionTexturesFromSprite(characterData.sprite, true);

        // 이전 방향 텍스처 map — 새 텍스처가 스프라이트에 적용된 "이후" 해제 (P1-6)
        const prevSpriteMap = texturesRef.current?.protagonist?.sprite ?? null;

        if (texturesRef.current) {
          const prevProfiles = texturesRef.current.protagonist?.profiles ?? null;

          texturesRef.current = {
            ...texturesRef.current,
            protagonist: {
              sprite: directionTextures,
              profiles: prevProfiles,
            },
          };

          logger.log("✅ 프로타고니스트 텍스처 참조(IDirectionTextureMap) 업데이트 완료");
        }

        let appliedNewTexture = false;

        if (protagonistRef.current) {
          const currentDirection = protagonistRef.current.data?.direction || getSpriteIdleDirection(characterData.sprite);
          const newTexture = pickDirectionTexture(directionTextures, currentDirection, 0);

          if (newTexture) {
            appliedNewTexture = true;
            protagonistRef.current.texture = newTexture;

            // v2(논리 좌표) 주인공은 init에서 spriteRatio 기반 비정사각 크기를 갖는다 —
            // userSize 정사각으로 되돌리면 스프라이트가 왜곡되므로 기존 크기를 보존 (ISO-5R)
            const hasLogicalAnchor = protagonistRef.current.__logicalPosition != null;
            if (
              !hasLogicalAnchor &&
              (protagonistRef.current.width !== userSize || protagonistRef.current.height !== userSize)
            ) {
              protagonistRef.current.width = userSize;
              protagonistRef.current.height = userSize;
            }

            protagonistRef.current.data = {
              ...protagonistRef.current.data,
              direction: currentDirection,
              displayName: characterData.name,
            };

            if ("currentDirection" in protagonistRef.current) {
              protagonistRef.current.currentDirection = currentDirection;
            }

            logger.log(
              `🎮 프로타고니스트 스프라이트 업데이트 완료 (방향: ${currentDirection}, 캐릭터: ${characterData.pid})`,
            );
          }
        }

        // 이전 방향 텍스처 해제 (P1-6 — 생성/해제 쌍, base는 TextureManager 소유로 보존)
        // 스프라이트가 새 텍스처로 교체됐거나 스프라이트가 없을 때만 해제 —
        // 새 텍스처 적용 실패 시(구 텍스처 계속 사용) 파괴된 텍스처 참조 방지
        if (prevSpriteMap && prevSpriteMap !== directionTextures && (appliedNewTexture || !protagonistRef.current)) {
          destroyDirectionTextureMap(prevSpriteMap);
        }

        // 이름 컨테이너 업데이트
        // (기존 updateProtagonistNameContainer 그대로 호출)

        updateProtagonistNameContainer(characterData);

        if (onTexturesUpdated) {
          onTexturesUpdated();
        }

        return Promise.resolve();
      } catch (error) {
        logger.error("프로타고니스트 텍스처 업데이트 중 오류:", error);
        return Promise.reject(error);
      }
    },
    [
      userSize,
      protagonistRef,
      texturesRef,
      onTexturesUpdated,
      updateProtagonistNameContainer,
    ],
  );

  return { updateProtagonistTexture, updateProtagonistName };
}

export default useProtagonistUpdate;
