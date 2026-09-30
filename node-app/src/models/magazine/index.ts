/**
 * @docHint
 * @purpose Magazine 콘텐츠 경험 모델 export
 * @process Registry 스키마를 도메인 레이어에 제공
 * @domain magazine-content-experience
 * @scope db-schema
 */

export { MagazineEmbedRegistrySchema, type IMagazineEmbedRegistryDocument } from "./MagazineEmbedRegistrySchema";
export {
  MagazineArticleDeclarationSchema,
  type IMagazineArticleDeclarationDocument,
  type MagazineArticleDeclarationSource,
} from "./MagazineArticleDeclarationSchema";
export {
  AppMagazineContentSchema,
  type IAppMagazineContentDocument,
  type AppMagazineContentSource,
} from "./AppMagazineContentSchema";
export {
  MagazineNarrationSchema,
  type IMagazineNarrationDocument,
} from "./MagazineNarrationSchema";
export {
  AppMagazineContentSaveSchema,
  AppMagazineTopicFollowSchema,
  AppMagazineReadingProgressSchema,
  AppMagazineTopicSchema,
  AppMagazinePersonalizationCounterSchema,
  type IAppMagazineContentSaveDocument,
  type IAppMagazineTopicFollowDocument,
  type IAppMagazineReadingProgressDocument,
  type IAppMagazineTopicDocument,
  type IAppMagazinePersonalizationCounterDocument,
  type AppMagazineCounterKind,
} from "./AppMagazinePersonalizationSchema";
export {
  MagazineKnowledgeArticleSchema,
  type IMagazineKnowledgeArticleDocument,
  type MagazineKnowledgeSource,
} from "./MagazineKnowledgeArticleSchema";
export {
  MagazineKnowledgeUnitSchema,
  type IMagazineKnowledgeUnitDocument,
} from "./MagazineKnowledgeUnitSchema";
export {
  MagazineRenewalLogSchema,
  type IMagazineRenewalLogDocument,
} from "./MagazineRenewalLogSchema";
export {
  MagazineEmbeddingSchema,
  type IMagazineEmbeddingDocument,
} from "./MagazineEmbeddingSchema";
export {
  MagazineIntelligencePatternSchema,
  type IMagazineIntelligencePatternDocument,
} from "./MagazineIntelligencePatternSchema";
export {
  MagazineIntelligenceExperimentSchema,
  MagazineIntelligenceExperimentResultSchema,
  MagazineProofBankSchema,
  type IMagazineIntelligenceExperimentDocument,
  type IMagazineIntelligenceExperimentResultDocument,
  type IMagazineProofBankDocument,
} from "./MagazineIntelligenceExperimentSchema";
