// DSH-Breaker 插件入口
//
// 职责：
//   1. 工具能力补丁（read 上限、bash 超时、结果不截断、web fetch、subagent 深度）
//   2. AGENTS.md 规范强化（工作区指令升格为强制配置）
//   3. Windows 子进程无闪窗
//   4. 启动自动重洗（npm 升级覆盖 node_modules 后自动重打）
//   5. 模式管理：内置逆向与工程模式，支持新增、编辑、删除
//
// 权限与审批由 Harness 的 /permission 预设管理；项目规范由项目目录的 AGENTS.md 提供。

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as core from "./core.js";
import * as presets from "./presets.js";
import * as cfgStore from "./config.js";

export const name = "dsh-breaker";

export const inject = ["tools"];

const DEFAULTS = {
  enabled: true,
  autoApplyOnStart: true,
  verbose: false,
};

const log = (config, ...args) => {
  if (config?.verbose) console.log("[dsh-breaker]", ...args);
};

/** 补丁分组：设置页按此展示。 */
const PATCH_GROUPS = [
  { key: "cap", ids: [23, 22, 19, 24] },
  { key: "spec", ids: [1, 2, 3] },
];

/** Windows 体验项：不是文件补丁，而是进程级行为。 */
const WINDOWS_ITEMS = [
  { key: "hide", text: "所有子进程隐藏控制台，不再弹出黑框" },
  { key: "bin", text: "启动入口预载隐藏模块，覆盖 Node 24 冻结导入" },
];

/** 职责边界。 */
const SCOPE_OWNED = [
  "工具能力：read 上限、bash 超时、结果不截断、subagent 深度",
  "规范强化：把 AGENTS.md 的工作区指令升格为强制配置",
  "Windows 体验：子进程隐藏控制台与启动入口预载，可分别开关",
  "模式管理：内置逆向与工程模式，支持新增、编辑、删除",
];

const SCOPE_NOT_OWNED = [
  "模式运行时行为：由所选模式的组合文件定义",
  "项目规范内容：由项目目录的 AGENTS.md 提供",
  "权限与审批：由 Harness 的 /permission 预设管理",
  "模型与供应商配置：由 Harness 设置页管理",
];

function line(title, value, ok = null) {
  const mark = ok === null ? "·" : ok ? "✓" : "✗";
  return `${mark} ${title}: ${value}`;
}

function renderStatus(state) {
  const out = [];
  out.push("DSH-Breaker 状态 / Status");
  out.push(line("DSH_HOME", state.dsh_home));
  out.push(line("插件根 / plugin root", state.ai_base || "NOT FOUND (set DSH_BASE)", !!state.ai_base));
  out.push(line("备份 / backup", state.has_backup ? "有 / yes" : "无 / no", state.has_backup));

  const config = cfgStore.loadConfig(state.dsh_home);
  const enabled = cfgStore.enabledPatches(core.ALL_PATCHES, config);

  out.push("");
  out.push(`补丁 / patches: ${state.patches_applied}/${enabled.length} applied, ${state.patches_pending} pending`);
  for (const g of PATCH_GROUPS) {
    out.push(`  ${g.key}:`);
    for (const id of g.ids) {
      const p = core.ALL_PATCHES.find((x) => x.id === id);
      if (!p) continue;
      const on = cfgStore.isEnabled(config, id);
      const s = state.patch_status[id] || "pending";
      const mark = !on ? "○" : s === "applied" ? "✓" : "✗";
      out.push(`    ${mark} ${p.name.padEnd(34)} ${on ? s : "已关闭"}`);
    }
  }
  out.push("  ux:");
  for (const it of WINDOWS_ITEMS) out.push(`    ✓ ${it.text}`);

  out.push("");
  out.push("模式 / presets:");
  try {
    const st = presets.presetStatus(state.dsh_home);
    if (st.length === 0) out.push("  （暂无）");
    for (const p of st) {
      const tag = p.modified ? "已自定义" : p.bundled ? "内置" : "外部";
      out.push(`  · ${p.id.padEnd(16)} ${(p.name || "").padEnd(12)} ${tag}`);
    }
  } catch {
    out.push("  （读取失败）");
  }

  out.push("");
  out.push("职责范围 / owned:");
  for (const s of SCOPE_OWNED) out.push(`  ✓ ${s}`);
  out.push("不负责 / not owned:");
  for (const s of SCOPE_NOT_OWNED) out.push(`  · ${s}`);
  return out.join("\n");
}

