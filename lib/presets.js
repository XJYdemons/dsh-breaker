// 模式（agent preset）安装器。
//
// 把插件自带的 presets/ 安装到 $DSH_HOME/.agent-presets/，使插件与模式一体化分发。
// 安装策略：只补缺失的，绝不覆盖用户已改过的模式；每个模式带版本标记以便升级。

import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_ROOT = path.join(HERE, "..", "presets");

/** 模式 id 必须匹配 dsh-agent-presets 的 PRESET_ID 正则。 */
const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/;

/** 版本标记文件名，写入安装后的模式目录，用于判断是否需要升级。 */
const STAMP_FILE = ".dsh-breaker-preset.json";

/** 读取插件自带的模式清单。 */
export function bundledPresets() {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(BUNDLED_ROOT, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || !PRESET_ID.test(e.name)) continue;
    const dir = path.join(BUNDLED_ROOT, e.name);
    const comp = path.join(dir, "agent.cordis.yml");
    if (!fs.existsSync(comp)) continue;
    let name = e.name;
    let description = "";
    let order;
    try {
      const meta = fs.readFileSync(path.join(dir, "preset.yml"), "utf8");
      for (const line of meta.split(/\r?\n/)) {
        const m = /^(\w+):\s*(.*)$/.exec(line.trim());
        if (!m) continue;
        if (m[1] === "name") name = m[2].trim();
        else if (m[1] === "description") description = m[2].trim();
        else if (m[1] === "order") order = Number(m[2]);
      }
    } catch {
      /* metadata optional */
    }
    out.push({ id: e.name, name, description, order, dir, composition: comp });
  }
  return out.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.id.localeCompare(b.id));
}

function readStamp(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, STAMP_FILE), "utf8"));
  } catch {
    return null;
  }
}

function fileDigest(fp) {
  try {
    const buf = fs.readFileSync(fp);
    // 轻量校验：长度 + 首尾片段，够用于判断"是否被改过"
    const head = buf.slice(0, 64).toString("utf8");
    const tail = buf.slice(-64).toString("utf8");
    return `${buf.length}:${head.length}:${tail.length}`;
  } catch {
    return null;
  }
}

/**
 * 安装插件自带的模式。
 *
 * 每个模式四种结果：
 *   installed  目标不存在 → 复制
 *   updated    用户没改过，且插件自带内容有变化 → 覆盖为新版
 *   current    用户没改过，内容与插件一致 → 不动（避免每次启动重写）
 *   kept       用户改过（摘要不符） → 保留，不动
 *
 * @param {string} dshHome
 * @returns {Promise<{installed:string[],updated:string[],current:string[],kept:string[],errors:Array}>}
 */
export async function installBundledPresets(dshHome) {
  const result = { installed: [], updated: [], current: [], kept: [], errors: [] };
  const bundled = bundledPresets();
  if (bundled.length === 0) return result;

  const root = path.join(dshHome, ".agent-presets");
  try {
    await fsp.mkdir(root, { recursive: true });
  } catch (e) {
    result.errors.push(["mkdir", String(e)]);
    return result;
  }

  for (const p of bundled) {
    const dest = path.join(root, p.id);
    const destComp = path.join(dest, "agent.cordis.yml");
    try {
      if (!fs.existsSync(destComp)) {
        await fsp.mkdir(dest, { recursive: true });
        await copyPresetFiles(p, dest);
        result.installed.push(p.id);
        continue;
      }

      // 目标已存在：只有确认"用户没改过"才允许覆盖
      const stamp = readStamp(dest);
      const current = fileDigest(destComp);
      if (!stamp || stamp.digest !== current) {
        // 用户改过（或非本插件安装）→ 保留
        result.kept.push(p.id);
        continue;
      }

      // 用户没改过：仅在插件自带内容确实不同时才覆盖
      const same = await sameContent(p.composition, destComp);
      if (same) {
        result.current.push(p.id);
        continue;
      }
      await copyPresetFiles(p, dest);
      result.updated.push(p.id);
    } catch (e) {
      result.errors.push([p.id, String(e)]);
    }
  }
  return result;
}

