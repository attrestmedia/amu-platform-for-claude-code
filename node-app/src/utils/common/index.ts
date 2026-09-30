export { cn } from "./tailwind";

export {
  isClient,
  isServer,
  isDev,
  isProduct,
  isSameComponent,
  isMobile,
  isTablet,
  isTouchDevice,
  isMobileScreen,
  isTabletScreen,
  isDesktopScreen,
  isMobileEnvironment,
  supportsCameraCaptureInput,
  getCurrentBreakpoint,
} from "./compare";

export { decodeHtmlEntities } from "./entityUtils";
export {
  stripHtml,
  sanitizeDescription,
  sanitizeProductSummary,
  cleanString,
  convertHtmlToString,
  splitIntoSentences,
  truncateToString,
} from "./sanitizeUtils";

export { getCookie, getAuthToken, getClientCookieOptions } from "./cookieUtils";
export { buildImageProxyUrl, isProxyImageUrl, IMAGE_PROXY_ROUTE } from "./imageProxyUtils";
export { millisecondsToHours, toDate } from "./timeUtils";
export { createTextHash, createSha256Hex, uniqueMsgId, stableMsgId, genUniqueId } from "./hashUtils";
export { stableSerialize } from "./stableSerialize";
export { getCapitalized, getCapitalizedWord, getFirstChar, getKeyToWord, safeString } from "./stringUtils";
export {
  createCanonicalSearchParams,
  getSearchParamWithAmpFallback,
  hasSearchParamWithAmpFallback,
} from "./searchParamUtils";
export {
  ensurePreparedTextLayoutFontReady,
  ensureTextLayoutFontReady,
  isPreparedTextLayoutFontReady,
  isTextLayoutFontReady,
  buildTextLayoutFontValue,
  getTextLayoutDocumentFontFamily,
  getTextLayoutDocumentLocale,
  resolveTextLayoutTypography,
  clearTextLayoutCaches,
  getPreparedTextLayoutCache,
  getTextLayoutWidthCache,
  setPreparedTextLayoutCache,
  setTextLayoutWidthCache,
  measurePreparedTextLayoutSync,
  measureTextLayoutSync,
  prepareTextLayoutSync,
  layoutPreparedTextLinesSync,
} from "./text-layout";

export {
  type GenerateActionError,
  type UnknownRecord,
  type ErrorLikeType,
  type CodedErrorInfoType,
  runAfterCurrentRender,
  toUnknownRecord,
  isUnknownRecord,
  isPlainObject,
  toErrorLike,
  toErrorMessage,
  extractApiErrorMessage,
  extractCodedError,
  pickArray,
  getResponseStatus,
  toTimestamp,
  toSafeString,
  pickString,
  toSortIndex,
  pickRoleList,
} from "./typeUtils";
