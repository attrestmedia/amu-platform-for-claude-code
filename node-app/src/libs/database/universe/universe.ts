import { getModel } from "libs/database/modelCache";
import type { IUniverseDocument } from "models/universe";
import { UniverseSchema } from "models/universe";
import type { IUniverse, IStageInfo } from "types/game";
import { logger } from "utils/log";
import type { Model, SortOrder } from "mongoose";
import { GAME_CONSTANTS as GC } from "consts/game";
import { MONGODB_AMU_URL } from "consts/env/server";
import { normalizeGaMeasurementId } from "libs/marketing/analytics/gaMeasurementIdContract";
import { normalizeGaReportingTargets } from "libs/marketing/analytics/gaReportingTargetsContract";

const UNIVERSE_BASE_PATHS = new Set(["play", "store"]);

export type UniverseWriteData = Omit<IUniverse, "createdAt" | "updatedAt" | "order"> & {
  order?: number | null;
};

function normalizeShowroomDateTime(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function normalizeUniverseOrderValue(value: unknown) {
  const order = Number(value);
  return Number.isFinite(order) ? Math.max(0, Math.trunc(order)) : undefined;
}

async function getLastUniverseOrder(UniverseModel: Model<IUniverseDocument>, excludeId: string) {
  const lastUniverse = await UniverseModel.findOne({ id: { $ne: excludeId } })
    .sort({ order: -1, createdAt: -1 })
    .select({ order: 1 })
    .lean();

  return normalizeUniverseOrderValue(lastUniverse?.order) ?? -1;
}

async function resolveUniverseOrder(
  UniverseModel: Model<IUniverseDocument>,
  universeId: string,
  rawOrder: unknown,
): Promise<{ order: number; shouldShift: boolean }> {
  const existingUniverse = await UniverseModel.findOne({ id: universeId }).select({ order: 1 }).lean();
  const requestedOrder = normalizeUniverseOrderValue(rawOrder);

  if (requestedOrder === undefined) {
    return {
      order: (await getLastUniverseOrder(UniverseModel, universeId)) + 1,
      shouldShift: false,
    };
  }

  const currentOrder = normalizeUniverseOrderValue(existingUniverse?.order);
  if (existingUniverse && currentOrder === requestedOrder) {
    const duplicatedAtSameOrder = await UniverseModel.exists({
      id: { $ne: universeId },
      order: requestedOrder,
    });

    return { order: requestedOrder, shouldShift: Boolean(duplicatedAtSameOrder) };
  }

  return { order: requestedOrder, shouldShift: true };
}

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process delete, get, update, upsert 작업  DB 조회/저장 수행
 * @domain universe
 * @scope server
 */

// 유니버스 모델 가져오기
async function getUniverseModel() {
  return await getModel<IUniverseDocument>(MONGODB_AMU_URL, "Universe", UniverseSchema, "universes");
}

// Document를 IUniverse 타입으로 안전하게 변환
function documentToUniverse(doc: IUniverseDocument | (Omit<IUniverse, "fixed"> & { fixed?: IUniverse["fixed"] })): IUniverse {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    logo: doc.logo,
    thumbnail: doc.thumbnail,
    type: doc.type,
    fixed: doc.fixed || { x: 0, y: 0 },
    enabled: doc.enabled,
    hideDisplay: Boolean(doc.hideDisplay),
    order: normalizeUniverseOrderValue(doc.order) ?? 0,
    npcs: doc.npcs,
    stages: doc.stages,
    typeSpecific: doc.typeSpecific,

    // 커머스 관리자 (조건부 포함)
    ...(doc.type === "commerce" && {
      billingOwnerEmail: doc.billingOwnerEmail,
      commerceAdmins: doc.commerceAdmins,
      wallet: doc.wallet,
    }),

    // 페르소나 제한 정보
    personaLimits: doc.personaLimits,

    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// 모든 유니버스 데이터 조회
export async function getUniverses(
  options: {
    enabledOnly?: boolean;
    sortByOrder?: boolean;
  } = {},
): Promise<IUniverse[]> {
  try {
    const { enabledOnly = false, sortByOrder = true } = options;

    logger.log("getUniverses 호출됨:", { enabledOnly, sortByOrder });

    const UniverseModel = await getUniverseModel();

    // 쿼리 조건 설정
    const query = enabledOnly ? { enabled: true } : {};

    // 정렬 조건 설정 (SortOrder 타입 사용)
    const sort: { [key: string]: SortOrder } = sortByOrder ? { order: 1, createdAt: 1 } : { createdAt: 1 };

    const universes = await UniverseModel.find(query).sort(sort).lean();

    // 헬퍼 함수를 사용한 안전한 변환
    return universes.filter((universe) => universe != null).map((universe) => documentToUniverse(universe));
  } catch (error) {
    logger.error("유니버스 데이터 조회 중 오류:", error);
    throw error;
  }
}

// 특정 유니버스 데이터 조회
export async function getUniverseById(universeId: string): Promise<IUniverse | null> {
  try {
    const UniverseModel = await getUniverseModel();
    const universe = await UniverseModel.findOne({ id: universeId }).lean();

    if (!universe) return null;

    // 헬퍼 함수로 안전한 변환
    return documentToUniverse(universe);
  } catch (error) {
    logger.error(`유니버스 데이터 조회 중 오류 (ID: ${universeId}):`, error);
    throw error;
  }
}

// 유니버스 데이터 생성/업데이트
export async function upsertUniverse(universeData: UniverseWriteData): Promise<IUniverse> {
  try {
    const UniverseModel = await getUniverseModel();

    // 스테이지 데이터 유효성 검증 및 보정
    const processedData = { ...universeData };

    // stages가 없거나 빈 배열인 경우 기본 스테이지 추가
    if (!processedData.stages || processedData.stages.length === 0) {
      processedData.stages = [
        {
          stageId: GC.FALLBACK.STAGE_ID,
          stageName: GC.FALLBACK.STAGE_NAME,
        },
      ];
      logger.log("기본 스테이지 추가됨:", processedData.stages[0]);
    }

    processedData.stages = processedData.stages.map((stage) => ({
      stageId: stage.stageId ?? GC.FALLBACK.STAGE_ID,
      stageName: stage.stageName ?? GC.FALLBACK.STAGE_NAME,
      isDefault: stage.isDefault ?? false,
      mode: stage.mode,
      layoutVersion: stage.layoutVersion,
      usageType: stage.usageType,
    }));

    // fixed 필드가 없으면 기본값 설정
    if (!processedData.fixed) {
      processedData.fixed = { x: 0, y: 0 };
    }

    // 타입별 필드 검증
    logger.log("타입 검증 시작:", {
      type: processedData.type,
      hasCommerceAdmins: !!processedData.commerceAdmins,
      commerceAdminsLength: processedData.commerceAdmins?.length || 0,
    });

    // UniverseSchema에서 교차 검증을 하지만, 서비스 레벨에서도 한 번 더 실행
    if (processedData.type !== "commerce") {
      // 게임 타입이면 관리자/지갑 강제 제거
      if (Array.isArray(processedData.commerceAdmins) && processedData.commerceAdmins.length > 0) {
        logger.warn("게임 타입 유니버스의 commerceAdmins를 강제로 제거합니다.");
        processedData.commerceAdmins = [];
      }
      processedData.billingOwnerEmail = undefined;

      if (processedData.wallet) {
        const m = Math.max(0, processedData.wallet?.membership?.coins || 0);
        const c = Math.max(0, processedData.wallet?.charged?.coins || 0);
        if (m > 0 || c > 0) {
          logger.warn("게임 타입 유니버스의 지갑을 초기화합니다.");
          processedData.wallet = undefined;
        }
      }

      const procWithShowroom = processedData as { typeSpecific?: { showroom?: unknown } };
      if (procWithShowroom?.typeSpecific?.showroom) {
        delete procWithShowroom.typeSpecific.showroom;
      }
    } else {
      processedData.billingOwnerEmail = String(
        processedData.billingOwnerEmail || processedData.commerceAdmins?.[0] || "",
      ).trim().toLowerCase();
      // 커머스 타입이면 commerceAdmins 정리
      if (processedData.commerceAdmins) {
        processedData.commerceAdmins = processedData.commerceAdmins
          .filter((email) => typeof email === "string" && email.trim().length > 0)
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email !== processedData.billingOwnerEmail);

        logger.log("커머스 관리자 목록 정리 완료:", {
          count: processedData.commerceAdmins.length,
          admins: processedData.commerceAdmins,
        });
      }

      type ShowroomConfig = { enabled?: unknown; opensAt?: unknown; closesAt?: unknown };
      const procWithShowroom = processedData as { typeSpecific?: { showroom?: ShowroomConfig } };
      const showroom = procWithShowroom?.typeSpecific?.showroom;
      if (showroom && typeof showroom === "object") {
        procWithShowroom.typeSpecific = {
          ...(procWithShowroom.typeSpecific || {}),
          showroom: {
            enabled: showroom.enabled === true,
            opensAt: normalizeShowroomDateTime(
              showroom.opensAt instanceof Date ? showroom.opensAt.toISOString() : (showroom.opensAt as string | null | undefined),
            ),
            closesAt: normalizeShowroomDateTime(
              showroom.closesAt instanceof Date ? showroom.closesAt.toISOString() : (showroom.closesAt as string | null | undefined),
            ),
          },
        };
      }
    }

    const requestedOrder = (processedData as { order?: unknown }).order;
    const { order, shouldShift } = await resolveUniverseOrder(UniverseModel, universeData.id, requestedOrder);
    processedData.order = order;

    await new UniverseModel({ ...processedData, id: universeData.id }).validate();

    if (shouldShift) {
      await UniverseModel.updateMany(
        {
          id: { $ne: universeData.id },
          order: { $gte: order },
        },
        { $inc: { order: 1 } },
      );
    }

    logger.log("MongoDB에 저장할 데이터:", JSON.stringify(processedData, null, 2));

    const { id: _ignoreId, ...updateFields } = processedData; // id는 절대 $set 하지 않음
    const filter = { id: universeData.id };

    const universe = await UniverseModel.findOneAndUpdate(
      filter,
      {
        $set: updateFields,
        $setOnInsert: { id: universeData.id },
      },
      {
        new: true,
        upsert: true,
        lean: true,
        runValidators: true,
        setDefaultsOnInsert: true,
        context: "query",
      },
    );

    // null 체크 추가
    if (!universe) {
      throw new Error("유니버스 생성/업데이트 실패");
    }

    logger.log("유니버스 저장 완료:", {
      id: universe.id,
      stages: universe.stages,
      fixed: universe.fixed,
    });

    // 헬퍼 함수로 일관된 변환
    return documentToUniverse(universe);
  } catch (error) {
    logger.error("유니버스 데이터 생성/업데이트 중 오류:", error);
    throw error;
  }
}

// 유니버스 데이터 삭제
export async function deleteUniverse(universeId: string): Promise<boolean> {
  try {
    const UniverseModel = await getUniverseModel();

    const result = await UniverseModel.deleteOne({ id: universeId });

    if (result.deletedCount === 0) {
      logger.warn(`삭제할 유니버스를 찾을 수 없음: ${universeId}`);
      return false;
    }

    logger.log(`유니버스 삭제 완료: ${universeId}`);
    return true;
  } catch (error) {
    logger.error(`유니버스 삭제 중 오류 (ID: ${universeId}):`, error);
    throw error;
  }
}

// stages 업데이트
export async function updateUniverseStages(universeId: string, stages: IStageInfo[]): Promise<IUniverse | null> {
  try {
    const UniverseModel = await getUniverseModel();
    const updated = await UniverseModel.findOneAndUpdate(
      { id: universeId },
      { $set: { stages } },
      {
        new: true,
        lean: true,
        runValidators: true,
        context: "query",
      },
    );

    if (!updated) return null;

    return documentToUniverse(updated);
  } catch (error) {
    logger.error(`유니버스 스테이지 업데이트 중 오류 (ID: ${universeId}):`, error);
    throw error;
  }
}

export async function updateUniversePreferredBasePath(
  universeId: string,
  preferredBasePath: "play" | "store",
): Promise<IUniverse | null> {
  try {
    const UniverseModel = await getUniverseModel();
    const nextBasePath = UNIVERSE_BASE_PATHS.has(String(preferredBasePath)) ? preferredBasePath : "play";

    const updated = await UniverseModel.findOneAndUpdate(
      { id: universeId },
      { $set: { "typeSpecific.routing.preferredBasePath": nextBasePath } },
      {
        new: true,
        lean: true,
        runValidators: true,
        context: "query",
      },
    );

    if (!updated) return null;

    return documentToUniverse(updated);
  } catch (error) {
    logger.error(`유니버스 기본 경로 업데이트 중 오류 (ID: ${universeId}):`, error);
    throw error;
  }
}

export async function getUniverseMarketingAnalyticsSettings(universeId: string) {
  const UniverseModel = await getUniverseModel();
  const universe = await UniverseModel.findOne({ id: universeId })
    .select({ "typeSpecific.marketing.analytics": 1, _id: 0 })
    .lean();
  if (!universe) return null;

  const analytics = universe.typeSpecific?.marketing?.analytics;
  return {
    measurementId: normalizeGaMeasurementId(analytics?.measurementId),
    trackingEnabled: typeof analytics?.trackingEnabled === "boolean" ? analytics.trackingEnabled : undefined,
    reportingTargets: normalizeGaReportingTargets(analytics?.reportingTargets),
  };
}

export async function updateUniverseGaReportingTargets(args: {
  universeId: string;
  reportingTargets: unknown;
}): Promise<IUniverse | null> {
  const reportingTargets = normalizeGaReportingTargets(args.reportingTargets);
  if (!reportingTargets.length) throw new Error("GA_REPORTING_TARGETS_REQUIRED");

  const UniverseModel = await getUniverseModel();
  const updated = await UniverseModel.findOneAndUpdate(
    { id: args.universeId },
    { $set: { "typeSpecific.marketing.analytics.reportingTargets": reportingTargets } },
    {
      new: true,
      lean: true,
      runValidators: true,
      context: "query",
    },
  );

  return updated ? documentToUniverse(updated) : null;
}

export async function updateUniverseMarketingAnalyticsSettings(args: {
  universeId: string;
  measurementId: string;
  trackingEnabled: boolean;
}): Promise<IUniverse | null> {
  const measurementId = normalizeGaMeasurementId(args.measurementId);
  if (!measurementId) throw new Error("GA_MEASUREMENT_ID_INVALID");

  const UniverseModel = await getUniverseModel();
  const updated = await UniverseModel.findOneAndUpdate(
    { id: args.universeId },
    {
      $set: {
        "typeSpecific.marketing.analytics.measurementId": measurementId,
        "typeSpecific.marketing.analytics.trackingEnabled": args.trackingEnabled,
      },
    },
    {
      new: true,
      lean: true,
      runValidators: true,
      context: "query",
    },
  );

  return updated ? documentToUniverse(updated) : null;
}
