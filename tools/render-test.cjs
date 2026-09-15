// Render smoke test for client.js using a minimal React-like runtime.
// Verifies: renders without crashing, Windows items are real switches, no restart
// button/route remains, and the two stats cards show enabled/total items + presets.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "client.js");

// ---------------------------------------------------------------------------
// minimal React runtime: per-instance hooks, state updates, async re-render
// ---------------------------------------------------------------------------
const PENDING = [];
let currentInst = null;

class Inst {
	constructor(type, props, pathKey) {
		this.type = type;
		this.props = props;
		this.pathKey = pathKey;
		this.hooks = [];
		this.hi = 0;
		this.rendered = null;
		this.effects = [];
	}
	setState(i, next) {
		const h = this.hooks[i];
		const val = typeof next === "function" ? next(h.value) : next;
		if (Object.is(val, h.value)) return;
		h.value = val;
		PENDING.push(this);
	}
}

const react = {
	createElement: (type, props, ...kids) => ({
		type,
		props: props || {},
		children: kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false && k !== true),
	}),
	useState: (init) => {
		const inst = currentInst;
		const i = inst.hi++;
		if (inst.hooks.length <= i) inst.hooks.push({ value: typeof init === "function" ? init() : init });
		return [inst.hooks[i].value, (n) => inst.setState(i, n)];
	},
	useEffect: (fn, deps) => {
		const inst = currentInst;
		const i = inst.hi++;
		const prev = inst.hooks[i];
		const same = prev && prev.deps && deps && prev.deps.length === deps.length && prev.deps.every((d, k) => Object.is(d, deps[k]));
		if (!same) inst.effects.push(fn);
		inst.hooks[i] = { deps };
	},
	useCallback: (fn, deps) => {
		const inst = currentInst;
		const i = inst.hi++;
		const prev = inst.hooks[i];
		const same = prev && prev.deps && deps && prev.deps.length === deps.length && prev.deps.every((d, k) => Object.is(d, deps[k]));
		if (same) return prev.fn;
		inst.hooks[i] = { fn, deps };
		return fn;
	},
	useRef: (init) => {
		const inst = currentInst;
		const i = inst.hi++;
		if (!inst.hooks[i]) inst.hooks[i] = { current: init };
		return inst.hooks[i];
	},
};

const instByKey = new Map();
function renderElement(el, key) {
	if (!el || typeof el !== "object") return el;
	if (typeof el.type === "function") {
		let inst = instByKey.get(key);
		if (!inst) { inst = new Inst(el.type, el.props, key); instByKey.set(key, inst); }
		inst.props = el.props;
		const savedInst = currentInst;
		currentInst = inst;
		inst.hi = 0;
		inst.effects = [];
		const props = Object.assign({}, el.props, { children: el.children });
		inst.rendered = renderElement(inst.type(props), key + "/>");
		currentInst = savedInst;
		return inst.rendered;
	}
	el.children = (el.children || []).map((c, i) => renderElement(c, key + "/" + i));
	return el;
}

let ROOT_EL = null;
let OUT = null;
function renderAll() { OUT = renderElement(ROOT_EL, "root"); }

async function flush() {
	for (let pass = 0; pass < 40; pass++) {
		for (const inst of instByKey.values()) {
			if (inst.effects.length) {
				const fns = inst.effects.slice();
				inst.effects = [];
				for (const fn of fns) fn();
			}
		}
		await new Promise((r) => setImmediate(r));
		await new Promise((r) => setImmediate(r));
		if (!PENDING.length) break;
		PENDING.length = 0;
		renderAll();
	}
}

