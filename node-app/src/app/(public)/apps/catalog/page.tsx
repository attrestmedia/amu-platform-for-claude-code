"use client";

import { AnnotationStateProvider } from "hooks/catalog/useAnnotationState";
import { AnnotationHeader, AnnotationApp } from "components/template/image-annotator";

export default function Home() {
  const appRunningMode = "edit"; // "edit", "view"

  return (
    <>
      <AnnotationStateProvider initMode={appRunningMode}>
        <AnnotationHeader />
        <main className="relative flex justify-between px-6 pb-6 annotation-main">
          <AnnotationApp />
        </main>
      </AnnotationStateProvider>
    </>
  );
}