/** 复制组合文件与元数据，然后写摘要标记。 */
async function copyPresetFiles(p, dest) {
  await fsp.copyFile(p.composition, path.join(dest, "agent.cordis.yml"));
  const metaSrc = path.join(p.dir, "preset.yml");
  if (fs.existsSync(metaSrc)) await fsp.copyFile(metaSrc, path.join(dest, "preset.yml"));
  await writeStamp(dest, p);
}

/** 两个文件内容是否一致。 */
async function sameContent(a, b) {
  try {
    const [bufA, bufB] = await Promise.all([fsp.readFile(a), fsp.readFile(b)]);
    return bufA.equals(bufB);
  } catch {
    return false;
  }
}

async function writeStamp(dest, p) {
  const payload = {
    installedBy: "dsh-breaker",
    presetId: p.id,
    digest: fileDigest(path.join(dest, "agent.cordis.yml")),
    at: new Date().toISOString(),
  };
  await fsp.writeFile(path.join(dest, STAMP_FILE), JSON.stringify(payload, null, 2), "utf8");
}

/** 列出已安装的模式及其来源。 */
export function presetStatus(dshHome) {
  const root = path.join(dshHome, ".agent-presets");
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  const bundledIds = new Set(bundledPresets().map((p) => p.id));
  for (const e of entries) {
    if (!e.isDirectory() || !PRESET_ID.test(e.name)) continue;
    const dir = path.join(root, e.name);
    const comp = path.join(dir, "agent.cordis.yml");
    const stamp = readStamp(dir);
    const exists = fs.existsSync(comp);
    let modified = false;
    if (stamp && exists) modified = stamp.digest !== fileDigest(comp);
    const meta = readMeta(dir);
    out.push({
      id: e.name,
      name: meta.name || e.name,
      description: meta.description || "",
      order: meta.order,
      bundled: bundledIds.has(e.name),
      installed: exists,
      managed: stamp?.installedBy === "dsh-breaker",
      modified,
    });
  }
  return out.sort((a, b) => {
    const byOrder = (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY);
    return byOrder === 0 ? a.id.localeCompare(b.id) : byOrder;
  });
}

/** 读取模式的 preset.yml 元数据。 */
function readMeta(dir) {
  const out = {};
  try {
    const raw = fs.readFileSync(path.join(dir, "preset.yml"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^(name|description|order):\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      if (m[1] === "order") out.order = Number(m[2]);
      else out[m[1]] = m[2].trim();
    }
  } catch {
    /* metadata optional */
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
//  模式 CRUD（供设置页使用）
// ═══════════════════════════════════════════════════════════════════

/** 校验模式 id。 */
export function validPresetId(id) {
  return typeof id === "string" && PRESET_ID.test(id);
}

/** 读取一个模式的完整内容（人格文本 + 元数据）。 */
export function readPreset(dshHome, id) {
  if (!validPresetId(id)) throw new Error(`invalid preset id: ${id}`);
  const dir = path.join(dshHome, ".agent-presets", id);
  const comp = path.join(dir, "agent.cordis.yml");
  if (!fs.existsSync(comp)) return null;
  const raw = fs.readFileSync(comp, "utf8");
  const meta = readMeta(dir);
  return {
    id,
    name: meta.name || id,
    description: meta.description || "",
    order: meta.order,
    persona: extractPersona(raw),
    complete: extractComplete(raw),
    raw,
  };
}

/** 从组合文件中取出 persona.prefix 的正文。 */
function extractPersona(raw) {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "prefix: |-" || l.trim() === "prefix: >-");
  if (start < 0) return "";
  // 收集块标量：缩进深于 prefix 行且不是下一个配置键
  const indentOf = (s) => s.length - s.trimStart().length;
  const base = indentOf(lines[start]);
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === "") { body.push(""); continue; }
    if (indentOf(l) <= base) break;
    body.push(l.slice(base + 2));
  }
  while (body.length && body[body.length - 1] === "") body.pop();
  return body.join("\n");
}

