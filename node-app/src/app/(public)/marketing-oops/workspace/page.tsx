import { redirect } from "next/navigation";
import { MARKETING_OPERATION_TABS } from "consts/marketing/public";

export default async function MarketingWorkspaceIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // 2026-10 이전 딥링크(?tab=)를 섹션 route 로 옮긴다 — 외부·내부 링크 하위 호환
  const rawTab = typeof query.tab === "string" ? query.tab : "";
  const section = (MARKETING_OPERATION_TABS as readonly string[]).includes(rawTab) ? rawTab : "queue";
  const rest = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (key === "tab" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) rest.append(key, item);
  }

  const qs = rest.toString();
  redirect(`/marketing-oops/workspace/${section}${qs ? `?${qs}` : ""}`);
}
