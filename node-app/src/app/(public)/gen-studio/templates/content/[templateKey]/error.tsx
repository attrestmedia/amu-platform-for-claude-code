"use client";

import { GenStudioRouteError } from "components/template/gen-studio/GenStudioRouteState";

export default function GenStudioContentTemplateError({ reset }: { reset: () => void }) {
  return <GenStudioRouteError mode="content" reset={reset} />;
}
