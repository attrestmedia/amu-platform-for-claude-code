import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { validatePromptTemplateFields, extractPromptVariables, findMissingRequiredPromptVariables, renderPromptConditionalBlocks } from "./lab/imagePrompt.ts";
import { renderContentPrompt } from "./lab/contentPrompt.ts";

const DIR = process.argv[2]; const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const PLATFORMS = ["instagram","threads","linkedin","x","youtube","blog","general","naver-blog","wp-blog"];
const report: string[] = [];
let failed = 0;
for (const f of readdirSync(DIR).filter((n) => n.endsWith(".md")).sort()) {
  const md = readFileSync(join(DIR, f), "utf8");
  const lines = md.split("\n");
  const title = lines.find((l) => l.startsWith("# "))!.slice(2).trim();
  const key = lines.slice(lines.findIndex((l) => l.startsWith("# ")) + 1).find((l) => l.trim())!.trim();
  const section = (name: string) => {
    const m = md.match(new RegExp(`^## ${name}:[ \\t]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"));
    return m ? m[1].trim() : "";
  };
  const templateText = md.split(/^## 템플릿:[ \t]*$/m)[1].trim();
  const categories = section("대표카테고리").split(",").map((s) => s.trim()).filter(Boolean);
  const tags = section("키워드").split(",").map((s) => s.trim()).filter(Boolean);
  const usageTip = section("활용팁");
  const defaultParams: Record<string, string> = {};
  for (const m of section("기본설정").matchAll(/^- `(\w+)`:\s*(.+)$/gm)) defaultParams[m[1]] = m[2].trim();

  const errs: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) errs.push("key not kebab-case");
  if (key !== f.replace(/\.md$/, "")) errs.push("key != filename");
  if (categories.length < 2 || categories.length > 4) errs.push(`categories=${categories.length}`);
  const ko = tags.filter((t) => /[가-힣]/.test(t)), en = tags.filter((t) => !/[가-힣]/.test(t));
  if (ko.length > 10 || en.length > 10) errs.push(`tags ko=${ko.length} en=${en.length}`);
  const longTags = tags.filter((t) => t.split(/\s+/).length > 2); if (longTags.length) errs.push(`tags >2 words: ${longTags}`);
  if (Array.from(usageTip).length > 140) errs.push(`usageTip ${Array.from(usageTip).length}자`);
  for (const k of ["platform","language","length","outputFormat"]) if (!defaultParams[k]) errs.push(`defaultParams.${k} missing`);
  if (!["markdown/mermaid","json"].includes(defaultParams.outputFormat)) errs.push("outputFormat invalid");
  if (!PLATFORMS.includes(defaultParams.platform)) errs.push("platform unknown");
  for (const sec of ["역할:","구조:","톤:","품질기준:"]) if (!templateText.includes(`\n${sec}\n`) && !templateText.startsWith(`${sec}\n`)) errs.push(`section ${sec} missing`);
  if (/\{#if[^}]*(!=|\belse\b|&&|\|\||\band\b|\bor\b)/.test(templateText) || /\{:else|\{#else/.test(templateText)) errs.push("forbidden condition form");
  const issues = validatePromptTemplateFields({ templateText });
  if (issues.length) errs.push("validator: " + JSON.stringify(issues));
  const vars = extractPromptVariables(templateText);
  const required = vars.filter((v) => v.required);
  if (!required.some((v) => v.kind === "text")) errs.push("no required free-text variable");
  const selects = vars.filter((v) => v.kind === "select");
  for (const v of selects) {
    if (v.options!.length > 8) errs.push(`${v.key} options ${v.options!.length} > 8`);
    for (const o of v.options!) if (/[a-z]|[-_]/.test(o) || o.includes(";")) errs.push(`${v.key} option '${o}' will be altered by normalizeLabel`);
  }
  // render every option of every select once (others default) to make sure no empty/broken output
  const reqParams = Object.fromEntries(required.map((v) => [v.key, v.kind === "text" ? "테스트 입력" : v.options![0]]));
  let renders = 0;
  for (const v of selects) for (const o of v.options!) {
    const params = { ...reqParams, [v.key]: o };
    const missing = findMissingRequiredPromptVariables(templateText, params);
    if (missing.length) errs.push(`missing required when ${v.key}=${o}: ${missing.map((m) => m.key)}`);
    const out = renderContentPrompt(title, templateText, { params });
    if (/\{#if|\{\/if\}|::/.test(out)) errs.push(`unrendered token when ${v.key}=${o}`);
    renders++;
  }
  // every condition value must be an actual option of its field
  for (const m of templateText.matchAll(/\{#if\s+([^\s=!]+)\s*==\s*"([^"]*)"\}/g)) {
    const spec = vars.find((v) => v.key === m[1]);
    if (!spec || spec.kind !== "select" || !spec.options!.includes(m[2])) errs.push(`condition ${m[1]}=="${m[2]}" never matches an option`);
  }
  const payload = { key, title, categories, tags, usageTip, templateText, defaultParams, accessLevel: "public", enabled: true, version: 1, strictNew: true };
  writeFileSync(join(OUT, `${key}.payload.json`), JSON.stringify(payload, null, 2) + "\n");
  const sample = renderContentPrompt(title, templateText, { params: reqParams });
  writeFileSync(join(OUT, `${key}.rendered-default.txt`), sample + "\n");
  if (errs.length) failed++;
  report.push(`${errs.length ? "FAIL" : "PASS"} ${key} | vars=${vars.length} (required ${required.map((v) => v.key).join(",")}) | selects=${selects.length} | conditions=${(templateText.match(/\{#if/g) || []).length} | option renders=${renders} | templateText ${Array.from(templateText).length}자 | default render ${Array.from(sample).length}자${errs.length ? "\n   - " + errs.join("\n   - ") : ""}`);
}
console.log(report.join("\n"));
process.exit(failed ? 1 : 0);