// ── 模式安装 ──────────────────────────────────────────────────────

/**
 * 把插件自带的模式安装到 $DSH_HOME/.agent-presets/。
 * 只补缺失；用户改过的模式一律保留，不覆盖。
 */
async function installPresetsOnce(config) {
  try {
    const dshHome = core.findDshHome();
    const r = await presets.installBundledPresets(dshHome);
    if (r.installed.length || r.updated.length || r.kept.length || r.errors.length) {
      log(config, "preset install:", JSON.stringify(r));
    }
    return r;
  } catch (e) {
    console.warn("[dsh-breaker] preset install error:", String(e));
    return { installed: [], updated: [], current: [], kept: [], errors: [[".", String(e)]] };
  }
}

// ── 一次性清理：移除历史遗留的 shim 注入 ──────────────────────────

/**
 * 早期版本会在 dsh.cmd / dsh.ps1 / dsh 里注入 DSH_HOME 设置片段。
 * 本机为标准 npm 安装，DSH_HOME 由环境变量提供，shim 不再需要。
 * 这里做一次幂等清理：有备份就从备份恢复，没备份就剥掉注入块。
 */
async function cleanupShimOnce(config) {
  try {
    const state = await core.gatherState();
    if (!state.shim_dir) return "no_shim_dir";
    const injected = state.shim_ps1 === "patched" || state.shim_bin === "patched" || state.shim_cmd === "patched";
    if (!injected) return "already_clean";
    const result = await core.revertAllShims();
    log(config, "shim cleanup:", JSON.stringify(result));
    return "cleaned";
  } catch (e) {
    console.warn("[dsh-breaker] shim cleanup error:", String(e));
    return `error:${e}`;
  }
}

// ── 自动重洗 ──────────────────────────────────────────────────────

async function autoApply(pluginCfg) {
  try {
    core.applyRuntimeEnv();
    const sanitized = core.sanitizeDesktopCommandRuntimes();
    if (sanitized.length) log(pluginCfg, "desktop runtime sanitized:", JSON.stringify(sanitized));

    const state = await core.gatherState();
    if (!state.ai_base) {
      log(pluginCfg, "skip auto-apply: plugin root not found");
      return "skip:plugin_root_not_found";
    }

    try {
      const flash = core.silenceCmdFlash(state.ai_base);
      if (!flash.ok) log(pluginCfg, "cmd-flash incomplete:", flash.entry);
    } catch (e) {
      log(pluginCfg, "cmd-flash failed:", String(e));
    }

    const userCfg = cfgStore.loadConfig(state.dsh_home);
    const enabled = cfgStore.enabledPatches(core.ALL_PATCHES, userCfg);

    // 清理早期版本遗留的备份文件
    try {
      const cleaned = await core.cleanupLegacyBackups(state.ai_base);
      if (cleaned.removed.length) log(pluginCfg, "legacy backups removed:", cleaned.removed.length);
    } catch {
      /* 清理失败不影响运行 */
    }

    // 只统计启用中的补丁；用户关掉的补丁不参与 pending 判定
    const statuses = await core.patchStatus(state.ai_base, enabled);
    const pending = enabled.filter((p) => statuses[p.id] === "pending");

    if (pending.length === 0) {
      log(pluginCfg, "auto-apply: already clean");
      return "already_clean";
    }
    if (!pluginCfg.autoApplyOnStart) {
      log(pluginCfg, "auto-apply disabled");
      return "disabled";
    }
    const report = await core.applyPatches(state.ai_base, enabled);
    const flash = core.silenceCmdFlash(state.ai_base);
    const applied = report.filter((r) => r.status === "applied").length;
    log(pluginCfg, `auto-apply done: ${applied} applied; ok=${flash.ok}`);
    return flash.ok ? `applied:${applied}` : `applied:${applied}:cmd_flash_incomplete`;
  } catch (e) {
    console.warn("[dsh-breaker] auto-apply error:", String(e));
    return `error:${e}`;
  }
}

// ── 命令处理 ──────────────────────────────────────────────────────

