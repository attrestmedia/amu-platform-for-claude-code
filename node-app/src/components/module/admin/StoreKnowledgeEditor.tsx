"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Input, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { IStoreExternalLink, IStoreKnowledge } from "types/game";

type ListFieldKey =
  | "brand.productCategories"
  | "brand.features"
  | "support.consultationTopics"
  | "shipping.notes"
  | "returns.freeCases"
  | "returns.customerPaysCases"
  | "returns.unavailableCases"
  | "returns.processSteps"
  | "warranty.exclusions"
  | "care.instructions";

const emptyKnowledge: IStoreKnowledge = {
  brand: {},
  support: { contact: {} },
  shipping: {},
  returns: {},
  warranty: {},
  care: {},
  faq: [],
};

function compactList(items?: string[]) {
  return (items || []).map((item) => String(item || "").trim()).filter(Boolean);
}

function patchList(value: IStoreKnowledge, key: ListFieldKey, items: string[]): Partial<IStoreKnowledge> {
  const next = compactList(items);
  if (key === "brand.productCategories") return { brand: { ...(value.brand || {}), productCategories: next } };
  if (key === "brand.features") return { brand: { ...(value.brand || {}), features: next } };
  if (key === "support.consultationTopics") {
    return { support: { ...(value.support || {}), consultationTopics: next } };
  }
  if (key === "shipping.notes") return { shipping: { ...(value.shipping || {}), notes: next } };
  if (key === "returns.freeCases") return { returns: { ...(value.returns || {}), freeCases: next } };
  if (key === "returns.customerPaysCases") return { returns: { ...(value.returns || {}), customerPaysCases: next } };
  if (key === "returns.unavailableCases") return { returns: { ...(value.returns || {}), unavailableCases: next } };
  if (key === "returns.processSteps") return { returns: { ...(value.returns || {}), processSteps: next } };
  if (key === "warranty.exclusions") return { warranty: { ...(value.warranty || {}), exclusions: next } };
  return { care: { ...(value.care || {}), instructions: next } };
}

