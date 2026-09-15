// Verify lib/index.js loads cleanly and its status builder works against the real install.
import * as plugin from "../lib/index.js";

const problems = [];

if (plugin.name !== "dsh-breaker") problems.push("bad name: " + plugin.name);
if (typeof plugin.apply !== "function") problems.push("no apply()");
if (!Array.isArray(plugin.inject)) problems.push("no inject array");

// exercise the same helpers the HTTP routes use
const core = await import("../lib/core.js");
const cfg = await import("../lib/config.js");
const presets = await import("../lib/presets.js");

const state = await core.gatherState();
const userCfg = cfg.loadConfig(state.dsh_home);
const enabled = cfg.enabledPatches(core.ALL_PATCHES, userCfg);
const statuses = await core.patchStatus(state.ai_base, core.ALL_PATCHES);

console.log("plugin name :", plugin.name);
console.log("inject      :", JSON.stringify(plugin.inject));
console.log("dsh_home    :", state.dsh_home);
console.log("ai_base     :", state.ai_base);
console.log("patches     :", enabled.length, "enabled /", core.ALL_PATCHES.length, "total");
console.log("statuses    :", JSON.stringify(statuses));
console.log("windows     :", cfg.WINDOWS_FEATURES.map((k) => k + "=" + cfg.isWindowsEnabled(userCfg, k)).join(" "));
console.log("presets     :", presets.presetStatus(state.dsh_home).map((p) => p.id).join(","));

// every patch must be reversible now that revert is reverse-substitution only
const notReversible = core.ALL_PATCHES.filter((p) => !core.patchIsReversible(p));
if (notReversible.length) problems.push("not reversible: " + notReversible.map((p) => p.id).join(","));

// all enabled patches must actually be applied on disk
const pending = enabled.filter((p) => statuses[p.id] !== "applied" && statuses[p.id] !== "already");
if (pending.length) problems.push("enabled but not applied: " + pending.map((p) => p.id).join(","));

if (problems.length) {
	console.error("FAIL:\n - " + problems.join("\n - "));
	process.exit(1);
}
console.log("plugin-load-test OK");