async function handleBreakerCommand(rawInput, config) {
  const args = (rawInput || "").trim().split(/\s+/).filter(Boolean);
  const sub = (args[0] || "status").toLowerCase();

  switch (sub) {
    case "status":
    case "s": {
      const state = await core.gatherState();
      return { kind: "success", text: renderStatus(state) };
    }
    case "apply":
    case "a": {
      core.applyRuntimeEnv();
      const scrubbed = core.sanitizeDesktopCommandRuntimes();
      const state = await core.gatherState();
      if (!state.ai_base) {
        return { kind: "error", text: "插件根未找到 / plugin root NOT FOUND — 请设置 DSH_BASE" };
      }
      const userCfg = cfgStore.loadConfig(state.dsh_home);
      const enabled = cfgStore.enabledPatches(core.ALL_PATCHES, userCfg);
      const report = await core.applyPatches(state.ai_base, enabled);
      const flash = core.silenceCmdFlash(state.ai_base);
      const lines = report.map((r) => {
        const m = r.status === "applied" ? "✓ 已应用" : r.status === "already" ? "- 已是最新" : r.status === "missing_file" ? "⚠ 文件缺失" : `✗ ${r.status}`;
        return `  ${m} ${r.name}`;
      });
      lines.push(`  控制台隐藏: ${flash.ok ? "✓" : "未完成"}`);
      if (scrubbed.length) {
        lines.push("", "Desktop in-bin .bak scrub:");
        for (const row of scrubbed) lines.push(`  ✓ ${row.dir} → ${row.cleaned.join(", ")}`);
      }
      lines.push("", "全部完成。重启 dsh 生效。");
      return { kind: "success", text: lines.join("\n") };
    }
    case "revert":
    case "r": {
      const state = await core.gatherState();
      const lines = [];
      if (state.ai_base) {
        const { reverted, failed } = await core.revertAllByReverse(state.ai_base);
        lines.push(...reverted.map((p) => `  ✓ 已还原 ${p}`));
        for (const [name, e] of failed) lines.push(`  ⚠ ${name}: ${e}`);
        if (reverted.length === 0) lines.push("  - 没有需要还原的改动");
      }
      lines.push("", "还原完成。重启 dsh 后恢复。");
      return { kind: "success", text: lines.join("\n") };
    }
    case "help":
    case "h":
    default:
      return {
        kind: "success",
        text: "DSH-Breaker 命令：\n" +
          "  /breaker status     显示状态、补丁开关与模式列表\n" +
          "  /breaker apply      应用启用中的补丁\n" +
          "  /breaker revert     还原到默认值\n" +
          "  /breaker help       显示帮助\n" +
          "\n图形界面：Harness 设置页 →「能力增强」",
      };
  }
}

