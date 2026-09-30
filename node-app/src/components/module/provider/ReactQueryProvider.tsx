"use client";

import React, { useState } from "react";
import { useBodyClassManager } from "hooks/common/useBodyClassManager";
import { useFontManager } from "hooks/common/useFontManager";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { toErrorMessage } from "utils/common/typeUtils";

export default function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  useBodyClassManager(); // 페이지별 body 클래스 관리
  useFontManager(); // 유니버스별 폰트 관리

  // useState를 이용하여 클라이언트에서 QueryClient 인스턴스 생성
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          // 전역 무음 실패 방어: 개별 onError가 없는 mutation의 실패는 반드시 사용자에게 표면화한다.
          // 개별 onError가 있거나 meta.suppressGlobalError를 지정한 mutation은 자체 처리에 위임.
          onError: (error, _variables, _context, mutation) => {
            if (mutation.options.onError) return;
            if (mutation.meta?.suppressGlobalError) return;
            void dialog.alert(
              lang({
                ko: `요청 처리에 실패했습니다.\n${toErrorMessage(error, "잠시 후 다시 시도해 주세요.")}`,
                en: `The request failed.\n${toErrorMessage(error, "Please try again shortly.")}`,
              }),
            );
          },
        }),
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
