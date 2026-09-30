import { getModel } from "libs/database/modelCache";
import type { IUniverseDetailDocument } from "models/universe";
import { UniverseDetailSchema } from "models/universe";
import type { IUniverseDetail } from "types/game";
import { MONGODB_AMU_URL } from "consts/env/server";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process get, upsert 작업  DB 조회/저장 수행
 * @domain universe
 * @scope server
 */

// 유니버스별 상세 데이터 모델 가져오기
async function getUniverseDetailModel(universeId: string) {
  const modelName = `${universeId}_details`;
  return await getModel<IUniverseDetailDocument>(MONGODB_AMU_URL, modelName, UniverseDetailSchema, modelName);
}

// Document를 IUniverseDetail 타입으로 안전하게 변환하는 헬퍼 함수
type RawUniverseDetail = IUniverseDetail;
function documentToUniverseDetail(doc: RawUniverseDetail): IUniverseDetail {
  return {
    universeId: doc.universeId,
    products: doc.products,
    settings: doc.settings,
    metadata: doc.metadata,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// 유니버스별 상세 데이터 조회 (단일)
export async function getUniverseDetail(universeId: string): Promise<IUniverseDetail | null> {
  try {
    const UniverseDetailModel = await getUniverseDetailModel(universeId);
    const result = await UniverseDetailModel.findOne({ universeId }).lean<IUniverseDetail>();

    if (!result) return null;

    return documentToUniverseDetail(result);
  } catch (error) {
    logger.error(`유니버스 상세 데이터 조회 오류 (${universeId}):`, error);
    throw error;
  }
}

// 유니버스별 상세 데이터 조회 (다중) - 기존 API와의 호환성을 위해 유지
export async function getUniverseDetails(universeId: string): Promise<IUniverseDetail[]> {
  try {
    const UniverseDetailModel = await getUniverseDetailModel(universeId);
    const results = await UniverseDetailModel.find({ universeId }).lean<IUniverseDetail[]>();

    return results.map(documentToUniverseDetail);
  } catch (error) {
    logger.error(`유니버스 상세 데이터 조회 오류 (${universeId}):`, error);
    throw error;
  }
}

// 유니버스별 상세 데이터 추가/업데이트
export async function upsertUniverseDetail(
  universeId: string,
  detailData: Partial<Omit<IUniverseDetail, "universeId" | "createdAt" | "updatedAt">>,
): Promise<IUniverseDetail> {
  try {
    const UniverseDetailModel = await getUniverseDetailModel(universeId);

    const result = await UniverseDetailModel.findOneAndUpdate(
      { universeId },
      { ...detailData, universeId },
      { new: true, upsert: true, lean: true },
    );

    if (!result) {
      throw new Error("유니버스 상세 데이터 생성/업데이트 실패");
    }

    return documentToUniverseDetail(result);
  } catch (error) {
    logger.error(`유니버스 상세 데이터 업데이트 오류 (${universeId}):`, error);
    throw error;
  }
}