function StringListEditor({
  label,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  items?: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  const list = items?.length ? items : [""];

  const update = (index: number, text: string) => {
    const next = [...list];
    next[index] = text;
    onChange(next);
  };

  const remove = (index: number) => onChange(list.filter((_, itemIndex) => itemIndex !== index));

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-primary-text">{label}</label>
      <div className="space-y-2">
        {list.map((item, index) => (
          <div key={`${label}-${index}`} className="flex gap-2">
            <Input value={item} onChange={(event) => update(index, event.target.value)} placeholder={placeholder} />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => remove(index)}
              aria-label={lang({ ko: "항목 삭제", en: "Remove item" })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={() => onChange([...list, ""])}>
        <Plus className="mr-2 h-4 w-4" />
        <Lang text={{ ko: "항목 추가", en: "Add Item" }} />
      </Button>
    </div>
  );
}

export function StoreKnowledgeEditor({
  value,
  onChange,
}: {
  value?: IStoreKnowledge;
  onChange: (next: IStoreKnowledge) => void;
}) {
  const v: IStoreKnowledge = {
    ...emptyKnowledge,
    ...(value || {}),
    brand: { ...(value?.brand || {}) },
    support: { ...(value?.support || {}), contact: { ...(value?.support?.contact || {}) } },
    shipping: { ...(value?.shipping || {}) },
    returns: { ...(value?.returns || {}) },
    warranty: { ...(value?.warranty || {}) },
    care: { ...(value?.care || {}) },
    faq: value?.faq || [],
  };

  const set = (patch: Partial<IStoreKnowledge>) =>
    onChange({
      ...v,
      ...patch,
      updatedAt: new Date().toISOString(),
    });

  const setList = (key: ListFieldKey, items: string[]) => set(patchList(v, key, items));

  const setExternalStores = (items: IStoreExternalLink[]) =>
    set({
      brand: {
        ...(v.brand || {}),
        externalStores: items
          .map((item) => ({ label: item.label.trim(), url: item.url.trim() }))
          .filter((item) => item.label || item.url),
      },
    });

  const externalStores = v.brand?.externalStores?.length ? v.brand.externalStores : [{ label: "", url: "" }];
  const faqList = v.faq?.length ? v.faq : [{ q: "", a: "" }];

  return (
    <div className="space-y-5 rounded-xl border border-border bg-surface p-4 text-primary-text">
      <div>
        <h3 className="text-base font-semibold text-primary-text">
          <Lang text={{ ko: "스토어 기본 지식", en: "Store Knowledge" }} />
        </h3>
        <p className="mt-1 text-sm leading-6 text-secondary-text">
          <Lang
            text={{
              ko: "공개 스토어와 상담 응답에 바로 쓰일 수 있도록 정보를 항목별로 입력합니다.",
              en: "Enter structured store information for storefront sections and support responses.",
            }}
          />
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
        <h4 className="text-sm font-semibold text-primary-text">
          <Lang text={{ ko: "브랜드", en: "Brand" }} />
        </h4>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-primary-text">
              <Lang text={{ ko: "브랜드 한 줄 소개", en: "Brand Headline" }} />
            </label>
            <Input
              value={v.brand?.headline || ""}
              onChange={(event) => set({ brand: { ...(v.brand || {}), headline: event.target.value } })}
              placeholder={lang({ ko: "예: 일상 속 빈티지 감성, SSINSTER", en: "Example: Everyday vintage, SSINSTER" })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-text">
              <Lang text={{ ko: "브랜드 철학", en: "Brand Philosophy" }} />
            </label>
            <Input
              value={v.brand?.philosophy || ""}
              onChange={(event) => set({ brand: { ...(v.brand || {}), philosophy: event.target.value } })}
              placeholder={lang({ ko: "예: 당신의 일상에 특별함을 더합니다.", en: "Example: Add character to everyday style." })}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "브랜드 소개", en: "Brand Intro" }} />
          </label>
          <Textarea
            value={v.brand?.intro || ""}
            onChange={(event) => set({ brand: { ...(v.brand || {}), intro: event.target.value } })}
            className="min-h-24"
            placeholder={lang({ ko: "고객에게 보여줄 상점 소개를 입력하세요.", en: "Enter the store introduction shown to visitors." })}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <StringListEditor
            label={lang({ ko: "주요 취급 상품", en: "Product Categories" })}
            items={v.brand?.productCategories}
            placeholder={lang({ ko: "예: 크롬 셔츠 & 빈티지 셔츠", en: "Example: Vintage shirts" })}
            onChange={(items) => setList("brand.productCategories", items)}
          />
          <StringListEditor
            label={lang({ ko: "스토어 특징", en: "Store Features" })}
            items={v.brand?.features}
            placeholder={lang({ ko: "예: 합리적인 가격대의 감각적인 디자인", en: "Example: Sensible design at accessible prices" })}
            onChange={(items) => setList("brand.features", items)}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "운영 중인 외부 스토어", en: "External Stores" }} />
          </label>
          {externalStores.map((item, index) => (
            <div key={`external-store-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
              <Input
                value={item.label}
                onChange={(event) => {
                  const next = [...externalStores];
                  next[index] = { ...next[index], label: event.target.value };
                  setExternalStores(next);
                }}
                placeholder={lang({ ko: "네이버 스마트스토어", en: "Naver Smart Store" })}
              />
              <Input
                value={item.url}
                onChange={(event) => {
                  const next = [...externalStores];
                  next[index] = { ...next[index], url: event.target.value };
                  setExternalStores(next);
                }}
                placeholder="https://smartstore.naver.com/..."
              />
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setExternalStores(externalStores.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={lang({ ko: "외부 스토어 삭제", en: "Remove external store" })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setExternalStores([...externalStores, { label: "", url: "" }])}>
            <Plus className="mr-2 h-4 w-4" />
            <Lang text={{ ko: "스토어 추가", en: "Add Store" }} />
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
          <h4 className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "상담 및 문의", en: "Support" }} />
          </h4>
          <Input
            value={v.support?.hours || ""}
            onChange={(event) => set({ support: { ...(v.support || {}), hours: event.target.value } })}
            placeholder={lang({ ko: "운영시간", en: "Support hours" })}
          />
          <Input
            value={v.support?.outsideHoursMessage || ""}
            onChange={(event) => set({ support: { ...(v.support || {}), outsideHoursMessage: event.target.value } })}
            placeholder={lang({ ko: "운영시간 외 안내", en: "Outside-hours message" })}
          />
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              value={v.support?.contact?.csPhone || ""}
              onChange={(event) =>
                set({ support: { ...(v.support || {}), contact: { ...(v.support?.contact || {}), csPhone: event.target.value } } })
              }
              placeholder={lang({ ko: "전화", en: "Phone" })}
            />
            <Input
              value={v.support?.contact?.csEmail || ""}
              onChange={(event) =>
                set({ support: { ...(v.support || {}), contact: { ...(v.support?.contact || {}), csEmail: event.target.value } } })
              }
              placeholder={lang({ ko: "이메일", en: "Email" })}
            />
            <Input
              value={v.support?.contact?.kakao || ""}
              onChange={(event) =>
                set({ support: { ...(v.support || {}), contact: { ...(v.support?.contact || {}), kakao: event.target.value } } })
              }
              placeholder={lang({ ko: "카카오", en: "Kakao" })}
            />
          </div>
          <StringListEditor
            label={lang({ ko: "상담 내용", en: "Support Topics" })}
            items={v.support?.consultationTopics}
            placeholder={lang({ ko: "예: 상품 문의", en: "Example: Product questions" })}
            onChange={(items) => setList("support.consultationTopics", items)}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
          <h4 className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "배송 정책", en: "Shipping" }} />
          </h4>
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={v.shipping?.courier || ""} onChange={(event) => set({ shipping: { ...(v.shipping || {}), courier: event.target.value } })} placeholder={lang({ ko: "택배사", en: "Courier" })} />
            <Input value={v.shipping?.baseFee || ""} onChange={(event) => set({ shipping: { ...(v.shipping || {}), baseFee: event.target.value } })} placeholder={lang({ ko: "기본 배송비", en: "Base fee" })} />
            <Input value={v.shipping?.freeShippingThreshold || ""} onChange={(event) => set({ shipping: { ...(v.shipping || {}), freeShippingThreshold: event.target.value } })} placeholder={lang({ ko: "무료 배송 기준", en: "Free shipping threshold" })} />
            <Input value={v.shipping?.averageLeadTime || ""} onChange={(event) => set({ shipping: { ...(v.shipping || {}), averageLeadTime: event.target.value } })} placeholder={lang({ ko: "평균 배송 기간", en: "Average lead time" })} />
          </div>
          <Input value={v.shipping?.cutoffTime || ""} onChange={(event) => set({ shipping: { ...(v.shipping || {}), cutoffTime: event.target.value } })} placeholder={lang({ ko: "주문 마감/발송 기준", en: "Cutoff and dispatch rule" })} />
          <Input value={v.shipping?.trackingGuide || ""} onChange={(event) => set({ shipping: { ...(v.shipping || {}), trackingGuide: event.target.value } })} placeholder={lang({ ko: "배송 조회 안내", en: "Tracking guide" })} />
          <StringListEditor
            label={lang({ ko: "배송 참고사항", en: "Shipping Notes" })}
            items={v.shipping?.notes}
            placeholder={lang({ ko: "예: 주말/공휴일 주문 건은 다음 영업일 발송", en: "Example: Weekend orders ship next business day" })}
            onChange={(items) => setList("shipping.notes", items)}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
          <h4 className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "반품/교환", en: "Returns" }} />
          </h4>
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={v.returns?.windowDays || ""} onChange={(event) => set({ returns: { ...(v.returns || {}), windowDays: event.target.value } })} placeholder={lang({ ko: "가능 기간", en: "Return window" })} />
            <Input value={v.returns?.customerFee || ""} onChange={(event) => set({ returns: { ...(v.returns || {}), customerFee: event.target.value } })} placeholder={lang({ ko: "고객 부담 배송비", en: "Customer-paid fee" })} />
          </div>
          <Input value={v.returns?.refundGuide || ""} onChange={(event) => set({ returns: { ...(v.returns || {}), refundGuide: event.target.value } })} placeholder={lang({ ko: "환불 안내", en: "Refund guide" })} />
          <StringListEditor label={lang({ ko: "무료 처리 조건", en: "Free Return Cases" })} items={v.returns?.freeCases} placeholder={lang({ ko: "예: 상품 불량 또는 하자", en: "Example: Product defect" })} onChange={(items) => setList("returns.freeCases", items)} />
          <StringListEditor label={lang({ ko: "고객 부담 조건", en: "Customer-paid Cases" })} items={v.returns?.customerPaysCases} placeholder={lang({ ko: "예: 단순 변심", en: "Example: Change of mind" })} onChange={(items) => setList("returns.customerPaysCases", items)} />
          <StringListEditor label={lang({ ko: "불가 안내", en: "Unavailable Cases" })} items={v.returns?.unavailableCases} placeholder={lang({ ko: "예: 택 제거 후", en: "Example: Tag removed" })} onChange={(items) => setList("returns.unavailableCases", items)} />
          <StringListEditor label={lang({ ko: "처리 절차", en: "Return Steps" })} items={v.returns?.processSteps} placeholder={lang({ ko: "예: 고객센터로 사전 연락", en: "Example: Contact support first" })} onChange={(items) => setList("returns.processSteps", items)} />
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
          <h4 className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "품질 보증 및 관리", en: "Warranty and Care" }} />
          </h4>
          <Input value={v.warranty?.summary || ""} onChange={(event) => set({ warranty: { ...(v.warranty || {}), summary: event.target.value } })} placeholder={lang({ ko: "품질 보증 요약", en: "Warranty summary" })} />
          <Input value={v.warranty?.period || ""} onChange={(event) => set({ warranty: { ...(v.warranty || {}), period: event.target.value } })} placeholder={lang({ ko: "보증 기간", en: "Warranty period" })} />
          <StringListEditor label={lang({ ko: "보증 제외", en: "Warranty Exclusions" })} items={v.warranty?.exclusions} placeholder={lang({ ko: "예: 세탁 방법 미준수", en: "Example: Care-label violation" })} onChange={(items) => setList("warranty.exclusions", items)} />
          <StringListEditor label={lang({ ko: "세탁/관리 주의사항", en: "Care Instructions" })} items={v.care?.instructions} placeholder={lang({ ko: "예: 손세탁 또는 드라이클리닝 권장", en: "Example: Hand wash or dry clean" })} onChange={(items) => setList("care.instructions", items)} />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "FAQ", en: "FAQ" }} />
          </h4>
          <Button variant="outline" size="sm" onClick={() => set({ faq: [...faqList, { q: "", a: "" }] })}>
            <Plus className="mr-2 h-4 w-4" />
            <Lang text={{ ko: "FAQ 추가", en: "Add FAQ" }} />
          </Button>
        </div>
        <div className="space-y-3">
          {faqList.map((item, index) => (
            <div key={`faq-${index}`} className="rounded-xl border border-border bg-surface/80 p-3">
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...faqList];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    set({ faq: next });
                  }}
                  aria-label={lang({ ko: "FAQ 위로 이동", en: "Move FAQ up" })}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={index === faqList.length - 1}
                  onClick={() => {
                    const next = [...faqList];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    set({ faq: next });
                  }}
                  aria-label={lang({ ko: "FAQ 아래로 이동", en: "Move FAQ down" })}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => set({ faq: faqList.filter((_, itemIndex) => itemIndex !== index) })}
                  aria-label={lang({ ko: "FAQ 삭제", en: "Remove FAQ" })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input
                  value={item.q}
                  onChange={(event) => {
                    const next = [...faqList];
                    next[index] = { ...next[index], q: event.target.value };
                    set({ faq: next });
                  }}
                  placeholder={lang({ ko: "질문", en: "Question" })}
                />
                <Textarea
                  value={item.a}
                  onChange={(event) => {
                    const next = [...faqList];
                    next[index] = { ...next[index], a: event.target.value };
                    set({ faq: next });
                  }}
                  className="min-h-20"
                  placeholder={lang({ ko: "답변", en: "Answer" })}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
