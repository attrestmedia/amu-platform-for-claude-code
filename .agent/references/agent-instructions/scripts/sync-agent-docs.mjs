import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const EXTRA_SYNC_MANIFEST = "agent-sync-manifest.json";
const RESERVED_INSTRUCTIONS_ENTRIES = new Set(["AGENT_GUIDE.md", "skills", "rules", "mcp", EXTRA_SYNC_MANIFEST]);
const AGENT_GUIDE_TARGETS = [
  { fileName: "CLAUDE.md", agentRoot: ".claude" },
  { fileName: "AGENTS.md", agentRoot: ".codex" },
];
const MCP_SYNC_TARGETS = [
  {
    sourceName: ".mcp.json",
    targetSegments: [".mcp.json"],
    format: "json",
  },
  {
    sourceName: "config.toml",
    targetSegments: [".codex", "config.toml"],
    format: "toml",
  },
  {
    // OpenCode는 .mcp.json을 자동 import하지 않는다.
    // 같은 정본(.mcp.json)을 OpenCode 문법으로 변환해 opencode.json으로 내보낸다.
    // MCP 외 설정(model/permission/remote MCP 등)은 overlayName 파일에서 병합한다.
    sourceName: ".mcp.json",
    overlayName: "opencode.json",
    targetSegments: ["opencode.json"],
    format: "opencode",
  },
];
const OPENCODE_SCHEMA_URL = "https://opencode.ai/config.json";
const AGENT_ROOT_PLACEHOLDER = "{{AGENT_ROOT}}";
const AGENT_TEMPLATE_TEXT_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".json", ".yaml", ".yml"]);

// ---------------------------
// 공용 스크립트용 ROOT 자동 결정
// - 우선순위: --root > ENV(AGENT_DOCS_ROOT) > cwd부터 상위 탐색
// - 탐색 기준: agent/AGENT_GUIDE.md 또는 scripts/AGENT_GUIDE.md 존재 여부
// ---------------------------

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function getArgValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return "";
  return String(process.argv[idx + 1] || "").trim();
}

function platformKey() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

function expandHome(p) {
  const s = String(p || "").trim();
  if (!s) return "";
  if (s === "~") return os.homedir();
  if (s.startsWith("~/") || s.startsWith("~\\")) return path.join(os.homedir(), s.slice(2));
  return s;
}

function isFsRoot(p) {
  const r = path.resolve(p);
  const root = path.parse(r).root;
  return r === root || r === root.replace(/[\\/]+$/, "");
}

function lowerIfWin(p) {
  return process.platform === "win32" ? String(p).toLowerCase() : String(p);
}

function isSubPath(child, parent) {
  const c = lowerIfWin(path.resolve(child));
  const p = lowerIfWin(path.resolve(parent));
  if (c === p) return false;
  return c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

async function findProjectRoot(startDir) {
  let cur = path.resolve(startDir);
  while (true) {
    const c1 = path.join(cur, "agent", "AGENT_GUIDE.md");
    const c2 = path.join(cur, "scripts", "AGENT_GUIDE.md");
    const c3 = path.join(cur, "AGENT_GUIDE.md");
    if ((await pathExists(c1)) || (await pathExists(c2)) || (await pathExists(c3))) return cur;

    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(startDir); // 못 찾으면 시작점 유지
    cur = parent;
  }
}

async function resolveSourcePath(rootDir) {
  const candidates = [
    path.join(rootDir, "agent", "AGENT_GUIDE.md"),
    path.join(rootDir, "scripts", "AGENT_GUIDE.md"),
    path.join(rootDir, "AGENT_GUIDE.md"),
  ];
  for (const p of candidates) {
    if (await pathExists(p)) return p;
  }
  return "";
}

async function syncDir(src, dst) {
  if (!(await pathExists(src))) return false;
  if (path.resolve(src) === path.resolve(dst)) return false;
  await fs.rm(dst, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dst), { recursive: true });
  // Node 16+ 지원: 디렉토리 통째 복사
  await fs.cp(src, dst, { recursive: true, force: true });
  return true;
}

