"use client";

import { GenStudioRouteError } from "components/template/gen-studio/GenStudioRouteState";

export default function GenStudioCustomContentError({ reset }: { reset: () => void }) {
  return <GenStudioRouteError mode="content" reset={reset} />;
}
