import "server-only";
import { logger } from "utils/log";
import { MAGAZINE_DYNAMIC_MODULES, buildResolverSuccess, evaluateMagazineEmbedRegistry, isExactOrigin, magazineContentRefId, makeContextHash, validateMagazineResolverRequest, type MagazineArticleDeclaration, type MagazineArticleSlot, type MagazineDynamicModule, type MagazineEmbedAllowedProps, type MagazineEmbedRegistryEntry, type MagazineRegistryResolutionConfig, type MagazineResolveContext, type MagazineResolverResponse } from "./magazineEmbedContract";
import { listMagazineEmbedRegistryEntries, getMagazineEmbedRegistryEntry } from "./magazineEmbedRegistry";
import { getMagazineArticleDeclaration, magazineArticleDeclarationRevision } from "./magazineArticleDeclaration";
import { issueMagazineLaunchToken, type MagazineLaunchTokenClaims } from "./magazineEmbedToken";

/**
 * @docHint
 * @purpose WordPress declaration을 Registry 정책과 결합하는 Magazine resolver
 * @process 입력 재검증  DB·환경 게이트 판정  제한된 launch URL/token projection
 * @domain magazine-content-experience
 * @scope server-service
 */

const EMBED_PATH_PREFIX = "/embed/magazine/v1/";

function requestConfig(): MagazineRegistryResolutionConfig {
  return {
    runtimeEnabled: String(process.env.MAGAZINE_EMBED_RUNTIME_ENABLED || "false").toLowerCase() === "true",
    killSwitch: ["1", "true", "yes"].includes(String(process.env.MAGAZINE_EMBED_KILL_SWITCH || "").toLowerCase()),
    featureFlagEnabled: String(process.env.MAGAZINE_EMBED_FEATURE_FLAG || "false").toLowerCase() === "true",
    allowedParentOrigins: String(process.env.MAGAZINE_EMBED_ALLOWED_PARENT_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => isExactOrigin(value)),
  };
}

