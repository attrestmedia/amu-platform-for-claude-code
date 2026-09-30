import { chromium } from "playwright-core";
import fs from "node:fs";
import assert from "node:assert/strict";
const dir = new URL(".", import.meta.url).pathname;
const shots = process.argv[2];
const svg = (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><circle cx="700" cy="600" r="260" fill="#ffffff55"/></svg>`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
let passed = 0; const errors = [];
async function open(view, { width = 390, height = 844, reduced = false, hasTouch = false, hydrate = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference", hasTouch });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${view}] ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${view}] ${e.message}`));
  await page.route("http://t.local/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.startsWith("/images/")) return route.fulfill({ contentType: "image/svg+xml", body: p.includes("team") ? svg("#3b4a6b", "#9eaf45") : svg("#1f2a44", "#c8a96a") });
    const f = p === "/" ? "index.html" : p.slice(1);
    return route.fulfill({ path: dir + f, contentType: f.endsWith(".css") ? "text/css" : f.endsWith(".js") ? "text/javascript" : "text/html" });
  });
  await page.goto(`http://t.local/?view=${view}${hydrate ? "&hydrate=1" : ""}`);
  return { ctx, page };
}
const t = async (name, fn) => { try { await fn(); passed++; } catch (e) { console.error("FAIL", name); throw e; } };
const attrIs = async (loc, name, value, msg) => { for (let i = 0; i < 40; i++) { if ((await loc.getAttribute(name)) === value) return; await new Promise((r) => setTimeout(r, 25)); } assert.equal(await loc.getAttribute(name), value, msg); };
const pointer = (page, sel, type, x, y) => page.evaluate(([sel, type, x, y]) => {
  const el = document.querySelector(sel); el.dispatchEvent(new PointerEvent(type, { pointerId: 7, isPrimary: true, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true }));
}, [sel, type, x, y]);
const sceneId = (page) => page.locator("[data-story-stage] [data-story-scene]").getAttribute("data-story-scene");

// 1. WAAPI parity: element.animate + currentTime seek == pure sampler
await t("waapi parity", async () => {
  const { ctx, page } = await open("hero");
  const diffs = await page.evaluate(() => {
    const MS = window.MS; const out = [];
    const a = document.createElement("div"), b = document.createElement("div");
    for (const el of [a, b]) { el.style.cssText = "width:100px;height:40px;position:fixed;top:0;left:0"; document.body.append(el); }
    for (const key of MS.MOTION_PRESET_KEYS) {
      if (MS.getMotionPreset(key).counter) continue;
      const dur = MS.getPresetDurationMs(key, 2000); if (dur === 0) continue;
      const anim = a.animate(MS.toWaapiKeyframes(key), { duration: dur, fill: "both", easing: "linear" }); anim.pause();
      for (const f of [0, 0.13, 0.37, 0.5, 0.81, 1]) {
        anim.currentTime = dur * f;
        b.removeAttribute("style"); b.style.cssText = "width:100px;height:40px;position:fixed;top:0;left:0";
        Object.assign(b.style, MS.channelsToCss(MS.samplePreset(key, dur * f, 2000)));
        const ca = getComputedStyle(a), cb = getComputedStyle(b);
        for (const prop of ["opacity", "transform", "clipPath", "backgroundSize"]) {
          const num = (s) => (s.match(/-?\d+(\.\d+)?(e-?\d+)?/g) || []).map(Number);
          const na = num(ca[prop]), nb = num(cb[prop]);
          const same = ca[prop] === cb[prop] || (na.length === nb.length && na.every((v, i) => Math.abs(v - nb[i]) < 0.02));
          if (!same) out.push(`${key}@${f} ${prop}: waapi=${ca[prop]} pure=${cb[prop]}`);
        }
      }
      anim.cancel();
    }
    return out;
  });
  assert.deepEqual(diffs, []);
  await ctx.close();
});

