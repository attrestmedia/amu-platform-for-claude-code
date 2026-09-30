"use client";

import { GenStudioRouteError } from "components/template/gen-studio/GenStudioRouteState";

export default function GenStudioImageTemplateError({ reset }: { reset: () => void }) {
  return <GenStudioRouteError mode="image" reset={reset} />;
}
