"use client";

export const AMU_NATIVE_BRIDGE_EVENT = "amu-native-bridge";
export const AMU_NATIVE_PUSH_TOKEN_EVENT = "amu-native-push-token";
export const AMU_NATIVE_PUSH_OPENED_EVENT = "amu-native-push-opened";
export const AMU_NATIVE_PUSH_TOKEN_STORAGE_KEY = "amu.native.push-token";
// EL-702: native 앱이 전달하는 재생 lifecycle(중단/재개) 신호.
export const AMU_NATIVE_APP_LIFECYCLE_EVENT = "amu-native-app-lifecycle";

export type AmuNativeAppLifecycleDetail = {
  state: string;
  command: string;
  isForeground: boolean;
  fallbackMode: string;
};

/** EL-702: native lifecycle CustomEvent를 구독한다. 반환값은 unsubscribe. */
export function subscribeAmuNativeAppLifecycle(
  handler: (detail: AmuNativeAppLifecycleDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object") return;
    const record = detail as Record<string, unknown>;
    handler({
      state: String(record.state || ""),
      command: String(record.command || ""),
      isForeground: Boolean(record.isForeground),
      fallbackMode: String(record.fallbackMode || ""),
    });
  };

  window.addEventListener(AMU_NATIVE_APP_LIFECYCLE_EVENT, listener as EventListener);
  return () => window.removeEventListener(AMU_NATIVE_APP_LIFECYCLE_EVENT, listener as EventListener);
}

export const AMU_NATIVE_REQUEST_CAMERA_CAPTURE = "camera.capture";
export const AMU_NATIVE_RESULT_CAMERA = "camera.result";

export type AmuNativeBridgeErrorCode = "cancelled" | "timeout" | "permission_denied" | "unsupported" | "internal_error";

export type AmuNativeBridgeStatus = "success" | "error";

export type AmuNativeBridgeRequest = {
  type: string;
  requestId: string;
  payload?: Record<string, unknown>;
};

export type AmuNativeBridgeResponse<TPayload = Record<string, unknown>> = {
  type: string;
  requestId: string;
  status: AmuNativeBridgeStatus;
  payload?: TPayload;
  errorCode?: AmuNativeBridgeErrorCode;
  message?: string;
};

type AmuNativeBridgeError = Error & { errorCode?: AmuNativeBridgeErrorCode };

export type AmuNativeCameraCapturePayload = {
  fileName: string;
  mimeType: string;
  base64Data: string;
};

export type AmuNativePushTokenDetail = {
  token: string;
  platform?: "android" | "ios" | "web" | "unknown";
  appVersion?: string;
  locale?: string;
  timezone?: string;
};

type NativeBridgeHost = {
  postMessage: (message: string) => void;
};

declare global {
  interface Window {
    AmuBridge?: NativeBridgeHost;
  }
}

function toBridgeResponse(value: unknown): AmuNativeBridgeResponse | null {
  const raw = typeof value === "string" ? safeParseJson(value) : value;
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const requestId = String(obj.requestId || "").trim();
  const type = String(obj.type || "").trim();
  const status = String(obj.status || "")
    .trim()
    .toLowerCase();

  if (!requestId || !type) return null;
  if (status !== "success" && status !== "error") return null;

  const response: AmuNativeBridgeResponse = {
    type,
    requestId,
    status: status as AmuNativeBridgeStatus,
    payload: (obj.payload as Record<string, unknown> | undefined) || undefined,
  };

  const errorCode = String(obj.errorCode || "").trim() as AmuNativeBridgeErrorCode;
  if (errorCode) response.errorCode = errorCode;

  const message = String(obj.message || "").trim();
  if (message) response.message = message;

  return response;
}

function safeParseJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function makeRequestId() {
  return `amu_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isNativeBridgeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.AmuBridge && typeof window.AmuBridge.postMessage === "function");
}

export function requestNative<TPayload = Record<string, unknown>>(args: {
  type: string;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<AmuNativeBridgeResponse<TPayload>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("native_bridge_unavailable"));
  }

  const bridge = window.AmuBridge;
  if (!bridge || typeof bridge.postMessage !== "function") {
    return Promise.reject(new Error("native_bridge_unavailable"));
  }

  const type = String(args.type || "").trim();
  if (!type) {
    return Promise.reject(new Error("native_bridge_invalid_type"));
  }

  const requestId = makeRequestId();
  const timeoutMs = Math.max(1000, Number(args.timeoutMs ?? 12000));

  const request: AmuNativeBridgeRequest = {
    type,
    requestId,
    payload: args.payload || {},
  };

  return new Promise<AmuNativeBridgeResponse<TPayload>>((resolve, reject) => {
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      window.removeEventListener(AMU_NATIVE_BRIDGE_EVENT, onBridgeEvent as EventListener);
      clearTimeout(timer);
    };

    const onBridgeEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const response = toBridgeResponse(detail);
      if (!response) return;
      if (response.requestId !== requestId) return;

      cleanup();
      resolve(response as AmuNativeBridgeResponse<TPayload>);
    };

    const timer = setTimeout(() => {
      cleanup();
      const timeoutError = new Error("native_bridge_timeout") as AmuNativeBridgeError;
      timeoutError.errorCode = "timeout";
      reject(timeoutError);
    }, timeoutMs);

    window.addEventListener(AMU_NATIVE_BRIDGE_EVENT, onBridgeEvent as EventListener);

    try {
      bridge.postMessage(JSON.stringify(request));
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function decodeBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function inferExtFromMimeType(mimeType: string) {
  const t = String(mimeType || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  return "jpg";
}

export function nativeCameraPayloadToFile(payload: unknown): File | null {
  if (!payload || typeof payload !== "object") return null;

  const obj = payload as Partial<AmuNativeCameraCapturePayload>;
  const mimeType = String(obj.mimeType || "").trim();
  const fileNameRaw = String(obj.fileName || "").trim();
  const base64Raw = String(obj.base64Data || "").trim();
  if (!mimeType || !base64Raw) return null;

  const normalizedBase64 = base64Raw.includes(",") ? base64Raw.split(",").pop() || "" : base64Raw;
  if (!normalizedBase64) return null;

  try {
    const bytes = decodeBase64ToBytes(normalizedBase64);
    const ext = inferExtFromMimeType(mimeType);
    const fileName = fileNameRaw || `capture_${Date.now()}.${ext}`;
    return new File([bytes], fileName, { type: mimeType });
  } catch {
    return null;
  }
}
