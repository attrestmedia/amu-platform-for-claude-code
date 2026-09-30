"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lang } from "components/module/i18n";
import { GenStudioHome } from "components/template/gen-studio/GenStudioHome";
import {
  createCanonicalGenStudioTemplateSearchParams,
  getGenStudioTemplateSearchParam,
  hasGenStudioTemplateSearchParam,
} from "utils/app/genStudioTemplateQuery";
import { buildGenStudioLegacyRedirectUrl } from "utils/app/genStudioRouteContract";

const TEMPLATE_BROWSER_INTENT_QUERY_KEYS = [
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
] as const;

function hasTemplateBrowserIntent(searchParams: ReturnType<typeof useSearchParams>) {
  return TEMPLATE_BROWSER_INTENT_QUERY_KEYS.some((key) => hasGenStudioTemplateSearchParam(searchParams, key));
}

export default function GenStudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canonicalSearchParams = useMemo(() => createCanonicalGenStudioTemplateSearchParams(searchParams), [searchParams]);
  const shouldRedirectToRoute = hasTemplateBrowserIntent(searchParams);
  const redirectTargetUrl = useMemo(
    () =>
      buildGenStudioLegacyRedirectUrl({
        mode: getGenStudioTemplateSearchParam(canonicalSearchParams, "mode"),
        templateKey: getGenStudioTemplateSearchParam(canonicalSearchParams, "templateKey"),
        template: getGenStudioTemplateSearchParam(canonicalSearchParams, "template"),
        detailMode: getGenStudioTemplateSearchParam(canonicalSearchParams, "detailMode"),
        currentSearchParams: canonicalSearchParams.toString(),
      }),
    [canonicalSearchParams],
  );

  useEffect(() => {
    if (!shouldRedirectToRoute) return;
    router.replace(redirectTargetUrl);
  }, [redirectTargetUrl, router, shouldRedirectToRoute]);

  if (shouldRedirectToRoute) {
    return (
      <section className="flex min-h-[100dvh] w-full items-center justify-center bg-background text-sm text-secondary-text">
        <Lang text={{ ko: "Gen Studio 화면으로 이동하고 있습니다.", en: "Opening the Gen Studio workspace." }} />
      </section>
    );
  }

  return <GenStudioHome />;
}
