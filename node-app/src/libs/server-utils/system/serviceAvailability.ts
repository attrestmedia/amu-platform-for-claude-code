import "server-only";

import {
  DEFAULT_SERVICE_AVAILABILITY,
  SERVICE_AVAILABILITY_SETTING_KEY,
  normalizeServiceAvailability,
  type ServiceAvailabilityMap,
  type ServiceKey,
} from "consts/system/serviceAvailability";
import { readSystemSetting, setSystemSetting } from "libs/database/system";
import { logger } from "utils/log";

type StoredServiceAvailability = {
  services?: Partial<ServiceAvailabilityMap>;
};

export async function getServiceAvailability(): Promise<ServiceAvailabilityMap> {
  try {
    const read = await readSystemSetting(SERVICE_AVAILABILITY_SETTING_KEY);
    // 손상 값은 부재와 같은 코드 기본값으로 계속 동작한다 — 서비스 노출 설정이라 fail-safe(INV-SSI-3).
    if (read.status === "invalid") {
      logger.error("[service-availability] 설정 저장값이 손상돼 코드 기본값을 사용합니다.", {
        valueType: read.valueType,
      });
      return normalizeServiceAvailability(undefined);
    }
    const setting = read.status === "ok" ? (read.value as StoredServiceAvailability) : null;
    return normalizeServiceAvailability(setting?.services);
  } catch (error) {
    logger.error("[service-availability] 설정 조회 실패, 코드 기본값을 사용합니다.", error);
    return { ...DEFAULT_SERVICE_AVAILABILITY };
  }
}

export async function setServiceAvailability(args: {
  key: ServiceKey;
  enabled: boolean;
  updatedBy: string;
}): Promise<ServiceAvailabilityMap> {
  const current = await getServiceAvailability();
  const services = { ...current, [args.key]: args.enabled };

  await setSystemSetting({
    key: SERVICE_AVAILABILITY_SETTING_KEY,
    value: { services },
    description: "통합 어드민에서 관리하는 서비스·미니앱 사용자 공개 상태",
    updatedBy: args.updatedBy,
  });

  return services;
}