/** 读取 persona.complete。 */
function extractComplete(raw) {
  const m = /^\s*complete:\s*(true|false)\s*$/m.exec(raw);
  return m ? m[1] === "true" : false;
}

/**
 * 把人格文本写回组合文件的 persona.prefix 块，保留其余内容不变。
 * 找不到 prefix 块时抛错，避免写坏文件。
 */
function replacePersona(raw, persona) {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "prefix: |-" || l.trim() === "prefix: >-");
  if (start < 0) throw new Error("组合文件中找不到 persona.prefix 块");
  const indentOf = (s) => s.length - s.trimStart().length;
  const base = indentOf(lines[start]);
  let end = start + 1;
  for (; end < lines.length; end++) {
    const l = lines[end];
    if (l.trim() !== "" && indentOf(l) <= base) break;
  }
  const block = persona.split("\n").map((l) => (l.trim() === "" ? "" : " ".repeat(base + 2) + l));
  return [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join("\n");
}

/**
 * 新建或更新一个模式。
 * @param {string} dshHome
 * @param {string} id
 * @param {{persona:string, name?:string, description?:string, order?:number}} data
 */
export async function savePreset(dshHome, id, data) {
  if (!validPresetId(id)) {
    throw new Error(`模式 id 只能用小写字母、数字和连字符，且以字母或数字开头：${id}`);
  }
  const root = path.join(dshHome, ".agent-presets");
  const dir = path.join(root, id);
  const comp = path.join(dir, "agent.cordis.yml");
  const persona = typeof data.persona === "string" ? data.persona : "";

  await fsp.mkdir(dir, { recursive: true });

  if (fs.existsSync(comp)) {
    // 已存在：只替换 persona，保留用户对组合文件的其他改动
    const raw = await fsp.readFile(comp, "utf8");
    await fsp.writeFile(comp, replacePersona(raw, persona), "utf8");
  } else {
    // 新建：以 standard 为骨架
    const skeleton = skeletonComposition();
    await fsp.writeFile(comp, replacePersona(skeleton, persona), "utf8");
  }

  // 元数据
  const meta = {};
  if (typeof data.name === "string" && data.name.trim()) meta.name = data.name.trim();
  if (typeof data.description === "string" && data.description.trim()) meta.description = data.description.trim();
  if (Number.isFinite(data.order)) meta.order = Number(data.order);
  const metaLines = [];
  if (meta.name) metaLines.push(`name: ${meta.name}`);
  if (meta.description) metaLines.push(`description: ${meta.description}`);
  if (meta.order !== undefined) metaLines.push(`order: ${meta.order}`);
  if (metaLines.length) {
    await fsp.writeFile(path.join(dir, "preset.yml"), metaLines.join("\n") + "\n", "utf8");
  }

  await writeStamp(dir, { id, composition: comp });
  return { id, ...meta };
}

/** 删除一个模式目录。 */
export async function deletePreset(dshHome, id) {
  if (!validPresetId(id)) throw new Error(`invalid preset id: ${id}`);
  const dir = path.join(dshHome, ".agent-presets", id);
  if (!fs.existsSync(dir)) return { deleted: false, id };
  await fsp.rm(dir, { recursive: true, force: true });
  return { deleted: true, id };
}

/** 组合文件骨架：优先用插件自带模式，退回 standard。 */
function skeletonComposition() {
  const bundled = bundledPresets();
  if (bundled.length) return fs.readFileSync(bundled[0].composition, "utf8");
  throw new Error("插件内没有可用的模式骨架");
}
