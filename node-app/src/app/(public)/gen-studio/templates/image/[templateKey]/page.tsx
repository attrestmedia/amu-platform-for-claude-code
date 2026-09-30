import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GenStudioTemplateRoute } from "components/template/gen-studio/GenStudioTemplateRoute";
import { normalizeGenStudioTemplateKey } from "utils/app/genStudioRouteContract";

export const metadata: Metadata = {
  title: "이미지 템플릿 생성 | Gen Studio",
  description: "Gen Studio 이미지 템플릿으로 생성 작업을 시작하세요.",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ templateKey: string }>;
};

export default async function GenStudioImageTemplatePage({ params }: PageProps) {
  const { templateKey } = await params;
  const safeTemplateKey = normalizeGenStudioTemplateKey(templateKey);
  if (!safeTemplateKey) notFound();

  return <GenStudioTemplateRoute mode="image" templateKey={safeTemplateKey} />;
}
