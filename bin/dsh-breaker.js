#!/usr/bin/env node
// DSH-Breaker CLI
// 用法:
//   dsh-breaker              # 等价 --status
//   dsh-breaker --status     # 显示状态、补丁开关与模式列表
//   dsh-breaker --apply      # 应用启用中的补丁
//   dsh-breaker --revert     # 还原到默认值
//   dsh-breaker --help       # 帮助

import * as core from "../lib/core.js";
import * as presets from "../lib/presets.js";
import * as cfgStore from "../lib/config.js";

const args = process.argv.slice(2);

const GROUPS = [
  { key: "cap", ids: [23, 22, 19, 24], label: "工具能力" },
  { key: "spec", ids: [1, 2, 3], label: "规范强化" },
];

const WINDOWS_LABELS = {
  hide: "子进程隐藏控制台",
  bin: "启动入口预载隐藏模块",
};

function printStatus(state) {
  const out = [];
  const config = cfgStore.loadConfig(state.dsh_home);
  const enabled = cfgStore.enabledPatches(core.ALL_PATCHES, config);

  out.push("DSH-Breaker 状态 / Status");
  out.push("  DSH_HOME      " + state.dsh_home);
  out.push("  插件根 / root  " + (state.ai_base || "NOT FOUND (set DSH_BASE)"));
  out.push("");
  out.push(`  补丁 ${state.patches_applied}/${enabled.length} 已应用, ${state.patches_pending} 待应用`);
  for (const g of GROUPS) {
    out.push(`  ${g.label}:`);
    for (const id of g.ids) {
      const p = core.ALL_PATCHES.find((x) => x.id === id);
      if (!p) continue;
      const on = cfgStore.isEnabled(config, id);
      const s = state.patch_status[id] || "pending";
      const mark = !on ? "○" : s === "applied" ? "✓" : "✗";
      out.push(`    ${mark} ${p.name.padEnd(34)} ${on ? s : "已关闭"}`);
    }
  }
  out.push("  Windows 体验:");
  for (const key of cfgStore.WINDOWS_FEATURES) {
    const on = cfgStore.isWindowsEnabled(config, key);
    out.push(`    ${on ? "✓" : "○"} ${WINDOWS_LABELS[key] || key}`);
  }

  out.push("");
  out.push("  模式 / presets:");
  try {
    const st = presets.presetStatus(state.dsh_home);
    if (st.length === 0) out.push("    （暂无）");
    for (const p of st) {
      const tag = p.modified ? "已自定义" : p.bundled ? "内置" : "外部";
      out.push(`    · ${p.id.padEnd(16)} ${(p.name || "").padEnd(12)} ${tag}`);
    }
  } catch {
    out.push("    （读取失败）");
  }

  out.push("");
  out.push("  职责范围 / owned:");
  out.push("    ✓ 工具能力：read 上限、bash 超时、结果不截断、subagent 深度");
  out.push("    ✓ 规范强化：把 AGENTS.md 的工作区指令升格为强制配置");
  out.push("    ✓ Windows 体验：所有子进程隐藏控制台");
  out.push("    ✓ 模式管理：内置逆向与工程模式，支持新增、编辑、删除");
  out.push("  不负责 / not owned:");
  out.push("    · 模式运行时行为 → 由所选模式的组合文件定义");
  out.push("    · 项目规范内容   → 项目目录的 AGENTS.md");
  out.push("    · 权限与审批     → Harness 的 /permission 预设");
  out.push("    · 模型与供应商   → Harness 设置页");
  return out.join("\n");
}

async function main() {
  const mode = args.find((a) => ["--apply", "--revert", "--status", "--help"].includes(a));

  if (mode === "--help" || args.includes("-h")) {
    console.log(`DSH-Breaker 用法:
  dsh-breaker --status     显示状态、补丁开关与模式列表
  dsh-breaker --apply      应用启用中的补丁
  dsh-breaker --revert     还原到默认值
  dsh-breaker --help       帮助

图形界面：Harness 设置页 →「能力增强」
重启方式：终端里 Ctrl+C 停止，再重新执行启动命令。`);
    return;
  }

  const state = await core.gatherState();
  console.log(printStatus(state));
  console.log("");

  if (mode === "--apply") {
    if (!state.ai_base) {
      console.log("[ERROR] 未找到插件根，请设置 DSH_BASE");
      process.exit(1);
    }
    const config = cfgStore.loadConfig(state.dsh_home);
    const enabled = cfgStore.enabledPatches(core.ALL_PATCHES, config);
    const report = await core.applyPatches(state.ai_base, enabled);
    for (const r of report) {
      const m = r.status === "applied" ? "✓ 已应用" : r.status === "already" ? "- 已是最新" : r.status === "missing_file" ? "⚠ 不适用" : `✗ ${r.status}`;
      console.log(`  ${m} ${r.name}`);
    }
    const flash = core.silenceCmdFlash(state.ai_base);
    console.log(`  控制台隐藏: ${flash.ok ? "✓" : "未完成"}`);
    console.log("");
    console.log("全部完成。重启 dsh 生效。");
  } else if (mode === "--revert") {
    if (state.ai_base) {
      const { reverted, failed } = await core.revertAllByReverse(state.ai_base);
      for (const p of reverted) console.log(`  ✓ 已还原 ${p}`);
      for (const [name, e] of failed) console.log(`  ⚠ ${name}: ${e}`);
      if (reverted.length === 0) console.log("  - 没有需要还原的改动");
    }
    await cfgStore.saveConfig(state.dsh_home, cfgStore.defaultConfig());
    console.log("");
    console.log("还原完成。重启 dsh 后恢复。");
  } else {
    console.log("默认只显示状态，使用 --apply 应用补丁。");
  }
}

main().catch((e) => {
  console.error("[dsh-breaker] error:", e);
  process.exit(1);
});
