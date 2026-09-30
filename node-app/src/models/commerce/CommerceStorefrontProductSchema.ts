import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

export interface ICommerceStorefrontProductDocument extends Document {
  productId: string;
  universeId: string;
  provider: "naver";
  draftId: string;
  title: string;
  image: string;
  imageFit: "cover" | "contain";
  itemType: "product" | "service";
  priceType: "fixed" | "range" | "text";
  price?: number;
  priceMin?: number;
  priceMax?: number;
  priceText?: string;
  summary: string;
  detail?: string;
  specs: UnknownRecord;
  url?: string;
  category?: string;
  inStock: boolean;
  order: number;
  displayOrder: number;
  featured: boolean;
  images: Array<UnknownRecord>;
  smartstore: UnknownRecord;
  source: UnknownRecord;
  publishedAt?: Date | null;
  syncedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CommerceStorefrontProductSchema = new Schema<ICommerceStorefrontProductDocument>(
  {
    productId: { type: String, required: true, index: true },
    universeId: { type: String, required: true, index: true },
    provider: { type: String, enum: ["naver"], required: true, default: "naver", index: true },
    draftId: { type: String, required: true, index: true },
    title: { type: String, required: true, default: "" },
    image: { type: String, default: "" },
    imageFit: { type: String, enum: ["cover", "contain"], default: "contain" },
    itemType: { type: String, enum: ["product", "service"], default: "product" },
    priceType: { type: String, enum: ["fixed", "range", "text"], default: "fixed" },
    price: { type: Number, default: undefined },
    priceMin: { type: Number, default: undefined },
    priceMax: { type: Number, default: undefined },
    priceText: { type: String, default: "" },
    summary: { type: String, default: "" },
    detail: { type: String, default: "" },
    specs: { type: Schema.Types.Mixed, default: () => ({}) },
    url: { type: String, default: "" },
    category: { type: String, default: "" },
    inStock: { type: Boolean, default: false, index: true },
    order: { type: Number, default: 9999 },
    displayOrder: { type: Number, default: 9999, index: true },
    featured: { type: Boolean, default: false, index: true },
    images: { type: Schema.Types.Mixed, default: [] },
    smartstore: { type: Schema.Types.Mixed, default: () => ({}) },
    source: { type: Schema.Types.Mixed, default: () => ({}) },
    publishedAt: { type: Date, default: null },
    syncedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "commerce_storefront_products" },
);

CommerceStorefrontProductSchema.index({ universeId: 1, productId: 1 }, { unique: true });
CommerceStorefrontProductSchema.index({ universeId: 1, displayOrder: 1, updatedAt: -1 });
CommerceStorefrontProductSchema.index({ universeId: 1, "smartstore.channelProductNo": 1 });
