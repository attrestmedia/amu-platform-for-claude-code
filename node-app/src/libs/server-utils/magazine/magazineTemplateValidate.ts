import "server-only";

import {
  GEN_STUDIO_TEMPLATE_INDEX_CONTRACT_TYPE,
  GEN_STUDIO_TEMPLATE_INDEX_SCHEMA_VERSION,
  GEN_STUDIO_TEMPLATE_LIMITS,
  GEN_STUDIO_TEMPLATE_TYPES,
  genStudioTemplateDocumentRef,
  type GenStudioTemplateIndex,
} from "./magazineTemplateContract";
import {
  MagazineKnowledgeContractError,
  assertKeys,
  enumValue,
  fail,
  identifier,
  isRecord,
  safeText,
  textList,
} from "./magazineKnowledgeSafety";

/**
 * @docHint
 * @purpose Gen Studio 템플릿 인덱스의 fail-closed 검증 — MIR-210
 * @process enum·길이·목록·양방향 참조 형식을 검증하고 저장 전 템플릿 인덱스를 고정한다
 * @domain magazine-semantic-index
 * @scope server-contract
 */

function unitRefList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > GEN_STUDIO_TEMPLATE_LIMITS.relatedKnowledgeUnitIds) {
    fail(field, `${GEN_STUDIO_TEMPLATE_LIMITS.relatedKnowledgeUnitIds}개 이하여야 합니다.`);
  }
  const refs = value.map((item, index) => {
    const ref = identifier(item, `${field}[${index}]`);
    if (!ref.startsWith("amu:magazine-knowledge-unit:")) fail(field, "Knowledge Unit 참조 형식이어야 합니다.");
    return ref;
  });
  if (new Set(refs).size !== refs.length) fail(field, "중복 참조를 포함할 수 없습니다.");
  return refs;
}

function patternRefList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > GEN_STUDIO_TEMPLATE_LIMITS.relatedPatternIds) {
    fail(field, `${GEN_STUDIO_TEMPLATE_LIMITS.relatedPatternIds}개 이하여야 합니다.`);
  }
  const refs = value.map((item, index) => identifier(item, `${field}[${index}]`));
  if (new Set(refs).size !== refs.length) fail(field, "중복 참조를 포함할 수 없습니다.");
  return refs;
}

export type GenStudioTemplateIndexValidation =
  | { ok: true; index: GenStudioTemplateIndex }
  | { ok: false; reasonCode: "gen_studio_template_index_invalid"; issues: string[] };

export function validateGenStudioTemplateIndex(value: unknown): GenStudioTemplateIndexValidation {
  try {
    if (!isRecord(value)) fail("index", "객체가 필요합니다.");
    const required = [
      "contractType", "schemaVersion", "templateId", "type", "title", "summary",
      "useCases", "industries", "audiences", "styles", "topics", "intents",
      "inputRequirements", "expectedOutputs", "relatedKnowledgeUnitIds", "relatedPatternIds",
    ];
    assertKeys(value, required, required, "index");
    if (value.contractType !== GEN_STUDIO_TEMPLATE_INDEX_CONTRACT_TYPE) fail("contractType", "지원하지 않는 contractType입니다.");
    if (value.schemaVersion !== GEN_STUDIO_TEMPLATE_INDEX_SCHEMA_VERSION) fail("schemaVersion", "지원하지 않는 schemaVersion입니다.");

    identifier(value.templateId, "templateId");
    enumValue(value.type, GEN_STUDIO_TEMPLATE_TYPES, "type");
    safeText(value.title, GEN_STUDIO_TEMPLATE_LIMITS.titleLength, "title");
    safeText(value.summary, GEN_STUDIO_TEMPLATE_LIMITS.summaryLength, "summary", true);

    const list = (field: string) => textList(value[field], field, GEN_STUDIO_TEMPLATE_LIMITS.listItems, GEN_STUDIO_TEMPLATE_LIMITS.itemLength);
    list("useCases");
    list("industries");
    list("audiences");
    list("styles");
    list("topics");
    list("intents");
    list("inputRequirements");
    list("expectedOutputs");
    unitRefList(value.relatedKnowledgeUnitIds, "relatedKnowledgeUnitIds");
    patternRefList(value.relatedPatternIds, "relatedPatternIds");

    return { ok: true, index: value as unknown as GenStudioTemplateIndex };
  } catch (error) {
    const message = error instanceof MagazineKnowledgeContractError ? error.message : "계약 검증에 실패했습니다.";
    return { ok: false, reasonCode: "gen_studio_template_index_invalid", issues: [message] };
  }
}

/** documentRef는 templateId로 고정 변환한다 — 임베딩 저장 dedup 키와 결합된다. */
export const genStudioTemplateRef = genStudioTemplateDocumentRef;
