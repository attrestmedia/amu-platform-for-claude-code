import type { Metadata } from "next";
import { getMetaDataDeletionReceiptStatus } from "libs/database/secure/metaDataDeletionReceipts";

/**
 * @docHint
 * @purpose Meta 데이터 삭제 요청의 비식별 처리 상태 공개
 * @process confirmation code 조회 → 완료 또는 찾을 수 없음만 표시
 * @domain marketing-auth
 * @scope public-page
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Data deletion status | All My Universe",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ code?: string | string[] }>;
};

export default async function MarketingDataDeletionStatusPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const receipt = await getMetaDataDeletionReceiptStatus(code);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-blue-600">All My Universe</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">데이터 삭제 처리 상태</h1>
        {receipt ? (
          <div className="mt-6 space-y-3 text-slate-700">
            <p className="font-semibold text-emerald-700">삭제 요청 처리가 완료되었습니다.</p>
            <p>Threads 연결 정보와 해당 연결에서 수집한 마케팅 데이터가 삭제되었습니다.</p>
            <p className="text-sm text-slate-500">완료 시각: {receipt.completedAt || "확인할 수 없음"}</p>
            <p className="text-sm text-slate-500">Your Threads data deletion request has been completed.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3 text-slate-700">
            <p className="font-semibold text-amber-700">유효한 삭제 처리 내역을 찾을 수 없습니다.</p>
            <p>확인 코드가 정확한지 확인하거나 고객지원에 문의해 주세요.</p>
            <p className="text-sm text-slate-500">No valid deletion receipt was found for this confirmation code.</p>
          </div>
        )}
      </section>
    </main>
  );
}
