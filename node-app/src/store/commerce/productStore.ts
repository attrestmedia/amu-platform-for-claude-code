import { create } from "zustand";
import type { ICommerceProduct } from "types/commerce";
import { GAME_CONSTANTS as GC } from "consts/game";
import fetchClient from "libs/api/fetchClient";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain commerce
 * @scope client
 */

type State = {
  byUniverse: Record<string, { products: ICommerceProduct[]; fetchedAt: number }>;
};

type Actions = {
  ensureLoaded: (universeId: string) => Promise<ICommerceProduct[]>;
  hydrateProducts: (universeId: string, products: ICommerceProduct[]) => void;
  getById: (universeId: string, id: string) => ICommerceProduct | undefined;
  resolveProductCodes: (universeId: string, codes: string[]) => ICommerceProduct[];
  invalidate: (universeId: string) => void;

  // 문장으로 상품 검색 (동기)
  searchByText: (
    universeId: string,
    text: string,
    options?: { limit?: number; minScore?: number }
  ) => ICommerceProduct[];

  // 문장으로 productCode 배열 생성 (동기)
  findProductCodesByText: (
    universeId: string,
    text: string,
    options?: { limit?: number; minScore?: number }
  ) => string[];

  getRecommendedProducts: (
    universeId: string,
    options?: {
      seedText?: string;
      category?: string;
      itemType?: ICommerceProduct["itemType"];
      excludeIds?: string[];
      limit?: number;
    }
  ) => ICommerceProduct[];
};

