import fetchClient from "libs/api/fetchClient";
import type { CardNewsDeck, CardNewsDeckPayload } from "types/card-news";

type CardNewsApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

export class CardNewsDeckApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "CARD_NEWS_API_ERROR") {
    super(message);
    this.name = "CardNewsDeckApiError";
    this.status = status;
    this.code = code;
  }
}

function requireData<T>(response: CardNewsApiEnvelope<T>, fallback: string) {
  if (!response?.ok || response.data === undefined) {
    throw new CardNewsDeckApiError(response?.error || fallback, 500, response?.error || fallback);
  }
  return response.data;
}

function getErrorStatus(error: unknown) {
  const candidate = error as { response?: { status?: unknown }; status?: unknown };
  const responseStatus = Number(candidate?.response?.status);
  if (Number.isFinite(responseStatus) && responseStatus > 0) return responseStatus;
  const status = Number(candidate?.status);
  return Number.isFinite(status) && status > 0 ? status : 500;
}

function getErrorCode(error: unknown) {
  const candidate = error as { response?: { data?: { error?: unknown } }; errorCode?: unknown };
  const responseError = candidate?.response?.data?.error;
  return typeof responseError === "string" && responseError
    ? responseError
    : typeof candidate?.errorCode === "string" && candidate.errorCode
      ? candidate.errorCode
      : "CARD_NEWS_API_ERROR";
}

function rethrow(error: unknown): never {
  if (error instanceof CardNewsDeckApiError) throw error;
  const candidate = error as { message?: unknown };
  throw new CardNewsDeckApiError(
    typeof candidate?.message === "string" && candidate.message ? candidate.message : "카드뉴스 요청에 실패했습니다.",
    getErrorStatus(error),
    getErrorCode(error),
  );
}

const BASE_PATH = "/lab/card-news/decks";

export async function createCardNewsDeck(payload?: Partial<CardNewsDeckPayload>) {
  try {
    const response = await fetchClient.post<CardNewsApiEnvelope<CardNewsDeck>>(
      BASE_PATH,
      payload ? { deck: payload } : {},
      { responseType: "auto" },
    );
    return requireData(response.data, "카드뉴스 덱을 만들지 못했습니다.");
  } catch (error) {
    return rethrow(error);
  }
}

export async function listCardNewsDecks(params?: { limit?: number; skip?: number }) {
  try {
    const response = await fetchClient.get<CardNewsApiEnvelope<{
      items: CardNewsDeck[];
      total: number;
      invalidCount?: number;
    }>>(BASE_PATH, {
      params: { limit: params?.limit ?? 20, skip: params?.skip ?? 0 },
      responseType: "auto",
      cache: "no-store",
    });
    return requireData(response.data, "카드뉴스 목록을 불러오지 못했습니다.");
  } catch (error) {
    return rethrow(error);
  }
}

export async function getCardNewsDeck(deckId: string) {
  try {
    const response = await fetchClient.get<CardNewsApiEnvelope<CardNewsDeck>>(
      `${BASE_PATH}/${encodeURIComponent(String(deckId || "").trim())}`,
      { responseType: "auto", cache: "no-store" },
    );
    return requireData(response.data, "카드뉴스 덱을 불러오지 못했습니다.");
  } catch (error) {
    return rethrow(error);
  }
}

export async function updateCardNewsDeck(
  deckId: string,
  patch: Partial<CardNewsDeckPayload>,
  revision: number,
) {
  try {
    const response = await fetchClient.patch<CardNewsApiEnvelope<CardNewsDeck>>(
      `${BASE_PATH}/${encodeURIComponent(String(deckId || "").trim())}`,
      { patch, revision },
      { responseType: "auto" },
    );
    return requireData(response.data, "카드뉴스 저장에 실패했습니다.");
  } catch (error) {
    return rethrow(error);
  }
}

export async function deleteCardNewsDeck(deckId: string, revision: number) {
  try {
    const response = await fetchClient.deleteWithBody<CardNewsApiEnvelope<{
      deckId: string;
      state: "deleted";
      revision: number;
      deletedAt: string | null;
    }>>(`${BASE_PATH}/${encodeURIComponent(String(deckId || "").trim())}`, { revision }, { responseType: "auto" });
    return requireData(response.data, "카드뉴스 덱을 삭제하지 못했습니다.");
  } catch (error) {
    return rethrow(error);
  }
}
