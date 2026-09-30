import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { NpcSpriteType, IExtendedNpcData } from "types/game";
import type { ICommerceProduct } from "types/commerce";
import { GAME_CONSTANTS as GC } from "consts/game";
import { isCollidingWithBuffer } from "utils/game";
import { genUniqueId } from "utils/common";
import { useUiControlStore } from "store/game";

/**
 * @docHint
 * @purpose useCommerceProductContact 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain commerce-stage
 * @scope client
 */

interface UseCommerceProductContactProps {
  enabled: boolean;
  protagonistRef: RefObject<NpcSpriteType | null>;
  obstaclesRef: RefObject<NpcSpriteType[]>;
  userSize: number;
  productDetailOpen: boolean;
  productConfirmOpen: boolean;
  askOpenProduct: (product: ICommerceProduct, source: "click" | "contact") => void;
  pickStageSpeaker: () => IExtendedNpcData | null;
  setStageChatSpeaker: (speaker: IExtendedNpcData | null) => void;
}

export function useCommerceProductContact({
  enabled,
  protagonistRef,
  obstaclesRef,
  userSize,
  productDetailOpen,
  productConfirmOpen,
  askOpenProduct,
  pickStageSpeaker,
  setStageChatSpeaker,
}: UseCommerceProductContactProps) {
  // 상품 팝업 쿨다운, 중복 접촉 방지용 ref
  const lastPromptAtRef = useRef<number>(0);
  const inContactIdRef = useRef<string | null>(null);

  // 쿨다운 시간은 스토어에서 구독
  const productCooldownUntil = useUiControlStore((s) => s.productCooldownUntil);

  useEffect(() => {
    if (!enabled) return;

    const INTERVAL = 120;

    const tick = () => {
      const p = protagonistRef.current;
      if (!p || p.destroyed) return;

      const now = Date.now();

      // 상품 상세/컨펌 모달이 열려 있으면 접촉 처리 중단
      if (productDetailOpen || productConfirmOpen) return;

      const prect = {
        id: genUniqueId("protagonist"),
        x: p.x,
        y: p.y,
        width: userSize,
        height: userSize,
      };

      let hitId: string | null = null;
      let hitProduct: ICommerceProduct | null = null;

      const obstacles = obstaclesRef.current ?? [];
      for (const ob of obstacles) {
        if (!ob?.role?.includes("product")) continue;

        const rect = {
          id: genUniqueId("rect"),
          x: ob.x,
          y: ob.y,
          width: ob.width,
          height: ob.height,
        };
        const buf = GC.COMMERCE.PRODUCT_CONTACT_BUFFER ?? 0;

        if (isCollidingWithBuffer(prect, rect, buf)) {
          // NpcSpriteType.productData는 { id? } 좁은 타입이지만 실제 런타임에는 full ICommerceProduct가 들어옴.
          const data = ob.productData as ICommerceProduct | undefined;
          if (data) {
            hitId = data.id;
            hitProduct = data;
          }
          break;
        }
      }

      // 가드 시간 동안은 팝업 X, 하지만 "접촉 중인 상품" 상태는 기록
      const { initialContactGuardUntil } = useUiControlStore.getState();
      if (hitId && now < initialContactGuardUntil) {
        if (inContactIdRef.current !== hitId) {
          inContactIdRef.current = hitId;
        }
        return;
      }

      // ENTER: 새 상품에 처음 접촉했을 때만 트리거
      if (hitId && inContactIdRef.current !== hitId) {
        inContactIdRef.current = hitId;
        const gapOk = now - lastPromptAtRef.current >= GC.INTERACTION.COOLDOWN_MS;

        if (hitProduct && now >= productCooldownUntil && gapOk) {
          lastPromptAtRef.current = now;

          const speaker = pickStageSpeaker();
          if (speaker) setStageChatSpeaker(speaker);

          askOpenProduct(hitProduct, "contact");
        }
      }

      // LEAVE: 접촉이 끊어지면 상태 초기화
      if (!hitId && inContactIdRef.current) {
        inContactIdRef.current = null;
      }
    };

    const timer = window.setInterval(tick, INTERVAL);
    return () => window.clearInterval(timer);
  }, [
    enabled,
    protagonistRef,
    obstaclesRef,
    userSize,
    productDetailOpen,
    productConfirmOpen,
    askOpenProduct,
    pickStageSpeaker,
    setStageChatSpeaker,
    productCooldownUntil,
  ]);
}
