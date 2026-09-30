import {
  createCanonicalSearchParams,
  getSearchParamWithAmpFallback,
  hasSearchParamWithAmpFallback,
} from "utils/common/searchParamUtils";
import { GEN_STUDIO_RETURN_URL_QUERY_KEY } from "utils/app/genStudioRouteContract";

type SearchParamsLike = Parameters<typeof getSearchParamWithAmpFallback>[0];

export const GEN_STUDIO_TEMPLATE_QUERY_KEYS = [
  "mode",
  "view",
  "templateKey",
  "template",
  "detailMode",
  "q",
  "theme",
  "group",
  "sort",
  "filter",
  "amu_template_key",
  "amu_template_title",
  "amu_cta_location",
  "amu_post_id",
  "amu_post_slug",
  GEN_STUDIO_RETURN_URL_QUERY_KEY,
] as const;

export function getGenStudioTemplateSearchParam(
  searchParams: SearchParamsLike,
  key: (typeof GEN_STUDIO_TEMPLATE_QUERY_KEYS)[number],
) {
  return getSearchParamWithAmpFallback(searchParams, key);
}

export function hasGenStudioTemplateSearchParam(
  searchParams: SearchParamsLike,
  key: (typeof GEN_STUDIO_TEMPLATE_QUERY_KEYS)[number],
) {
  return hasSearchParamWithAmpFallback(searchParams, key);
}

export function createCanonicalGenStudioTemplateSearchParams(searchParams: SearchParamsLike) {
  return createCanonicalSearchParams(searchParams, GEN_STUDIO_TEMPLATE_QUERY_KEYS);
}
