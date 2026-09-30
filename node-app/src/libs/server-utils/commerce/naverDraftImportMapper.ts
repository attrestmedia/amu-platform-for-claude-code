import "server-only";

import { pickChannelProduct, toMainImage } from "./naverUtils";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toFiniteNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function toRecord(value: unknown) {
  return toUnknownRecord(value);
}

function pickFirstText(...values: unknown[]) {
  for (const value of values) {
    const next = toSafeString(value);
    if (next) return next;
  }
  return "";
}

function pickDetailContent(product: UnknownRecord, channelProduct: UnknownRecord) {
  const originProduct = toRecord(product.originProduct);
  const channelDetailAttribute = toRecord(channelProduct.detailAttribute);
  const originDetailAttribute = toRecord(originProduct.detailAttribute);
  const productDetailAttribute = toRecord(product.detailAttribute);
  return pickFirstText(
    channelProduct.detailContent,
    originProduct.detailContent,
    product.detailContent,
    channelProduct.description,
    product.description,
    channelDetailAttribute.description,
    originDetailAttribute.description,
    productDetailAttribute.description,
  );
}

function pickImages(product: UnknownRecord, channelProduct: UnknownRecord) {
  const originProduct = toRecord(product.originProduct);
  const imageObject = toRecord(channelProduct.images || originProduct.images || product.images);
  const objectImages = [
    imageObject.representativeImage,
    ...(Array.isArray(imageObject.optionalImages) ? imageObject.optionalImages : []),
  ].filter(Boolean);
  const candidates = Array.isArray(channelProduct.images)
    ? channelProduct.images
    : objectImages.length > 0
      ? objectImages
      : Array.isArray(originProduct.images)
        ? originProduct.images
        : Array.isArray(product.images)
          ? product.images
          : [];

  const mapped = candidates
    .map((rawImage, index: number) => {
      const image = toRecord(rawImage);
      const url = pickFirstText(image.url, image.imageUrl, typeof rawImage === "string" ? rawImage : "");
      if (!url) return null;
      return {
        url,
        role: index === 0 ? "representative" : "detail",
        imageType: pickFirstText(image.type, image.imageType, index === 0 ? "REPRESENTATIVE" : "OPTIONAL"),
        origin: "imported",
        sortOrder: index + 1,
      };
    })
    .filter(Boolean);

  if (mapped.length > 0) return mapped;

  const fallback = pickFirstText(toMainImage(channelProduct), toMainImage(product));
  if (!fallback) return [];

  return [
    {
      url: fallback,
      role: "representative",
      imageType: "REPRESENTATIVE",
      origin: "imported",
      sortOrder: 1,
    },
  ];
}

function pickNotice(product: UnknownRecord, channelProduct: UnknownRecord) {
  const originProduct = toRecord(product.originProduct);
  const detailAttribute = toRecord(originProduct.detailAttribute || product.detailAttribute);
  const notice = toRecord(detailAttribute.productInfoProvidedNotice);
  const source = toRecord(
    channelProduct.productInfoProvidedNotice ||
      channelProduct.notice ||
      notice ||
      product.productInfoProvidedNotice ||
      product.notice,
  );
  return {
    productInfoProvidedNoticeType: pickFirstText(
      source.productInfoProvidedNoticeType,
      source.noticeType,
      channelProduct.productInfoProvidedNoticeType,
      notice.productInfoProvidedNoticeType,
      product.productInfoProvidedNoticeType,
    ),
    payload: toRecord(source.payload || source.content || source.noticeDetail || source),
  };
}

function pickOrigin(product: UnknownRecord, channelProduct: UnknownRecord) {
  const originProduct = toRecord(product.originProduct);
  const detailAttribute = toRecord(originProduct.detailAttribute || product.detailAttribute);
  const origin = toRecord(
    channelProduct.origin ||
      channelProduct.originAreaInfo ||
      detailAttribute.originAreaInfo ||
      product.origin ||
      product.originAreaInfo,
  );
  return {
    originAreaCode: pickFirstText(origin.originAreaCode, origin.code, origin.contentOriginAreaCode),
    originAreaName: pickFirstText(origin.originAreaName, origin.name),
    content: pickFirstText(origin.content, origin.originContent, origin.originAreaName),
  };
}

function pickLogistics(product: UnknownRecord, channelProduct: UnknownRecord) {
  const originProduct = toRecord(product.originProduct);
  const detailAttribute = toRecord(originProduct.detailAttribute || product.detailAttribute);
  const deliveryInfo = toRecord(channelProduct.deliveryInfo || originProduct.deliveryInfo || product.deliveryInfo);
  const deliveryClaimInfo = toRecord(deliveryInfo.claimDeliveryInfo);
  const afterServiceInfo = toRecord(detailAttribute.afterServiceInfo);
  const logistics = toRecord(channelProduct.logistics || product.logistics);
  const logisticsClaimInfo = toRecord(logistics.claimDeliveryInfo);
  return {
    shippingPolicyText: pickFirstText(
      logistics.shippingPolicyText,
      deliveryInfo.deliveryType,
      logistics.shippingMethodType,
      logistics.deliveryType,
    ),
    returnPolicyText: pickFirstText(
      logistics.returnPolicyText,
      deliveryClaimInfo.returnDeliveryCompanyCode,
      logisticsClaimInfo.returnDeliveryCompanyCode,
      logistics.returnChargeName,
    ),
    asPolicyText: pickFirstText(
      logistics.asPolicyText,
      afterServiceInfo.afterServiceGuideContent,
      afterServiceInfo.afterServiceTelephoneNumber,
      logistics.afterServiceInfo,
      logistics.afterServiceTelephoneNumber,
    ),
    deliveryInfo: Object.keys(deliveryInfo).length > 0 ? deliveryInfo : logistics,
  };
}