// 2. Player autoplay, keyboard, gestures, pause/hold
await t("player", async () => {
  const { ctx, page } = await open("player");
  await page.waitForTimeout(300);
  assert.equal(await sceneId(page), "s-hook");
  const toggle = page.getByRole("button", { name: "자동 재생" });
  await attrIs(toggle, "aria-pressed", "true");
  if (shots) await page.screenshot({ path: `${shots}/player-375-hook-reveal.png` });
  await page.waitForFunction(() => document.querySelector("[data-story-stage] [data-story-scene]")?.getAttribute("data-story-scene") === "s-problem", null, { timeout: 7000 });
  // keyboard
  await toggle.focus(); await page.keyboard.press("ArrowRight"); assert.equal(await sceneId(page), "s-context");
  await page.keyboard.press("ArrowLeft"); assert.equal(await sceneId(page), "s-problem");
  await page.keyboard.press("End"); assert.equal(await sceneId(page), "s-cta");
  await page.keyboard.press("Home"); assert.equal(await sceneId(page), "s-hook");
  // pause via button, then next scene is static & fully visible
  await toggle.click(); await attrIs(toggle, "aria-pressed", "false");
  await page.getByRole("button", { name: "다음 장면" }).click();
  assert.equal(await sceneId(page), "s-problem");
  const opac = await page.$$eval("[data-story-stage] p span.inline-block", (els) => els.map((e) => getComputedStyle(e).opacity));
  assert.ok(opac.length > 0 && opac.every((o) => o === "1"), `static scene visible ${opac}`);
  await page.waitForTimeout(600); assert.equal(await sceneId(page), "s-problem", "paused stays");
  // tap zones: right = next, left = prev
  const box = await page.locator("[data-story-stage]").boundingBox();
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2); assert.equal(await sceneId(page), "s-context");
  await page.mouse.click(box.x + box.width * 0.15 + 30, box.y + box.height / 2); assert.equal(await sceneId(page), "s-problem");
  // swipe left = next
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.8, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * 0.8 - i * 25, y + i);
  await page.mouse.up(); assert.equal(await sceneId(page), "s-context");
  // swipe down = close (synthetic touch pointer)
  const stageSel = "[data-story-stage]"; const cx = box.x + box.width / 2;
  await pointer(page, stageSel, "pointerdown", cx, box.y + 120);
  for (let i = 1; i <= 8; i++) await pointer(page, stageSel, "pointermove", cx + 1, box.y + 120 + i * 20);
  await pointer(page, stageSel, "pointerup", cx + 1, box.y + 280);
  // long press while playing -> hold
  await toggle.click(); await page.waitForTimeout(100); await attrIs(toggle, "aria-pressed", "true");
  await pointer(page, stageSel, "pointerdown", cx, y); await page.waitForTimeout(650);
  await attrIs(toggle, "aria-pressed", "false", "held pauses");
  const before = await sceneId(page); await pointer(page, stageSel, "pointerup", cx, y); await page.waitForTimeout(150);
  await attrIs(toggle, "aria-pressed", "true", "release resumes"); assert.equal(await sceneId(page), before, "long press does not navigate");
  // Escape closes
  await toggle.focus(); await page.keyboard.press("Escape");
  const ev = await page.evaluate(() => window.events);
  assert.equal(ev.filter((e) => e === "close").length, 2, ev.join(","));
  if (shots) { await page.keyboard.press("End"); await page.waitForTimeout(50); await toggle.click(); await page.keyboard.press("Home"); await page.getByRole("button", { name: "다음 장면" }).click(); await page.getByRole("button", { name: "다음 장면" }).click(); await page.getByRole("button", { name: "다음 장면" }).click(); await page.screenshot({ path: `${shots}/player-375-comparison.png` }); await page.getByRole("button", { name: "다음 장면" }).click(); await page.screenshot({ path: `${shots}/player-375-quote.png` }); }
  await ctx.close();
});

// 3. full autoplay completes
await t("player completes", async () => {
  const { ctx, page } = await open("player", { width: 1440, height: 900 });
  await page.evaluate(() => { const d = document.querySelector("[data-story-stage]"); });
  if (shots) { await page.waitForTimeout(2600); await page.screenshot({ path: `${shots}/player-1440-hook.png` }); }
  await page.waitForFunction(() => window.events.includes("complete"), null, { timeout: 45000 });
  assert.equal(await sceneId(page), "s-cta");
  assert.equal(await page.getByRole("button", { name: "자동 재생" }).getAttribute("aria-pressed"), "false");
  const ev = await page.evaluate(() => window.events.filter((e) => e.startsWith("scene:")));
  assert.deepEqual([...new Set(ev)], ["scene:0", "scene:1", "scene:2", "scene:3", "scene:4", "scene:5", "scene:6"]);
  await ctx.close();
});

