"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@amu-labs/ui";
import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { ContentPromptManager, ImagePromptManager, TemplateGroupAdminPanel } from "components/module/admin/prompt-manager";
import { Lang } from "components/module/i18n";

export default function PromptsPage() {
  return (
    <AdminOperationPage title={{ ko: "프롬프트 관리", en: "Prompt Management" }}>
      <Tabs defaultValue="image" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="image">
            <Lang text={{ ko: "이미지 프롬프트", en: "Image Prompts" }} />
          </TabsTrigger>
          <TabsTrigger value="content">
            <Lang text={{ ko: "콘텐츠 프롬프트", en: "Content Prompts" }} />
          </TabsTrigger>
          <TabsTrigger value="groups">
            <Lang text={{ ko: "템플릿 그룹", en: "Template Groups" }} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="image" className="mt-4">
          <ImagePromptManager />
        </TabsContent>
        <TabsContent value="content" className="mt-4">
          <ContentPromptManager />
        </TabsContent>
        <TabsContent value="groups" className="mt-4">
          <TemplateGroupAdminPanel />
        </TabsContent>
      </Tabs>
    </AdminOperationPage>
  );
}
