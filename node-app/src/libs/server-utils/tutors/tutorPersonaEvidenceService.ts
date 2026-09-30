import "server-only";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { resolveImageAssetByProfileUrl } from "libs/server-utils/lab/imageAssetProfileUrlResolver";
import { getModel } from "libs/database/modelCache";
import { TUTORS_SHARED_TEMPLATE_COLLECTION } from "libs/services/tutors/tutorsCollectionKey";
import { PersonaSchema, type IPersonaDocument } from "models/universe";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose Agent/MCP에 튜터 페르소나 메타와 프로필 이미지의 생성 자산 연결을 읽기 전용으로 제공
 * @process 공개/소유 튜터 조회 -> profiles 이미지 URL 수집 -> storage URL 역조회로 assetId 확인 -> uid 비노출 변환
 * @domain tutors
 * @scope agent-api
 */

export type TutorPersonaResolvedAsset = {
  assetId: string;
  url: string;
  visibility: string;
  templateKey: string;
};

export type TutorPersonaEvidenceItem = {
  pid: string;
  name: string;
  visibility: string;
  status: string;
  isTemplate: boolean;
  isOwnedByAgentKey: boolean;
  personaType: string;
  tutorIntro: string;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
  profileImageUrls: string[];
  resolvedAssets: TutorPersonaResolvedAsset[];
  unresolvedImageUrls: string[];
};

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/**
 * profiles는 Schema.Types.Mixed라 형태를 신뢰할 수 없다.
 * 문자열 URL만 평탄화해 수집하고 중복을 제거한다.
 */
function collectProfileImageUrls(profiles: unknown): string[] {
  const record = toUnknownRecord(profiles);
  const urls: string[] = [];
  for (const value of Object.values(record)) {
    if (typeof value === "string") {
      urls.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") urls.push(item);
      }
    }
  }
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
}

export async function listTutorPersonaEvidence(args: {
  uid: string;
  scope: "public" | "mine";
  pid?: string;
  sinceDays?: number;
  limit?: number;
  includeAssetIds?: boolean;
}): Promise<{ personas: TutorPersonaEvidenceItem[] }> {
  const limit = Math.max(1, Math.min(Math.floor(args.limit || DEFAULT_LIMIT), MAX_LIMIT));
  const includeAssetIds = args.includeAssetIds !== false;

  const TemplateModel = await getModel<IPersonaDocument>(
    MONGODB_PERSONA_URL,
    TUTORS_SHARED_TEMPLATE_COLLECTION,
    PersonaSchema,
    TUTORS_SHARED_TEMPLATE_COLLECTION,
  );

  // 공개 판정 조건은 api/(app)/tutors/public-gallery/route.ts와 동일하게 유지한다.
  const filter: Record<string, unknown> =
    args.scope === "mine"
      ? { ownerId: args.uid, status: "active" }
      : { isTemplate: true, visibility: "public", status: "active" };

  const pid = toSafeString(args.pid);
  if (pid) filter.pid = pid;
  if (args.sinceDays) {
    filter.updatedAt = { $gte: new Date(Date.now() - args.sinceDays * 24 * 60 * 60 * 1000) };
  }

  const docs = await TemplateModel.find(filter)
    .select({
      pid: 1,
      name: 1,
      visibility: 1,
      status: 1,
      isTemplate: 1,
      ownerId: 1,
      personaType: 1,
      tutorIntro: 1,
      version: 1,
      profiles: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  const personas: TutorPersonaEvidenceItem[] = [];

  for (const doc of docs || []) {
    const profileImageUrls = collectProfileImageUrls(doc.profiles);
    const resolvedAssets: TutorPersonaResolvedAsset[] = [];
    const unresolvedImageUrls: string[] = [];

    if (includeAssetIds) {
      for (const url of profileImageUrls) {
        const asset = await resolveImageAssetByProfileUrl(url);
        const record = toUnknownRecord(asset);
        const assetId = toSafeString(record.assetId);
        if (assetId) {
          resolvedAssets.push({
            assetId,
            url,
            visibility: toSafeString(record.visibility),
            templateKey: toSafeString(record.templateKey),
          });
        } else {
          // 역조회 실패를 삼키지 않는다. 연결 미확인 이미지를 확인된 자산으로 오인하면 안 된다.
          unresolvedImageUrls.push(url);
        }
      }
    }

    personas.push({
      pid: toSafeString(doc.pid),
      name: toSafeString(doc.name),
      visibility: toSafeString(doc.visibility),
      status: toSafeString(doc.status),
      isTemplate: Boolean(doc.isTemplate),
      // uid 원문은 응답에 담지 않는다 (compliance-guardrails §4-1 비가역 식별자 원칙).
      isOwnedByAgentKey: toSafeString(doc.ownerId) === args.uid,
      personaType: toSafeString(doc.personaType),
      tutorIntro: toSafeString(doc.tutorIntro),
      version: Number(doc.version || 1),
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      profileImageUrls,
      resolvedAssets,
      unresolvedImageUrls,
    });
  }

  return { personas };
}
