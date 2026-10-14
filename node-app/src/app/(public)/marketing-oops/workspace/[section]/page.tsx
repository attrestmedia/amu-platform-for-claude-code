import { notFound } from "next/navigation";
import { MARKETING_OPERATION_TABS } from "consts/marketing/public";

export default async function MarketingWorkspaceSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!(MARKETING_OPERATION_TABS as readonly string[]).includes(section)) notFound();

  return null;
}
