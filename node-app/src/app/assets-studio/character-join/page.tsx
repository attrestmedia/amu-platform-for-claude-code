import { PersonalCharacterJoinEditor } from "components/module/game/character-studio/PersonalCharacterJoinEditor";

type PageProps = {
  searchParams: Promise<{ characterId?: string; universeId?: string }>;
};

export default async function PersonalCharacterJoinPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <PersonalCharacterJoinEditor characterId={String(params.characterId || "")} universeId={String(params.universeId || "")} />;
}
