import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import * as MS from "motion-story";
import { SAMPLE_INTERACTIVE_ARTICLE as FX } from "interactive-articles/fixtures/sampleInteractiveArticle";
import { buildInteractiveArticleRegistry } from "interactive-articles";
import { InteractiveStoryPlayer, InteractiveArticleCard, InteractiveArticleHero, InteractiveArticleHomeDeck } from "components/module/magazine/story";

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (e) { console.error("FAIL", name); throw e; } };
const clone = <T,>(v: T): any => JSON.parse(JSON.stringify(v));

// ---- contract
test("fixture valid", () => { const r = MS.parseInteractiveArticle(FX); assert.ok(r.ok, JSON.stringify(!r.ok && r.errors)); });
const expectErr = (mut: (x: any) => void, re: RegExp) => { const x = clone(FX); mut(x); const r = MS.parseInteractiveArticle(x); assert.equal(r.ok, false); assert.ok(!r.ok && r.errors.some((e) => re.test(e)), !r.ok ? r.errors.join("\n") : ""); };
test("unknown field", () => expectErr((x) => { x.foo = 1; }, /\$\.foo: 알 수 없는 필드/));
test("unknown scene field", () => expectErr((x) => { x.scenes[0].css = "x"; }, /알 수 없는 필드/));
test("url assetId", () => expectErr((x) => { x.scenes[0].visual.assetId = "https://evil/x.png"; }, /URL 금지/));
test("missing asset", () => expectErr((x) => { x.scenes[0].visual.assetId = "nope"; }, /없는 assetId/));
test("hypothesis claim", () => expectErr((x) => { x.scenes[3].data.figures[0].claimStatus = "hypothesis"; }, /measured · sourced/));
test("comparison needs 2", () => expectErr((x) => { x.scenes[3].data.figures.pop(); }, /comparison 은 수치 2개/));
test("data on statement", () => expectErr((x) => { x.scenes[1].data = clone(FX.scenes[3]!.data); }, /data · comparison 일 때만/));
test("wrong preset category", () => expectErr((x) => { x.scenes[0].text.enter = "trans.fade"; }, /enter\.\* 프리셋/));
test("number-count non data", () => expectErr((x) => { x.scenes[1].text.emphasis = "emph.number-count"; }, /number-count 는 data/));
test("homeCard budget", () => expectErr((x) => { x.scenes[5].timing.holdMs = 2000; }, /합계 .*ms > 8000ms/));
test("homeCard 3 scenes", () => expectErr((x) => { x.surfaces.homeCard.sceneIds = ["s-hook", "s-takeaway", "s-cta"]; }, /최대 2개/));
test("short only published", () => expectErr((x) => { x.surfaces.short = { sceneIds: ["s-hook"], format: "9:16", maxDurationMs: 45000 }; }, /status=published/));
test("broken beat ref", () => expectErr((x) => { x.scenes[0].beatIds = ["zz"]; }, /없는 beatId/));
test("sceneOrder mismatch", () => expectErr((x) => { x.sceneOrder.pop(); }, /sceneOrder/));
test("primitive needs fallback", () => expectErr((x) => { x.scenes[0].visual.primitiveKey = "particles"; }, /primitiveKey 사용 시 필수/));
test("dup ids", () => expectErr((x) => { x.beats[1].beatId = "b-hook"; }, /중복 ID/));
test("asset protocol-relative", () => expectErr((x) => { x.assets[0].src = "//cdn/x.png"; }, /src/));
test("short published ok", () => { const x = clone(FX); x.status = "published"; x.surfaces.short = { sceneIds: ["s-hook", "s-takeaway"], format: "9:16", maxDurationMs: 45000 }; assert.ok(MS.parseInteractiveArticle(x).ok); });
test("registry fail-closed", () => {
  const bad = clone(FX); bad.slug = "Bad Slug";
  const pub = clone(FX); pub.status = "published";
  const reg = buildInteractiveArticleRegistry([pub, bad, clone(FX)]);
  assert.equal(reg.valid.length, 1); assert.equal(reg.rejected.length, 2);
  assert.ok(reg.rejected.some((r) => r.errors.some((e) => /slug 중복/.test(e))));
});
test("text hash stable & sensitive", () => {
  const a = MS.computeStoryTextHash(FX.beats); assert.equal(a, MS.computeStoryTextHash(clone(FX.beats)));
  const b = clone(FX.beats); b[0].body[0] += "!"; assert.notEqual(a, MS.computeStoryTextHash(b)); assert.match(a, /^fnv1a-[0-9a-f]{8}$/);
});