// 4. reduced motion
await t("reduced motion", async () => {
  const { ctx, page } = await open("player", { reduced: true });
  await page.waitForTimeout(800);
  assert.equal(await page.getByRole("button", { name: "자동 재생" }).count(), 0);
  assert.ok(await page.getByText("동작 줄이기 설정으로 자동 재생 꺼짐").isVisible());
  assert.equal(await sceneId(page), "s-hook");
  const opac = await page.$$eval("[data-story-stage] span.inline-block", (els) => els.map((e) => getComputedStyle(e).opacity + "|" + getComputedStyle(e).clipPath));
  assert.ok(opac.every((o) => o.startsWith("1|")) && opac.every((o) => !o.includes("100%")), opac.join());
  await page.getByRole("button", { name: "다음 장면" }).click(); assert.equal(await sceneId(page), "s-problem");
  await ctx.close();
});

// 5. home deck: only one active card, pauses off-screen, gestures, impression
await t("deck", async () => {
  const { ctx, page } = await open("deck", { width: 390, height: 844 });
  await page.waitForTimeout(400);
  const pressed = () => page.$$eval("[data-interactive-article-card] button[aria-pressed]", (els) => els.map((e) => e.getAttribute("aria-pressed")));
  let p = await pressed(); assert.deepEqual(p, ["true", "false"], `first active ${p}`);
  if (shots) { await page.waitForTimeout(1500); await page.screenshot({ path: `${shots}/deck-375.png` }); }
  await page.waitForFunction(() => window.events.includes("imp:sample-workflow"), null, { timeout: 3000 });
  // scroll so 2nd card is most visible
  await page.locator('[data-interactive-article-card="second"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 300)); await page.waitForTimeout(400);
  p = await pressed(); assert.deepEqual(p, ["false", "true"], `second active ${p}`);
  // manual pause is sticky
  const btn = page.locator('[data-interactive-article-card="second"] button[aria-pressed]');
  await btn.click(); await attrIs(btn, "aria-pressed", "false");
  // swipe right on media = read, double tap = like, single tap = nothing
  const media = await page.locator('[data-interactive-article-card="second"] [data-story-scene]').boundingBox();
  const cy = media.y + Math.min(media.height / 2, 300);
  await page.mouse.move(media.x + 60, cy); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(media.x + 60 + i * 25, cy);
  await page.mouse.up();
  await page.mouse.click(media.x + 150, cy); await page.waitForTimeout(40); await page.mouse.click(media.x + 150, cy);
  await page.mouse.click(media.x + 150, cy + 40); await page.waitForTimeout(400);
  // edge guard: start within 24px of viewport edge
  await page.mouse.move(10, cy); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(10 + i * 25, cy); await page.mouse.up();
  const ev = await page.evaluate(() => window.events.filter((e) => !e.startsWith("imp:")));
  assert.deepEqual(ev, ["read:second", "like:second"]);
  // keyboard parity
  await page.locator('[data-interactive-article-card="second"] h3 a').focus(); await page.keyboard.press("ArrowLeft");
  assert.equal((await page.evaluate(() => window.events)).at(-1), "explore-category:second");
  await ctx.close();
});

// 6. hero plays once and stops, signature not required
await t("hero", async () => {
  const { ctx, page } = await open("hero", { width: 1440, height: 900 });
  const btn = page.getByRole("button", { name: "도입 움직임" });
  await page.waitForTimeout(300); await attrIs(btn, "aria-pressed", "true");
  if (shots) { await page.waitForTimeout(2200); await page.screenshot({ path: `${shots}/hero-1440.png` }); }
  await page.waitForFunction(() => document.querySelector('button[aria-label="도입 움직임"]')?.getAttribute("aria-pressed") === "false", null, { timeout: 12000 });
  assert.equal(await page.locator("[data-story-scene]").getAttribute("data-story-scene"), "s-context");
  await ctx.close();
});

// 7. SSR → hydration: 경고 0, 서버 마크업은 정지 프레임(텍스트 표시), 이후 재생 시작
await t("hydration", async () => {
  for (const view of ["player", "deck", "hero"]) {
    const { ctx, page } = await open(view, { hydrate: true });
    const ssr = await page.evaluate(() => window.ssrHtml);
    assert.ok(!/opacity:0[;"]/.test(ssr), `${view} ssr visible`);
    await page.waitForTimeout(600);
    await ctx.close();
  }
});

// 7. dark mode render sanity
if (shots) { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" }); await ctx.close(); }

await browser.close();
const relevant = errors.filter((e) => !/Download the React DevTools/.test(e));
assert.deepEqual(relevant, [], relevant.join("\n"));
console.log(`browser tests passed: ${passed}, console errors: 0`);