function publicAppOrigin() {
  const configured = String(process.env.MAGAZINE_EMBED_PUBLIC_ORIGIN || "").trim();
  const siteDomain = String(process.env.SITE_DOMAIN || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const raw = configured || (siteDomain ? `https://${siteDomain}` : "");
  if (!isExactOrigin(raw)) return "";
  return raw.replace(/\/$/, "");
}

function safeRequestId(raw: unknown) {
  const value = typeof raw === "string" ? raw.trim() : "";
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : `mag-${crypto.randomUUID()}`;
}

function serviceForSlot(slot: MagazineArticleSlot) {
  return slot.moduleType === "tutors_embed" ? "tutors" : slot.moduleType === "image_embed" || slot.moduleType === "content_embed" ? "gen-studio" : null;
}

function returnUrlFor(site: string, declaration: MagazineArticleDeclaration) {
  const host = site.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const base = host ? `https://${host}` : "";
  const path = declaration.contentRef.kind === "wp_post"
    ? `/${declaration.contentRef.postSlug}/`
    : `/magazine/${declaration.contentRef.slug}`;
  return `${base}${path}#${encodeURIComponent(declaration.returnSectionId)}`;
}

function disabledResponse(requestId: string, declaration: MagazineArticleDeclaration, slot: MagazineArticleSlot, reasonCode: Exclude<MagazineEmbedResolverReason, "enabled">): MagazineResolverResponse {
  const serviceKey = serviceForSlot(slot) || "gen-studio";
  return buildResolverSuccess({
    requestId,
    data: {
      enabled: false,
      reasonCode,
      serviceKey,
      renderMode: "context-link",
      capabilities: [],
      contextRevision: `wp-${makeContextHash({ declaration, slot }).slice(0, 32)}`,
      returnUrl: returnUrlFor("", declaration),
    },
  });
}

type MagazineEmbedResolverReason = Exclude<import("./magazineEmbedContract").MagazineReasonCode, "enabled">;

function buildLaunchClaims(args: { entry: MagazineEmbedRegistryEntry; declaration: MagazineArticleDeclaration; slot: MagazineArticleSlot; context: MagazineResolveContext; parentOrigin: string; requestId: string; returnUrl: string }): Omit<MagazineLaunchTokenClaims, "v" | "nonce" | "jti" | "iat" | "exp"> {
  return {
    integrationId: args.entry.integrationId,
    serviceKey: args.entry.serviceKey,
    moduleType: args.slot.moduleType as MagazineDynamicModule,
    contentRef: args.declaration.contentRef,
    sectionId: args.slot.sectionId,
    experienceId: args.slot.slotId,
    experienceLevel: args.declaration.experienceLevel,
    returnSectionId: args.declaration.returnSectionId,
    ...(args.slot.templateKey ? { templateKey: args.slot.templateKey } : {}),
    ...(args.slot.contextKey ? { contextKey: args.slot.contextKey } : {}),
    ...(args.slot.allowedProps ? { allowedProps: args.slot.allowedProps as MagazineEmbedAllowedProps } : {}),
    capabilities: args.entry.capabilities,
    contextRevision: args.entry.contextRevision,
    contextHash: args.entry.contextHash,
    parentOrigin: args.parentOrigin,
    requestId: args.requestId,
    returnUrl: args.returnUrl,
    articleContext: {
      title: args.declaration.contentRef.kind === "wp_post" ? args.declaration.contentRef.postSlug : args.declaration.contentRef.slug,
      question: args.declaration.primaryQuestion,
      intent: args.slot.intent,
    },
  };
}

/**
 * 차단 판정을 integrationId 단위 감사 로그로 남긴다. 값은 판정에 쓰인 식별자와 사유뿐이며
 * 사용자·토큰·개인정보는 남기지 않는다(G-CI-04).
 */
function auditDisabled(
  requestId: string,
  declaration: MagazineArticleDeclaration,
  slot: MagazineArticleSlot,
  reasonCode: Exclude<MagazineEmbedResolverReason, "enabled">,
  serviceKey: string,
  integrationId: string,
  expiresAt?: Date | string,
): MagazineResolverResponse {
  // 설정상 꺼둔 상태(플래그·런타임·노출)는 정상이므로 info로 남긴다. warn은 예상 밖 차단에만 쓴다.
  const expectedOff = reasonCode === "feature_flag_off" || reasonCode === "runtime_disabled" || reasonCode === "exposure_disabled" || reasonCode === "kill_switch";
  const write = expectedOff ? logger.info : logger.warn;
  write("[magazine-embed-resolver] disabled", {
    requestId,
    reasonCode,
    serviceKey,
    integrationId: integrationId || "(none)",
    contentRefKey: magazineContentRefId(declaration.contentRef),
    slotId: slot.slotId,
    moduleType: slot.moduleType,
    ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
  });
  return disabledResponse(requestId, declaration, slot, reasonCode);
}

export async function resolveMagazineEmbedRequest(args: { body: unknown; site: string; requestId?: string }): Promise<MagazineResolverResponse> {
  const requestId = safeRequestId(args.requestId);
  const parsed = validateMagazineResolverRequest(args.body);
  if (!parsed.ok) {
    const fallbackDeclaration = { contentRef: { kind: "wp_post", postId: 0, postSlug: "invalid" }, returnSectionId: "article-experience" } as unknown as MagazineArticleDeclaration;
    const fallbackSlot = { moduleType: "static" } as MagazineArticleSlot;
    return disabledResponse(requestId, fallbackDeclaration, fallbackSlot, parsed.reasonCode === "enabled" ? "manifest_invalid" : parsed.reasonCode);
  }
  const { slot, context } = parsed;
  if (!MAGAZINE_DYNAMIC_MODULES.includes(slot.moduleType as (typeof MAGAZINE_DYNAMIC_MODULES)[number])) return disabledResponse(requestId, parsed.declaration, slot, "exposure_disabled");

  const serviceKey = serviceForSlot(slot);
  if (!serviceKey || slot.serviceKey !== serviceKey) return disabledResponse(requestId, parsed.declaration, slot, "unknown_service");
  const declarationResult = await getMagazineArticleDeclaration({ contentRef: parsed.declaration.contentRef });
  if (!declarationResult.ok) {
    return auditDisabled(
      requestId,
      parsed.declaration,
      slot,
      declarationResult.error === "not_found" ? "declaration_not_found" : "registry_unavailable",
      serviceKey,
      "",
    );
  }
  const declaration = declarationResult.data.declaration;
  const storedSlot = declaration.slots.find((item) => item.slotId === slot.slotId);
  // WP bridge payload는 transport 호환용 입력일 뿐이다. declaration·slot·context가
  // node-app 저장본과 정확히 일치할 때만 Registry 판정을 진행한다.
  if (
    magazineContentRefId(declaration.contentRef) !== magazineContentRefId(parsed.context.contentRef) ||
    declaration.experienceLevel !== parsed.context.experienceLevel ||
    declaration.returnSectionId !== parsed.context.returnSectionId ||
    magazineArticleDeclarationRevision(parsed.declaration) !== declarationResult.data.revision ||
    !storedSlot ||
    JSON.stringify(storedSlot) !== JSON.stringify(slot)
  ) {
    return disabledResponse(requestId, parsed.declaration, slot, "manifest_invalid");
  }
  const parentOrigin = context.parentOrigin || "";
  const config = requestConfig();
  if (!isExactOrigin(parentOrigin)) return disabledResponse(requestId, declaration, slot, "allowlist_mismatch");

  const registry = await listMagazineEmbedRegistryEntries(serviceKey);
  // 읽기 실패(재시도 대상)와 항목 부재(설정 대상)를 같은 코드로 뭉치면 운영에서 원인을 분간할 수 없다.
  if (!registry.ok) return auditDisabled(requestId, declaration, slot, "registry_unavailable", serviceKey, "");
  const candidates = registry.entries
    .filter((entry) => entry.serviceKey === serviceKey)
    .filter((entry) => {
      const templateMatches = !entry.allowedTemplateKeys?.length || Boolean(slot.templateKey && entry.allowedTemplateKeys.includes(slot.templateKey));
      const personaMatches = slot.moduleType !== "tutors_embed" || !entry.allowedTutorPersonaIds?.length || Boolean(slot.contextKey && entry.allowedTutorPersonaIds.includes(slot.contextKey));
      return templateMatches && personaMatches;
    });
  if (candidates.length !== 1) {
    return auditDisabled(requestId, declaration, slot, candidates.length === 0 ? "registry_entry_missing" : "internal_error", serviceKey, candidates.map((entry) => entry.integrationId).join(","));
  }
  const decision = evaluateMagazineEmbedRegistry({ entry: candidates[0], declaration, slot, parentOrigin, config });
  if (!decision.enabled) return auditDisabled(requestId, declaration, slot, decision.reasonCode, serviceKey, candidates[0].integrationId, decision.reasonCode === "expired" ? candidates[0].expiresAt : undefined);

  const origin = publicAppOrigin();
  if (!origin) return disabledResponse(requestId, declaration, slot, "internal_error");
  const returnUrl = returnUrlFor(args.site, declaration);
  const baseEmbedUrl = `${origin}${EMBED_PATH_PREFIX}${encodeURIComponent(decision.entry.integrationId)}`;
  let embedUrl = baseEmbedUrl;
  if (context.issueLaunchToken === true) {
    try {
      const launch = issueMagazineLaunchToken(buildLaunchClaims({ entry: decision.entry, declaration, slot, context, parentOrigin, requestId, returnUrl }));
      // Token은 서버 로그·Referer에 남지 않도록 URL fragment에만 한 번 전달한다.
      embedUrl = `${baseEmbedUrl}#amu_launch_token=${launch.token}`;
    } catch {
      return disabledResponse(requestId, declaration, slot, "internal_error");
    }
  }

  return buildResolverSuccess({
    requestId,
    data: {
      enabled: true,
      reasonCode: "enabled",
      serviceKey: decision.entry.serviceKey,
      renderMode: "app-embed",
      capabilities: decision.entry.capabilities,
      contextRevision: decision.entry.contextRevision,
      returnUrl,
      integrationId: decision.entry.integrationId,
      embedUrl,
    },
  });
}

export async function revalidateMagazineLaunch(args: { claims: MagazineLaunchTokenClaims; nowMs?: number }) {
  const registry = await getMagazineEmbedRegistryEntry(args.claims.integrationId);
  if (!registry.ok) return { ok: false as const, reasonCode: "registry_unavailable" as const };
  const entry = registry.entries[0];
  if (!entry) return { ok: false as const, reasonCode: "registry_unavailable" as const };
  const decision = (await import("./magazineEmbedContract")).validateMagazineLaunchClaims({
    claims: args.claims,
    entry,
    config: requestConfig(),
    nowMs: args.nowMs,
  });
  return decision.ok ? { ok: true as const, entry } : decision;
}

export function magazineEmbedRuntimeConfig() {
  return requestConfig();
}
