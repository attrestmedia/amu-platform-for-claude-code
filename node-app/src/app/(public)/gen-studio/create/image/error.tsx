"use client";

import { GenStudioRouteError } from "components/template/gen-studio/GenStudioRouteState";

export default function GenStudioCustomImageError({ reset }: { reset: () => void }) {
  return <GenStudioRouteError mode="image" reset={reset} />;
}