// ---- compiler
test("draft from beats validates", () => {
  const scenes = MS.draftScenesFromBeats(FX.beats);
  const surfaces = MS.draftSurfaces(FX.beats, scenes, { homeCardTier: "signature" });
  const res = { ...clone(FX), scenes, sceneOrder: scenes.map((s) => s.sceneId), surfaces };
  const r = MS.parseInteractiveArticle(res); assert.ok(r.ok, !r.ok ? r.errors.join("\n") : "");
  assert.equal(scenes[0]!.layout, "cover"); assert.equal(scenes.at(-1)!.transitionOut, "trans.cut");
  assert.ok(surfaces.homeCard && surfaces.homeCard.sceneIds[0] === "scene-1");
  assert.deepEqual(MS.draftScenesFromBeats(FX.beats), scenes); // deterministic
});
test("reading pace", () => {
  assert.equal(MS.readingMsForLine("가나다"), 1400);
  assert.equal(MS.readingMsForLine("가".repeat(27)), 3000);
  assert.equal(MS.computeSceneDurationMs(["짧다"], "line", "enter.fade-up"), 2400);
  assert.ok(MS.computeSceneDurationMs(Array(40).fill("가".repeat(100)), "line", "enter.fade-up") === MS.MOTION_TOKENS.scene.maxDurationMs);
});

// ---- presets
test("presets finite at all t", () => {
  for (const key of MS.MOTION_PRESET_KEYS) for (let t = -100; t <= 3000; t += 7) {
    const css = MS.channelsToCss(MS.samplePreset(key, t, 2000));
    for (const v of Object.values(css)) assert.ok(!/NaN|Infinity/.test(String(v)), `${key}@${t}: ${v}`);
  }
});
test("preset endpoints", () => {
  assert.deepEqual(MS.channelsToCss(MS.samplePreset("enter.fade-up", -1)), { opacity: "0", transform: "translate(0px, 12px) scale(1)" });
  assert.deepEqual(MS.channelsToCss(MS.samplePreset("enter.fade-up", 99999)), { opacity: "1", transform: "translate(0px, 0px) scale(1)" });
  assert.equal(MS.channelsToCss(MS.samplePreset("enter.mask-reveal", 0)).clipPath, "inset(0% 0% 100% 0%)");
  assert.equal(MS.channelsToCss(MS.samplePreset("emph.pulse", 210)).transform, "translate(0px, 0px) scale(1.04)");
  assert.equal(MS.channelsToCss(MS.samplePreset("camera.push", 1000, 2000)).transform, "translate(0px, 0px) scale(1.04)");
  assert.equal(MS.channelsToCss(MS.samplePreset("trans.cut", 0)).opacity, "1");
  assert.equal(MS.sampleNumberCount(0, 42, 99999), 42); assert.equal(MS.sampleNumberCount(0, 42, 0), 0);
  const mid = MS.sampleNumberCount(0, 100, 600); assert.ok(mid > 50 && mid < 100);
});
test("waapi keyframes", () => {
  const k = MS.toWaapiKeyframes("emph.pulse"); assert.equal(k.length, 3); assert.equal(k[0]!.easing, "cubic-bezier(0.2, 0, 0, 1)"); assert.equal(k[2]!.easing, undefined);
  assert.equal(MS.toWaapiKeyframes("camera.push")[0]!.easing, "linear");
});

