import type { Metadata } from "next";
import StoryPlayer from "components/module/story/StoryPlayer";

export const metadata: Metadata = {
  title: "Interactive Story · AMU Play",
  robots: { index: false, follow: false },
};

export default async function InteractiveStoryPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  return (
    <div className="min-h-[100dvh] bg-background text-primary-text">
      <StoryPlayer storyId={storyId} entryContext="play" />
    </div>
  );
}
