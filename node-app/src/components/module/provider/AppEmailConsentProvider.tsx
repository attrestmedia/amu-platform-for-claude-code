"use client";

import { useEffect, useState } from "react";
import { EmailConsentModal } from "components/module/auth";

const MSG = "이메일 동의가 필요합니다";

export default function AppEmailConsentProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // fetch 래핑 (앱에서 fetch를 쓰는 경우도 대비)
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...(args as Parameters<typeof originalFetch>));
      if (res.status === 403) {
        try {
          const clone = res.clone();
          const data = await clone.json().catch(() => null);
          if (data?.message && String(data.message).includes(MSG)) setOpen(true);
        } catch {
          // ignore
        }
      }
      return res;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <>
      <EmailConsentModal open={open} onOpenChange={setOpen} />
      {children}
    </>
  );
}
