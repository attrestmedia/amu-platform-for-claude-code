import { AudioStudioEditor } from "./AudioStudioEditor";
import { ContentStudioEditor } from "./ContentStudioEditor";
import { ImageStudioEditor } from "./ImageStudioEditor";
import type { GenStudioTemplateRouteMode } from "./GenStudioTemplateRoute";

type GenStudioCustomRouteProps = {
  mode: GenStudioTemplateRouteMode | "audio";
};

export function GenStudioCustomRoute({ mode }: GenStudioCustomRouteProps) {
  if (mode === "audio") {
    return <AudioStudioEditor routeDetailMode="custom" />;
  }

  if (mode === "content") {
    return (
      <ContentStudioEditor
        mode="user"
        detailPresentation="page"
        detailNavigationMode="route"
        routeDetailMode="custom"
        navigationBasePath="/gen-studio/templates"
      />
    );
  }

  return (
    <ImageStudioEditor
      mode="user"
      detailPresentation="page"
      detailNavigationMode="route"
      routeDetailMode="custom"
      navigationBasePath="/gen-studio/templates"
    />
  );
}
