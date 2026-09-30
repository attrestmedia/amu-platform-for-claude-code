import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GenStudioTemplateRoute } from "components/template/gen-studio/GenStudioTemplateRoute";
import { normalizeGenStudioTemplateKey } from "utils/app/genStudioRouteContract";

export const metadata: Metadata = {
  title: "음성 템플릿 생성 | Gen Studio",
  description: "Gen Studio 음성 템플릿으로 내레이션 생성을 시작하세요.",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ templateKey: string }>;
};

export default async function GenStudioAudioTemplatePage({ params }: PageProps) {
  const { templateKey } = await params;
  const safeTemplateKey = normalizeGenStudioTemplateKey(templateKey);
  if (!safeTemplateKey) notFound();

  return <GenStudioTemplateRoute mode="audio" templateKey={safeTemplateKey} />;
}