// ---- timeline
const story = MS.buildStoryTimeline(FX, "story");
test("timeline contiguous", () => {
  let c = 0; for (const s of story.scenes) { assert.equal(s.startMs, c); c = s.endMs; }
  assert.equal(story.totalMs, c);
  const sum = FX.scenes.reduce((a, s) => a + s.timing.preRollMs + s.timing.durationMs + s.timing.holdMs, 0); assert.equal(story.totalMs, sum);
  assert.equal(story.scenes.at(-1)!.transitionOut, "trans.cut");
  assert.equal(story.restMs, story.totalMs);
});
test("sampling phases", () => {
  const f0 = MS.sampleStoryTimeline(story, 0); assert.equal(f0.sceneIndex, 0); assert.equal(f0.phase, "preRoll");
  const s1 = story.scenes[1]!; const f1 = MS.sampleStoryTimeline(story, s1.startMs + 500); assert.equal(f1.sceneIndex, 1); assert.equal(f1.phase, "reveal");
  assert.equal(MS.sampleStoryTimeline(story, s1.startMs + s1.transitionStartMs + 1).phase, "transition");
  assert.equal(MS.sampleStoryTimeline(story, 1e9).sceneIndex, story.scenes.length - 1);
  assert.equal(MS.sampleStoryTimeline(story, -5).timeMs, 0);
});
test("hidden before reveal, visible at rest, deterministic", () => {
  for (const s of story.scenes) {
    const early = MS.sampleSceneStyles(s, 0);
    for (const u of early.units) assert.ok(u.opacity === "0" || /inset\(0% 0% 100%/.test(u.clipPath ?? ""), s.sceneId);
    const rest = MS.sampleSceneStyles(s, s.restLocalMs);
    for (const u of rest.units) assert.ok((u.opacity ?? "1") === "1" && !/100%/.test(u.clipPath ?? ""), `${s.sceneId} rest ${JSON.stringify(u)}`);
    assert.equal(rest.container.opacity ?? "1", "1");
    const st = MS.sampleSceneStyles(s, 123, true); for (const u of st.units) assert.equal(u.opacity ?? "1", "1");
    assert.deepEqual(MS.sampleSceneStyles(s, 777), MS.sampleSceneStyles(s, 777));
  }
});
test("word units & stagger", () => {
  const q = story.scenes.find((s) => s.layout === "quote")!;
  assert.equal(q.units.length, 6); assert.deepEqual(q.units.map((u) => u.startMs), [360, 450, 540, 630, 720, 810]);
  assert.ok(q.lines[0]!.words && q.lines[0]!.words.length === 6);
  const fade = story.scenes.find((s) => s.layout === "comparison")!; assert.equal(fade.units.length, 1); assert.equal(fade.emphasisStartMs, 360);
});
test("cues override word timing", () => {
  const cues = { "s-turn": [0, 1, 2, 3, 4, 5].map((i) => ({ text: "w", startMs: 1000 + i * 400, endMs: 1300 + i * 400 })) };
  const t = MS.buildStoryTimeline(FX, "story", { cues }); const q = t.scenes.find((s) => s.sceneId === "s-turn")!;
  assert.deepEqual(q.units.map((u) => u.startMs), [1000, 1400, 1800, 2200, 2600, 3000]); assert.ok(q.durationMs >= 3300 - 360);
  const bad = MS.buildStoryTimeline(FX, "story", { cues: { "s-turn": cues["s-turn"].slice(0, 2) } });
  assert.equal(bad.scenes.find((s) => s.sceneId === "s-turn")!.units[1]!.startMs, 450);
});
test("card surface & loops", () => {
  const card = MS.buildStoryTimeline(FX, "homeCard");
  assert.deepEqual(card.scenes.map((s) => s.sceneId), ["s-hook", "s-takeaway"]);
  assert.equal(card.scenes[1]!.transitionOut, "trans.fade"); assert.ok(card.restMs < card.totalMs);
  assert.ok(card.scenes.every((s) => s.lines.length <= MS.MOTION_TOKENS.scene.maxLines));
  const p = MS.resolvePlayback(card, card.totalMs + 10, 2); assert.equal(p.iteration, 1); assert.equal(p.done, false); assert.equal(p.timeMs, 10);
  const d = MS.resolvePlayback(card, card.totalMs * 2, 2); assert.ok(d.done); assert.equal(d.timeMs, card.restMs);
  const hero = MS.buildStoryTimeline(FX, "hero"); assert.equal(hero.restMs, hero.totalMs);
});

// ---- gesture
const G = MS.DEFAULT_GESTURE_CONFIG;
const run = (events: MS.GestureEvent[], cfg: Partial<MS.GestureConfig> = {}) => {
  let st = MS.INITIAL_GESTURE_STATE; const out: MS.GestureIntent[] = [];
  for (const e of events) { const r = MS.reduceGesture(st, e, { ...G, ...cfg }); st = r.state; out.push(...r.intents); }
  return { st, out: out.filter((i) => i.type !== "drag"), drags: out.filter((i) => i.type === "drag") };
};
const down = (x: number, y: number, t: number, blocked = false): MS.GestureEvent => ({ type: "down", pointerId: 1, x, y, t, blocked });
const mv = (x: number, y: number, t: number): MS.GestureEvent => ({ type: "move", pointerId: 1, x, y, t });
const up = (x: number, y: number, t: number): MS.GestureEvent => ({ type: "up", pointerId: 1, x, y, t });
test("tap", () => assert.deepEqual(run([down(100, 100, 0), up(103, 101, 120)]).out, [{ type: "tap", x: 103, y: 101 }]));
test("slow press no tap", () => assert.deepEqual(run([down(100, 100, 0), up(100, 100, 400)]).out, []));
test("swipe left/right", () => {
  assert.equal((run([down(200, 100, 0), mv(180, 102, 50), mv(120, 104, 200), up(120, 104, 400)]).out[0] as any).direction, "left");
  assert.equal((run([down(100, 100, 0), mv(120, 100, 50), mv(180, 100, 300), up(180, 100, 600)]).out[0] as any).direction, "right");
});
test("short slow drag no swipe; fling yes", () => {
  assert.deepEqual(run([down(100, 100, 0), mv(115, 100, 100), mv(140, 100, 400), up(140, 100, 500)]).out, []);
  assert.equal((run([down(100, 100, 0), mv(115, 100, 20), up(130, 100, 50)]).out[0] as any)?.type, "swipe");
});
test("vertical goes native on x axis", () => {
  const r = run([down(100, 100, 0), mv(102, 130, 50), mv(180, 200, 100), up(200, 200, 150)]);
  assert.equal(r.out.length, 0); assert.equal(r.drags.length, 0);
  const b = run([down(100, 100, 0), mv(102, 130, 50), up(102, 200, 150)], { axes: "both" }); assert.equal((b.out[0] as any).direction, "down");
});
test("direction lock sticks", () => {
  const r = run([down(100, 100, 0), mv(115, 102, 30), mv(116, 200, 100), up(116, 220, 150)]);
  assert.deepEqual(r.out, []); assert.equal(r.drags.at(-1)!.type === "drag" && (r.drags.at(-1) as any).axis, "x");
});
test("edge/interactive blocked", () => assert.deepEqual(run([down(5, 100, 0, true), mv(200, 100, 50), up(200, 100, 100)]).out, []));
test("long press", () => {
  const r = run([down(100, 100, 0), { type: "timer", t: 460 }, up(100, 100, 900)]);
  assert.deepEqual(r.out.map((i) => i.type), ["long-press-start", "long-press-end"]);
  const early = run([down(100, 100, 0), { type: "timer", t: 300 }, up(100, 100, 350)]); assert.deepEqual(early.out, []);
});
test("double tap & deferred single tap", () => {
  const cfg = { doubleTap: true };
  assert.deepEqual(run([down(100, 100, 0), up(100, 100, 80), down(104, 102, 200), up(104, 102, 260)], cfg).out.map((i) => i.type), ["double-tap"]);
  const single = run([down(100, 100, 0), up(100, 100, 80)], cfg); assert.deepEqual(single.out, []);
  assert.equal(MS.nextGestureDeadline(single.st, { ...G, ...cfg }), 80 + G.doubleTapMs);
  assert.deepEqual(run([down(100, 100, 0), up(100, 100, 80), { type: "timer", t: 400 }], cfg).out.map((i) => i.type), ["tap"]);
  assert.deepEqual(run([down(100, 100, 0), up(100, 100, 80), down(300, 300, 150), up(300, 300, 200)], cfg).out, []);
});
test("second pointer ignored; cancel", () => {
  const r = run([down(100, 100, 0), { type: "down", pointerId: 2, x: 0, y: 0, t: 10 }, { type: "up", pointerId: 2, x: 0, y: 0, t: 20 }, up(100, 100, 50)]);
  assert.deepEqual(r.out.map((i) => i.type), ["tap"]);
  assert.deepEqual(run([down(100, 100, 0), { type: "timer", t: 500 }, { type: "cancel", pointerId: 1 }]).out.map((i) => i.type), ["long-press-start", "long-press-end"]);
});
test("action maps", () => {
  const box = { width: 300, left: 0 };
  assert.equal(MS.toStoryAction({ type: "tap", x: 50, y: 0 }, box), "prev"); assert.equal(MS.toStoryAction({ type: "tap", x: 200, y: 0 }, box), "next");
  assert.equal(MS.toStoryAction({ type: "swipe", direction: "down", distance: 99, velocity: 1 }, box), "close");
  assert.equal(MS.toDeckAction({ type: "swipe", direction: "right", distance: 99, velocity: 1 }), "read");
  assert.equal(MS.toDeckAction({ type: "swipe", direction: "left", distance: 99, velocity: 1 }), "explore-category");
  assert.equal(MS.toDeckAction({ type: "double-tap", x: 0, y: 0 }), "like"); assert.equal(MS.toDeckAction({ type: "tap", x: 0, y: 0 }), null);
});

// ---- SSR
test("SSR renders full text statically", () => {
  const html = renderToString(<InteractiveStoryPlayer resource={FX} onClose={() => {}} />);
  for (const line of FX.beats[0]!.body) assert.ok(html.includes(line));
  assert.ok(!/opacity:0[;"]/.test(html), "SSR frame must be visible");
  assert.ok(html.includes('aria-pressed="false"'));
  const pub = { ...clone(FX), status: "published" };
  const card = renderToString(<InteractiveArticleHomeDeck resources={[pub, { ...pub, articleId: "x2", slug: "x2", surfaces: { ...pub.surfaces, homeCard: { ...pub.surfaces.homeCard, tier: "signature" } } }]} hrefFor={(r) => `/interactive/${r.slug}`} />);
  assert.equal((card.match(/data-story-tier="signature"/g) || []).length, 1);
  const twoSig = renderToString(<InteractiveArticleHomeDeck resources={[0, 1].map((n) => ({ ...pub, articleId: `s${n}`, slug: `s${n}`, surfaces: { ...pub.surfaces, homeCard: { ...pub.surfaces.homeCard, tier: "signature" } } }))} hrefFor={(r) => `/i/${r.slug}`} />);
  assert.deepEqual(twoSig.match(/data-story-tier="[a-z]+"/g), ['data-story-tier="signature"', 'data-story-tier="motion"']);
  assert.equal((card.match(/<img[^>]*fetchPriority="high"/g) || []).length, 1);
  assert.ok(card.includes("/interactive/sample-workflow"));
  const hero = renderToString(<InteractiveArticleHero resource={FX} actions={<button>스토리로 보기</button>} />);
  assert.ok(hero.includes("한 팀의 한 달을") === false && hero.includes("같은 일을 하는데"));
  const std = renderToString(<InteractiveArticleCard resource={FX} href="/x" tier="standard" />); assert.ok(!std.includes("aria-pressed"));
});

console.log(`core tests passed: ${passed}`);