function normalizeCommerceText(str: string) {
  return String(str || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeCommerceText(str: string) {
  return normalizeCommerceText(str)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function buildProductSearchText(product: ICommerceProduct) {
  const specText = product.specs ? JSON.stringify(product.specs) : "";
  return [product.title, product.summary, product.detail, product.category, product.itemType, specText].filter(Boolean).join(" ");
}

export const useProductStore = create<State & Actions>((set, get) => ({
  byUniverse: {},
  ensureLoaded: async (universeId) => {
    const s = get().byUniverse[universeId];
    if (s?.products?.length) return s.products;

    const res = await fetchClient.get<{ data?: { products?: ICommerceProduct[] } }>(
      `/universe/${universeId}/commerce/storefront-products`,
      { cache: "no-store" },
    );
    const json = res.data;
    const products: ICommerceProduct[] = json?.data?.products || [];

    set((st) => ({
      byUniverse: { ...st.byUniverse, [universeId]: { products, fetchedAt: Date.now() } },
    }));
    return products;
  },
  hydrateProducts: (universeId, products) =>
    set((st) => ({
      byUniverse: {
        ...st.byUniverse,
        [universeId]: {
          products: Array.isArray(products) ? products : [],
          fetchedAt: Date.now(),
        },
      },
    })),
  getById: (universeId, id) => {
    const s = get().byUniverse[universeId];
    return s?.products?.find((p) => p.id === id);
  },
  resolveProductCodes: (universeId, codes) => {
    const s = get().byUniverse[universeId];
    const mapById = new Map(s?.products?.map((p) => [p.id, p]) || []);
    return codes.map((c) => mapById.get(c)).filter(Boolean) as ICommerceProduct[];
  },
  invalidate: (universeId) =>
    set((st) => {
      const next = { ...st.byUniverse };
      delete next[universeId];
      return { byUniverse: next };
    }),

  // 문장 기반 상품 검색
  searchByText: (universeId, rawText, options) => {
    const s = get().byUniverse[universeId];
    const products = s?.products || [];
    const limit = options?.limit ?? GC.COMMERCE.MAX_PRODUCTS_PER_STAGE;
    const minScore = GC.COMMERCE.SEARCH_MIN_SCORE;

    if (!rawText || rawText.trim().length < 2 || products.length === 0) return [];

    // 과도한 길이 컷 (ex. 너무 긴 텍스트일 경우 맨 앞 200자만 사용)
    const MAX_LEN = 200;
    const text = rawText.length > MAX_LEN ? rawText.slice(0, MAX_LEN) : rawText;

    const quotedPhrases = Array.from(text.matchAll(/['"`“”‘’](.+?)['"`“”‘’]/g))
      .map((m) => normalizeCommerceText(m[1]))
      .filter(Boolean);

    const textTokens = new Set(tokenizeCommerceText(text));

    const scoreProduct = (p: ICommerceProduct) => {
      const titleNorm = normalizeCommerceText(p.title || "");
      const searchText = buildProductSearchText(p);
      const searchTextNorm = normalizeCommerceText(searchText);
      const allTokens = new Set(tokenizeCommerceText(searchText));
      if (allTokens.size === 0) return 0;

      // 토큰 겹침
      let overlap = 0;
      for (const t of textTokens) if (allTokens.has(t)) overlap++;
      const tokenScore = overlap / Math.max(1, allTokens.size);

      // 따옴표 구절 포함 가중치 (title/summary 모두 체크)
      let phraseBoost = 0;
      for (const q of quotedPhrases) {
        if (q.length >= 4 && (titleNorm.includes(q) || searchTextNorm.includes(q))) {
          phraseBoost = Math.max(phraseBoost, 0.8);
        }
      }

      // 제목 내 포함 가중치 (summary는 과도 노이즈라 제외)
      let containsBoost = 0;
      for (const t of textTokens) {
        if (t.length >= 3 && titleNorm.includes(t)) {
          containsBoost = Math.max(containsBoost, Math.min(0.4, t.length / 20));
        }
      }

      const score = Math.max(0, Math.min(1, phraseBoost + containsBoost + 0.6 * tokenScore));
      return score;
    };

    const scored = products
      .map((p) => ({ p, score: scoreProduct(p) }))
      .filter(({ score }) => score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ p }) => p);

    return scored;
  },

  // productCode 배열로 변환
  findProductCodesByText: (universeId, text, options) => {
    const items = get().searchByText(universeId, text, options);
    return items.map((p) => p.id);
  },

  getRecommendedProducts: (universeId, options) => {
    const products = get().byUniverse[universeId]?.products || [];
    const limit = Math.max(1, options?.limit ?? 6);
    if (products.length === 0) return [];

    const excludeIds = new Set((options?.excludeIds || []).map((item) => String(item || "").trim()).filter(Boolean));
    const seedText = String(options?.seedText || "").trim();
    const searchSeed =
      seedText.length >= 2
        ? get().searchByText(universeId, seedText, {
            limit: Math.max(limit * 2, 8),
            minScore: Math.max(0.2, GC.COMMERCE.SEARCH_MIN_SCORE - 0.1),
          })
        : [];

    const normalizedCategory = normalizeCommerceText(options?.category || "");
    const matchedCategories = new Set(
      [normalizedCategory, ...searchSeed.map((product) => normalizeCommerceText(product.category || ""))].filter(Boolean),
    );
    const matchedItemTypes = new Set(
      [options?.itemType, ...searchSeed.map((product) => product.itemType)].filter(Boolean) as Array<ICommerceProduct["itemType"]>,
    );
    const searchRanks = new Map(searchSeed.map((product, index) => [product.id, index]));

    return products
      .filter((product) => !excludeIds.has(product.id))
      .map((product) => {
        const orderScore = typeof product.displayOrder === "number" ? product.displayOrder : Number(product.order || 9999);
        let score = 0;

        if (product.featured) score += 1.4;
        if (product.inStock !== false) score += 0.2;
        if (matchedCategories.size && matchedCategories.has(normalizeCommerceText(product.category || ""))) score += 1.1;
        if (matchedItemTypes.size && product.itemType && matchedItemTypes.has(product.itemType)) score += 0.35;

        const searchRank = searchRanks.get(product.id);
        if (typeof searchRank === "number") {
          score += 1.6 - Math.min(1, searchRank * 0.12);
        }

        score += Math.max(0, 0.6 - Math.min(orderScore, 12) * 0.04);

        return { product, score, orderScore };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.orderScore - b.orderScore;
      })
      .slice(0, limit)
      .map(({ product }) => product);
  },
}));
