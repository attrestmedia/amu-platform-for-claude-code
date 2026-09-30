"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@amu-labs/ui";

export default function NotFound() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  // 카운트다운 처리
  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  // 카운트다운이 0이 되면 리디렉션
  useEffect(() => {
    if (countdown === 0) {
      router.push("/");
    }
  }, [countdown, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        {/* 404 아이콘 */}
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-gray-300">404</h1>
        </div>

        {/* 메시지 */}
        <h2 className="mb-4 text-2xl font-semibold text-gray-800">페이지를 찾을 수 없습니다</h2>
        <p className="mb-8 text-gray-600">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>

        {/* 카운트다운 */}
        {countdown > 0 && (
          <p className="mb-6 text-sm text-gray-500">
            <span className="font-semibold text-blue-600">{countdown}초</span> 후 홈으로 이동합니다
          </p>
        )}

        {/* 즉시 이동 버튼 */}
        <Button
          onClick={() => router.push("/")}
          className="rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
        >
          지금 홈으로 이동
        </Button>
      </div>
    </div>
  );
}
