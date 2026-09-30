import fetchClient from "libs/api/fetchClient";
import {
  normalizeJevRuntimeControls,
  type JevRuntimeControls,
  type JevRuntimeControlsPatch,
} from "consts/system/jevRuntimeControls";

/** @docHint @purpose 어드민 JEV 런타임 제어 API 클라이언트 @domain system-control @scope admin */

export type JevControlsSnapshot = {
  readable: boolean;
  recoverable: boolean;
  controls: JevRuntimeControls | null;
};

type JevControlsResponse = {
  ok: boolean;
  readable?: boolean;
  recoverable?: boolean;
  controls: unknown;
};

function toSnapshot(body: JevControlsResponse): JevControlsSnapshot {
  if (body.readable !== true) {
    return { readable: false, recoverable: body.recoverable === true, controls: null };
  }
  const normalized = normalizeJevRuntimeControls(body.controls);
  return normalized.ok
    ? { readable: true, recoverable: false, controls: normalized.controls }
    : { readable: false, recoverable: false, controls: null };
}

export async function fetchJevControls(): Promise<JevControlsSnapshot> {
  const response = await fetchClient.get<JevControlsResponse>("/admin/jev-controls");
  return toSnapshot(response.data);
}

export async function patchJevControls(args: {
  patch: JevRuntimeControlsPatch;
  reason: string;
}): Promise<JevControlsSnapshot> {
  const response = await fetchClient.patch<JevControlsResponse>(
    "/admin/jev-controls",
    { ...args.patch, reason: args.reason },
    { responseType: "json" },
  );
  return toSnapshot(response.data);
}
