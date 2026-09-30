"use client";

import { useEffect, useRef } from "react";
import { signIn } from "next-auth/react";

type MagazineAuthProvider = "google" | "kakao" | "naver";

export default function MagazineLoginAutoStart({ provider, returnTo }: { provider: MagazineAuthProvider; returnTo: string }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const callbackUrl = `/auth/magazine-return?returnTo=${encodeURIComponent(returnTo)}`;
    const recoveryParams = new URLSearchParams({
      error: "MAGAZINE_LOGIN_RECOVERY",
      source: "magazine",
      provider,
      returnTo,
      next: callbackUrl,
    });
    const recoveryUrl = `/login?${recoveryParams.toString()}`;
    window.history.replaceState(window.history.state, "", recoveryUrl);

    const start = async () => {
      try {
        const response = await fetch("/api/auth/magazine-login-intent", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider, returnTo }),
        });
        if (!response.ok) throw new Error("intent unavailable");
        await signIn(provider, { callbackUrl });
        window.location.replace(recoveryUrl);
      } catch {
        window.location.replace(recoveryUrl);
      }
    };
    void start();
  }, [provider, returnTo]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-primary-text">
      <p className="flex items-center gap-3 text-center text-sm text-secondary-text" role="status" aria-live="polite">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        로그인을 준비하고 있습니다.
      </p>
    </main>
  );
}
