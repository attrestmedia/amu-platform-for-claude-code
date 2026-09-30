"use client";

import { Input } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";

type Props = {
  billingOwnerEmail: string;
  adminsDraft: string;
  errors: Record<string, string>;
  onBillingOwnerChange: (value: string) => void;
  onAdminsDraftChange: (value: string) => void;
  onAdminsCommit: (value: string) => void;
};

export function UniverseCommerceAccessFields({
  billingOwnerEmail,
  adminsDraft,
  errors,
  onBillingOwnerChange,
  onAdminsDraftChange,
  onAdminsCommit,
}: Props) {
  return (
    <>
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium" htmlFor="billingOwnerEmail">
          <Lang text={{ ko: "결제·환불 책임자 (billingOwner)", en: "Billing & refund owner (billingOwner)" }} />
        </label>
        <Input
          id="billingOwnerEmail"
          type="email"
          value={billingOwnerEmail}
          onChange={(event) => onBillingOwnerChange(event.target.value)}
          placeholder={lang({ ko: "billing@example.com", en: "billing@example.com" })}
          className={errors.billingOwnerEmail ? "border-danger" : ""}
        />
        {errors.billingOwnerEmail && <p className="mt-1 text-sm text-danger">{errors.billingOwnerEmail}</p>}
        <p className="mt-1 text-sm text-secondary-text">
          <Lang text={{ ko: "이 계정만 멤버십 결제, Charged 충전 및 환불을 요청할 수 있습니다.", en: "Only this account can pay for membership, top up Charged coins, or request refunds." }} />
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="commerceAdmins">
          <Lang text={{ ko: "추가 운영 관리자 (commerceAdmins)", en: "Additional operators (commerceAdmins)" }} />
        </label>
        <Input
          id="commerceAdmins"
          value={adminsDraft}
          onChange={(event) => onAdminsDraftChange(event.target.value)}
          onBlur={(event) => onAdminsCommit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdminsCommit(adminsDraft);
            }
          }}
          placeholder={lang({ ko: "operator1@example.com, operator2@example.com (쉼표로 구분)", en: "operator1@example.com, operator2@example.com (comma-separated)" })}
          className={errors.commerceAdmins ? "border-danger" : ""}
        />
        {errors.commerceAdmins && <p className="mt-1 text-sm text-danger">{errors.commerceAdmins}</p>}
        <p className="mt-1 text-sm text-secondary-text">
          <Lang text={{ ko: "조회·설정·서비스 운영은 가능하지만 결제·환불 권한은 없습니다. 쉼표로 구분해 추가하세요.", en: "Operators can view, configure, and run services, but cannot make payments or request refunds. Separate emails with commas." }} />
        </p>
      </div>
    </>
  );
}