// ── 插件 apply ────────────────────────────────────────────────────

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config || {}) };
  if (!cfg.enabled) return;
  log(cfg, "plugin enabled");

  // Windows 体验项按用户开关决定是否装配
  const userCfg = cfgStore.loadConfig(core.findDshHome());
  const wantHide = cfgStore.isWindowsEnabled(userCfg, "hide");
  const wantBin = cfgStore.isWindowsEnabled(userCfg, "bin");

  try {
    if (wantHide) {
      // 进程内拦截：本次运行期间所有子进程隐藏控制台
      const live = core.ensureHiddenConsole();
      log(cfg, "hide-console live:", JSON.stringify(live.live));
    } else {
      log(cfg, "hide-console disabled by config");
    }
    if (wantBin) {
      // 持久化预载：重启后依然生效
      const entry = core.installHideConsoleIntoBin();
      log(cfg, "hide-console entry:", entry);
    } else {
      core.removeHideConsoleFromBin();
      log(cfg, "hide-console entry removed");
    }
  } catch (e) {
    console.warn("[dsh-breaker] hide-console error:", String(e));
  }

  core.applyRuntimeEnv();
  try {
    const scrubbed = core.sanitizeDesktopCommandRuntimes();
    if (scrubbed.length) log(cfg, "desktop runtime scrub on load:", JSON.stringify(scrubbed));
  } catch (e) {
    console.warn("[dsh-breaker] desktop runtime scrub error:", String(e));
  }

  // 启动：安装自带模式 + 清理历史 shim 注入 + 自动重洗补丁（异步，不阻塞启动）
  setImmediate(() => {
    installPresetsOnce(cfg).then((r) => log(cfg, "presets:", JSON.stringify(r)));
    cleanupShimOnce(cfg).then((r) => log(cfg, "shim cleanup:", r));
    autoApply(cfg).then((r) => log(cfg, "auto-apply:", r));
  });

  // /breaker 命令
  const commands = ctx.get?.("commands");
  if (commands) {
    commands.register({
      name: "breaker",
      description: "DSH-Breaker 能力层补丁管理（status/apply/revert/help）",
      input: { hint: "status | apply | revert | help" },
      handler: async (invocation) => handleBreakerCommand(invocation.rawInput ?? "", cfg),
    });
  }

  // 模型工具
  if (ctx.tools) {
    ctx.tools.register({
      name: "breaker_status",
      description: `查看 DSH-Breaker 状态：${core.ALL_PATCHES.length} 个补丁的开关与进度、模式列表、职责范围。`,
      parameters: { type: "object", additionalProperties: false, properties: {} },
      output: {
        schema: { type: "object", additionalProperties: false, properties: { text: { type: "string" } } },
        render: (_args, value) => [{ type: "text", text: String(value?.text ?? "") }],
      },
      async execute() {
        const state = await core.gatherState();
        return { text: renderStatus(state) };
      },
    });
    ctx.tools.register({
      name: "breaker_apply",
      description: `应用 DSH-Breaker 启用中的补丁：read 上限、bash 超时、结果不截断、subagent 深度、AGENTS.md 规范强化。需重启 dsh 完全生效。`,
      parameters: { type: "object", additionalProperties: false, properties: {} },
      output: {
        schema: { type: "object", additionalProperties: false, properties: { text: { type: "string" } } },
        render: (_args, value) => [{ type: "text", text: String(value?.text ?? "") }],
      },
      async execute() {
        core.applyRuntimeEnv();
        const scrubbed = core.sanitizeDesktopCommandRuntimes();
        const state = await core.gatherState();
        if (!state.ai_base) return { text: "ERROR: 插件根未找到，请设置 DSH_BASE" };
        const userCfg = cfgStore.loadConfig(state.dsh_home);
        const enabled = cfgStore.enabledPatches(core.ALL_PATCHES, userCfg);
        const report = await core.applyPatches(state.ai_base, enabled);
        const flash = core.silenceCmdFlash(state.ai_base);
        const applied = report.filter((r) => r.status === "applied").length;
        const already = report.filter((r) => r.status === "already").length;
        const scrubNote = scrubbed.length ? ` desktop_scrub=${scrubbed.length}` : "";
        return { text: `应用完成 / applied=${applied}, already=${already}.${scrubNote} 重启 dsh 生效.` };
      },
    });
    ctx.tools.register({
      name: "breaker_revert",
      description: "还原 DSH-Breaker 的全部改动到默认值（按补丁定义反向替换，不依赖备份）。",
      parameters: { type: "object", additionalProperties: false, properties: {} },
      output: {
        schema: { type: "object", additionalProperties: false, properties: { text: { type: "string" } } },
        render: (_args, value) => [{ type: "text", text: String(value?.text ?? "") }],
      },
      async execute() {
        const state = await core.gatherState();
        let n = 0;
        let failed = 0;
        if (state.ai_base) {
          const r = await core.revertAllByReverse(state.ai_base);
          n = r.reverted.length;
          failed = r.failed.length;
        }
        return { text: `还原完成 / reverted=${n}${failed ? ` failed=${failed}` : ""}. 重启 dsh 恢复.` };
      },
    });
  }

  installWebServer(ctx, cfg);
}

// ── Web UI 设置面板后端 ───────────────────────────────────────────

