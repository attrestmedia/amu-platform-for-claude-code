import type { ContentPromptCustomType } from "types/app";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateContentPrompt } from "libs/server-utils/api/routeValidators";
import { handleUniverseContentCustom, type ContentCustomBody } from "libs/server-utils/api/contentBasicHandler";
import { COMMERCE_NAMESPACE_KEY } from "consts/app";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

const validate = validateContentPrompt;
async function handler(data: ContentPromptCustomType, user: AuthenticatedUserType) {
  return await handleUniverseContentCustom(data as ContentCustomBody, user, {
    routeMeta: "commerce/content",
    appBillingKey: COMMERCE_NAMESPACE_KEY,
  });
}

export const POST = withAuth<ContentPromptCustomType>(handler, validate, "commerce/generate/basic-content", {
  checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
});
