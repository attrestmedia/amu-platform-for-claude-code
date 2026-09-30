import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import * as MS from "motion-story";
import { SAMPLE_INTERACTIVE_ARTICLE as FX } from "interactive-articles/fixtures/sampleInteractiveArticle";
import { InteractiveStoryPlayer, InteractiveArticleHero, InteractiveArticleHomeDeck } from "components/module/magazine/story";

const w = window as any;
w.MS = MS; w.events = [] as string[];
const pub = { ...FX, status: "published" as const };
const decks = [pub, { ...pub, articleId: "ia-2", slug: "second", title: "(샘플) 두 번째 카드" }];
const params = new URLSearchParams(location.search);
const mode = params.get("view") ?? "player";
const hydrate = params.get("hydrate") === "1";

function App() {
  if (mode === "player") return <div style={{ height: "100dvh" }}><InteractiveStoryPlayer resource={FX} onClose={() => w.events.push("close")} onComplete={() => w.events.push("complete")} onSceneChange={(i) => w.events.push(`scene:${i}`)} outroAction={<a href="#source" className="underline">원문 기사 보기</a>} /></div>;
  if (mode === "deck") return <div className="p-4"><InteractiveArticleHomeDeck resources={decks} hrefFor={(r) => `#/${r.slug}`} onDeckAction={(a, r) => w.events.push(`${a}:${r.slug}`)} onImpression={(r) => w.events.push(`imp:${r.slug}`)} /><div style={{ height: 2000 }} /></div>;
  return <div className="mx-auto max-w-3xl p-4"><h1 className="mb-4 text-3xl font-bold text-primary-text">{FX.title}</h1><InteractiveArticleHero resource={FX} actions={<button className="rounded-full border px-4 py-2">스토리로 보기</button>} /></div>;
}
const root = document.getElementById("root")!;
if (hydrate) { root.innerHTML = renderToString(<App />); (window as any).ssrHtml = root.innerHTML; hydrateRoot(root, <App />, { onRecoverableError: (e) => console.error("recoverable", String(e)) }); }
else createRoot(root).render(<App />);
