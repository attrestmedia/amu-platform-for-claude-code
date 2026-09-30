"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChatMessage } from "types/ai";
import type { ICommerceProduct } from "types/commerce";
import { useProductStore } from "store/commerce";
import { useUiControlStore } from "store/game";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose useChatCommerce 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain commerce-chat
 * @scope client
 */

// 안정 참조 — selector fallback 시 매번 새 배열 생성으로 인한 effect 재실행 방지
const EMPTY_PRODUCTS: ICommerceProduct[] = [];

export function useChatCommerce(args: {
  open: boolean;
  enabled: boolean;
  universeId: string;

  messages: IChatMessage[];
  scrollToBottom: (behavior?: ScrollBehavior) => void;

  initialProductCodes?: string[];
  initialMessage?: string;
  autoAskOnOpen?: boolean;
  isInitialized: boolean;

  // pipeline send
  sendWithMessage: (overrideText?: string, opts?: { preserveInput?: boolean }) => Promise<void>;
}) {
  const {
    open,
    enabled,
    universeId,
    messages,
    scrollToBottom,
    initialProductCodes,
    autoAskOnOpen,
    isInitialized,
    sendWithMessage,
  } = args;

  const [lastProductCodes, setLastProductCodes] = useState<string[] | null>(null);
  const [productSourceMessageId, setProductSourceMessageId] = useState<string | null>(null);
  const [productInlinePrompt, setProductInlinePrompt] = useState<Record<string, string>>({});
  const [showAllProducts, setShowAllProducts] = useState(false);

  // 이전 코드는 useMemo로 fake-ref를 만들어 lint(react-hooks/immutability)가 mutation을 거부했음.
  // 진짜 useRef로 교체하여 ref mutation이 허용되도록 한다.
  const didAutoAskRef = useRef(false);

  // 복잡 표현식 deps 회피용 안정 키
  const initialProductCodesKey = initialProductCodes?.join(",") ?? "";

  // store selectors — selector가 매번 새 배열을 만들지 않도록 memoize하고, 빈 배열 fallback은 stable 참조 사용.
  const allProductsRaw = useProductStore((s) => s.byUniverse?.[universeId]?.products);
  const allProducts = useMemo<ICommerceProduct[]>(() => allProductsRaw ?? EMPTY_PRODUCTS, [allProductsRaw]);
  const resolveProductCodes = useProductStore((s) => s.resolveProductCodes);

  const { openProduct, cancelOpenProduct } = useUiControlStore();

  // resolved products memo
  const resolvedProducts = useMemo(() => {
    if (!enabled || !universeId || !lastProductCodes?.length) return [];
    const resolved = resolveProductCodes(universeId, lastProductCodes);
    logger.log("[CharacterChat] resolvedProducts:", {
      lastProductCodes,
      count: resolved?.length ?? 0,
      sample: resolved?.[0],
    });
    return resolved;
  }, [enabled, universeId, lastProductCodes, resolveProductCodes]);

  // 커머스 상품 목록 ensureLoaded
  useEffect(() => {
    if (!enabled || !universeId) return;
    useProductStore.getState().ensureLoaded(universeId);
  }, [enabled, universeId]);

  // 닫힐 때 리셋 — open 변경 추적은 render-time prev state 비교(상태 일관성), ref reset은 effect로 분리.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setLastProductCodes(null);
      setProductSourceMessageId(null);
      setProductInlinePrompt({});
      setShowAllProducts(false);
    }
  }
  // ref 변경은 render 중 금지 → effect로 분리
  useEffect(() => {
    if (!open) didAutoAskRef.current = false;
  }, [open]);

  // 최신 assistant 메시지 productCode 추적 — 외부 messages prop 변화에 동기화하는 정당한 subscribe 패턴.
  // set-state-in-effect rule은 cascading render 회피용 권고이지만, 여기는 외부 입력(props)에 대한 단방향 동기화이므로 의도적 disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!messages.length) {
      setLastProductCodes(null);
      setProductSourceMessageId(null);
      return;
    }

    let foundCodes: string[] | null = null;
    let foundMsgId: string | null = null;

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m.isUser && Array.isArray(m.productCode) && m.productCode.length) {
        foundCodes = m.productCode;
        foundMsgId = m.id;
        break;
      }
    }

    if (foundCodes && foundMsgId) {
      setLastProductCodes(foundCodes);
      setProductSourceMessageId(foundMsgId);
    } else {
      const last = messages[messages.length - 1];
      if (last && !last.isUser) setProductSourceMessageId(null);
    }
  }, [messages]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 상세 요청 텍스트
  const buildProductAskMessage = useCallback((p: ICommerceProduct) => {
    const title = p?.title || "해당 상품";
    return `"${title}"에 대해 설명해주세요.`;
  }, []);

  // CTA/이벤트에서 호출되는 상세요청 전송기
  const handleAskForProductDetails = useCallback(
    async (p: ICommerceProduct) => {
      if (!p) return;
      setLastProductCodes(p.id ? [p.id] : null);
      const ask = buildProductAskMessage(p);
      await sendWithMessage(ask, { preserveInput: true });
    },
    [sendWithMessage, buildProductAskMessage],
  );

  // 상품 클릭 핸들러
  const handleProductClick = useCallback(
    async (p: ICommerceProduct) => {
      if (!p) return;

      if (showAllProducts) {
        setShowAllProducts(false);
        openProduct(p, { solo: false });
        return;
      }

      setLastProductCodes(p.id ? [p.id] : null);

      const lastAssistant = [...messages].reverse().find((m) => !m.isUser);
      if (lastAssistant) setProductSourceMessageId(lastAssistant.id);

      openProduct(p, { solo: true });
    },
    [messages, showAllProducts, openProduct],
  );

  // ask/decline window 이벤트
  useEffect(() => {
    const onAsk = (ev: Event) => {
      const e = ev as CustomEvent<{ product: ICommerceProduct }>;
      const prod = e.detail?.product;
      if (prod) void handleAskForProductDetails(prod);
    };

    const onDecline = () => {
      if (productSourceMessageId) {
        setProductInlinePrompt((prev) => ({
          ...prev,
          [productSourceMessageId]: "그럼 다른 어떤 도움이 필요하신가요?",
        }));
        requestAnimationFrame(() => scrollToBottom("auto"));
      }
    };

    window.addEventListener("amu:product-ask", onAsk as EventListener);
    window.addEventListener("amu:product-decline", onDecline as EventListener);

    return () => {
      window.removeEventListener("amu:product-ask", onAsk as EventListener);
      window.removeEventListener("amu:product-decline", onDecline as EventListener);
    };
  }, [handleAskForProductDetails, productSourceMessageId, scrollToBottom]);

  // autoAskOnOpen (첫 턴 자동 질문) — 첫 mount 트리거 패턴. setState는 1회성 자동 액션의 일부로 의도적.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !isInitialized || !enabled) return;
    if (!autoAskOnOpen || didAutoAskRef.current) return;

    const productId = initialProductCodes?.[0];
    if (!productId) return;

    const product = allProducts.find((it) => it.id === productId);
    if (!product) return;

    didAutoAskRef.current = true;
    setLastProductCodes([productId]);
    setProductSourceMessageId((prev) => prev ?? null);
    void handleAskForProductDetails(product);
  }, [
    open,
    isInitialized,
    enabled,
    autoAskOnOpen,
    initialProductCodes,
    initialProductCodesKey,
    allProducts,
    handleAskForProductDetails,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 전체상품을 여는 동안 기존 preview 겹침 방지
  useEffect(() => {
    if (showAllProducts) cancelOpenProduct();
  }, [showAllProducts, cancelOpenProduct]);

  return {
    allProducts,
    resolvedProducts,

    lastProductCodes,
    setLastProductCodes,

    productSourceMessageId,
    setProductSourceMessageId,

    productInlinePrompt,
    setProductInlinePrompt,

    showAllProducts,
    setShowAllProducts,

    handleProductClick,
    handleAskForProductDetails,
  };
}
