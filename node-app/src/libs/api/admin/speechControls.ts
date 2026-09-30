import fetchClient from "libs/api/fetchClient";
import type { SpeechCatalogProviderType } from "consts/ai";
import {
  normalizeSpeechRuntimeControls,
  type SpeechRuntimeControls,
} from "consts/system/speechRuntimeControls";

/**
 * @docHint
 * @purpose 어드민 speech 런타임 제어 조회·변경 클라이언트
 * @process 관리자 API 호출  저장값 정규화  화면 상태 반환
 * @domain system-control
 * @scope admin
 */

export type SpeechControlsSnapshot = {
  controls: SpeechRuntimeControls;
  /** 코드 정책 상한. DB는 이 값을 끌 수만 있고 켤 수 없다. */
  providerRoutable: Record<SpeechCatalogProviderType, boolean>;
};

type SpeechControlsResponse = {
  ok: boolean;
  controls: unknown;
  providerRoutable?: Record<SpeechCatalogProviderType, boolean>;
};

function toSnapshot(body: SpeechControlsResponse, fallbackRoutable?: SpeechControlsSnapshot["providerRoutable"]) {
  return {
    // 서버 응답도 신뢰하지 않고 같은 정규화를 통과시킨다 — 화면이 코드 정책 밖의 값을 보여주지 않는다.
    controls: normalizeSpeechRuntimeControls(body.controls as Partial<SpeechRuntimeControls>),
    providerRoutable: body.providerRoutable || fallbackRoutable || ({} as SpeechControlsSnapshot["providerRoutable"]),
  };
}

export async function fetchSpeechControls(): Promise<SpeechControlsSnapshot> {
  const response = await fetchClient.get<SpeechControlsResponse>("/admin/speech-controls");
  return toSnapshot(response.data);
}

/** PATCH는 부분 갱신이다. 보내지 않은 필드는 서버에서 기존 값이 유지된다. */
export async function patchSpeechControls(args: {
  patch: Partial<SpeechRuntimeControls>;
  reason: string;
  fallbackRoutable?: SpeechControlsSnapshot["providerRoutable"];
}): Promise<SpeechControlsSnapshot> {
  const response = await fetchClient.patch<SpeechControlsResponse>(
    "/admin/speech-controls",
    { ...args.patch, reason: args.reason },
    { responseType: "json" },
  );
  return toSnapshot(response.data, args.fallbackRoutable);
}