async function syncPath(src, dst) {
  if (!(await pathExists(src))) return false;
  if (path.resolve(src) === path.resolve(dst)) return false;
  await fs.rm(dst, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.cp(src, dst, { recursive: true, force: true });
  return true;
}

function shouldRenderAgentTemplate(filePath) {
  return AGENT_TEMPLATE_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeIfChanged(filePath, next) {
  let prev = null;
  try {
    prev = await fs.readFile(filePath, "utf8");
  } catch {
    // 파일이 없으면 새로 생성
  }
  if (prev === next) return false;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, next, "utf8");
  return true;
}

async function writeBufferIfChanged(filePath, next) {
  let prev = null;
  try {
    prev = await fs.readFile(filePath);
  } catch {
    // 파일이 없으면 새로 생성
  }
  if (prev && Buffer.compare(prev, next) === 0) return false;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, next);
  return true;
}

async function loadJson(p) {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw);
}

async function loadJsonIfExists(p) {
  try {
    return await loadJson(p);
  } catch {
    return null;
  }
}

function renderAgentTemplate(sourceText, agentRoot) {
  if (!agentRoot) return sourceText;
  return String(sourceText).split(AGENT_ROOT_PLACEHOLDER).join(agentRoot);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function deepMerge(base, override) {
  if (override == null) return cloneValue(base);
  if (base == null) return cloneValue(override);
  if (Array.isArray(base) && Array.isArray(override)) return cloneValue(override);
  if (!isPlainObject(base) || !isPlainObject(override)) return cloneValue(override);

  const merged = {};
  for (const [key, value] of Object.entries(base)) {
    merged[key] = cloneValue(value);
  }
  for (const [key, value] of Object.entries(override)) {
    if (key in merged) {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }
    merged[key] = cloneValue(value);
  }
  return merged;
}

function hasMeaningfulContent(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.values(value).some((item) => hasMeaningfulContent(item));
  return value != null;
}

function removeInlineTomlComment(line) {
  let out = "";
  let inBasic = false;
  let inLiteral = false;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (inBasic && ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (!inLiteral && ch === "\"") {
      inBasic = !inBasic;
      out += ch;
      continue;
    }
    if (!inBasic && ch === "'") {
      inLiteral = !inLiteral;
      out += ch;
      continue;
    }
    if (!inBasic && !inLiteral && ch === "#") break;
    out += ch;
  }
  return out.trim();
}

function splitTomlArray(input) {
  const items = [];
  let cur = "";
  let depth = 0;
  let inBasic = false;
  let inLiteral = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (inBasic && ch === "\\") {
      cur += ch;
      escaped = true;
      continue;
    }
    if (!inLiteral && ch === "\"") {
      inBasic = !inBasic;
      cur += ch;
      continue;
    }
    if (!inBasic && ch === "'") {
      inLiteral = !inLiteral;
      cur += ch;
      continue;
    }
    if (!inBasic && !inLiteral) {
      if (ch === "[") depth += 1;
      if (ch === "]") depth -= 1;
      if (ch === "," && depth === 0) {
        if (cur.trim()) items.push(cur.trim());
        cur = "";
        continue;
      }
    }
    cur += ch;
  }

  if (cur.trim()) items.push(cur.trim());
  return items;
}

function parseTomlValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  if (value.startsWith("\"") && value.endsWith("\"")) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return splitTomlArray(inner).map((item) => parseTomlValue(item));
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function setNestedValue(target, segments, value) {
  let cur = target;
  for (let i = 0; i < segments.length; i += 1) {
    const key = segments[i];
    const isLast = i === segments.length - 1;
    if (isLast) {
      cur[key] = value;
      return;
    }
    if (!isPlainObject(cur[key])) cur[key] = {};
    cur = cur[key];
  }
}

function countUnclosedTomlBrackets(input) {
  let depth = 0;
  let inBasic = false;
  let inLiteral = false;
  let escaped = false;
  for (const ch of String(input || "")) {
    if (escaped) { escaped = false; continue; }
    if (inBasic && ch === "\\") { escaped = true; continue; }
    if (!inLiteral && ch === "\"") { inBasic = !inBasic; continue; }
    if (!inBasic && ch === "'") { inLiteral = !inLiteral; continue; }
    if (inBasic || inLiteral) continue;
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;
  }
  return depth;
}

