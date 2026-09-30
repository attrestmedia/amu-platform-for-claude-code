import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ method?: string }>;
};

export default async function UserCharacterStudioPage({ searchParams }: PageProps) {
  const { method } = await searchParams;
  const query = method === "new" || method === "upload" ? `?method=${method}` : "";
  redirect(`/assets-studio/character${query}`);
}
