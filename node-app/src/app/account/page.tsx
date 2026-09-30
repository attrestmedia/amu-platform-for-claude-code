import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountManagement } from "components/module/auth";
import { Lang } from "components/module/i18n";

export default function AccountPage() {
  return (
    <main className="min-h-[100dvh] bg-background px-4 py-8 text-primary-text sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-secondary-text hover:text-primary-text">
          <ArrowLeft className="h-4 w-4" />
          <Lang text={{ ko: "AMU로 돌아가기", en: "Back to AMU" }} />
        </Link>
        <header className="mb-7">
          <h1 className="text-2xl font-bold sm:text-3xl"><Lang text={{ ko: "계정 관리", en: "Account management" }} /></h1>
          <p className="mt-2 text-sm text-secondary-text"><Lang text={{ ko: "통합 계정의 연결 상태와 탈퇴 절차를 관리합니다.", en: "Manage integrated sign-ins and account withdrawal." }} /></p>
        </header>
        <AccountManagement />
      </div>
    </main>
  );
}
