import type { ICommerceProduct } from "types/commerce";
import { COMMERCE_PLACEHOLDER_IMAGE } from "consts/app";
import { buildImageProxyUrl, isProxyImageUrl } from "../common";

export const getSafeImageUrl = (imageUrl: string): string => {
  if (!imageUrl || typeof imageUrl !== "string") return COMMERCE_PLACEHOLDER_IMAGE;
  if (isProxyImageUrl(imageUrl) || imageUrl.startsWith("/assets/")) return imageUrl;
  if (!/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return buildImageProxyUrl(imageUrl);
};

export const preprocessCommerceProducts = (products: ICommerceProduct[]): ICommerceProduct[] => {
  return products.map((product) => ({
    ...product,
    image: getSafeImageUrl(product.image),
    title: product.title || "상품명 없음",
    price: typeof product.price === "number" ? product.price : 0,
    id: product.id || `product_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  }));
};
