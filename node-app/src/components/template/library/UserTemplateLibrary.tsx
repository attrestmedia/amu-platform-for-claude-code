"use client";

import ImagePromptBookmarkManager, {
  ContentPromptBookmarkManager,
} from "components/module/admin/prompt-manager/ImagePromptBookmarkManager";
import { Lang } from "components/module/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@amu-labs/ui";

export function UserTemplateLibrary() {
  return (
    <section className="min-h-[32rem] bg-background">
      <Tabs defaultValue="image">
        <TabsList className="mb-4 grid grid-cols-2 w-full bg-transparent p-0 shadow-none sm:w-[24rem]">
          <TabsTrigger value="image">
            <Lang text={{ ko: "이미지 템플릿", en: "Image Templates" }} />
          </TabsTrigger>
          <TabsTrigger value="content">
            <Lang text={{ ko: "콘텐츠 템플릿", en: "Content Templates" }} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="image" className="min-h-[28rem] overflow-hidden">
          <ImagePromptBookmarkManager showBackButton={false} />
        </TabsContent>
        <TabsContent value="content" className="min-h-[28rem] overflow-hidden">
          <ContentPromptBookmarkManager showBackButton={false} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
