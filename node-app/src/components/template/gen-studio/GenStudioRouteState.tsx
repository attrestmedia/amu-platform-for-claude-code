"use client";

import Link from "next/link";
import { Button, Preloader } from "@amu-labs/ui";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import type { GenStudioTemplateRouteMode } from "./GenStudioTemplateRoute";

type GenStudioRouteStateProps = {
  mode: GenStudioTemplateRouteMode;
};

const TEMPLATE_LIST_PATH = "/gen-studio/templates";

function templateListHref(mode: GenStudioTemplateRouteMode) {
  return `${TEMPLATE_LIST_PATH}?mode=${mode}`;
}

function routeLabel(mode: GenStudioTemplateRouteMode) {
  return mode === "image"
    ? { ko: "이미지", en: "image" }
    : { ko: "콘텐츠", en: "content" };
}

export function GenStudioRouteLoading({ mode }: GenStudioRouteStateProps) {
  const label = routeLabel(mode);

  return (
    <main
      className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-primary-text"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Preloader variant="spin" size="lg" />
        <p className="text-sm text-secondary-text">
          <Lang text={{ ko: `${label.ko} 템플릿 생성 화면을 준비하고 있습니다.`, en: `Preparing the ${label.en} template workspace.` }} />
        </p>
      </div>
    </main>
  );
}

export function GenStudioRouteNotFound({ mode }: GenStudioRouteStateProps) {
  const label = routeLabel(mode);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-primary-text">
      <section className="flex max-w-md flex-col items-center gap-3 text-center" role="alert">
        <AlertTriangle className="icon-lg text-secondary-text" aria-hidden="true" />
        <h1 className="text-xl font-semibold">
          <Lang text={{ ko: `${label.ko} 템플릿을 찾을 수 없습니다.`, en: `The ${label.en} template was not found.` }} />
        </h1>
        <p className="text-sm leading-6 text-secondary-text">
          <Lang
            text={{
              ko: "템플릿이 비활성화되었거나 접근 권한이 없을 수 있습니다.",
              en: "The template may be disabled or you may not have permission to access it.",
            }}
          />
        </p>
        <Button variant="outline" asChild>
          <Link href={templateListHref(mode)}>
            <ArrowLeft className="icon-sm" aria-hidden="true" />
            <Lang text={{ ko: "템플릿 목록으로", en: "Back to templates" }} />
          </Link>
        </Button>
      </section>
    </main>
  );
}

export function GenStudioRouteError({ mode, reset }: GenStudioRouteStateProps & { reset: () => void }) {
  const label = routeLabel(mode);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-primary-text">
      <section className="flex max-w-md flex-col items-center gap-3 text-center" role="alert" aria-live="assertive">
        <AlertTriangle className="icon-lg text-danger" aria-hidden="true" />
        <h1 className="text-xl font-semibold">
          <Lang text={{ ko: `${label.ko} 생성 화면에 문제가 발생했습니다.`, en: `The ${label.en} workspace encountered a problem.` }} />
        </h1>
        <p className="text-sm leading-6 text-secondary-text">
          <Lang
            text={{
              ko: "잠시 후 다시 시도하거나 템플릿 목록으로 돌아가세요.",
              en: "Try again shortly or return to the template list.",
            }}
          />
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={reset}>
            <Lang text={{ ko: "다시 시도", en: "Try again" }} />
          </Button>
          <Button variant="outline" asChild>
            <Link href={templateListHref(mode)}>
              <Lang text={{ ko: "목록으로", en: "Back to list" }} />
            </Link>
          </Button>
        </div>
        <span className="sr-only">{lang({ ko: "오류 상태", en: "Error state" })}</span>
      </section>
    </main>
  );
}