// ---------------------------------------------------------------------------
// globals the module expects
// ---------------------------------------------------------------------------
let captured = null;
const STATUS = {
	ok: true,
	patches_total: 7,
	patches_applied: 7,
	patches: [
		{ id: 23, name: "READ_CAPS_RAISED", group: "cap", enabled: true, status: "applied" },
		{ id: 22, name: "BASH_TIMEOUT_RAISED", group: "cap", enabled: true, status: "applied" },
		{ id: 19, name: "TOOL_RESULT_PRUNER_DISABLED", group: "cap", enabled: true, status: "applied" },
		{ id: 24, name: "SUBAGENT_MAXDEPTH_RAISED", group: "cap", enabled: true, status: "applied" },
		{ id: 1, name: "WORKSPACE_CONTEXT_INTRO", group: "spec", enabled: true, status: "applied" },
		{ id: 2, name: "REPLACEMENT_WORKSPACE_CONTEXT_INTRO", group: "spec", enabled: true, status: "applied" },
		{ id: 3, name: "SCOPE_INTRO", group: "spec", enabled: true, status: "applied" },
	],
	windows: [
		{ key: "hide", enabled: true, text: "hide console" },
		{ key: "bin", enabled: false, text: "preload at bin" },
	],
	presets: [
		{ id: "reverse", name: "逆向", bundled: true },
		{ id: "engineering", name: "工程", bundled: true },
	],
};

const POSTED = [];
global.window = {
	__ModuleLoader__: { load: (def) => { captured = def; } },
	location: { origin: "http://127.0.0.1:3080" },
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (id) => clearTimeout(id),
	setInterval: (fn, ms) => setInterval(fn, ms),
	clearInterval: (id) => clearInterval(id),
	matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
	confirm: () => true,
};
global.document = {
	body: { hasAttribute: () => false },
	documentElement: { style: {} },
	createElement: () => ({ style: {} }),
};
global.getComputedStyle = () => ({ getPropertyValue: () => "" });
global.MutationObserver = class { observe() {} disconnect() {} };
global.fetch = (url, init) => {
	if (init && init.method === "POST") POSTED.push({ url: String(url), body: init.body });
	return Promise.resolve({
		ok: true, status: 200, statusText: "OK",
		text: () => Promise.resolve(JSON.stringify(STATUS)),
	});
};

// ---------------------------------------------------------------------------
// load module, register section, render
// ---------------------------------------------------------------------------
require(SRC.replace(/\\/g, "/"));
if (!captured) throw new Error("client.js did not call __ModuleLoader__.load");
const mod = captured.factory((n) => (n === "react" ? react : {}));
if (mod.name !== "dsh-breaker") throw new Error("bad module name: " + mod.name);

let SectionRenderer = null;
const t = (k, p) => (p && p.n !== undefined ? k + ":" + p.n : k);
mod.apply({
	effect: (fn) => { if (typeof fn === "function") fn(); },
	locale: { register: () => {}, bind: () => t },
	slots: { inject: (_n, fn) => fn(), register: (def, Comp) => { SectionRenderer = Comp; } },
});
if (!SectionRenderer) throw new Error("no settings.section component registered");

ROOT_EL = { type: SectionRenderer, props: { t }, children: [] };

// ---------------------------------------------------------------------------
// assertions
// ---------------------------------------------------------------------------
function walk(node, out = []) {
	if (node === null || node === undefined || node === false) return out;
	if (typeof node !== "object") { out.push(node); return out; }
	out.push(node);
	if (node.type === "style") return out; // skip CSS blob
	for (const c of node.children || []) walk(c, out);
	return out;
}

const isSwitch = (n) => n.props && n.props.role === "switch";
const stringsOf = (nodes) => nodes.filter((n) => typeof n === "string");

// expand every collapsed group header so all rows render
function expandAll() {
	for (const n of walk(OUT)) {
		if (n.type === "button" && n.props && n.props["aria-expanded"] === "false" && typeof n.props.onClick === "function") {
			n.props.onClick();
		}
	}
}

