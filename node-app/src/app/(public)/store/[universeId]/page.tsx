"use client";

import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Info, Pencil, Search, ShoppingBag, Sliders, X } from "lucide-react";
import { Button, Input, Preloader, RichTextRenderer, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, dialog } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import { TopBarAppLauncher } from "components/module/layout";
import { StoreManagePanel } from "components/module/store/StoreManagePanel";
import { ServiceThemeScope } from "components/module/theme/ServiceThemeScope";
import type { IProduct, IStoreKnowledge, IStorefrontContent, IUniverse, IUniverseDetail } from "types/game";
import type { ICommerceProduct, ICommerceStorefrontProduct } from "types/commerce";
import fetchClient from "libs/api/fetchClient";
import { useProductStore } from "store/commerce";
import { useUniverseAdminAccess } from "hooks/admin";
import { useUserData } from "hooks/auth";
import { getLocalizedUniverseDescription, getPlayPath } from "utils/app";
import { trackGaEvent } from "utils/analytics/ga4";
import type { UnknownRecord } from "utils/common";
import { cn } from "utils/common";

function formatPrice(product: IProduct) {
  if (product.priceType === "text" && product.priceText) return product.priceText;
  if (product.priceType === "range" && product.priceMin != null && product.priceMax != null) {
    return `${product.priceMin.toLocaleString()} ~ ${product.priceMax.toLocaleString()}`;
  }
  if (product.price != null && product.price > 0) return `${product.price.toLocaleString()}원`;
  return "";
}

type ProductCardVariant = "featured" | "catalog" | "compact";
type StoreInfoPanel = "guide" | "shipping" | "returns" | "faq" | "contact" | "care";

const STORE_INFO_TABS: Array<{ key: StoreInfoPanel; label: { ko: string; en: string } }> = [
  { key: "guide", label: { ko: "소개", en: "Guide" } },
  { key: "shipping", label: { ko: "배송", en: "Shipping" } },
  { key: "returns", label: { ko: "반품/교환", en: "Returns" } },
  { key: "faq", label: { ko: "FAQ", en: "FAQ" } },
  { key: "contact", label: { ko: "고객센터", en: "Support" } },
  { key: "care", label: { ko: "품질/관리", en: "Care" } },
];

type StorefrontProductsResponse = {
  products: ICommerceProduct[];
  totalCount: number;
  updatedAt?: string;
};

type StorefrontStatusResponse = {
  isOpen: boolean;
  isCommerceUniverse: boolean;
  credentialReady: boolean;
  storeId?: string;
  storefrontOpen: boolean;
  walletAccess?: {
    accessState?: "active" | "suspended" | "closed";
    publicAllowed?: boolean;
    closeReason?: "coins_empty" | "inactive";
    message?: string;
  };
  updatedAt?: string;
};

const EMPTY_COMMERCE_PRODUCTS: ICommerceProduct[] = [];

function safeText(value?: string | null) {
  return String(value || "").trim();
}

function compactTextList(value?: string[]) {
  return Array.isArray(value) ? value.map((item) => safeText(item)).filter(Boolean) : [];
}

function hasAnyContent(value?: unknown): boolean {
  if (!value) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.some((item) => hasAnyContent(item));
  if (typeof value === "object")
    return Object.values(value as Record<string, unknown>).some((item) => hasAnyContent(item));
  return true;
}

function EditableButton({
  active,
  label,
  value,
  onEdit,
}: {
  active: boolean;
  label: { ko: string; en: string };
  value: string;
  onEdit: (label: { ko: string; en: string }, value: string) => void;
}) {
  if (!active) return null;

  return (
    <Button
      variant="blank"
      size="icon-sm"
      className="ml-2 inline-flex align-middle text-current opacity-70 hover:opacity-100"
      aria-label={lang({ ko: `${label.ko} 편집`, en: `Edit ${label.en}` })}
      onClick={() => onEdit(label, value)}
    >
      <Pencil className="h-3.5 w-3.5" />
    </Button>
  );
}

