"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { AlertTriangle, CheckCircle2, Link2, Shield, Trash2 } from "lucide-react";
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { useAuthStore } from "store/auth";
import AmuChatPreferencePanel from "./AmuChatPreferencePanel";

type AccountData = {
  uid: string;
  email: string;
  accountStatus: string;
  providers: string[];
  balances: { bonusCoins: number; membershipCoins: number; chargedCoins: number; subscriptionActive: boolean };
  canDeleteAutomatically: boolean;
  deletionBlockReason?: "ADMIN_ACCOUNT_DELETION_FORBIDDEN" | "REFUND_REVIEW_REQUIRED" | null;
  deletionRequest?: { status: string; reasonCode?: string | null } | null;
};

type NewsletterSubscriptionStatus =
  | "disabled"
  | "none"
  | "pending"
  | "subscribed"
  | "unsubscribed"
  | "bounced"
  | "complained";

type NewsletterData = {
  enabled: boolean;
  consentVersion: string;
  subscription: {
    status: NewsletterSubscriptionStatus;
    subscribed: boolean;
    pending: boolean;
  };
};

type LoadError = {
  message: string;
  requiresLogin: boolean;
};

export default function AccountManagement() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [newsletter, setNewsletter] = useState<NewsletterData | null>(null);
  const [newsletterLoading, setNewsletterLoading] = useState(true);
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [newsletterError, setNewsletterError] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const logout = useAuthStore((state) => state.logout);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/account", { credentials: "include", cache: "no-store" });
      const data = (await response.json().catch(() => null)) as { account?: AccountData; error?: string } | null;
      if (response.status === 401) {
        setLoadError({
          message: lang({ ko: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.", en: "Your session has expired. Please sign in again." }),
          requiresLogin: true,
        });
        return;
      }
      if (!response.ok || !data?.account) {
        setLoadError({
          message: data?.error || lang({ ko: "계정 정보를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.", en: "There was a problem loading your account. Please try again shortly." }),
          requiresLogin: false,
        });
        return;
      }
      setAccount(data.account);
    } catch {
      setLoadError({
        message: lang({ ko: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.", en: "Check your network connection and try again." }),
        requiresLogin: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNewsletter = useCallback(async () => {
    setNewsletterLoading(true);
    setNewsletterError("");
    try {
      const response = await fetch("/api/newsletter/subscription", { credentials: "include", cache: "no-store" });
      const data = (await response.json().catch(() => null)) as NewsletterData | null;
      if (!response.ok || !data || typeof data.enabled !== "boolean") {
        throw new Error("NEWSLETTER_SUBSCRIPTION_UNAVAILABLE");
      }
      setNewsletter(data);
      setNewsletterConsent(["pending", "subscribed"].includes(data.subscription.status));
    } catch {
      setNewsletterError(lang({ ko: "뉴스레터 수신 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", en: "We could not load newsletter settings. Please try again shortly." }));
    } finally {
      setNewsletterLoading(false);
    }
  }, []);

  const loadAccountAndNewsletter = useCallback(async () => {
    await Promise.all([loadAccount(), loadNewsletter()]);
  }, [loadAccount, loadNewsletter]);

  useEffect(() => {
    function loadInitialAccountData() {
      void loadAccountAndNewsletter();
    }
    loadInitialAccountData();
  }, [loadAccountAndNewsletter]);

  const submitDeletion = async () => {
    setSubmitting(true);
    setSubmitError("");
    const response = await fetch("/api/account", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation, acknowledged }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string; errorCode?: string } | null;
    if (!response.ok) {
      setSubmitError(data?.error || lang({ ko: "탈퇴 요청을 접수하지 못했습니다.", en: "Could not submit the withdrawal request." }));
      setSubmitting(false);
      return;
    }
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    await signOut({ redirect: false }).catch(() => undefined);
    logout();
    window.location.assign("/login?withdrawal=accepted");
  };

  const saveNewsletterSubscription = async () => {
    if (!newsletter || newsletterSubmitting) return;
    const shouldSubscribe = newsletterConsent;
    setNewsletterSubmitting(true);
    setNewsletterError("");
    setNewsletterMessage("");
    try {
      const response = await fetch("/api/newsletter/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: shouldSubscribe ? "subscribe" : "unsubscribe",
          consentVersion: newsletter.consentVersion,
        }),
      });
      const data = (await response.json().catch(() => null)) as { errorCode?: string } | null;
      if (!response.ok) {
        throw new Error(data?.errorCode || "NEWSLETTER_SUBSCRIPTION_UNAVAILABLE");
      }
      await loadNewsletter();
      setNewsletterMessage(
        shouldSubscribe
          ? lang({ ko: "확인 메일을 보냈습니다. 메일의 링크를 눌러야 수신이 시작됩니다.", en: "We sent a confirmation email. You must use its link before receiving newsletters." })
          : lang({ ko: "뉴스레터 수신거부가 즉시 반영되었습니다.", en: "Newsletter delivery has been stopped immediately." }),
      );
    } catch {
      setNewsletterError(lang({ ko: "뉴스레터 수신 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", en: "We could not save newsletter settings. Please try again shortly." }));
    } finally {
      setNewsletterSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4" role="alert">
        <p className="text-sm text-destructive">{loadError.message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {loadError.requiresLogin ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/login?next=/account"><Lang text={{ ko: "다시 로그인", en: "Sign in again" }} /></Link>
            </Button>
          ) : (
            <Button variant="outline" className="min-h-11" onClick={() => void loadAccount()} loading={loading}>
              <Lang text={{ ko: "다시 시도", en: "Try again" }} />
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (loading || !account) return <div className="flex min-h-48 items-center justify-center"><Preloader /></div>;

  const administratorDeletionBlocked = account.deletionBlockReason === "ADMIN_ACCOUNT_DELETION_FORBIDDEN";
  const reviewRequired = account.deletionBlockReason === "REFUND_REVIEW_REQUIRED";
  const pending = account.accountStatus === "deletion_pending";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="account-summary-title">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <h2 id="account-summary-title" className="font-semibold"><Lang text={{ ko: "통합 계정", en: "Integrated account" }} /></h2>
            <p className="mt-1 break-all text-sm text-secondary-text">{account.email}</p>
            <p className="mt-2 text-sm text-secondary-text">
              <Lang text={{ ko: "AMU 플랫폼과 AMU 매거진에서 공통으로 사용하는 계정입니다.", en: "This account is shared by the AMU platform and AMU Magazine." }} />
            </p>
          </div>
        </div>
      </section>

      <AmuChatPreferencePanel />

      {newsletterLoading ? (
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="newsletter-loading-title" aria-busy="true">
          <h2 id="newsletter-loading-title" className="font-semibold"><Lang text={{ ko: "뉴스레터 수신 설정", en: "Newsletter settings" }} /></h2>
          <div className="mt-4 flex min-h-12 items-center justify-center"><Preloader /></div>
        </section>
      ) : newsletter?.enabled ? (
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="newsletter-title">
          <h2 id="newsletter-title" className="font-semibold"><Lang text={{ ko: "뉴스레터 수신 설정", en: "Newsletter settings" }} /></h2>
          <div id="newsletter-copy" className="mt-3 space-y-2 text-sm leading-relaxed text-secondary-text">
            <p><Lang text={{ ko: "[선택] All My Universe 뉴스레터 및 광고성 정보 수신 동의", en: "[Optional] Consent to receive All My Universe newsletters and promotional information" }} /></p>
            <p><Lang text={{ ko: "All My Universe의 신규 콘텐츠·편집자 추천, 서비스 소식, 이벤트 및 프로모션 정보를 이메일로 받습니다. 정기 뉴스레터는 통상 주 1회, 특별호는 월 2회 이내로 발송합니다.", en: "Receive All My Universe new content, editor picks, service news, events, and promotions by email. Regular newsletters are usually sent once a week, and special issues no more than twice a month." }} /></p>
            <p><Lang text={{ ko: "구독을 위해 이메일 주소와 동의·확인·철회 이력을 처리하며, 뉴스레터 운영 개선을 위해 발송·열람·링크 클릭 여부를 처리할 수 있습니다. IP 주소 원문, User-Agent 원문 및 클릭 URL 전문은 장기 보관하지 않습니다.", en: "We process your email address and consent, confirmation, and withdrawal history to provide the subscription. We may process delivery, open, and link-click events to improve newsletter operations. Raw IP addresses, raw User-Agent values, and full click URLs are not retained long term." }} /></p>
            <p><Lang text={{ ko: "수신 동의는 2년마다 확인합니다.", en: "We reconfirm newsletter consent every two years." }} /></p>
            <p><Lang text={{ ko: "이 동의는 회원가입·서비스 이용에 필요한 동의와 별개입니다. 동의하지 않아도 회원가입과 공개 콘텐츠 이용에 불이익이 없으며, 메일의 수신거부 링크 또는 이 설정에서 언제든지 철회할 수 있습니다.", en: "This consent is separate from consent required for membership and service use. You will not be disadvantaged in joining or using public content if you decline, and you can withdraw at any time through the email unsubscribe link or these settings." }} /></p>
          </div>

          <div className="mt-4 space-y-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm" htmlFor="newsletter-consent">
              <Checkbox
                id="newsletter-consent"
                checked={newsletterConsent}
                disabled={newsletterSubmitting || ["bounced", "complained"].includes(newsletter.subscription.status)}
                onCheckedChange={(checked) => setNewsletterConsent(checked === true)}
              />
              <span><Lang text={{ ko: "뉴스레터 및 광고성 정보 수신에 동의합니다.", en: "I consent to receive newsletters and promotional information." }} /></span>
            </label>
            {newsletter.subscription.status === "pending" ? (
              <p id="newsletter-status" className="text-sm text-primary" role="status"><Lang text={{ ko: "확인 메일의 링크를 눌러야 수신이 시작됩니다.", en: "You must use the confirmation email link before receiving newsletters." }} /></p>
            ) : newsletter.subscription.status === "subscribed" ? (
              <p id="newsletter-status" className="text-sm text-primary" role="status"><Lang text={{ ko: "뉴스레터를 수신 중입니다. 설정을 저장하면 언제든지 철회할 수 있습니다.", en: "You are subscribed to the newsletter. You can withdraw at any time by saving this setting." }} /></p>
            ) : ["bounced", "complained"].includes(newsletter.subscription.status) ? (
              <p id="newsletter-status" className="text-sm text-secondary-text" role="status"><Lang text={{ ko: "이 주소는 반송 또는 수신자 불만으로 보호되어 다시 구독할 수 없습니다.", en: "This address is protected after a bounce or complaint and cannot be resubscribed." }} /></p>
            ) : null}
            {newsletterError ? <p className="text-sm text-destructive" role="alert">{newsletterError}</p> : null}
            {newsletterMessage ? <p className="text-sm text-primary" role="status">{newsletterMessage}</p> : null}
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void saveNewsletterSubscription()}
              disabled={newsletterSubmitting || ["bounced", "complained"].includes(newsletter.subscription.status)}
              loading={newsletterSubmitting}
            >
              <Lang text={{ ko: "수신 설정 저장", en: "Save newsletter settings" }} />
            </Button>
          </div>
        </section>
      ) : newsletterError ? (
        <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 sm:p-6" aria-labelledby="newsletter-error-title">
          <h2 id="newsletter-error-title" className="font-semibold"><Lang text={{ ko: "뉴스레터 수신 설정", en: "Newsletter settings" }} /></h2>
          <p className="mt-3 text-sm text-destructive" role="alert">{newsletterError}</p>
          <Button variant="outline" className="mt-4 min-h-11" onClick={() => void loadNewsletter()} loading={newsletterLoading}>
            <Lang text={{ ko: "다시 시도", en: "Try again" }} />
          </Button>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="linked-title">
        <h2 id="linked-title" className="flex items-center gap-2 font-semibold"><Link2 className="h-5 w-5" /><Lang text={{ ko: "연결된 로그인", en: "Linked sign-ins" }} /></h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-muted px-3 py-1.5 text-sm">Email / AMU</span>
          {account.providers.map((provider) => <span key={provider} className="rounded-full bg-muted px-3 py-1.5 text-sm capitalize">{provider}</span>)}
        </div>
        {account.providers.length > 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-secondary-text">
            <Lang text={{ ko: "탈퇴하면 AMU 내부 소셜 연결은 사용할 수 없게 됩니다. Google·Kakao·Naver 계정 자체나 제공자 측 연결 기록은 각 제공자 설정에서 별도로 관리해야 합니다.", en: "Withdrawal disables AMU's social links. Manage the provider account and provider-side authorization separately in Google, Kakao, or Naver settings." }} />
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-destructive/30 bg-surface p-5 sm:p-6" aria-labelledby="withdrawal-title">
        <h2 id="withdrawal-title" className="flex items-center gap-2 font-semibold text-destructive"><Trash2 className="h-5 w-5" /><Lang text={{ ko: "회원탈퇴", en: "Withdraw account" }} /></h2>
        <p className="mt-3 text-sm leading-relaxed text-secondary-text">
          <Lang text={{ ko: "탈퇴 접수 즉시 두 사이트의 계정 접근을 중지하고, 개인정보 삭제 절차를 시작합니다. 법령상 보존 의무가 있는 결제·거래 기록은 정해진 기간 동안 분리 보관됩니다.", en: "Access to both sites stops when withdrawal is accepted, and personal-data deletion begins. Legally required payment and transaction records remain segregated for the required period." }} />
        </p>

        <div className="mt-4 rounded-xl bg-muted/70 p-4 text-sm">
          <p><Lang text={{ ko: `무상 코인: ${account.balances.bonusCoins.toLocaleString()} / 멤버십 코인: ${account.balances.membershipCoins.toLocaleString()} / 충전 코인: ${account.balances.chargedCoins.toLocaleString()}`, en: `Bonus coins: ${account.balances.bonusCoins.toLocaleString()} / Membership coins: ${account.balances.membershipCoins.toLocaleString()} / Purchased coins: ${account.balances.chargedCoins.toLocaleString()}` }} /></p>
          <p className="mt-1"><Lang text={{ ko: `활성 구독: ${account.balances.subscriptionActive ? "있음" : "없음"}`, en: `Active subscription: ${account.balances.subscriptionActive ? "Yes" : "No"}` }} /></p>
        </div>

        {pending ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-primary" role="status"><CheckCircle2 className="h-5 w-5" /><Lang text={{ ko: "탈퇴 요청이 처리 중입니다.", en: "Your withdrawal request is being processed." }} /></p>
        ) : administratorDeletionBlocked ? (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm" role="status">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-amber-600" /><Lang text={{ ko: "관리자 계정은 자동 탈퇴할 수 없습니다.", en: "Administrator accounts cannot be withdrawn automatically." }} /></p>
            <p className="mt-2 text-secondary-text"><Lang text={{ ko: "서비스 운영 권한을 다른 계정으로 이전하고 보존 대상 데이터를 확인한 뒤 운영 절차로 처리해 주세요.", en: "Transfer service administration to another account and review retained data before using the administrative withdrawal process." }} /></p>
            <a className="mt-3 inline-flex min-h-11 items-center text-primary underline" href="mailto:attrestmedia@gmail.com">attrestmedia@gmail.com</a>
          </div>
        ) : reviewRequired ? (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm" role="status">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-amber-600" /><Lang text={{ ko: "환불·정산 검토가 먼저 필요합니다.", en: "Refund or billing review is required first." }} /></p>
            <p className="mt-2 text-secondary-text"><Lang text={{ ko: "잔여 자산 또는 구독을 확인한 뒤 고객지원으로 탈퇴를 요청해 주세요.", en: "Please contact support after checking your remaining balance or subscription." }} /></p>
            <a className="mt-3 inline-flex min-h-11 items-center text-primary underline" href="mailto:attrestmedia@gmail.com">attrestmedia@gmail.com</a>
          </div>
        ) : (
          <Button variant="destructive" className="mt-5 min-h-11" onClick={() => setDialogOpen(true)}>
            <Lang text={{ ko: "회원탈퇴 진행", en: "Continue withdrawal" }} />
          </Button>
        )}
      </section>

      <p className="text-center text-xs text-secondary-text">
        <Link className="underline" href="https://allmyuniverse.com/privacy-policy/" target="_blank"><Lang text={{ ko: "개인정보처리방침", en: "Privacy Policy" }} /></Link>{" · "}
        <Link className="underline" href="https://allmyuniverse.com/terms-conditions/" target="_blank"><Lang text={{ ko: "이용약관", en: "Terms" }} /></Link>
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent disableOutsideClick className="max-w-md">
          <DialogHeader>
            <DialogTitle><Lang text={{ ko: "회원탈퇴 최종 확인", en: "Confirm withdrawal" }} /></DialogTitle>
            <DialogDescription><Lang text={{ ko: "이 작업은 두 사이트의 통합 계정 접근을 중지합니다.", en: "This stops integrated-account access to both sites." }} /></DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm font-medium" htmlFor="withdrawal-confirmation"><Lang text={{ ko: '확인을 위해 “회원탈퇴”를 입력하세요.', en: 'Type “회원탈퇴” to confirm.' }} /></label>
            <Input id="withdrawal-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <Checkbox checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked === true)} />
              <Lang text={{ ko: "서비스 접근 중지와 데이터 처리 안내를 확인했습니다.", en: "I understand the access and data-processing notice." }} />
            </label>
            {submitError ? <p className="text-sm text-destructive" role="alert">{submitError}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}><Lang text={{ ko: "취소", en: "Cancel" }} /></Button>
            <Button variant="destructive" onClick={() => void submitDeletion()} disabled={confirmation !== "회원탈퇴" || !acknowledged || submitting} loading={submitting}><Lang text={{ ko: "탈퇴 접수", en: "Submit withdrawal" }} /></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
