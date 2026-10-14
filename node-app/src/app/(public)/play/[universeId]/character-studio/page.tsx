import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ universeId: string }>;
  searchParams: Promise<{ method?: string }>;
};

export default async function UserCharacterStudioPage({ params, searchParams }: PageProps) {
  const [{ universeId }, { method }] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams({ universeId });
  if (method === "new" || method === "upload") query.set("method", method);
  redirect(`/assets-studio/character?${query.toString()}`);
}
