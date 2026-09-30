export const TOKEN_REFRESH_THRESHOLD_SEC = 7200;
export const AUTH_TOKEN_MAX_AGE_SEC = 60 * 60 * 24;
export const COOKIE_CONFIG = {
  LANGUAGE: {
    name: "language",
    path: "/",
  },
  DEVICE_TYPE: {
    name: "deviceType",
    path: "/",
  },
  OS: {
    name: "os",
    path: "/",
  },
  AUTH_TOKEN: {
    name: "authToken",
    path: "/",
  },
};

// 게스트ID 보장 헬퍼용 키
export const GUEST_ID_KEY = "amu_guest_id";
