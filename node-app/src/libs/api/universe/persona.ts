import fetchClient from "libs/api/fetchClient";
import { logger } from "utils/log";
import type { IExtendedNpcData } from "types/game";
import type { IPersona } from "types/ai";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/universe/persona) 호출 구성  응답/에러 정리 반환
 * @domain universe
 * @scope client
 */

interface PersonaRequestParams {
  collection?: string;
  pids?: string[];
  all?: boolean;
  options?: UnknownRecord;
}

// ====================================================================
// mongodb/getDocumentData
// ====================================================================

const PERSONA_API_URL = "/universe/persona";

// 페르소나 데이터 가져오기
export async function getPersonas(params?: PersonaRequestParams): Promise<IExtendedNpcData[]> {
  try {
    const { collection, ...rest } = params || {};
    const paramsObj: UnknownRecord = { ...rest };
    if (collection) paramsObj.collectionName = collection;

    const response = await fetchClient.get<IExtendedNpcData[]>(PERSONA_API_URL, { params: paramsObj });
    return response.data;
  } catch (error) {
    console.error("페르소나 데이터 가져오기 실패:", error);
    throw error;
  }
}

// 지정된 컬렉션에서 특정 페르소나들의 데이터를 가져오기
export async function getPersonasBy({
  collection,
  pids,
}: {
  collection: string;
  pids: string[];
}): Promise<IExtendedNpcData[]> {
  try {
    const response = await fetchClient.get<IExtendedNpcData[]>(PERSONA_API_URL, {
      params: {
        collectionName: collection,
        pids: pids.join(","),
      },
    });

    return response.data;
  } catch (error) {
    console.error("특정 페르소나 데이터 가져오기 실패:", error);
    throw error;
  }
}

// ====================================================================
// ** api/persona
// ====================================================================

// 특정 컬렉션의 전체 페르소나 데이터 가져오기
export async function getAllPersonas(collectionName: string): Promise<IExtendedNpcData[]> {
  try {
    logger.log("[Client] getAllPersonas 호출:", { collectionName });

    const response = await fetchClient.get(PERSONA_API_URL, {
      params: {
        collectionName,
        all: true,
      },
    });

    logger.log("[Client] getAllPersonas 응답:", {
      status: response.status,
      dataLength: Array.isArray(response.data) ? response.data.length : "not array",
      dataType: typeof response.data,
    });

    if (!Array.isArray(response.data)) {
      logger.error("[Client] 응답 데이터가 배열이 아님:", response.data);
      return [];
    }

    return response.data;
  } catch (error) {
    logger.error("[Client] 전체 페르소나 데이터 가져오기 실패:", error);

    // 에러 상세 정보 로깅
    if (error instanceof Error) {
      logger.error("[Client] 에러 상세:", {
        name: error.name,
        message: error.message,
        stack: error.stack?.split("\n").slice(0, 3),
      });
    }

    throw error;
  }
}

// 보유 캐릭터 우선 + 나머지 랜덤 보충, 카드용 최소 데이터만 반환
export async function getSelectablePersonas(params: {
  collection: string; // 유니버스/컬렉션 ID
  limit?: number; // 기본 10
  ownedPids?: string[]; // 보유 캐릭터 pid
  excludePids?: string[]; // 제외할 pid (선택)
}): Promise<IExtendedNpcData[]> {
  const response = await fetchClient.get<IExtendedNpcData[]>(PERSONA_API_URL, {
    params: {
      collectionName: params.collection,
      action: "selectable",
      limit: params.limit ?? 10,
      ownedPids: (params.ownedPids || []).join(","),
      excludePids: (params.excludePids || []).join(","),
    },
  });

  return response.data || [];
}

// 상세 모달용: 특정 pid만 단건/소수 조회
export async function getPersonaDetail(collection: string, pid: string): Promise<IExtendedNpcData | null> {
  const result = await getPersonasBy({ collection, pids: [pid] });
  return result?.[0] ?? null;
}

// 페르소나 저장/업데이트
type PersonaApiEnvelope<T> = { success?: boolean; data?: T; error?: string };

export async function savePersona(params: {
  collectionName: string; // 유니버스 ID (persona DB 컬렉션명)
  data: IPersona; // PersonaEditor 폼 값
}) {
  try {
    const response = await fetchClient.post<PersonaApiEnvelope<IExtendedNpcData>>(PERSONA_API_URL, {
      collectionName: params.collectionName,
      data: params.data,
    });

    if (!response.data?.success) {
      throw new Error(response.data?.error || "save_failed");
    }

    return response.data.data as IExtendedNpcData;
  } catch (error) {
    logger.error("[Client] 페르소나 저장 실패:", error);
    throw error;
  }
}

// 페르소나와 서버에서 연결된 system_personas도 함께 삭제
export async function deletePersona(params: { collectionName: string; pid: string }) {
  try {
    const response = await fetchClient.delete<PersonaApiEnvelope<unknown>>(PERSONA_API_URL, {
      params: {
        collectionName: params.collectionName,
        pid: params.pid,
      },
    });

    if (!response.data?.success) {
      throw new Error(response.data?.error || "delete_failed");
    }

    return true;
  } catch (error) {
    logger.error("[Client] 페르소나 삭제 실패:", error);
    throw error;
  }
}
