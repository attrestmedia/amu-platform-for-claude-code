"use client";

import { use } from "react";
import { CardNewsEditorPage } from "components/template/card-news";

export default function CardNewsDeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const resolvedParams = use(params);
  return <CardNewsEditorPage deckId={resolvedParams.deckId} />;
}
