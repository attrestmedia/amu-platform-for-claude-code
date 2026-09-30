"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AuthSplitLayout } from "components/template/auth";
import { Signup } from "components/module/auth";
import { Lang } from "components/module/i18n";
import { resolveMagazineReturnTo } from "utils/auth/magazineReturnTo";

export default function SignupPage() {
  const searchParams = useSearchParams();
  const magazineReturnTo = useMemo(() => {
    if (searchParams.get("source") !== "magazine") return "";
    return resolveMagazineReturnTo(searchParams.get("returnTo"));
  }, [searchParams]);
  const safeNext = useMemo(() => {
    if (magazineReturnTo) return `/auth/magazine-return?returnTo=${encodeURIComponent(magazineReturnTo)}`;
    const value = searchParams.get("next") || "/";
    return value.startsWith("/") && !value.startsWith("//") && !value.includes("://") ? value : "/";
  }, [magazineReturnTo, searchParams]);

  return (
    <AuthSplitLayout
      titleId="signup-title"
      title={<Lang text={{ ko: "하나의 계정으로\nAMU와 매거진을 함께", en: "One account for\nAMU and Magazine" }} />}
      description={
        <Lang
          text={{
            ko: "가입한 계정은 app.allmyuniverse.com과 allmyuniverse.com에서 공통으로 사용합니다.",
            en: "Use the same account across app.allmyuniverse.com and allmyuniverse.com.",
          }}
        />
      }
      formLabel={
        <h2 className="text-center text-lg font-semibold">
          <Lang text={{ ko: "통합회원가입", en: "Integrated signup" }} />
        </h2>
      }
    >
      <Signup
        redirect={safeNext}
        intentSource={magazineReturnTo ? "magazine" : "platform"}
        preferredProvider={searchParams.get("provider") || undefined}
        returnTo={magazineReturnTo || safeNext}
        cleanupIntents={searchParams.get("cleanup") === "1"}
      />
    </AuthSplitLayout>
  );
}
