import "server-only";

import {
  DEFAULT_SPEECH_RUNTIME_CONTROLS,
  SPEECH_BUDGET_OWNERS,
  SPEECH_PROVIDER_ROUTABLE,
  SPEECH_RUNTIME_CONTROLS_SETTING_KEY,
  normalizeSpeechRuntimeControls,
  resolveSpeechProviderBlock,
  type SpeechRuntimeControls,
} from "consts/system/speechRuntimeControls";
import { readSystemSetting, setSystemSetting } from "libs/database/system";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose EL-202 speech 런타임 제어 서버 권위 조회/저장
 * @process 저장값 조회  정규화  코드 정책 상한 적용
 * @domain system-control
 * @scope server
 */

/**
 * 마지막으로 성공한 조회 결과. 조회 실패 시 코드 기본값으로 되돌아가 **운영자가 켜 둔 kill switch가
 * 조용히 풀리는 것**을 막는다. 프로세스 로컬이므로 컨테이너별로 각자 보유한다.
 */
let lastKnownGoodControls: SpeechRuntimeControls | null = null;

/**
 * 조회 실패 시 폴백 방향.
 * 저장값 손상도 조회 실패와 같다.
 * 1. 마지막으로 성공한 값이 있으면 그것을 쓴다. **비상 정지(killSwitch)를 장애가 해제하지 않는다.**
 * 2. 한 번도 성공하지 못했으면(콜드 스타트 + DB 장애) 코드 기본값을 쓴다.
 *    - 코드 정책상 라우팅 가능한 provider(openai): 계속 동작한다(fail-safe).
 *      운영 중인 speech를 DB 장애로 끊지 않는다.
 *    - 미검증 provider(elevenlabs): 코드 기본값 자체가 비활성이라 차단된다(fail-closed).
 *
 * 남은 한계: 콜드 스타트와 DB 장애가 겹치면 그 컨테이너는 저장된 killSwitch를 알 수 없다.
 * 지출 상한을 저장소 수준에서 강제하는 것은 EL-204(budget·circuit breaker) 소유다.
 *
 * 저장값은 코드 정책을 **더 좁힐 수만** 있고 승격할 수 없다.
 */
export async function getSpeechRuntimeControls(): Promise<SpeechRuntimeControls> {
  try {
    const read = await readSystemSetting(SPEECH_RUNTIME_CONTROLS_SETTING_KEY);
    if (read.status === "invalid") {
      // 손상 값은 LKG를 갱신하지 않고 조회 실패와 같은 폴백을 적용한다.
      return fallbackSpeechRuntimeControls("invalid", { valueType: read.valueType });
    }
    const resolved = normalizeSpeechRuntimeControls(
      read.status === "ok" ? (read.value as Partial<SpeechRuntimeControls>) : null,
    );
    lastKnownGoodControls = resolved;
    return resolved;
  } catch (error) {
    return fallbackSpeechRuntimeControls("error", error);
  }
}

function fallbackSpeechRuntimeControls(reason: "invalid" | "error", detail: unknown): SpeechRuntimeControls {
  const hasLastKnownGood = lastKnownGoodControls !== null;
  if (reason === "invalid") {
    logger.error(
      hasLastKnownGood
        ? "[speech-runtime-controls] 설정 저장값이 손상돼 마지막 성공 값을 유지합니다."
        : "[speech-runtime-controls] 설정 저장값이 손상돼 코드 기본값을 사용합니다.",
      detail,
    );
  } else {
    logger.error(
      hasLastKnownGood
        ? "[speech-runtime-controls] 설정 조회 실패, 마지막 성공 값을 유지합니다."
        : "[speech-runtime-controls] 설정 조회 실패, 코드 기본값을 사용합니다.",
      detail,
    );
  }
  if (lastKnownGoodControls) return lastKnownGoodControls;
  return normalizeSpeechRuntimeControls(DEFAULT_SPEECH_RUNTIME_CONTROLS);
}

/** 테스트 전용 — 프로세스 로컬 캐시를 비운다. */
export function __resetSpeechRuntimeControlsCache() {
  lastKnownGoodControls = null;
}

export async function setSpeechRuntimeControls(args: {
  patch: Partial<SpeechRuntimeControls>;
  updatedBy: string;
}): Promise<SpeechRuntimeControls> {
  const current = await getSpeechRuntimeControls();
  // undefined 값을 가진 키를 스프레드하면 소유 프로퍼티로 복사되어 current 값을 지운다.
  // 부분 PATCH가 kill switch·preset·voiceAllowlist를 조용히 초기화하던 결함을 막는다.
  const patch = Object.fromEntries(
    Object.entries(args.patch).filter(([, value]) => value !== undefined),
  ) as Partial<SpeechRuntimeControls>;
  const merged = normalizeSpeechRuntimeControls({
    ...current,
    ...patch,
    providerEnabled: { ...current.providerEnabled, ...(patch.providerEnabled || {}) },
    budget: { ...current.budget, ...(patch.budget || {}) },
    // owner별 상한도 owner 단위로 병합한다. 통째로 덮으면 한 owner만 바꾸려던 PATCH가
    // 나머지 owner의 상한을 미확정으로 되돌린다 — providerEnabled와 같은 이유다.
    budgetByOwner: Object.fromEntries(
      SPEECH_BUDGET_OWNERS.map((owner) => [
        owner,
        { ...current.budgetByOwner[owner], ...(patch.budgetByOwner?.[owner] || {}) },
      ]),
    ) as SpeechRuntimeControls["budgetByOwner"],
    concurrency: { ...current.concurrency, ...(patch.concurrency || {}) },
    tutorsStt: { ...current.tutorsStt, ...(patch.tutorsStt || {}) },
  });

  await setSystemSetting({
    key: SPEECH_RUNTIME_CONTROLS_SETTING_KEY,
    value: merged,
    description: "통합 어드민에서 관리하는 speech(TTS/STT) 런타임 제어",
    updatedBy: args.updatedBy,
  });

  return merged;
}

/** provider 호출 직전 게이트. 차단이면 사유 코드를 돌려주고 호출부가 SPEECH_MODEL_NOT_AVAILABLE로 변환한다. */
export async function resolveSpeechProviderGate(provider: string) {
  const controls = await getSpeechRuntimeControls();
  return { controls, blockedReason: resolveSpeechProviderBlock(controls, provider) };
}

export { SPEECH_PROVIDER_ROUTABLE };
