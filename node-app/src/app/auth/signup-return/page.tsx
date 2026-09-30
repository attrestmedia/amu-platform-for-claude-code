"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

export default function SignupReturnPage() {
  const searchParams = useSearchParams();
  const next = useMemo(() => {
    const value = searchParams.get("next") || "/";
    if (
      !value.startsWith("/") ||
      value.startsWith("//") ||
      value.includes("://") ||
      /[\\\u0000-\u001F\u007F]/.test(value)
    ) return "/";
    return value;
  }, [searchParams]);

  useEffect(() => {
    void fetch("/api/auth/signup-intent", { method: "DELETE", credentials: "include" })
      .catch(() => undefined)
      .finally(() => window.location.replace(next));
  }, [next]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-primary-text">
      <p className="flex items-center gap-3 text-sm text-secondary-text" role="status" aria-live="polite">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        회원가입을 마무리하고 있습니다.
      </p>
    </main>
  );
}