/** 汇总状态：补丁、开关、模式、职责边界。 */
async function buildStatus() {
  const state = await core.gatherState();
  const userCfg = cfgStore.loadConfig(state.dsh_home);
  const enabled = cfgStore.enabledPatches(core.ALL_PATCHES, userCfg);
  const statuses = state.ai_base ? await core.patchStatus(state.ai_base, core.ALL_PATCHES) : {};

  const patches = [];
  for (const g of PATCH_GROUPS) {
    for (const id of g.ids) {
      const p = core.ALL_PATCHES.find((x) => x.id === id);
      if (!p) continue;
      patches.push({
        id: p.id,
        group: g.key,
        name: p.name,
        enabled: cfgStore.isEnabled(userCfg, id),
        status: statuses[id] || "pending",
        shared: core.sharedPatchIds(p, core.ALL_PATCHES),
      });
    }
  }

  const on = patches.filter((p) => p.enabled);
  return {
    ok: true,
    dsh_home: state.dsh_home,
    ai_base: state.ai_base,
    patches,
    patches_total: patches.length,
    patches_applied: on.filter((p) => p.status === "applied" || p.status === "already").length,
    patches_pending: on.filter((p) => p.status === "pending").length,
    windows: WINDOWS_ITEMS.map((it) => ({
      key: it.key,
      text: it.text,
      enabled: cfgStore.isWindowsEnabled(userCfg, it.key),
    })),
    presets: presets.presetStatus(state.dsh_home),
    scope_owned: SCOPE_OWNED,
    scope_not_owned: SCOPE_NOT_OWNED,
  };
}

