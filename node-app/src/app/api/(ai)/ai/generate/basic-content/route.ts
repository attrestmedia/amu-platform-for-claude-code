import type { ContentPromptCustomType } from "types/app";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateContentPrompt } from "libs/server-utils/api/routeValidators";
import { handleUserContentCustom, type ContentCustomBody } from "libs/server-utils/api/contentBasicHandler";
import { CONTENT_STUDIO_NAMESPACE_KEY } from "consts/app/services";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

const validate = validateContentPrompt;
async function handler(data: ContentPromptCustomType, user: AuthenticatedUserType) {
  return await handleUserContentCustom(data as ContentCustomBody, user, {
    routeMeta: "ai/content",
    appBillingKey: CONTENT_STUDIO_NAMESPACE_KEY,
  });
}

export const POST = withAuth<ContentPromptCustomType>(handler, validate, "ai/generate/basic-content");