(async () => {
	renderAll();
	await flush();

	// expand spec + windows groups, then re-collect
	expandAll();
	await flush();

	const nodes = walk(OUT);
	const strings = stringsOf(nodes);
	const problems = [];

	// 1. no restart affordance anywhere
	const restartText = strings.filter((s) => /restart|重启|Ctrl\+C/i.test(s));
	if (restartText.length) problems.push("restart affordance present: " + restartText.join(" | "));

	// 2. no backup stat
	if (strings.some((s) => /backup|备份/i.test(s))) problems.push("backup stat still present");

	// 3. exactly two stats: all items (enabled/total) and preset count
	for (const key of ["metric.total", "metric.presets"]) {
		if (!strings.includes(key)) problems.push("missing stat label " + key);
	}
	if (strings.includes("metric.patches")) problems.push("dropped stat label metric.patches is still rendered");
	const statCards = nodes.filter((n) => n.props && typeof n.props.className === "string" && /^dshp-stat(\s|$)/.test(n.props.className));
	if (statCards.length !== 2) problems.push("expected 2 stat cards, got " + statCards.length);
	// each card pairs a big number (.dshp-stat-n) with a label (.dshp-stat-l)
	const textOf = (node) => walk(node).filter((n) => typeof n === "string").join("");
	const statPairs = statCards.map((c) => {
		const kids = (c.children || []).filter((k) => k && typeof k === "object" && k.props);
		const num = kids.find((k) => /dshp-stat-n/.test(k.props.className || ""));
		const lab = kids.find((k) => /dshp-stat-l/.test(k.props.className || ""));
		return [num ? textOf(num) : "", lab ? textOf(lab) : ""];
	});
	if (!statPairs.some(([v, l]) => v === "8/9" && l === "metric.total")) {
		problems.push("no card showing enabled/total items 8/9: " + JSON.stringify(statPairs));
	}
	if (!statPairs.some(([v, l]) => v === "2" && l === "metric.presets")) {
		problems.push("no card showing the preset count 2: " + JSON.stringify(statPairs));
	}

	// 4. switches exist for the 7 patches + 2 windows
	const switches = nodes.filter(isSwitch);
	if (switches.length !== 9) problems.push("expected 9 switches (7 patches + 2 windows), got " + switches.length);

	// 5. windows group renders its rows with the win.* labels
	const winLabels = strings.filter((s) => s.startsWith("win."));
	if (winLabels.length !== 2) problems.push("expected 2 win.* labels, got " + JSON.stringify(winLabels));

	// 5b. every real patch id must resolve to an i18n label (no missing keys)
	const missing = STATUS.patches.filter((p) => !strings.includes("patch." + p.id));
	if (missing.length) problems.push("missing i18n labels for patch ids: " + missing.map((p) => p.id).join(","));
	// and no label may fall back to the raw patch name
	const rawNames = STATUS.patches.filter((p) => strings.includes(p.name));
	if (rawNames.length) problems.push("patch label fell back to raw name: " + rawNames.map((p) => p.name).join(","));

	// 6. group counts present
	const counts = strings.filter((s) => /^\d+\/\d+$/.test(s));
	if (!counts.includes("4/4")) problems.push("cap group count wrong: " + JSON.stringify(counts));
	if (!counts.includes("3/3")) problems.push("spec group count wrong: " + JSON.stringify(counts));
	if (!counts.includes("1/2")) problems.push("windows group count wrong (1 of 2 on): " + JSON.stringify(counts));

	// 7. no request was fired at a restart route
	if (POSTED.some((p) => /restart/.test(p.url))) problems.push("posted to a restart route");

	// 8. toggling a Windows switch posts to /dsh-breaker/windows
	const binSwitch = switches.find((n) => n.props["aria-label"] === "win.bin");
	if (!binSwitch) problems.push("no switch bound to win.bin");
	else {
		binSwitch.props.onClick();
		await flush();
		const call = POSTED.find((p) => /\/dsh-breaker\/windows$/.test(p.url));
		if (!call) problems.push("toggling a Windows switch did not POST /dsh-breaker/windows");
		else {
			const body = JSON.parse(call.body);
			if (body.key !== "bin" || body.enabled !== true) problems.push("bad windows body: " + call.body);
		}
	}

	console.log("counts:", JSON.stringify(counts), "| switches:", switches.length, "| win labels:", winLabels.length);
	console.log("sample text:", strings.slice(0, 12).join(" / "));
	if (problems.length) {
		console.error("FAIL:\n - " + problems.join("\n - "));
		process.exit(1);
	}
	console.log("render-test OK");
	process.exit(0);
})().catch((e) => { console.error("crash:", e); process.exit(1); });
