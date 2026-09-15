// DSH-Breaker 配置持久化。
//
// 只存"用户选择"，不存运行时状态。文件缺失或损坏时回落到默认值。
// 路径：$DSH_HOME/.dsh-breaker/config.json

import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

const CONFIG_DIR = ".dsh-breaker";
const CONFIG_FILE = "config.json";

/** 可开关的 Windows 体验项。 */
export const WINDOWS_FEATURES = ["hide", "bin"];

export function configPath(dshHome) {
  return path.join(dshHome, CONFIG_DIR, CONFIG_FILE);
}

/** 默认配置：所有补丁与 Windows 项均启用。 */
export function defaultConfig() {
  return { disabledPatches: [], disabledWindows: [] };
}

function intArray(v) {
  return Array.isArray(v) ? [...new Set(v.filter((n) => Number.isInteger(n)))].sort((a, b) => a - b) : [];
}

function strArray(v, allowed) {
  return Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === "string" && allowed.includes(s)))] : [];
}

/**
 * 读取配置。任何异常都回落默认值，保证插件始终可用。
 * @param {string} dshHome
 */
export function loadConfig(dshHome) {
  try {
    const raw = fs.readFileSync(configPath(dshHome), "utf8");
    const parsed = JSON.parse(raw);
    return {
      disabledPatches: intArray(parsed?.disabledPatches),
      disabledWindows: strArray(parsed?.disabledWindows, WINDOWS_FEATURES),
    };
  } catch {
    return defaultConfig();
  }
}

/** 写入配置。目录不存在时自动创建。 */
export async function saveConfig(dshHome, config) {
  const fp = configPath(dshHome);
  await fsp.mkdir(path.dirname(fp), { recursive: true });
  const payload = {
    disabledPatches: intArray(config.disabledPatches),
    disabledWindows: strArray(config.disabledWindows, WINDOWS_FEATURES),
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

/** 由配置推导出应当启用的补丁列表。 */
export function enabledPatches(allPatches, config) {
  const off = new Set(config.disabledPatches || []);
  return allPatches.filter((p) => !off.has(p.id));
}

/** 某个补丁是否启用。 */
export function isEnabled(config, id) {
  return !(config.disabledPatches || []).includes(id);
}

/** 某个 Windows 项是否启用。 */
export function isWindowsEnabled(config, key) {
  return !(config.disabledWindows || []).includes(key);
}

/** 切换一个补丁的启用状态，返回新配置（不写盘）。 */
export function togglePatch(config, id, enabled) {
  const off = new Set(config.disabledPatches || []);
  if (enabled) off.delete(id);
  else off.add(id);
  return { ...config, disabledPatches: [...off].sort((a, b) => a - b) };
}

/** 切换一个 Windows 项的启用状态，返回新配置（不写盘）。 */
export function toggleWindows(config, key, enabled) {
  if (!WINDOWS_FEATURES.includes(key)) return config;
  const off = new Set(config.disabledWindows || []);
  if (enabled) off.delete(key);
  else off.add(key);
  return { ...config, disabledWindows: [...off] };
}
