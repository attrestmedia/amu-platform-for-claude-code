import { Schema, type Document } from "mongoose";
import type {
  MagazineNarrationContentRef,
  MagazineNarrationInvalidation,
  MagazineNarrationPlaylist,
  MagazineNarrationSegment,
  MagazineNarrationSource,
  MagazineNarrationState,
} from "libs/server-utils/magazine/magazineNarrationContract";

export interface IMagazineNarrationDocument extends Document {
  contractType: "magazine-narration";
  schemaVersion: "magazine-narration.v1";
  narrationId: string;
  contentRefKey: string;
  contentRef: MagazineNarrationContentRef;
  articleRevision: string;
  source: MagazineNarrationSource;
  playlist: MagazineNarrationPlaylist;
  segments: MagazineNarrationSegment[];
  status: MagazineNarrationState;
  publishedBy: string;
  publishedAt: Date;
  invalidation?: MagazineNarrationInvalidation;
  invalidatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MagazineNarrationSchema = new Schema<IMagazineNarrationDocument>(
  {
    contractType: { type: String, enum: ["magazine-narration"], required: true, default: "magazine-narration" },
    schemaVersion: { type: String, enum: ["magazine-narration.v1"], required: true, default: "magazine-narration.v1" },
    narrationId: { type: String, required: true, unique: true, index: true },
    contentRefKey: { type: String, required: true, index: true, maxlength: 180 },
    contentRef: { type: Schema.Types.Mixed, required: true },
    articleRevision: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    source: { type: Schema.Types.Mixed, required: true },
    playlist: { type: Schema.Types.Mixed, required: true },
    segments: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["published", "invalidation_pending", "invalidated"], required: true, index: true },
    publishedBy: { type: String, required: true },
    publishedAt: { type: Date, required: true },
    invalidation: { type: Schema.Types.Mixed, default: null },
    invalidatedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "magazine_narrations", strict: "throw" },
);

MagazineNarrationSchema.index({ contentRefKey: 1, articleRevision: 1 }, { unique: true });
MagazineNarrationSchema.index({ contentRefKey: 1, status: 1, updatedAt: -1 });
