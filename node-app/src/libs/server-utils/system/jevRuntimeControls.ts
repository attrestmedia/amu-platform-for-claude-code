import "server-only";

import {
  JEV_RUNTIME_CONTROLS_SETTING_KEY,
  normalizeJevRuntimeControls,
  type JevRuntimeControls,
  type JevRuntimeControlsPatch,
} from "consts/system/jevRuntimeControls";
import { readSystemSetting, setSystemSetting } from "libs/database/system";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose JEV 런타임 제어의 서버 권위 조회·저장
 * @process 설정 읽기  엄격한 정규화  중첩 PATCH 병합  저장
 * @domain system-control
 * @scope server
 */

export type JevRuntimeControlsRead =
  | { readable: true; controls: JevRuntimeControls }
  | { readable: false };

/**
 * OD-JEV-14: 판단 호출마다 DB 를 읽지 않도록 읽기 성공값만 짧게 캐시한다.
 * unreadable(손상·정규화 거부·조회 예외)은 캐시하지 않아 fail-closed 가 매 호출 재평가된다.
 * 같은 프로세스의 저장은 즉시 무효화하고, 다른 인스턴스 반영은 최대 TTL 만큼 늦다.
 */
export const JEV_RUNTIME_CONTROLS_CACHE_TTL_MS = 3_000;

let controlsCache: { controls: JevRuntimeControls; expiresAt: number } | null = null;

export function invalidateJevRuntimeControlsCache() {
  controlsCache = null;
}

/** 판단 런타임 전용 조회. 관리자 화면은 항상 최신값을 보도록 getJevRuntimeControls 를 쓴다. */
export async function getCachedJevRuntimeControls(nowMs: number = Date.now()): Promise<JevRuntimeControlsRead> {
  if (controlsCache && controlsCache.expiresAt > nowMs) {
    return { readable: true, controls: controlsCache.controls };
  }
  controlsCache = null;
  const read = await getJevRuntimeControls();
  if (read.readable) {
    controlsCache = { controls: read.controls, expiresAt: nowMs + JEV_RUNTIME_CONTROLS_CACHE_TTL_MS };
  }
  return read;
}

export async function getJevRuntimeControls(): Promise<JevRuntimeControlsRead> {
  try {
    // 손상 값(문서는 있으나 plain object 아님)은 부재와 구분해 차단한다 — 외부 비용 축이라 fail-closed(INV-SSI-3).
    const read = await readSystemSetting(JEV_RUNTIME_CONTROLS_SETTING_KEY);
    if (read.status === "invalid") {
      logger.error("[jev-runtime-controls] 설정 저장값이 손상돼 판단 호출을 차단합니다.", { valueType: read.valueType });
      return { readable: false };
    }
    const normalized = normalizeJevRuntimeControls(read.status === "ok" ? read.value : null);
    if (!normalized.ok) {
      logger.error("[jev-runtime-controls] 설정 형식이 올바르지 않습니다.");
      return { readable: false };
    }
    return { readable: true, controls: normalized.controls };
  } catch (error) {
    logger.error("[jev-runtime-controls] 설정 조회 실패, 판단 호출을 차단합니다.", error);
    return { readable: false };
  }
}

/**
 * 쓰기 기준값. 런타임 조회와 달리 손상 저장값(문서는 있으나 plain object 아님)은 차단하지 않고
 * 코드 기본값(전부 OFF)을 기준으로 삼아 어드민이 덮어써 복구할 수 있게 한다(SSI-001 A1-RECOVER).
 * 조회 예외·정규화 거부는 저장하지 않는다 — 현재 값을 모르는 채 병합하면 켜 둔 kill switch 를 잃을 수 있다.
 */
export type JevRuntimeControlsWriteBase =
  | { writable: true; controls: JevRuntimeControls; recoveredFromValueType: string | null }
  | { writable: false };

export async function getJevRuntimeControlsWriteBase(): Promise<JevRuntimeControlsWriteBase> {
  try {
    const read = await readSystemSetting(JEV_RUNTIME_CONTROLS_SETTING_KEY);
    const normalized = normalizeJevRuntimeControls(read.status === "ok" ? read.value : null);
    if (!normalized.ok) {
      logger.error("[jev-runtime-controls] 설정 형식이 올바르지 않아 저장하지 않습니다.");
      return { writable: false };
    }
    return {
      writable: true,
      controls: normalized.controls,
      recoveredFromValueType: read.status === "invalid" ? read.valueType : null,
    };
  } catch (error) {
    logger.error("[jev-runtime-controls] 설정 조회 실패, 저장하지 않습니다.", error);
    return { writable: false };
  }
}

function definedEntries<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(value || {}).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

export async function setJevRuntimeControls(args: {
  patch: JevRuntimeControlsPatch;
  updatedBy: string;
}): Promise<JevRuntimeControls> {
  const current = await getJevRuntimeControlsWriteBase();
  if (!current.writable) throw new Error("JEV_RUNTIME_CONTROLS_UNREADABLE");
  if (current.recoveredFromValueType) {
    logger.warn("[jev-runtime-controls] 손상 설정을 코드 기본값 기준으로 복구합니다.", {
      valueType: current.recoveredFromValueType,
    });
  }

  const patch = definedEntries(args.patch);
  const services: JevRuntimeControls["services"] = { ...current.controls.services };
  for (const [service, value] of Object.entries(args.patch.services || {})) {
    if (!value) continue;
    const key = service as keyof typeof services;
    const currentValue = services[key];
    if (value.enabled === undefined && !currentValue) continue;
    services[key] = { enabled: value.enabled ?? currentValue?.enabled ?? false };
  }

  const decisionPoints: JevRuntimeControls["decisionPoints"] = { ...current.controls.decisionPoints };
  for (const [id, value] of Object.entries(args.patch.decisionPoints || {})) {
    if (value) decisionPoints[id] = {
      ...decisionPoints[id],
      ...definedEntries(value),
    } as JevRuntimeControls["decisionPoints"][string];
  }

  const normalized = normalizeJevRuntimeControls({
    ...current.controls,
    ...patch,
    services,
    decisionPoints,
    circuit: { ...current.controls.circuit, ...definedEntries(args.patch.circuit) },
  });
  if (!normalized.ok) throw new Error("JEV_RUNTIME_CONTROLS_NORMALIZATION_FAILED");

  await setSystemSetting({
    key: JEV_RUNTIME_CONTROLS_SETTING_KEY,
    value: normalized.controls,
    description: "통합 어드민에서 관리하는 JEV Decision Runtime 제어",
    updatedBy: args.updatedBy,
  });
  invalidateJevRuntimeControlsCache();

  return normalized.controls;
}
