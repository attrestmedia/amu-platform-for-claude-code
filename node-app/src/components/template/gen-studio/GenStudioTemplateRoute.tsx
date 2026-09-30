import { AudioStudioEditor } from "./AudioStudioEditor";
import { ContentStudioEditor } from "./ContentStudioEditor";
import { ImageStudioEditor } from "./ImageStudioEditor";

export type GenStudioTemplateRouteMode = "image" | "content";

type GenStudioTemplateRouteProps = {
  mode: GenStudioTemplateRouteMode | "audio";
  templateKey: string;
};

export function GenStudioTemplateRoute({ mode, templateKey }: GenStudioTemplateRouteProps) {
  if (mode === "audio") {
    return <AudioStudioEditor routeTemplateKey={templateKey} />;
  }

  if (mode === "content") {
    return (
      <ContentStudioEditor
        mode="user"
        detailPresentation="page"
        detailNavigationMode="route"
        navigationBasePath="/gen-studio/templates"
        routeTemplateKey={templateKey}
      />
    );
  }

  return (
    <ImageStudioEditor
      mode="user"
      detailPresentation="page"
      detailNavigationMode="route"
      navigationBasePath="/gen-studio/templates"
      routeTemplateKey={templateKey}
    />
  );
}