function StoreProductCard({
  product,
  variant,
  actionLabel,
  onInspect,
  onExternalOpen,
}: {
  product: IProduct;
  variant: ProductCardVariant;
  actionLabel: { ko: string; en: string };
  onInspect?: (product: IProduct) => void;
  onExternalOpen?: (product: IProduct) => void;
}) {
  const isCompact = variant === "compact";
  const isFeatured = variant === "featured";
  const isCatalog = variant === "catalog";
  const price = formatPrice(product);

  return (
    <article className="group min-w-0">
      <div className="flex flex-col justify-between space-y-3 h-full">
        <div className="flex flex-col space-y-3">
          <button
            type="button"
            className="relative block w-full overflow-hidden bg-[var(--storefront-soft)] text-left"
            onClick={() => onInspect?.(product)}
          >
            <span className={isCompact ? "block aspect-[4/3] w-full" : "block aspect-[3/4] w-full"}>
              <ImageBox
                src={product.image}
                alt={product.title}
                width="100%"
                height="100%"
                className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
                objectFit="object-cover"
                sizes={isFeatured ? "(max-width: 640px) 92vw, 560px" : "(max-width: 640px) 46vw, 320px"}
                allowUpscale
              />
            </span>
            {isFeatured ? (
              <span className="absolute left-3 top-3 bg-[var(--storefront-accent)] px-2.5 py-1 text-xxs font-semibold uppercase tracking-[0.12em] text-white">
                BEST
              </span>
            ) : null}
            {product.inStock === false ? (
              <span className="absolute left-3 top-3 bg-[var(--storefront-dark)] px-2.5 py-1 text-xxs font-semibold uppercase tracking-[0.12em] text-white">
                SOLD OUT
              </span>
            ) : null}
          </button>
          <div className="space-y-1">
            {product.category ? (
              <p className="text-xxs uppercase tracking-[0.14em] text-[var(--storefront-muted)]">{product.category}</p>
            ) : null}
            <h3
              className={
                isCompact
                  ? "line-clamp-2 text-sm font-medium text-[var(--storefront-ink)]"
                  : "line-clamp-2 text-sm font-medium text-[var(--storefront-ink)] sm:text-base"
              }
            >
              {product.title}
            </h3>
            {isCompact ? null : (
              <RichTextRenderer
                content={product.summary}
                compact
                enableMermaid={false}
                className="line-clamp-2 text-xs leading-5 text-[var(--storefront-muted)] sm:text-sm"
              />
            )}
          </div>
          {price ? <p className="text-sm font-semibold text-[var(--storefront-ink)]">{price}</p> : null}
        </div>
        <div className={cn("grid gap-2", !isCatalog ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
          <Button
            variant="outline"
            size="lg"
            rounded="full"
            className="w-full border-[var(--storefront-line)] text-[var(--storefront-ink)]"
            onClick={() => onInspect?.(product)}
          >
            <Lang text={{ ko: "자세히 보기", en: "View Details" }} className="text-sm" />
          </Button>
          {product.url ? (
            <Button
              variant={isFeatured ? "primary" : "outline"}
              size="lg"
              rounded="full"
              className="w-full text-sm"
              onClick={() => onExternalOpen?.(product)}
            >
              <Lang text={actionLabel} />
            </Button>
          ) : (
            <Button variant="disabled" size="sm" className="w-full" disabled>
              <Lang text={{ ko: "준비중", en: "Soon" }} className="text-sm" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function getProductImages(product?: IProduct | null) {
  if (!product) return [];
  const storefrontProduct = product as Partial<ICommerceStorefrontProduct>;
  const extraImages = Array.isArray(storefrontProduct.images) ? storefrontProduct.images : [];

  return Array.from(
    new Set(
      [
        product.image,
        ...extraImages.map((image) => String(image?.url || image?.imageUrl || image?.src || "").trim()),
      ].filter(Boolean),
    ),
  );
}

function StoreInfoRows({
  rows,
  emptyText,
}: {
  rows: Array<{ label: { ko: string; en: string }; value?: string | string[] | null }>;
  emptyText: { ko: string; en: string };
}) {
  const visibleRows = rows
    .map((row) => ({
      ...row,
      value: Array.isArray(row.value) ? compactTextList(row.value) : safeText(row.value),
    }))
    .filter((row) => (Array.isArray(row.value) ? row.value.length > 0 : Boolean(row.value)));

  if (visibleRows.length === 0) {
    return <Lang text={emptyText} />;
  }

  return (
    <div className="space-y-3">
      {visibleRows.map((row) => (
        <div
          key={`${row.label.ko}-${Array.isArray(row.value) ? row.value.join(",") : row.value}`}
          className="border border-[var(--storefront-line)] bg-white/50 px-4 py-4 dark:bg-black/10"
        >
          <p className="text-xxs font-semibold uppercase tracking-[0.2em] text-[var(--storefront-muted)]">
            <Lang text={row.label} />
          </p>
          {Array.isArray(row.value) ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6 text-[var(--storefront-ink)]">
              {row.value.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <RichTextRenderer
              content={row.value}
              compact
              enableMermaid={false}
              className="mt-2 text-sm leading-6 text-[var(--storefront-ink)]"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function StoreProductDetailSheet({
  product,
  open,
  onOpenChange,
  onExternalOpen,
}: {
  product: IProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExternalOpen: (product: IProduct) => void;
}) {
  const images = getProductImages(product);
  const specs =
    product?.specs && typeof product.specs === "object"
      ? Object.entries(product.specs).filter(([, value]) => value != null && String(value).trim())
      : [];
  const price = product ? formatPrice(product) : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-service-theme="shopping-mall"
        className="w-[calc(100%-1rem)] overflow-y-auto bg-[var(--storefront-bg)] p-0 text-[var(--storefront-ink)] sm:max-w-[34rem]"
      >
        <SheetHeader className="border-b border-[var(--storefront-line)] px-5 py-4 text-left">
          <SheetTitle className="pr-8 text-lg text-[var(--storefront-ink)]">
            {product?.title || lang({ ko: "상품 상세", en: "Product Details" })}
          </SheetTitle>
          <SheetDescription className="text-[var(--storefront-muted)]">
            <Lang
              text={{
                ko: "상품 이미지와 상세 정보를 확인한 뒤 스마트스토어로 이동할 수 있습니다.",
                en: "Review product details, then continue to Smart Store.",
              }}
            />
          </SheetDescription>
        </SheetHeader>

        {product ? (
          <div className="space-y-6 px-5 py-5">
            <div className="space-y-3">
              {images[0] ? (
                <div className="aspect-[3/4] overflow-hidden bg-[var(--storefront-soft)]">
                  <ImageBox
                    src={images[0]}
                    alt={product.title}
                    width="100%"
                    height="100%"
                    className="h-full w-full"
                    objectFit={product.imageFit === "contain" ? "object-contain" : "object-cover"}
                    sizes="(max-width: 640px) 92vw, 520px"
                    allowUpscale
                  />
                </div>
              ) : null}
              {images.length > 1 ? (
                <div className="grid grid-cols-4 gap-2">
                  {images.slice(1, 5).map((image) => (
                    <div key={image} className="aspect-square overflow-hidden bg-[var(--storefront-soft)]">
                      <ImageBox
                        src={image}
                        alt={product.title}
                        width="100%"
                        height="100%"
                        className="h-full w-full"
                        objectFit="object-cover"
                        sizes="120px"
                        allowUpscale
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              {product.category ? (
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--storefront-muted)]">{product.category}</p>
              ) : null}
              <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--storefront-ink)]">{product.title}</h2>
              {price ? <p className="mt-3 text-2xl font-semibold text-[var(--storefront-ink)]">{price}</p> : null}
              <p className="mt-2 text-sm text-[var(--storefront-muted)]">
                <Lang
                  text={
                    product.inStock === false
                      ? { ko: "현재 품절", en: "Out of Stock" }
                      : { ko: "구매 가능", en: "Available" }
                  }
                />
              </p>
            </div>

            {product.summary ? (
              <RichTextRenderer
                content={product.summary}
                compact
                enableMermaid={false}
                className="text-sm leading-6 text-[var(--storefront-muted)]"
              />
            ) : null}
            {product.detail ? (
              <RichTextRenderer
                content={product.detail}
                enableMermaid={false}
                className="text-sm leading-7 text-[var(--storefront-ink)]"
              />
            ) : null}

            {specs.length ? (
              <div className="border border-[var(--storefront-line)] bg-white/50 px-4 py-4 dark:bg-black/10">
                <p className="text-sm font-semibold text-[var(--storefront-ink)]">
                  <Lang text={{ ko: "상품 정보", en: "Product Specs" }} />
                </p>
                <dl className="mt-3 divide-y divide-[var(--storefront-line)] text-sm">
                  {specs.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2">
                      <dt className="text-[var(--storefront-muted)]">{key}</dt>
                      <dd className="break-words text-[var(--storefront-ink)]">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {product.url ? (
              <Button className="w-full" onClick={() => onExternalOpen(product)}>
                <ShoppingBag className="mr-2 h-4 w-4" />
                <Lang text={{ ko: "스마트스토어에서 보기", en: "View in Smart Store" }} />
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function StoreInfoSheet({
  knowledge,
  open,
  panel,
  onOpenChange,
  onPanelChange,
}: {
  knowledge?: IStoreKnowledge;
  open: boolean;
  panel: StoreInfoPanel;
  onOpenChange: (open: boolean) => void;
  onPanelChange: (panel: StoreInfoPanel) => void;
}) {
  const brand = knowledge?.brand;
  const support = knowledge?.support;
  const shipping = knowledge?.shipping;
  const returns = knowledge?.returns;
  const warranty = knowledge?.warranty;
  const care = knowledge?.care;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-service-theme="shopping-mall"
        className="w-[calc(100%-1rem)] overflow-y-auto bg-[var(--storefront-bg)] p-0 text-[var(--storefront-ink)] sm:max-w-[32rem]"
      >
        <SheetHeader className="border-b border-[var(--storefront-line)] px-5 py-4 text-left">
          <SheetTitle className="text-[var(--storefront-ink)]">
            <Lang text={{ ko: "스토어 정보", en: "Store Information" }} />
          </SheetTitle>
          <SheetDescription className="text-[var(--storefront-muted)]">
            <Lang
              text={{
                ko: "배송, 반품, 고객센터, FAQ를 필요한 순간에 확인합니다.",
                en: "Check shipping, returns, support, and FAQ when needed.",
              }}
            />
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--storefront-line)] px-5 py-3">
          {STORE_INFO_TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={panel === tab.key ? "primary" : "outline"}
              size="sm"
              onClick={() => onPanelChange(tab.key)}
            >
              <Lang text={tab.label} />
            </Button>
          ))}
        </div>
        <div className="space-y-4 px-5 py-5 text-sm leading-7 text-[var(--storefront-muted)]">
          {panel === "guide" ? (
            hasAnyContent(brand) ? (
              <StoreInfoRows
                rows={[
                  { label: { ko: "브랜드 한 줄 소개", en: "Headline" }, value: brand?.headline },
                  { label: { ko: "상점 소개", en: "Introduction" }, value: brand?.intro },
                  { label: { ko: "브랜드 철학", en: "Philosophy" }, value: brand?.philosophy },
                  { label: { ko: "주요 취급 상품", en: "Categories" }, value: brand?.productCategories },
                  { label: { ko: "스토어 특징", en: "Store Features" }, value: brand?.features },
                  {
                    label: { ko: "운영 중인 스토어", en: "External Stores" },
                    value: brand?.externalStores?.map((item) => `${item.label}${item.url ? ` - ${item.url}` : ""}`),
                  },
                ]}
                emptyText={{ ko: "등록된 상점 소개가 없습니다.", en: "No store guide is available yet." }}
              />
            ) : (
              <Lang text={{ ko: "등록된 상점 소개가 없습니다.", en: "No store guide is available yet." }} />
            )
          ) : null}
          {panel === "shipping" ? (
            <StoreInfoRows
              rows={[
                { label: { ko: "배송 방법", en: "Courier" }, value: shipping?.courier },
                { label: { ko: "기본 배송비", en: "Base Fee" }, value: shipping?.baseFee },
                {
                  label: { ko: "무료 배송 기준", en: "Free Shipping Threshold" },
                  value: shipping?.freeShippingThreshold,
                },
                { label: { ko: "발송 기준", en: "Cutoff Time" }, value: shipping?.cutoffTime },
                { label: { ko: "평균 배송 기간", en: "Lead Time" }, value: shipping?.averageLeadTime },
                { label: { ko: "배송 조회", en: "Tracking" }, value: shipping?.trackingGuide },
                { label: { ko: "배송 안내", en: "Shipping Notes" }, value: shipping?.notes },
              ]}
              emptyText={{ ko: "등록된 배송 안내가 없습니다.", en: "No shipping information is available yet." }}
            />
          ) : null}
          {panel === "returns" ? (
            <StoreInfoRows
              rows={[
                { label: { ko: "가능 기간", en: "Return Window" }, value: returns?.windowDays },
                { label: { ko: "고객 부담 비용", en: "Customer Fee" }, value: returns?.customerFee },
                { label: { ko: "판매자 부담 사유", en: "Seller-paid Cases" }, value: returns?.freeCases },
                { label: { ko: "고객 부담 사유", en: "Customer-paid Cases" }, value: returns?.customerPaysCases },
                { label: { ko: "반품/교환 불가", en: "Unavailable Cases" }, value: returns?.unavailableCases },
                { label: { ko: "처리 절차", en: "Process" }, value: returns?.processSteps },
                { label: { ko: "환불 안내", en: "Refund Guide" }, value: returns?.refundGuide },
              ]}
              emptyText={{ ko: "등록된 반품/교환 안내가 없습니다.", en: "No return information is available yet." }}
            />
          ) : null}
          {panel === "faq" ? (
            knowledge?.faq?.length ? (
              knowledge.faq.slice(0, 8).map((item, index) => (
                <div
                  key={`${item.q}-${index}`}
                  className="border border-[var(--storefront-line)] bg-white/50 px-4 py-4 dark:bg-black/10"
                >
                  <RichTextRenderer
                    content={item.q}
                    compact
                    enableMermaid={false}
                    className="font-semibold text-[var(--storefront-ink)]"
                  />
                  <RichTextRenderer
                    content={item.a}
                    compact
                    enableMermaid={false}
                    className="mt-2 text-[var(--storefront-muted)]"
                  />
                </div>
              ))
            ) : (
              <Lang text={{ ko: "등록된 FAQ가 없습니다.", en: "No FAQ is available yet." }} />
            )
          ) : null}
          {panel === "contact" ? (
            <StoreInfoRows
              rows={[
                { label: { ko: "운영 시간", en: "Hours" }, value: support?.hours },
                { label: { ko: "운영시간 외 안내", en: "Outside Hours" }, value: support?.outsideHoursMessage },
                { label: { ko: "상담 내용", en: "Topics" }, value: support?.consultationTopics },
                { label: { ko: "고객센터 전화", en: "Support Phone" }, value: support?.contact?.csPhone },
                { label: { ko: "고객센터 이메일", en: "Support Email" }, value: support?.contact?.csEmail },
                { label: { ko: "카카오 채널", en: "Kakao Channel" }, value: support?.contact?.kakao },
              ]}
              emptyText={{ ko: "등록된 고객센터 안내가 없습니다.", en: "No support information is available yet." }}
            />
          ) : null}
          {panel === "care" ? (
            <StoreInfoRows
              rows={[
                { label: { ko: "품질 보증", en: "Warranty Summary" }, value: warranty?.summary },
                { label: { ko: "보증 기간", en: "Warranty Period" }, value: warranty?.period },
                { label: { ko: "보증 제외", en: "Exclusions" }, value: warranty?.exclusions },
                { label: { ko: "세탁/관리", en: "Care Instructions" }, value: care?.instructions },
              ]}
              emptyText={{
                ko: "등록된 품질/관리 안내가 없습니다.",
                en: "No warranty or care information is available yet.",
              }}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function StoreUniversePage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const universeId = String(params?.universeId || "").trim();
  const queryClient = useQueryClient();
  const { userData, isLoading: isUserDataLoading } = useUserData();
  const hydrateProducts = useProductStore((state) => state.hydrateProducts);
  const searchByText = useProductStore((state) => state.searchByText);
  const storeProducts = useProductStore((state) => state.byUniverse[universeId]?.products || EMPTY_COMMERCE_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<IProduct | null>(null);
  const [storeInfoOpen, setStoreInfoOpen] = useState(false);
  const [storeInfoPanel, setStoreInfoPanel] = useState<StoreInfoPanel>("guide");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const mode = String(searchParams?.get("mode") || "")
    .trim()
    .toLowerCase();
  const isManageMode = pathname.endsWith("/manage");
  const isPreviewMode = mode === "preview";
  const isOperatorMode = isManageMode || isPreviewMode;

  const { data: universe, isLoading: isUniverseLoading } = useQuery<IUniverse | null>({
    queryKey: ["store-universe-doc", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<UnknownRecord>(`/universe/${universeId}`, { cache: "no-store" });
      return (response?.data?.data || null) as IUniverse | null;
    },
    enabled: !!universeId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { canEditUniverse } = useUniverseAdminAccess(universe ? [universe] : []);
  const canManageStore = useMemo(
    () => Boolean(universe?.type === "commerce" && canEditUniverse(universe)),
    [canEditUniverse, universe],
  );

  const { data: storefrontStatus, isLoading: isStorefrontStatusLoading } = useQuery<StorefrontStatusResponse>({
    queryKey: ["storefront-status", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<UnknownRecord>(`/universe/${universeId}/commerce/storefront-status`, {
        cache: "no-store",
      });
      return (response?.data?.data || {
        isOpen: false,
        isCommerceUniverse: false,
        credentialReady: false,
        storefrontOpen: false,
      }) as StorefrontStatusResponse;
    },
    enabled: !!universeId && !isOperatorMode,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: detail, isLoading: isDetailLoading } = useQuery<IUniverseDetail | null>({
    queryKey: ["store-universe-detail", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<UnknownRecord>(`/universe/${universeId}/details`, { cache: "no-store" });
      return (response?.data?.data || null) as IUniverseDetail | null;
    },
    enabled: !!universeId && !isManageMode && (isPreviewMode ? canManageStore : Boolean(storefrontStatus?.isOpen)),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: storefrontData, isLoading: isProductsLoading } = useQuery<StorefrontProductsResponse>({
    queryKey: ["storefront-products", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<UnknownRecord>(`/universe/${universeId}/commerce/storefront-products`, {
        cache: "no-store",
      });
      return (response?.data?.data || { products: [], totalCount: 0 }) as StorefrontProductsResponse;
    },
    enabled: !!universeId && !isManageMode && (isPreviewMode ? canManageStore : Boolean(storefrontStatus?.isOpen)),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const storefrontProducts = useMemo<ICommerceProduct[]>(
    () =>
      [...(storefrontData?.products || [])].sort(
        (a, b) => Number(a?.displayOrder ?? a?.order ?? 0) - Number(b?.displayOrder ?? b?.order ?? 0),
      ),
    [storefrontData?.products],
  );
  const orderedStoreProducts = useMemo<ICommerceProduct[]>(
    () =>
      [...(storeProducts.length ? storeProducts : storefrontProducts)].sort(
        (a, b) => Number(a?.displayOrder ?? a?.order ?? 0) - Number(b?.displayOrder ?? b?.order ?? 0),
      ),
    [storeProducts, storefrontProducts],
  );
  const featuredProducts = useMemo(
    () => orderedStoreProducts.filter((product) => product.featured).slice(0, 4),
    [orderedStoreProducts],
  );
  const defaultFeaturedProducts = useMemo(
    () => (featuredProducts.length > 0 ? featuredProducts : orderedStoreProducts.slice(0, 4)),
    [featuredProducts, orderedStoreProducts],
  );
  const searchResults = useMemo(
    () =>
      deferredSearchQuery
        ? searchByText(universeId, deferredSearchQuery, {
            limit: 12,
          })
        : [],
    [deferredSearchQuery, searchByText, universeId],
  );
  const catalogProducts = deferredSearchQuery ? searchResults : orderedStoreProducts;
  const categoryKeywords = useMemo(
    () =>
      Array.from(
        new Set(orderedStoreProducts.map((product) => String(product.category || "").trim()).filter(Boolean)),
      ).slice(0, 6),
    [orderedStoreProducts],
  );
  const categoryTiles = useMemo(
    () =>
      categoryKeywords.map((category) => ({
        category,
        product: orderedStoreProducts.find((product) => String(product.category || "").trim() === category),
      })),
    [categoryKeywords, orderedStoreProducts],
  );
  const storeKnowledge = detail?.metadata?.storeKnowledge;
  const storefrontContent = detail?.metadata?.storefrontContent || {};
  const heroImage =
    storefrontContent.hero?.imageUrl || universe?.logo || universe?.thumbnail || orderedStoreProducts[0]?.image || "";
  const heroDescription = getLocalizedUniverseDescription(universe?.description);
  const canInlineEdit = isPreviewMode && canManageStore;
  const contentText = {
    topNotice:
      storefrontContent.topNotice ||
      lang({
        ko: "스마트스토어 상품을 한눈에 확인하세요.",
        en: "Browse Smart Store products.",
      }),
    heroEyebrow: storefrontContent.hero?.eyebrow || "Smart Store Collection",
    heroTitle: storefrontContent.hero?.title || universe?.name || "",
    heroBody: storefrontContent.hero?.body || heroDescription || storeKnowledge?.brand?.intro || "",
    primaryCta: storefrontContent.hero?.primaryCta || lang({ ko: "상품 둘러보기", en: "Shop Products" }),
    secondaryCta: storefrontContent.hero?.secondaryCta || lang({ ko: "스토어 정보", en: "Store Info" }),
    featuredTitle: storefrontContent.sections?.featuredTitle || "Best Sellers",
    featuredSubtitle:
      storefrontContent.sections?.featuredSubtitle ||
      lang({ ko: "먼저 볼 만한 대표 상품", en: "Featured products to start with" }),
    helpEyebrow: storefrontContent.sections?.helpEyebrow || "Store Help",
    helpTitle:
      storefrontContent.sections?.helpTitle ||
      lang({ ko: "구매 전 필요한 정보를 빠르게 확인하세요.", en: "Check key buying details quickly" }),
    catalogTitle: storefrontContent.sections?.catalogTitle || "New Arrivals",
    catalogSubtitle:
      storefrontContent.sections?.catalogSubtitle ||
      lang({ ko: "현재 공개된 스마트스토어 상품", en: "Published Smart Store products" }),
    infoShipping: storefrontContent.infoButtons?.shipping || lang({ ko: "배송", en: "Shipping" }),
    infoReturns: storefrontContent.infoButtons?.returns || lang({ ko: "반품/교환", en: "Returns" }),
    infoFaq: storefrontContent.infoButtons?.faq || "FAQ",
    infoContact: storefrontContent.infoButtons?.contact || lang({ ko: "고객센터", en: "Support" }),
    infoCare: storefrontContent.infoButtons?.care || lang({ ko: "품질/관리", en: "Care" }),
    footerTitle: storefrontContent.footer?.title || universe?.name || "",
    footerBody: storefrontContent.footer?.body || storeKnowledge?.brand?.headline || storeKnowledge?.brand?.intro || "",
    footerStoreGuideButton:
      storefrontContent.footer?.storeGuideButton || lang({ ko: "스토어 소개", en: "Store Guide" }),
    footerMoreStoresButton:
      storefrontContent.footer?.moreStoresButton || lang({ ko: "다른 스토어 보기", en: "More Stores" }),
  };

  const saveStorefrontContentMutation = useMutation({
    mutationFn: async (patch: Partial<IStorefrontContent>) => {
      const response = await fetchClient.patch<UnknownRecord>(`/universe/${universeId}/storefront-content`, {
        storefrontContent: patch,
      });
      return (response?.data?.data || {}) as IStorefrontContent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-universe-detail", universeId] });
    },
  });

  const editStorefrontText = async (
    labelText: { ko: string; en: string },
    value: string,
    buildPatch: (next: string) => Partial<IStorefrontContent>,
  ) => {
    if (!canInlineEdit || saveStorefrontContentMutation.isPending) return;
    const next = await dialog.prompt(
      { message: lang({ ko: `${labelText.ko} 수정`, en: `Edit ${labelText.en}` }) },
      value,
    );
    if (next == null || next === value) return;
    saveStorefrontContentMutation.mutate(buildPatch(next));
  };

  const renderEditButton = (
    labelText: { ko: string; en: string },
    value: string,
    buildPatch: (next: string) => Partial<IStorefrontContent>,
  ) => (
    <EditableButton
      active={canInlineEdit}
      label={labelText}
      value={value}
      onEdit={(label, current) => editStorefrontText(label, current, buildPatch)}
    />
  );

  useEffect(() => {
    if (!universeId || isManageMode) return;
    hydrateProducts(universeId, storefrontProducts);
  }, [hydrateProducts, isManageMode, storefrontProducts, universeId]);

  const trackStoreEvent = (eventName: string, extraParams: Record<string, string | number | boolean>) => {
    trackGaEvent(eventName, {
      universe_id: universeId,
      universe_name: universe?.name || "",
      query: deferredSearchQuery,
      product_total: orderedStoreProducts.length,
      ...extraParams,
    });
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    trackStoreEvent("store_search", {
      result_count: searchResults.length,
      keyword_count: categoryKeywords.length,
    });
  };

  const handleKeywordClick = (keyword: string) => {
    setSearchQuery(keyword);
    trackStoreEvent("store_keyword_click", { keyword });
  };

  const handleInspectProduct = (product: IProduct, area: "featured" | "catalog" | "recommendation") => {
    trackStoreEvent("store_product_view", {
      area,
      product_id: product.id,
      product_title: product.title,
      category: product.category || "",
    });
    setSelectedProduct(product);
  };

  const handleOpenProduct = (product: IProduct, area: "featured" | "catalog" | "recommendation" | "detail") => {
    if (!product.url) return;
    trackStoreEvent("store_product_external_click", {
      area,
      product_id: product.id,
      product_title: product.title,
      category: product.category || "",
    });
    window.open(product.url, "_blank", "noopener,noreferrer");
  };

  if (isUniverseLoading || isDetailLoading || isStorefrontStatusLoading || isProductsLoading) {
    return (
      <Preloader
        variant="spin"
        size="lg"
        container
        fullScreen
        text={lang({ ko: "스토어 홈을 불러오는 중입니다...", en: "Loading store home..." })}
      />
    );
  }

  if (!universe) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6">
        <div className="space-y-4 text-center">
          <p className="text-sm text-secondary-text">
            <Lang text={{ ko: "스토어 정보를 찾을 수 없습니다.", en: "Store information was not found." }} />
          </p>
          <Button onClick={() => router.push("/store")}>
            <Lang text={{ ko: "스토어 허브로 이동", en: "Go to Store Hub" }} />
          </Button>
        </div>
      </div>
    );
  }

  if (universe.type !== "commerce") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6">
        <div className="space-y-4 text-center">
          <p className="text-sm text-secondary-text">
            <Lang
              text={{
                ko: "이 유니버스는 스토어가 아니라 플레이 유니버스입니다.",
                en: "This universe is a play universe, not a store universe.",
              }}
            />
          </p>
          <Button onClick={() => router.push(getPlayPath(universeId, { basePath: "play", universe }))}>
            <Lang text={{ ko: "플레이로 이동", en: "Go to Play" }} />
          </Button>
        </div>
      </div>
    );
  }

  // userData가 아직 한 번도 로드되지 않은 초기 확인에만 전체 화면 로더를 사용한다.
  // 캐시 만료 후 백그라운드 재검증에서 StoreManagePanel이 언마운트되어 편집 상태가 초기화되는 것을 방지.
  if (isOperatorMode && isUserDataLoading && !userData) {
    return (
      <Preloader
        variant="spin"
        size="lg"
        container
        fullScreen
        text={lang({ ko: "운영 권한을 확인하는 중입니다...", en: "Checking operator access..." })}
      />
    );
  }

  if (isOperatorMode && !isUserDataLoading && !canManageStore) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6">
        <div className="max-w-[28rem] space-y-4 text-center">
          <p className="text-sm text-secondary-text">
            <Lang
              text={{
                ko: "이 유니버스의 운영 surface는 커머스 관리자만 사용할 수 있습니다.",
                en: "Only commerce operators can open this universe management surface.",
              }}
            />
          </p>
          <Button onClick={() => router.push(`/store/${universeId}`)}>
            <Lang text={{ ko: "스토어로 돌아가기", en: "Back to Storefront" }} />
          </Button>
        </div>
      </div>
    );
  }

  if (isManageMode && canManageStore) {
    return <StoreManagePanel universeId={universeId} universe={universe} />;
  }

  if (!isPreviewMode && !storefrontStatus?.isOpen) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-primary-text">
        <div className="max-w-[30rem] space-y-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-secondary-text">
            <Lang text={{ ko: "Store Closed", en: "Store Closed" }} />
          </p>
          <h1 className="text-2xl font-semibold">{universe.name}</h1>
          <p className="text-sm leading-6 text-secondary-text">
            <Lang
              text={{
                ko:
                  storefrontStatus?.walletAccess?.publicAllowed === false
                    ? storefrontStatus.walletAccess.message || "멤버십 부족으로 유니버스가 잠시 사라집니다."
                    : storefrontStatus?.credentialReady
                      ? "현재 이 스마트스토어는 공개 설정이 꺼져 있습니다. 운영자가 공개를 완료하면 접속할 수 있습니다."
                      : "현재 이 유니버스는 스마트스토어 자격증명이 연결되지 않아 공개 스토어 접속이 제한됩니다.",
                en: storefrontStatus?.credentialReady
                  ? "This Smart Store is not public yet. It will open after the operator enables storefront publishing."
                  : "This universe has no connected Smart Store credential yet, so storefront access is restricted.",
              }}
            />
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => router.push("/store")}>
              <Lang text={{ ko: "스토어 허브로 이동", en: "Go to Store Hub" }} />
            </Button>
            {canManageStore ? (
              <Button onClick={() => router.push(`/store/${universeId}/manage`)}>
                <Lang text={{ ko: "스마트스토어 운영", en: "Smart Store Ops" }} />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ServiceThemeScope service="shopping-mall">
      <main className="min-h-[100dvh] bg-[var(--storefront-bg)] text-[var(--storefront-ink)]">
      <div className="bg-[var(--storefront-dark)] px-4 py-2 text-center text-xxs font-light tracking-[0.12em] text-[#f8f6f2]">
        {contentText.topNotice}
        {renderEditButton({ ko: "상단 안내", en: "Top notice" }, contentText.topNotice, (next) => ({
          topNotice: next,
        }))}
      </div>

      <header className="sticky top-0 z-40 border-b border-[var(--storefront-line)] bg-[var(--storefront-bg)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <button
            type="button"
            className="min-w-0 truncate text-left text-xl font-semibold uppercase tracking-[0.18em] text-[var(--storefront-ink)] sm:text-2xl"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            {universe.name}
          </button>
          <div className="hidden items-center gap-8 text-xs font-medium uppercase tracking-[0.12em] text-[var(--storefront-muted)] md:flex">
            {categoryKeywords.slice(0, 5).map((keyword) => (
              <button
                key={keyword}
                type="button"
                className="transition-colors hover:text-[var(--storefront-accent)]"
                onClick={() => handleKeywordClick(keyword)}
              >
                {keyword}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <TopBarAppLauncher />
            <Button
              variant="blank"
              size="icon-sm"
              className="flex-center text-[var(--storefront-ink)]"
              aria-label={lang({ ko: "상품 검색으로 이동", en: "Go to product search" })}
              onClick={() =>
                document.getElementById("store-search")?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
            >
              <Search className="h-5 w-5" />
            </Button>
            <Button
              variant="blank"
              size="icon-sm"
              className="flex-center text-[var(--storefront-ink)]"
              aria-label={lang({ ko: "스토어 정보", en: "Store information" })}
              onClick={() => setStoreInfoOpen(true)}
            >
              <Info className="h-5 w-5" />
            </Button>
            {canManageStore ? (
              <Button
                variant="blank"
                size="icon-sm"
                className="flex-center text-[var(--storefront-ink)]"
                aria-label={lang({ ko: "스토어 관리자 페이지 이동", en: "Open store management" })}
                title={lang({ ko: "스토어 관리자 페이지 이동", en: "Open store management" })}
                onClick={() => router.push(`/store/${universeId}/manage`)}
              >
                <Sliders className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[90rem] gap-8 px-4 py-12 sm:px-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:py-20">
        <div className="flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--storefront-accent)]">
            {contentText.heroEyebrow}
            {renderEditButton({ ko: "히어로 카파", en: "Hero eyebrow" }, contentText.heroEyebrow, (next) => ({
              hero: { ...(storefrontContent.hero || {}), eyebrow: next },
            }))}
          </p>
          <h1 className="mt-5 max-w-[34rem] text-4xl font-light leading-tight text-[var(--storefront-ink)] sm:text-6xl">
            {contentText.heroTitle}
            {renderEditButton({ ko: "히어로 타이틀", en: "Hero title" }, contentText.heroTitle, (next) => ({
              hero: { ...(storefrontContent.hero || {}), title: next },
            }))}
          </h1>
          {contentText.heroBody ? (
            <RichTextRenderer
              content={contentText.heroBody}
              compact
              enableMermaid={false}
              className="mt-5 max-w-[32rem] text-sm leading-7 text-[var(--storefront-muted)] sm:text-base"
            />
          ) : null}
          {renderEditButton({ ko: "히어로 설명", en: "Hero body" }, contentText.heroBody, (next) => ({
            hero: { ...(storefrontContent.hero || {}), body: next },
          }))}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              rounded="full"
              size="lg"
              onClick={() => document.getElementById("store-catalog")?.scrollIntoView({ behavior: "smooth" })}
              className="bg-[var(--storefront-accent)]"
            >
              <ShoppingBag className="mr-2 h-4 w-4" />
              {contentText.primaryCta}
            </Button>
            <Button variant="outline" rounded="full" size="lg" onClick={() => setStoreInfoOpen(true)}>
              <Info className="mr-2 h-4 w-4" />
              {contentText.secondaryCta}
            </Button>
            {renderEditButton({ ko: "기본 CTA", en: "Primary CTA" }, contentText.primaryCta, (next) => ({
              hero: { ...(storefrontContent.hero || {}), primaryCta: next },
            }))}
            {renderEditButton({ ko: "보조 CTA", en: "Secondary CTA" }, contentText.secondaryCta, (next) => ({
              hero: { ...(storefrontContent.hero || {}), secondaryCta: next },
            }))}
          </div>
        </div>

        <div className="min-h-[22rem] overflow-hidden bg-[var(--storefront-soft)] md:min-h-[34rem]">
          {heroImage ? (
            <ImageBox
              src={heroImage}
              alt={universe.name}
              width="100%"
              height="100%"
              className="h-full w-full"
              objectFit="object-cover"
              sizes="(max-width: 768px) 92vw, 760px"
              allowUpscale
            />
          ) : (
            <div className="flex h-full min-h-[22rem] items-center justify-center text-sm text-[var(--storefront-muted)]">
              <Lang text={{ ko: "대표 이미지를 준비 중입니다.", en: "Hero image is coming soon." }} />
            </div>
          )}
        </div>
      </section>

      {categoryTiles.length > 0 ? (
        <section className="mx-auto w-full max-w-[78rem] px-4 pb-12 sm:px-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categoryTiles.slice(0, 5).map(({ category, product }) => (
              <button
                key={category}
                type="button"
                className="group text-center"
                onClick={() => handleKeywordClick(category)}
              >
                <div className="aspect-square overflow-hidden bg-[var(--storefront-soft)]">
                  {product?.image ? (
                    <ImageBox
                      src={product.image}
                      alt={category}
                      width="100%"
                      height="100%"
                      className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
                      objectFit="object-cover"
                      sizes="(max-width: 640px) 46vw, 220px"
                      allowUpscale
                    />
                  ) : null}
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--storefront-ink)]">
                  {category}
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mx-auto w-full max-w-[78rem] px-4 sm:px-8">
        <div className="h-px bg-[var(--storefront-line)]" />
      </div>

      <section className="mx-auto w-full max-w-[78rem] px-4 py-12 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-light tracking-[0.04em] text-[var(--storefront-ink)]">
              {contentText.featuredTitle}
              {renderEditButton(
                { ko: "대표 상품 섹션 타이틀", en: "Featured section title" },
                contentText.featuredTitle,
                (next) => ({
                  sections: { ...(storefrontContent.sections || {}), featuredTitle: next },
                }),
              )}
            </h2>
            <p className="mt-2 text-sm text-[var(--storefront-muted)]">
              {contentText.featuredSubtitle}
              {renderEditButton(
                { ko: "대표 상품 섹션 설명", en: "Featured section subtitle" },
                contentText.featuredSubtitle,
                (next) => ({
                  sections: { ...(storefrontContent.sections || {}), featuredSubtitle: next },
                }),
              )}
            </p>
          </div>
          <Button
            variant="blank"
            className="hidden items-center text-sm text-[var(--storefront-muted)] sm:inline-flex"
            onClick={() => document.getElementById("store-catalog")?.scrollIntoView({ behavior: "smooth" })}
          >
            <Lang text={{ ko: "전체보기", en: "View All" }} />
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {defaultFeaturedProducts.length > 0 ? (
            defaultFeaturedProducts.map((product) => (
              <StoreProductCard
                key={product.id}
                product={product}
                variant="featured"
                actionLabel={{ ko: "구매하기", en: "Buy Now" }}
                onInspect={(selected) => handleInspectProduct(selected, "featured")}
                onExternalOpen={(selected) => handleOpenProduct(selected, "featured")}
              />
            ))
          ) : (
            <div className="col-span-full border border-dashed border-[var(--storefront-line)] px-4 py-10 text-center text-sm text-[var(--storefront-muted)]">
              <Lang
                text={{
                  ko: "아직 대표 상품이 없습니다. 관리자 화면에서 상품을 등록하면 여기에 노출됩니다.",
                  en: "There are no featured products yet. Add products in the admin screen to populate this section.",
                }}
              />
            </div>
          )}
        </div>
      </section>

      <section className="bg-[var(--storefront-dark)] px-4 py-12 text-[#f8f6f2] sm:px-8">
        <div className="mx-auto grid w-full max-w-[78rem] gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--storefront-accent)]">
              {contentText.helpEyebrow}
              {renderEditButton({ ko: "도움말 카파", en: "Help eyebrow" }, contentText.helpEyebrow, (next) => ({
                sections: { ...(storefrontContent.sections || {}), helpEyebrow: next },
              }))}
            </p>
            <h2 className="mt-4 text-3xl font-light leading-tight sm:text-5xl">
              {contentText.helpTitle}
              {renderEditButton({ ko: "도움말 타이틀", en: "Help title" }, contentText.helpTitle, (next) => ({
                sections: { ...(storefrontContent.sections || {}), helpTitle: next },
              }))}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                panel: "shipping" as StoreInfoPanel,
                label: contentText.infoShipping,
                editLabel: { ko: "배송 버튼", en: "Shipping button" },
                patchKey: "shipping",
              },
              {
                panel: "returns" as StoreInfoPanel,
                label: contentText.infoReturns,
                editLabel: { ko: "반품/교환 버튼", en: "Returns button" },
                patchKey: "returns",
              },
              {
                panel: "faq" as StoreInfoPanel,
                label: contentText.infoFaq,
                editLabel: { ko: "FAQ 버튼", en: "FAQ button" },
                patchKey: "faq",
              },
              {
                panel: "contact" as StoreInfoPanel,
                label: contentText.infoContact,
                editLabel: { ko: "고객센터 버튼", en: "Support button" },
                patchKey: "contact",
              },
              {
                panel: "care" as StoreInfoPanel,
                label: contentText.infoCare,
                editLabel: { ko: "품질/관리 버튼", en: "Care button" },
                patchKey: "care",
              },
            ].map((item) => {
              return (
                <div
                  key={item.panel}
                  className="flex items-center border border-white/15 transition-colors hover:border-[var(--storefront-accent)]"
                >
                  <Button
                    variant="blank"
                    size="xl"
                    className="group relative flex items-center justify-center gap-2 px-3 py-3 text-sm w-full"
                    onClick={() => {
                      setStoreInfoPanel(item.panel);
                      setStoreInfoOpen(true);
                    }}
                  >
                    <span>{item.label}</span>
                  </Button>
                  <span className="pr-2">
                    {renderEditButton(item.editLabel, item.label, (next) => ({
                      infoButtons: { ...(storefrontContent.infoButtons || {}), [item.patchKey]: next },
                    }))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="store-catalog" className="mx-auto w-full max-w-[78rem] px-4 py-12 sm:px-8">
        <div
          id="store-search"
          className="flex flex-col gap-5 border-b border-[var(--storefront-line)] pb-6 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <h2 className="text-3xl font-light tracking-[0.04em] text-[var(--storefront-ink)]">
              {deferredSearchQuery ? "Search Results" : contentText.catalogTitle}
              {!deferredSearchQuery
                ? renderEditButton(
                    { ko: "상품 목록 타이틀", en: "Catalog title" },
                    contentText.catalogTitle,
                    (next) => ({
                      sections: { ...(storefrontContent.sections || {}), catalogTitle: next },
                    }),
                  )
                : null}
            </h2>
            <p className="mt-2 text-sm text-[var(--storefront-muted)]">
              {deferredSearchQuery ? (
                <Lang
                  text={{
                    ko: `"${deferredSearchQuery}" 기준 ${catalogProducts.length}개 상품`,
                    en: `${catalogProducts.length} products matched "${deferredSearchQuery}".`,
                  }}
                />
              ) : (
                <>
                  {contentText.catalogSubtitle}
                  {renderEditButton(
                    { ko: "상품 목록 설명", en: "Catalog subtitle" },
                    contentText.catalogSubtitle,
                    (next) => ({
                      sections: { ...(storefrontContent.sections || {}), catalogSubtitle: next },
                    }),
                  )}
                </>
              )}
            </p>
          </div>

          <form className="flex items-center w-full gap-2 lg:max-w-[34rem]" onSubmit={handleSearchSubmit}>
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={lang({
                ko: "상품명 또는 카테고리 검색",
                en: "Search product or category",
              })}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button type="submit">
                <Search className="icon-xs" />
                <Lang text={{ ko: "검색", en: "Search" }} className="text-xs" />
              </Button>
              {searchQuery ? (
                <Button variant="outline" onClick={() => setSearchQuery("")}>
                  <X className="mr-2 h-4 w-4" />
                  <Lang text={{ ko: "초기화", en: "Clear" }} />
                </Button>
              ) : null}
            </div>
          </form>
        </div>

        {categoryKeywords.length > 0 ? (
          <div className="mt-6 flex gap-0 overflow-x-auto border-b border-[var(--storefront-line)]">
            <Button
              variant="blank"
              className="border-b-2 border-[var(--storefront-accent)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--storefront-ink)]"
              onClick={() => setSearchQuery("")}
            >
              ALL
            </Button>
            {categoryKeywords.map((keyword) => (
              <Button
                key={keyword}
                variant="blank"
                className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--storefront-muted)] hover:text-[var(--storefront-ink)]"
                onClick={() => handleKeywordClick(keyword)}
              >
                {keyword}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4 xl:gap-x-5">
          {catalogProducts.length > 0 ? (
            catalogProducts.map((product) => (
              <StoreProductCard
                key={product.id}
                product={product}
                variant="catalog"
                actionLabel={{ ko: "구매하기", en: "Buy Now" }}
                onInspect={(selected) => handleInspectProduct(selected, "catalog")}
                onExternalOpen={(selected) => handleOpenProduct(selected, "catalog")}
              />
            ))
          ) : (
            <div className="col-span-full border border-dashed border-[var(--storefront-line)] px-4 py-10 text-center text-sm text-[var(--storefront-muted)]">
              <Lang
                text={{
                  ko: deferredSearchQuery
                    ? "검색 결과가 없습니다. 다른 키워드로 다시 찾아보세요."
                    : "아직 공개된 상품 projection이 없습니다. 스마트스토어 운영 화면에서 publish를 완료하면 자동으로 노출됩니다.",
                  en: deferredSearchQuery
                    ? "No products matched. Try another keyword."
                    : "There are no published storefront products yet. Publish from Smart Store operations to show products here.",
                }}
              />
            </div>
          )}
        </div>
      </section>

      <footer className="bg-[var(--storefront-dark)] px-4 py-10 text-[#f8f6f2] sm:px-8">
        <div className="mx-auto flex w-full max-w-[78rem] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xl font-semibold uppercase tracking-[0.18em]">
              {contentText.footerTitle}
              {renderEditButton({ ko: "푸터 타이틀", en: "Footer title" }, contentText.footerTitle, (next) => ({
                footer: { ...(storefrontContent.footer || {}), title: next },
              }))}
            </p>
            {contentText.footerBody ? (
              <RichTextRenderer
                content={contentText.footerBody}
                compact
                enableMermaid={false}
                className="mt-3 max-w-[28rem] text-sm leading-6 text-white/60"
              />
            ) : null}
            {renderEditButton({ ko: "푸터 설명", en: "Footer body" }, contentText.footerBody, (next) => ({
              footer: { ...(storefrontContent.footer || {}), body: next },
            }))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStoreInfoOpen(true)}>
              <Info className="mr-2 h-4 w-4" />
              {contentText.footerStoreGuideButton}
            </Button>
            {renderEditButton(
              { ko: "푸터 스토어 소개 버튼", en: "Footer store guide button" },
              contentText.footerStoreGuideButton,
              (next) => ({
                footer: { ...(storefrontContent.footer || {}), storeGuideButton: next },
              }),
            )}
            <Button variant="outline" onClick={() => router.push("/store")}>
              {contentText.footerMoreStoresButton}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {renderEditButton(
              { ko: "푸터 다른 스토어 버튼", en: "Footer more stores button" },
              contentText.footerMoreStoresButton,
              (next) => ({
                footer: { ...(storefrontContent.footer || {}), moreStoresButton: next },
              }),
            )}
          </div>
        </div>
      </footer>

      <StoreProductDetailSheet
        product={selectedProduct}
        open={Boolean(selectedProduct)}
        onOpenChange={(open) => {
          if (!open) setSelectedProduct(null);
        }}
        onExternalOpen={(product) => handleOpenProduct(product, "detail")}
      />
      <StoreInfoSheet
        knowledge={storeKnowledge}
        open={storeInfoOpen}
        panel={storeInfoPanel}
        onOpenChange={setStoreInfoOpen}
        onPanelChange={setStoreInfoPanel}
      />
      </main>
    </ServiceThemeScope>
  );
}

export default StoreUniversePage;