function pickFacts(product: UnknownRecord, channelProduct: UnknownRecord) {
  const originProduct = toRecord(product.originProduct);
  const channelDetailAttribute = toRecord(channelProduct.detailAttribute);
  const originDetailAttribute = toRecord(originProduct.detailAttribute);
  const productDetailAttribute = toRecord(product.detailAttribute);
  const searchInfo = toRecord(
    channelDetailAttribute.naverShoppingSearchInfo ||
      toRecord(originDetailAttribute.naverShoppingSearchInfo) ||
      toRecord(productDetailAttribute.naverShoppingSearchInfo),
  );
  const detailAttribute = toRecord(channelProduct.detailAttribute || originProduct.detailAttribute || product.detailAttribute);
  return {
    brandName: pickFirstText(searchInfo.brandName, detailAttribute.brandName, channelProduct.brandName, product.brandName),
    manufacturerName: pickFirstText(
      searchInfo.manufacturerName,
      detailAttribute.manufacturerName,
      channelProduct.manufacturerName,
      product.manufacturerName,
    ),
    modelName: pickFirstText(detailAttribute.modelName, channelProduct.modelName, product.modelName),
  };
}

export function mapNaverProductDetailToDraft(productRaw: UnknownRecord) {
  const product = toRecord(productRaw);
  const originProduct = toRecord(product.originProduct);
  const channelProduct = toRecord(pickChannelProduct(productRaw) || productRaw);
  const channelSale = toRecord(channelProduct.sale);
  const originDetailAttribute = toRecord(originProduct.detailAttribute);
  const productDetailAttribute = toRecord(product.detailAttribute);
  const originSellerCodeInfo = toRecord(originDetailAttribute.sellerCodeInfo);
  const productSellerCodeInfo = toRecord(productDetailAttribute.sellerCodeInfo);

  const displayTitle = pickFirstText(
    channelProduct.channelProductName,
    channelProduct.productName,
    originProduct.name,
    originProduct.productName,
    product.channelProductName,
    product.productName,
    product.name,
  );
  const detailContent = pickDetailContent(product, channelProduct);
  const salePrice =
    toFiniteNumber(channelProduct.salePrice ?? channelSale.salePrice ?? originProduct.salePrice ?? product.salePrice) ?? 0;
  const stockQuantity = toFiniteNumber(channelProduct.stockQuantity ?? originProduct.stockQuantity ?? product.stockQuantity) ?? 0;
  const images = pickImages(product, channelProduct);
  const facts = pickFacts(product, channelProduct);
  const logistics = pickLogistics(product, channelProduct);
  const notice = pickNotice(product, channelProduct);
  const origin = pickOrigin(product, channelProduct);

  const importedSnapshot = {
    importedAt: new Date().toISOString(),
    title: displayTitle,
    channelProductName: displayTitle,
    productName: pickFirstText(channelProduct.productName, originProduct.name, product.productName, product.name, displayTitle),
    salePrice,
    stockQuantity,
    statusType: pickFirstText(channelProduct.statusType, originProduct.statusType, product.statusType),
    channelProductDisplayStatusType: pickFirstText(
      channelProduct.channelProductDisplayStatusType,
      product.channelProductDisplayStatusType,
    ),
    detailContent,
    categoryId: pickFirstText(channelProduct.categoryId, originProduct.leafCategoryId, originProduct.categoryId, product.categoryId),
    categoryName: pickFirstText(channelProduct.categoryName, product.categoryName),
    sellerManagementCode: pickFirstText(
      channelProduct.sellerManagementCode,
      originSellerCodeInfo.sellerManagementCode,
      productSellerCodeInfo.sellerManagementCode,
      product.sellerManagementCode,
    ),
    channelProductNo: toFiniteNumber(channelProduct.channelProductNo ?? product.channelProductNo),
    originProductNo: toFiniteNumber(channelProduct.originProductNo ?? product.originProductNo ?? originProduct.originProductNo),
    brandName: facts.brandName,
    manufacturerName: facts.manufacturerName,
    images,
  };

  return {
    display: {
      title: displayTitle,
      summary: pickFirstText(product.summary, channelProduct.summary, importedSnapshot.categoryName),
      detailHtml: detailContent,
      price: salePrice,
    },
    smartstore: {
      channelProductNo: importedSnapshot.channelProductNo,
      originProductNo: importedSnapshot.originProductNo,
      channelProductName: importedSnapshot.channelProductName,
      productName: importedSnapshot.productName,
      salePrice,
      stockQuantity,
      statusType: importedSnapshot.statusType,
      channelProductDisplayStatusType: importedSnapshot.channelProductDisplayStatusType,
      categoryId: importedSnapshot.categoryId,
      categoryName: importedSnapshot.categoryName,
      sellerManagementCode: importedSnapshot.sellerManagementCode,
      images,
      logistics,
      notice,
      origin,
      facts,
      importedSnapshot,
      lastImportedAt: importedSnapshot.importedAt,
    },
    review: {
      factualConfirmed: false,
      representativeImageConfirmed: true,
      aiDisclosureChecked: false,
    },
    importedSnapshot,
  };
}