function installWebServer(ctx, pluginCfg) {
  ctx.inject(["webServer"], (host) => {
    host.effect(() => {
      const route = (path, label, handler) => {
        host.webServer.register({ kind: "exact", path, handler }, `dsh-breaker: ${label}`);
      };

      route("/dsh-breaker/status", "status", async (request, response) => {
        if (request.method !== "GET") return methodNotAllowed(response, "GET");
        try {
          sendJson(response, 200, await buildStatus());
        } catch (e) {
          sendJson(response, 500, { ok: false, error: String(e) });
        }
      });

      // 切换单个补丁
      route("/dsh-breaker/patch", "patch toggle", async (request, response) => {
        if (request.method !== "POST") return methodNotAllowed(response, "POST");
        try {
          const body = await readJsonBody(request);
          const name = typeof body?.name === "string" ? body.name : "";
          const want = body?.enabled === true;
          const patch = core.ALL_PATCHES.find((p) => p.name === name);
          if (!patch) {
            sendJson(response, 400, { ok: false, error: `未知补丁：${name}` });
            return;
          }
          const state = await core.gatherState();
          if (!state.ai_base) {
            sendJson(response, 500, { ok: false, error: "插件根未找到" });
            return;
          }

          const userCfg = cfgStore.loadConfig(state.dsh_home);
          const next = cfgStore.togglePatch(userCfg, patch.id, want);

          let detail;
          if (want) {
            detail = await core.enablePatch(state.ai_base, patch);
          } else {
            detail = await core.disablePatch(state.ai_base, patch);
          }
          await cfgStore.saveConfig(state.dsh_home, next);
          core.silenceCmdFlash(state.ai_base);

          sendJson(response, 200, {
            ok: true,
            name,
            enabled: want,
            detail,
            restart: true,
            status: await buildStatus(),
          });
        } catch (e) {
          sendJson(response, 500, { ok: false, error: String(e) });
        }
      });

      // 批量应用 / 还原
      route("/dsh-breaker/apply", "apply", async (request, response) => {
        if (request.method !== "POST") return methodNotAllowed(response, "POST");
        try {
          core.applyRuntimeEnv();
          const state = await core.gatherState();
          if (!state.ai_base) {
            sendJson(response, 500, { ok: false, error: "插件根未找到" });
            return;
          }
          const userCfg = cfgStore.loadConfig(state.dsh_home);
          const enabled = cfgStore.enabledPatches(core.ALL_PATCHES, userCfg);
          const report = await core.applyPatches(state.ai_base, enabled);
          const flash = core.silenceCmdFlash(state.ai_base);
          const summary = core.summarizeApplyReport(report, enabled);
          sendJson(response, 200, {
            ok: true,
            complete: summary.failed.length === 0 && flash.ok === true,
            applied: summary.applied,
            already: summary.already,
            failed: summary.failed.length,
            restart: true,
            status: await buildStatus(),
          });
        } catch (e) {
          sendJson(response, 500, { ok: false, error: String(e) });
        }
      });

      route("/dsh-breaker/revert", "revert", async (request, response) => {
        if (request.method !== "POST") return methodNotAllowed(response, "POST");
        try {
          const state = await core.gatherState();
          let reverted = 0;
          let failed = 0;
          if (state.ai_base) {
            const r = await core.revertAllByReverse(state.ai_base);
            reverted = r.reverted.length;
            failed = r.failed.length;
          }
          await cfgStore.saveConfig(state.dsh_home, cfgStore.defaultConfig());
          sendJson(response, 200, { ok: true, reverted, failed, restart: true, status: await buildStatus() });
        } catch (e) {
          sendJson(response, 500, { ok: false, error: String(e) });
        }
      });

      // 切换 Windows 体验项
      route("/dsh-breaker/windows", "windows toggle", async (request, response) => {
        if (request.method !== "POST") return methodNotAllowed(response, "POST");
        try {
          const body = await readJsonBody(request);
          const key = typeof body?.key === "string" ? body.key : "";
          const want = body?.enabled === true;
          if (!cfgStore.WINDOWS_FEATURES.includes(key)) {
            sendJson(response, 400, { ok: false, error: `未知项：${key}` });
            return;
          }
          const state = await core.gatherState();
          const userCfg = cfgStore.loadConfig(state.dsh_home);
          const next = cfgStore.toggleWindows(userCfg, key, want);
          await cfgStore.saveConfig(state.dsh_home, next);

          let detail = "saved";
          if (state.ai_base) {
            if (key === "bin") {
              detail = want ? core.installHideConsoleIntoBin(state.ai_base) : core.removeHideConsoleFromBin(state.ai_base);
            } else if (want) {
              core.ensureHiddenConsole(state.ai_base);
              detail = "enabled";
            }
          }
          sendJson(response, 200, {
            ok: true,
            key,
            enabled: want,
            detail,
            restart: true,
            status: await buildStatus(),
          });
        } catch (e) {
          sendJson(response, 500, { ok: false, error: String(e) });
        }
      });

      // ── 模式 CRUD ──────────────────────────────────────────────

      route("/dsh-breaker/preset/read", "preset read", async (request, response) => {
        if (request.method !== "GET") return methodNotAllowed(response, "GET");
        try {
          const url = new URL(request.url ?? "", "http://localhost");
          const id = url.searchParams.get("id") ?? "";
          const state = await core.gatherState();
          const data = presets.readPreset(state.dsh_home, id);
          if (!data) {
            sendJson(response, 404, { ok: false, error: `模式不存在：${id}` });
            return;
          }
          sendJson(response, 200, { ok: true, preset: data });
        } catch (e) {
          sendJson(response, 400, { ok: false, error: String(e) });
        }
      });

      route("/dsh-breaker/preset/save", "preset save", async (request, response) => {
        if (request.method !== "POST") return methodNotAllowed(response, "POST");
        try {
          const body = await readJsonBody(request);
          const id = typeof body?.id === "string" ? body.id.trim() : "";
          const state = await core.gatherState();
          const r = await presets.savePreset(state.dsh_home, id, {
            persona: typeof body?.persona === "string" ? body.persona : "",
            name: typeof body?.name === "string" ? body.name : undefined,
            description: typeof body?.description === "string" ? body.description : undefined,
            order: Number.isFinite(body?.order) ? Number(body.order) : undefined,
          });
          sendJson(response, 200, { ok: true, preset: r, restart: false, status: await buildStatus() });
        } catch (e) {
          sendJson(response, 400, { ok: false, error: String(e) });
        }
      });

      route("/dsh-breaker/preset/delete", "preset delete", async (request, response) => {
        if (request.method !== "POST") return methodNotAllowed(response, "POST");
        try {
          const body = await readJsonBody(request);
          const id = typeof body?.id === "string" ? body.id.trim() : "";
          const state = await core.gatherState();
          const r = await presets.deletePreset(state.dsh_home, id);
          sendJson(response, 200, { ok: true, ...r, restart: false, status: await buildStatus() });
        } catch (e) {
          sendJson(response, 400, { ok: false, error: String(e) });
        }
      });
    }, "dsh-breaker: http routes");
  });
}

function methodNotAllowed(response, allow) {
  response.writeHead(405, { allow });
  response.end();
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > 2 * 1024 * 1024) throw new Error("请求体过大");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}