function parseTomlDocument(raw) {
  const doc = {};
  let currentPath = [];
  const lines = String(raw || "").split(/\r?\n/);
  // 여러 줄에 걸친 배열 값(TOML 표준 문법)을 이어 붙이기 위한 버퍼.
  let pendingKey = null;
  let pendingValue = "";

  for (const originalLine of lines) {
    const line = removeInlineTomlComment(originalLine);
    if (!line) continue;

    // table 판정보다 먼저 처리한다. 그러지 않으면 중첩 배열의 continuation(`[1, 2],`)을
    // table 헤더로 오독한다.
    if (pendingKey !== null) {
      pendingValue += ` ${line}`;
      if (countUnclosedTomlBrackets(pendingValue) > 0) continue;
      setNestedValue(doc, [...currentPath, pendingKey], parseTomlValue(pendingValue));
      pendingKey = null;
      pendingValue = "";
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      const tablePath = line.slice(1, -1).trim();
      if (!tablePath) throw new Error("EMPTY_TOML_TABLE");
      currentPath = tablePath.split(".").map((part) => part.trim()).filter(Boolean);
      if (currentPath.length === 0) throw new Error("EMPTY_TOML_TABLE");
      let cur = doc;
      for (const segment of currentPath) {
        if (!isPlainObject(cur[segment])) cur[segment] = {};
        cur = cur[segment];
      }
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) throw new Error(`INVALID_TOML_LINE: ${originalLine}`);
    const key = line.slice(0, eqIndex).trim();
    const rawValue = line.slice(eqIndex + 1).trim();
    if (!key) throw new Error(`INVALID_TOML_KEY: ${originalLine}`);

    if (countUnclosedTomlBrackets(rawValue) > 0) {
      pendingKey = key;
      pendingValue = rawValue;
      continue;
    }

    const fullPath = [...currentPath, key];
    setNestedValue(doc, fullPath, parseTomlValue(rawValue));
  }

  if (pendingKey !== null) throw new Error(`UNTERMINATED_TOML_ARRAY: ${pendingKey}`);

  return doc;
}

function formatTomlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function formatTomlValue(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map((item) => formatTomlValue(item)).join(", ")}]`;
  throw new Error(`UNSUPPORTED_TOML_VALUE: ${typeof value}`);
}

function stringifyTomlDocument(doc) {
  const lines = [];

  function emitTable(table, pathSegments = []) {
    const scalars = [];
    const tables = [];

    for (const [key, value] of Object.entries(table)) {
      if (isPlainObject(value)) {
        tables.push([key, value]);
        continue;
      }
      scalars.push([key, value]);
    }

    if (pathSegments.length > 0 && scalars.length > 0) {
      lines.push(`[${pathSegments.map((segment) => formatTomlKey(segment)).join(".")}]`);
    }

    for (const [key, value] of scalars) {
      lines.push(`${formatTomlKey(key)} = ${formatTomlValue(value)}`);
    }

    if (pathSegments.length > 0 && scalars.length > 0 && tables.length > 0) {
      lines.push("");
    }

    tables.forEach(([key, value], index) => {
      emitTable(value, [...pathSegments, key]);
      if (index < tables.length - 1) lines.push("");
    });
  }

  emitTable(doc);
  const text = lines.join("\n").trim();
  return text ? `${text}\n` : "";
}

async function loadOptionalJson(filePath) {
  const raw = await readTextIfExists(filePath);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`INVALID_JSON(${filePath}): ${error.message}`);
  }
}

async function loadOptionalToml(filePath) {
  const raw = await readTextIfExists(filePath);
  if (raw == null) return null;
  try {
    return parseTomlDocument(raw);
  } catch (error) {
    throw new Error(`INVALID_TOML(${filePath}): ${error.message}`);
  }
}

async function removeIfExists(filePath) {
  if (!(await pathExists(filePath))) return false;
  await fs.rm(filePath, { recursive: true, force: true });
  return true;
}

async function syncPathForAgent(src, dst, agentRoot) {
  if (!(await pathExists(src))) return false;
  if (path.resolve(src) === path.resolve(dst)) return false;

  const stat = await fs.stat(src);
  await fs.rm(dst, { recursive: true, force: true });

  if (stat.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const childSrc = path.join(src, entry.name);
      const childDst = path.join(dst, entry.name);
      if (entry.isDirectory()) {
        await syncPathForAgent(childSrc, childDst, agentRoot);
        continue;
      }
      if (entry.isFile() && shouldRenderAgentTemplate(childSrc)) {
        const sourceText = await readText(childSrc);
        const rendered = renderAgentTemplate(sourceText, agentRoot);
        await fs.mkdir(path.dirname(childDst), { recursive: true });
        await fs.writeFile(childDst, rendered, "utf8");
        continue;
      }
      await fs.mkdir(path.dirname(childDst), { recursive: true });
      await fs.cp(childSrc, childDst, { recursive: true, force: true });
    }
    return true;
  }

  await fs.mkdir(path.dirname(dst), { recursive: true });
  if (shouldRenderAgentTemplate(src)) {
    const sourceText = await readText(src);
    const rendered = renderAgentTemplate(sourceText, agentRoot);
    await fs.writeFile(dst, rendered, "utf8");
    return true;
  }

  await fs.cp(src, dst, { recursive: true, force: true });
  return true;
}

async function listInstructionExtras(dir) {
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => !RESERVED_INSTRUCTIONS_ENTRIES.has(entry.name))
    .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function ensureManagedSubPath(dst, root, code) {
  if (!isSubPath(dst, root)) {
    throw new Error(`${code} (${dst})`);
  }
}

async function syncInstructionExtrasToAgent({ sourceRoot, agentDirName, agentTargetRoot, targetRoot, changedFiles }) {
  const extras = await listInstructionExtras(sourceRoot);
  const manifestPath = path.join(agentTargetRoot, EXTRA_SYNC_MANIFEST);
  ensureManagedSubPath(agentTargetRoot, targetRoot, "UNSAFE_AGENT_ROOT");
  ensureManagedSubPath(manifestPath, targetRoot, "UNSAFE_MANIFEST_DST");

  const prev = await loadJsonIfExists(manifestPath);
  const prevEntries = Array.isArray(prev?.entries)
    ? prev.entries.filter((name) => typeof name === "string" && name.trim())
    : [];
  const nextEntries = extras.map((entry) => entry.name);

  if (nextEntries.length === 0 && prevEntries.length === 0) return;

  await fs.mkdir(agentTargetRoot, { recursive: true });

  for (const stale of prevEntries) {
    if (nextEntries.includes(stale)) continue;
    const staleDst = path.join(agentTargetRoot, stale);
    ensureManagedSubPath(staleDst, targetRoot, "UNSAFE_EXTRA_DST");
    await fs.rm(staleDst, { recursive: true, force: true });
    changedFiles.push(`${path.relative(targetRoot, staleDst)} (removed)`);
  }

  for (const entry of extras) {
    const src = path.join(sourceRoot, entry.name);
    const dst = path.join(agentTargetRoot, entry.name);
    ensureManagedSubPath(dst, targetRoot, "UNSAFE_EXTRA_DST");
    const synced = await syncPathForAgent(src, dst, agentDirName);
    if (!synced) continue;
    changedFiles.push(entry.isDirectory ? `${path.relative(targetRoot, dst)}/*` : path.relative(targetRoot, dst));
  }

  const manifest = `${JSON.stringify({ version: 1, entries: nextEntries }, null, 2)}\n`;
  await writeIfChanged(manifestPath, manifest);
}

function stringifyMcpJson(doc) {
  return `${JSON.stringify(doc ?? {}, null, 2)}\n`;
}

function stringifyMcpToml(doc) {
  return stringifyTomlDocument(doc ?? {});
}

// ---------------------------
// OpenCode 변환
// - 입력: Claude 계열 `.mcp.json` ({ mcpServers: { <name>: { command, args, env, ... } } })
// - 출력: OpenCode stable 문법 ({ mcp: { <name>: { type, command[], environment, enabled } } })
// - OpenCode는 local MCP의 환경변수 키로 `env`가 아니라 `environment`를 쓴다
// ---------------------------
function toOpenCodeMcpEntry(name, entry) {
  if (!isPlainObject(entry)) throw new Error(`INVALID_MCP_ENTRY(${name})`);

  const enabled = entry.enabled === false || entry.disabled === true ? false : true;
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  const declaredType = typeof entry.type === "string" ? entry.type.trim().toLowerCase() : "";

  // remote (http / sse / 이미 OpenCode 문법인 remote)
  if (url || declaredType === "remote" || declaredType === "http" || declaredType === "sse") {
    if (!url) throw new Error(`MCP_REMOTE_URL_MISSING(${name})`);
    const remote = { type: "remote", url, enabled };
    if (isPlainObject(entry.headers) && Object.keys(entry.headers).length > 0) {
      remote.headers = { ...entry.headers };
    }
    if (Number.isFinite(entry.timeout)) remote.timeout = entry.timeout;
    return remote;
  }

  // local (stdio)
  let command = [];
  if (Array.isArray(entry.command)) {
    command = entry.command.map((item) => String(item));
  } else if (typeof entry.command === "string" && entry.command.trim()) {
    command = [entry.command.trim(), ...(Array.isArray(entry.args) ? entry.args.map((item) => String(item)) : [])];
  }
  if (command.length === 0) throw new Error(`MCP_COMMAND_MISSING(${name})`);

  const local = { type: "local", command, enabled };
  const environment = isPlainObject(entry.environment)
    ? entry.environment
    : isPlainObject(entry.env)
      ? entry.env
      : null;
  if (environment && Object.keys(environment).length > 0) {
    local.environment = Object.fromEntries(
      Object.entries(environment).map(([key, value]) => [key, String(value)]),
    );
  }
  if (typeof entry.cwd === "string" && entry.cwd.trim()) local.cwd = entry.cwd.trim();
  if (Number.isFinite(entry.timeout)) local.timeout = entry.timeout;
  return local;
}

function buildOpenCodeDoc(mcpJsonDoc, overlayDoc) {
  const servers = isPlainObject(mcpJsonDoc?.mcpServers) ? mcpJsonDoc.mcpServers : {};
  const mcp = {};
  for (const [name, entry] of Object.entries(servers)) {
    mcp[name] = toOpenCodeMcpEntry(name, entry);
  }

  const base = { $schema: OPENCODE_SCHEMA_URL };
  if (Object.keys(mcp).length > 0) base.mcp = mcp;

  // overlay가 우선한다: 프로젝트별로 특정 서버 비활성화(`{"mcp":{"x":{"enabled":false}}}`)나
  // OpenCode 전용 설정(model/permission/remote MCP) 추가가 가능하다.
  return deepMerge(base, overlayDoc ?? {});
}

function stringifyOpenCodeJson(doc) {
  return `${JSON.stringify(doc ?? {}, null, 2)}\n`;
}

async function syncCentralMcpFiles({ repoRoot, instructionsRoot, projectKey, targetRoot, changedFiles }) {
  const mcpRoot = path.join(repoRoot, "mcp");
  const projectMcpRoot = path.join(instructionsRoot, projectKey, "mcp");

  for (const item of MCP_SYNC_TARGETS) {
    const dst = path.join(targetRoot, ...item.targetSegments);
    ensureManagedSubPath(dst, targetRoot, "UNSAFE_MCP_DST");

    const commonSrc = path.join(mcpRoot, item.sourceName);
    const projectSrc = path.join(projectMcpRoot, item.sourceName);
    const loadOptional = item.format === "toml" ? loadOptionalToml : loadOptionalJson;
    const stringify =
      item.format === "toml" ? stringifyMcpToml : item.format === "opencode" ? stringifyOpenCodeJson : stringifyMcpJson;

    const commonDoc = await loadOptional(commonSrc);
    const projectDoc = await loadOptional(projectSrc);

    let overlayCommonDoc = null;
    let overlayProjectDoc = null;
    if (item.overlayName) {
      overlayCommonDoc = await loadOptionalJson(path.join(mcpRoot, item.overlayName));
      overlayProjectDoc = await loadOptionalJson(path.join(projectMcpRoot, item.overlayName));
    }

    if (commonDoc == null && projectDoc == null && overlayCommonDoc == null && overlayProjectDoc == null) {
      const removed = await removeIfExists(dst);
      if (removed) changedFiles.push(`${path.relative(targetRoot, dst)} (removed)`);
      continue;
    }

    let mergedDoc = deepMerge(commonDoc ?? {}, projectDoc ?? {});
    if (item.format === "opencode") {
      const overlayDoc = deepMerge(overlayCommonDoc ?? {}, overlayProjectDoc ?? {});
      try {
        mergedDoc = buildOpenCodeDoc(mergedDoc, overlayDoc);
      } catch (error) {
        throw new Error(`OPENCODE_CONVERT_FAILED(${projectKey}): ${error.message}`);
      }
    }
    const emptyOpenCode =
      item.format === "opencode" && Object.keys(mergedDoc).filter((key) => key !== "$schema").length === 0;
    if (emptyOpenCode || !hasMeaningfulContent(mergedDoc)) {
      const removed = await removeIfExists(dst);
      if (removed) changedFiles.push(`${path.relative(targetRoot, dst)} (removed)`);
      continue;
    }
    const payload = stringify(mergedDoc);
    const changed = await writeIfChanged(dst, payload);
    if (changed) changedFiles.push(path.relative(targetRoot, dst));
  }
}

function pickTargetRoot(rootConfig) {
  if (!rootConfig) return "";
  if (typeof rootConfig === "string") return expandHome(rootConfig);
  const key = platformKey();
  return expandHome(rootConfig[key] || rootConfig.default || "");
}

function inferProjectKeyFromChangedFile(changedFile, instructionsRoot, validKeys) {
  const cf = String(changedFile || "").trim();
  if (!cf) return "";
  const abs = path.resolve(expandHome(cf));
  const base = path.resolve(expandHome(instructionsRoot));
  const rel = path.relative(base, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return "";
  const seg = rel.split(path.sep).filter(Boolean)[0] || "";
  if (!seg) return "";
  if (Array.isArray(validKeys) && validKeys.length > 0 && !validKeys.includes(seg)) return "";
  return seg;
}

async function syncOneCentral({ instructionsRoot, projectKey, targetRoot, sync }) {
  const INSTR = path.resolve(instructionsRoot);
  const KEY = String(projectKey || "").trim();
  const ROOT = path.resolve(expandHome(targetRoot));
  const REPO_ROOT = path.dirname(INSTR);

  if (!KEY) return { key: KEY, ok: false, reason: "EMPTY_KEY" };
  if (!ROOT || isFsRoot(ROOT)) return { key: KEY, ok: false, reason: "UNSAFE_TARGET_ROOT" };
  if (!(await pathExists(ROOT))) return { key: KEY, ok: false, reason: "TARGET_ROOT_NOT_FOUND" };

  const guideSrc = path.join(INSTR, KEY, "AGENT_GUIDE.md");
  if (!(await pathExists(guideSrc))) return { key: KEY, ok: false, reason: "GUIDE_NOT_FOUND" };

  const sourceText = await readText(guideSrc);
  const targets = AGENT_GUIDE_TARGETS.map(({ fileName, agentRoot }) => ({
    path: path.join(ROOT, fileName),
    payload: renderAgentTemplate(sourceText, agentRoot),
  }));
  const changedFiles = [];

  for (const t of targets) {
    const changed = await writeIfChanged(t.path, t.payload);
    if (changed) changedFiles.push(path.relative(ROOT, t.path));
  }

  const wantSkills = sync?.skills !== false;
  const wantRules = sync?.rules === true;
  const wantExtras = sync?.extras !== false;
  const instructionsProjectRoot = path.join(INSTR, KEY);

  if (wantSkills) {
    const skillsSrc = path.join(instructionsProjectRoot, "skills");
    if (await pathExists(skillsSrc)) {
      const dst1 = path.join(ROOT, ".claude", "skills");
      const dst2 = path.join(ROOT, ".codex", "skills");

      // 안전: 타겟 루트 밖으로 삭제/복사 방지
      if (!isSubPath(dst1, ROOT) || !isSubPath(dst2, ROOT)) {
        throw new Error(`UNSAFE_SKILLS_DST(${KEY})`);
      }

      const s1 = await syncPathForAgent(skillsSrc, dst1, ".claude");
      const s2 = await syncPathForAgent(skillsSrc, dst2, ".codex");
      if (s1) changedFiles.push(".claude/skills/*");
      if (s2) changedFiles.push(".codex/skills/*");
    }
  }

  if (wantRules) {
    const rulesSrc = path.join(instructionsProjectRoot, "rules");
    if (await pathExists(rulesSrc)) {
      const dst1 = path.join(ROOT, ".claude", "rules");
      const dst2 = path.join(ROOT, ".codex", "rules");

      if (!isSubPath(dst1, ROOT) || !isSubPath(dst2, ROOT)) {
        throw new Error(`UNSAFE_RULES_DST(${KEY})`);
      }

      const r1 = await syncPathForAgent(rulesSrc, dst1, ".claude");
      const r2 = await syncPathForAgent(rulesSrc, dst2, ".codex");
      if (r1) changedFiles.push(".claude/rules/*");
      if (r2) changedFiles.push(".codex/rules/*");
    }
  }

  if (wantExtras) {
    await syncInstructionExtrasToAgent({
      sourceRoot: instructionsProjectRoot,
      agentDirName: ".claude",
      agentTargetRoot: path.join(ROOT, ".claude"),
      targetRoot: ROOT,
      changedFiles,
    });
    await syncInstructionExtrasToAgent({
      sourceRoot: instructionsProjectRoot,
      agentDirName: ".codex",
      agentTargetRoot: path.join(ROOT, ".codex"),
      targetRoot: ROOT,
      changedFiles,
    });
  }

  await syncCentralMcpFiles({
    repoRoot: REPO_ROOT,
    instructionsRoot: INSTR,
    projectKey: KEY,
    targetRoot: ROOT,
    changedFiles,
  });

  return { key: KEY, ok: true, root: ROOT, guide: guideSrc, changedFiles };
}

async function main() {
  // ---------------------------
  // 중앙(Agents) 모드: --config로 여러 타겟 동기화
  // ---------------------------
  const configArg = getArgValue("--config") || String(process.env.AGENT_TARGETS_CONFIG || "").trim();
  const instructionsArg = getArgValue("--instructionsRoot") || String(process.env.AGENT_INSTRUCTIONS_ROOT || "").trim();
  const onlyKey = getArgValue("--projectKey"); // 선택: 특정 key만 동기화
  const changedFileArg = getArgValue("--changedFile") || getArgValue("--changedPath");

  if (configArg) {
    const CONFIG_PATH = path.resolve(expandHome(configArg));
    const INSTRUCTIONS_ROOT = path.resolve(expandHome(instructionsArg || path.join(process.cwd(), "instructions")));

    if (!(await pathExists(CONFIG_PATH))) {
      console.error("[sync-agent-docs] config not found:", CONFIG_PATH);
      process.exit(1);
    }
    if (!(await pathExists(INSTRUCTIONS_ROOT))) {
      console.error("[sync-agent-docs] instructionsRoot not found:", INSTRUCTIONS_ROOT);
      process.exit(1);
    }

    const conf = await loadJson(CONFIG_PATH);
    const markerFile = String(conf?.markerFile || "").trim();
    const targets = conf?.targets || {};
    const keys = Object.keys(targets);
    if (keys.length === 0) {
      console.error("[sync-agent-docs] no targets in config");
      process.exit(1);
    }

    const inferredKey = onlyKey ? "" : inferProjectKeyFromChangedFile(changedFileArg, INSTRUCTIONS_ROOT, keys);
    const effectiveOnlyKey = String(onlyKey || inferredKey || "").trim();

    console.log(`[sync-agent-docs] mode: central`);
    console.log(`[sync-agent-docs] instructionsRoot: ${INSTRUCTIONS_ROOT}`);
    console.log(`[sync-agent-docs] config: ${CONFIG_PATH}`);
    if (effectiveOnlyKey) console.log(`[sync-agent-docs] projectKey: ${effectiveOnlyKey}`);

    let anyChanged = false;
    for (const key of keys) {
      if (effectiveOnlyKey && key !== effectiveOnlyKey) continue;
      const item = targets[key] || {};
      const targetRoot = pickTargetRoot(item.root);
      try {
        if (!String(targetRoot || "").trim()) {
          console.warn(`[sync-agent-docs] skip(${key}): EMPTY_TARGET_ROOT (${platformKey()})`);
          continue;
        }
        const resolvedRoot = path.resolve(expandHome(targetRoot));
        if (!(await pathExists(resolvedRoot))) {
          console.warn(`[sync-agent-docs] skip(${key}): TARGET_ROOT_NOT_FOUND (${resolvedRoot})`);
          continue;
        }
        if (markerFile) {
          const markerPath = path.join(resolvedRoot, markerFile);
          if (!(await pathExists(markerPath))) {
            console.warn(`[sync-agent-docs] skip(${key}): MARKER_MISSING (${markerPath})`);
            continue;
          }
        }
        const res = await syncOneCentral({
          instructionsRoot: INSTRUCTIONS_ROOT,
          projectKey: key,
          targetRoot,
          sync: item.sync || {},
        });
        if (!res.ok) {
          console.warn(`[sync-agent-docs] skip(${key}): ${res.reason}`);
          continue;
        }
        if (res.changedFiles.length > 0) anyChanged = true;
        console.log(`[sync-agent-docs] ${key} -> ${res.root}`);
        console.log(`[sync-agent-docs] SOURCE: ${res.guide}`);
        if (res.changedFiles.length === 0) {
          console.log(`[sync-agent-docs] updated: (no changes)`);
        } else {
          console.log(`[sync-agent-docs] updated: ${res.changedFiles.join(", ")}`);
        }
      } catch (e) {
        console.error(`[sync-agent-docs] error(${key}):`, e);
      }
    }

    if (!anyChanged) console.log("[sync-agent-docs] no changes");
    return;
  }

  // ---------------------------
  // 레거시(단일 프로젝트) 모드
  // ---------------------------
  const rootArg = getArgValue("--root");
  const rootEnv = String(process.env.AGENT_DOCS_ROOT || "").trim();
  const startDir = rootArg || rootEnv || process.cwd();
  const ROOT = await findProjectRoot(startDir);

  const SOURCE = await resolveSourcePath(ROOT);
  const TARGETS = AGENT_GUIDE_TARGETS.map(({ fileName, agentRoot }) => ({
    path: path.join(ROOT, fileName),
    agentRoot,
  }));

  // skills 동기화 (심링크 미사용 시)
  const SKILLS_SRC = path.join(ROOT, "skills");
  const CLAUDE_SKILLS_DST = path.join(ROOT, ".claude", "skills");
  const CODEX_SKILLS_DST = path.join(ROOT, ".codex", "skills");


  let sourceText;
  try {
    if (!SOURCE) throw new Error("SOURCE_EMPTY");
    sourceText = await readText(SOURCE);
  } catch {
    console.error(`[sync-agent-docs] source not found`);
    console.error(`- startDir: ${startDir}`);
    console.error(`- resolved ROOT: ${ROOT}`);
    console.error(`- checked:`);
    console.error(`  - ${path.join(ROOT, "agent", "AGENT_GUIDE.md")}`);
    console.error(`  - ${path.join(ROOT, "scripts", "AGENT_GUIDE.md")}`);
    console.error(`  - ${path.join(ROOT, "AGENT_GUIDE.md")}`);
    console.error(`TIP: node sync-agent-docs.mjs --root <projectRoot>`);
    process.exit(1);
  }

  const results = [];
  for (const t of TARGETS) {
    const payload = renderAgentTemplate(sourceText, t.agentRoot);
    const changed = await writeIfChanged(t.path, payload);
    results.push({ file: path.relative(ROOT, t.path), changed });
  }

  const changedFiles = results.filter((r) => r.changed).map((r) => r.file);

  // skills 폴더 동기화
  const s1 = await syncPathForAgent(SKILLS_SRC, CLAUDE_SKILLS_DST, ".claude");
  const s2 = await syncPathForAgent(SKILLS_SRC, CODEX_SKILLS_DST, ".codex");
  if (s1) changedFiles.push(".claude/skills/*");
  if (s2) changedFiles.push(".codex/skills/*");

  if (changedFiles.length === 0) {
    console.log("[sync-agent-docs] no changes");
    return;
  }
  console.log(`[sync-agent-docs] ROOT: ${ROOT}`);
  console.log("[sync-agent-docs] updated:", changedFiles.join(", "));
}

main().catch((e) => {
  console.error("[sync-agent-docs] error:", e);
  process.exit(1);
});
