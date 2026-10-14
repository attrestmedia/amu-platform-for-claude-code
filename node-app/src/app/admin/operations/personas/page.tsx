"use client";

import { Preloader, Tabs, TabsContent, TabsList, TabsTrigger } from "@amu-labs/ui";
import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { PersonaManager } from "components/module/admin/persona";
import { UserPersonaManager } from "components/module/persona/UserPersonaManager";
import { Lang } from "components/module/i18n";
import { useManageableUniverses } from "hooks/admin";

function PersonaOperationContent() {
  const { editableUniverses, isLoading, error } = useManageableUniverses(true);

  return (
    <Tabs defaultValue="universe" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="universe">
          <Lang text={{ ko: "공용 유니버스", en: "Universe Personas" }} />
        </TabsTrigger>
        <TabsTrigger value="tutors">
          <Lang text={{ ko: "내 Tutors", en: "My Tutors" }} />
        </TabsTrigger>
      </TabsList>
      <TabsContent value="universe" className="mt-2">
        {isLoading ? (
          <Preloader variant="spin" size="lg" container />
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            <Lang text={{ ko: "편집 가능한 유니버스 목록을 불러오지 못했습니다.", en: "Unable to load editable universes." }} />
          </p>
        ) : editableUniverses.length === 0 ? (
          <p role="status" className="text-sm text-secondary-text">
            <Lang text={{ ko: "편집 가능한 유니버스가 없습니다.", en: "No editable universes are available." }} />
          </p>
        ) : (
          <PersonaManager availableUniverses={editableUniverses} />
        )}
      </TabsContent>
      <TabsContent value="tutors" className="mt-2 p-2">
        <UserPersonaManager surface="tutors" imageGenerationPresentation="embedded" />
      </TabsContent>
    </Tabs>
  );
}

export default function PersonasPage() {
  return (
    <AdminOperationPage title={{ ko: "페르소나 관리", en: "Persona Management" }}>
      <PersonaOperationContent />
    </AdminOperationPage>
  );
}
