// DSH-Breaker settings panel.
window.__ModuleLoader__.load({ id: "dsh-breaker", factory: (require) => {

		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const h = react.createElement;
		const { useState, useEffect, useCallback, useRef } = react;

		const name = "dsh-breaker";
		const inject = ["slots", "locale"];
		const NS = "settings.dsh-breaker";
		let translate = (key) => key;
		function useT() { return translate; }

		function apiUrl(p) {
			try { return new URL(p, window.location.origin).toString(); } catch { return p; }
		}
		async function apiJson(p, init) {
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), 20000);
			try {
				const r = await fetch(apiUrl(p), Object.assign({ cache: "no-store", credentials: "same-origin", signal: ctrl.signal }, init || {}));
				const text = await r.text();
				let data;
				try { data = text ? JSON.parse(text) : null; } catch {
					throw new Error(r.status + " non-json: " + text.slice(0, 120));
				}
				if (!r.ok) throw new Error((data && (data.error || data.message)) || (r.status + " " + r.statusText));
				return data;
			} finally { clearTimeout(timer); }
		}
		async function apiPost(path, body) {
			return apiJson(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body || {}),
			});
		}

		const GROUP_ICON = { cap: "⚡", spec: "📐", ux: "🪟" };

		const zh = {
			nav: "能力增强",
			"brand.sub": "工具能力 · 规范强化 · 模式管理",
			"metric.presets": "模式数",
			"metric.total": "全部项",
			"btn.apply": "全部应用",
			"btn.revert": "全部还原",
			"btn.new": "新建模式",
			"btn.save": "保存",
			"btn.cancel": "取消",
			"btn.delete": "删除",
			"btn.edit": "编辑",
			"group.cap": "工具能力",
			"group.spec": "规范强化",
			"group.ux": "Windows 体验",
			"group.preset": "模式",
			"patch.1": "AGENTS.md 包装：参考建议 → 强制配置",
			"patch.2": "替换式基线文案同步升格",
			"patch.3": "作用域声明升格（嵌套 AGENTS.md）",
			"patch.19": "工具结果不截断（取消 8KB 修剪）",
			"patch.22": "bash 超时 60 秒 → 600 秒",
			"patch.23": "read 上限：1e4 字符 / 1MB / 2e4 行",
			"patch.24": "subagent 嵌套深度 3 → 10",
			"win.hide": "所有子进程隐藏控制台，不再弹出黑框",
			"win.bin": "启动入口预载隐藏模块，重启后仍生效",
			"status.applied": "已应用",
			"status.pending": "待重启",
			"status.skip": "不适用",
			"status.off": "已关闭",
			"preset.hint": "新开对话时在顶部下拉选择。已开始的会话不能换模式。",
			"preset.bundled": "内置",
			"preset.modified": "已自定义",
			"preset.external": "外部",
			"preset.empty": "暂无模式",
			"preset.newTitle": "新建模式",
			"preset.editTitle": "编辑模式",
			"field.id": "标识（小写字母、数字、连字符）",
			"field.name": "显示名称",
			"field.desc": "描述",
			"field.order": "排序（数字，越小越靠前）",
			"field.persona": "人格与规则（系统提示词正文）",
			"preset.deleteConfirm": "删除模式 {id}？此操作不可撤销。",
			"preset.idTaken": "标识已存在，请换一个",
			"preset.needId": "请填写标识",
			"preset.saved": "模式已保存",
			"preset.deleted": "模式已删除",
			"scope.title": "职责边界",
			"scope.owned": "本插件负责",
			"scope.notowned": "不负责",
			"notice.applied": "已应用 {n} 项",
			"notice.reverted": "已还原 {n} 个文件",
			"notice.restart": "改动需重启 dsh 才生效",
			"notice.restartHint": "在终端里 Ctrl+C 停止，再重新执行启动命令。",
			"notice.toggled": "已{state}",
			"notice.on": "启用",
			"notice.off": "关闭",
			"err.load": "读取状态失败：{error}",
			"err.action": "操作失败：{error}",
		};

		const en = {
			nav: "Capabilities",
			"brand.sub": "Tool capacity · Instruction strength · Presets",
			"metric.presets": "Presets",
			"metric.total": "All items",
			"btn.apply": "Apply all",
			"btn.revert": "Revert all",
			"btn.new": "New preset",
			"btn.save": "Save",
			"btn.cancel": "Cancel",
			"btn.delete": "Delete",
			"btn.edit": "Edit",
			"group.cap": "Tool capacity",
			"group.spec": "Instruction strength",
			"group.ux": "Windows UX",
			"group.preset": "Presets",
			"patch.1": "AGENTS.md wrapper: guidance → mandate",
			"patch.2": "Replacement baseline promoted",
			"patch.3": "Scope declaration promoted (nested AGENTS.md)",
			"patch.19": "Tool results not truncated (8KB pruner off)",
			"patch.22": "bash timeout 60s → 600s",
			"patch.23": "read caps: 1e4 chars / 1MB / 2e4 lines",
			"patch.24": "subagent depth 3 → 10",
			"win.hide": "Hide every child-process console",
			"win.bin": "Preload the hiding module at launch entry",
			"status.applied": "Applied",
			"status.pending": "Restart needed",
			"status.skip": "N/A",
			"status.off": "Off",
			"preset.hint": "Pick one from the dropdown at the top of a new chat. A started session cannot switch.",
			"preset.bundled": "Bundled",
			"preset.modified": "Customized",
			"preset.external": "External",
			"preset.empty": "No presets",
			"preset.newTitle": "New preset",
			"preset.editTitle": "Edit preset",
			"field.id": "ID (lowercase letters, digits, hyphens)",
			"field.name": "Display name",
			"field.desc": "Description",
			"field.order": "Order (lower first)",
			"field.persona": "Persona & rules (system prompt body)",
			"preset.deleteConfirm": "Delete preset {id}? This cannot be undone.",
			"preset.idTaken": "ID already exists",
			"preset.needId": "ID is required",
			"preset.saved": "Preset saved",
			"preset.deleted": "Preset deleted",
			"scope.title": "Scope",
			"scope.owned": "Owned",
			"scope.notowned": "Not owned",
			"notice.applied": "Applied {n}",
			"notice.reverted": "Reverted {n} file(s)",
			"notice.restart": "Restart dsh for changes to take effect",
			"notice.restartHint": "Press Ctrl+C in the terminal, then run the launch command again.",
			"notice.toggled": "{state}",
			"notice.on": "Enabled",
			"notice.off": "Disabled",
			"err.load": "Failed to load: {error}",
			"err.action": "Action failed: {error}",
		};

		const CSS = `
.dshp{--r:14px;--r-sm:9px;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  --mono:ui-monospace,"SF Mono","Cascadia Code","JetBrains Mono",Consolas,monospace;
  font-family:var(--font);color:var(--ink);max-width:940px;margin:0 auto;padding:4px;-webkit-font-smoothing:antialiased}
.dshp[data-t="light"]{--bg:#f6f6f7;--card:#fff;--card2:#fafafa;--line:#e7e7ea;--line2:#f1f1f3;--ink:#18181b;--ink2:#52525b;--ink3:#a1a1aa;--accent:#2563eb;--accent-soft:#eff6ff;--accent-line:#bfdbfe;--ok:#059669;--ok-soft:#ecfdf5;--ok-line:#a7f3d0;--warn:#b45309;--warn-soft:#fffbeb;--warn-line:#fde68a;--err:#dc2626;--err-soft:#fef2f2;--err-line:#fecaca;--shadow:0 1px 2px rgba(0,0,0,.04),0 4px 16px -4px rgba(0,0,0,.06);color-scheme:light}
.dshp[data-t="dark"]{--bg:#0d0d0f;--card:#17171a;--card2:#1c1c20;--line:#27272b;--line2:#212125;--ink:#f4f4f5;--ink2:#a1a1aa;--ink3:#71717a;--accent:#60a5fa;--accent-soft:#1a2332;--accent-line:#1e3a5f;--ok:#34d399;--ok-soft:#0a2a20;--ok-line:#115e46;--warn:#fbbf24;--warn-soft:#2a1f08;--warn-line:#5c4310;--err:#f87171;--err-soft:#2a1214;--err-line:#5c2124;--shadow:0 1px 2px rgba(0,0,0,.3),0 4px 16px -4px rgba(0,0,0,.5);color-scheme:dark}
.dshp-wrap{background:var(--bg);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:14px}
.dshp-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.dshp-head-l{display:flex;align-items:center;gap:12px;min-width:0}
.dshp-mark{width:40px;height:40px;flex:0 0 40px;border-radius:11px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font:700 14px/1 var(--mono);letter-spacing:-.5px;box-shadow:var(--shadow)}
.dshp-h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.dshp-tagline{margin:2px 0 0;font-size:12px;color:var(--ink3);line-height:1.4}
.dshp-head-r{display:flex;gap:8px;flex:0 0 auto}
.dshp-btn{appearance:none;font:500 13px/1 var(--font);height:34px;padding:0 15px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;transition:background .14s,border-color .14s,transform .08s;white-space:nowrap}
.dshp-btn:hover:not(:disabled){background:var(--card2);border-color:var(--ink3)}
.dshp-btn:active:not(:disabled){transform:scale(.98)}
.dshp-btn:disabled{opacity:.45;cursor:not-allowed}
.dshp-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.dshp-btn-p{background:var(--accent);border-color:var(--accent);color:#fff}
.dshp-btn-p:hover:not(:disabled){filter:brightness(1.08);background:var(--accent);border-color:var(--accent)}
.dshp-btn-d{color:var(--err);border-color:var(--err-line)}
.dshp-btn-d:hover:not(:disabled){background:var(--err-soft);border-color:var(--err)}
.dshp-btn-sm{height:29px;padding:0 11px;font-size:12px}
.dshp-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.dshp-stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;box-shadow:var(--shadow)}
.dshp-stat-n{font:600 24px/1.1 var(--font);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.dshp-stat-n small{font-size:14px;font-weight:500;color:var(--ink3);margin-left:2px}
.dshp-stat-l{margin-top:5px;font-size:11.5px;color:var(--ink3)}
.dshp-stat.is-ok .dshp-stat-n{color:var(--ok)}
.dshp-stat.is-warn .dshp-stat-n{color:var(--warn)}
.dshp-prog{height:4px;background:var(--line2);border-radius:99px;overflow:hidden}
.dshp-prog>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),#8b5cf6);transition:width .5s cubic-bezier(.16,1,.3,1)}
.dshp-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.dshp-card-h{display:flex;align-items:center;gap:9px;padding:13px 16px;border-bottom:1px solid var(--line2)}
.dshp-card-h h3{margin:0;font-size:13.5px;font-weight:600}
.dshp-card-h .dshp-hint{margin-left:auto;font-size:11.5px;color:var(--ink3)}
.dshp-row{display:flex;align-items:center;gap:11px;padding:11px 16px;border-bottom:1px solid var(--line2)}
.dshp-row:last-child{border-bottom:0}
.dshp-row.is-btn{cursor:pointer;user-select:none;width:100%;text-align:left;font:inherit;color:inherit;background:none;border-left:0;border-right:0;border-top:0}
.dshp-row.is-btn:hover{background:var(--card2)}
.dshp-row.is-btn:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.dshp-ico{width:22px;flex:0 0 22px;text-align:center;font-size:13px;opacity:.75}
.dshp-row-t{flex:1;min-width:0;font-size:13px;font-weight:500}
.dshp-row-c{font:500 11.5px/1 var(--mono);color:var(--ink3);font-variant-numeric:tabular-nums;flex:0 0 auto}
.dshp-chev{width:12px;flex:0 0 12px;text-align:center;color:var(--ink3);font-size:9px;transition:transform .18s}
.dshp-chev.is-open{transform:rotate(90deg)}
.dshp-list{padding:3px 0 6px;background:var(--card2)}
.dshp-item{display:flex;align-items:center;gap:11px;padding:9px 16px;font-size:12.5px;line-height:1.5}
.dshp-item:hover{background:var(--card)}
.dshp-item-t{flex:1;min-width:0;color:var(--ink2)}
.dshp-item.is-off .dshp-item-t{color:var(--ink3);text-decoration:line-through;text-decoration-color:var(--line)}
.dshp-pill{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;font:500 11px/1 var(--font);padding:4px 9px;border-radius:99px;border:1px solid;white-space:nowrap}
.dshp-pill::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor;flex:0 0 5px}
.dshp-pill.is-ok{color:var(--ok);background:var(--ok-soft);border-color:var(--ok-line)}
.dshp-pill.is-wait{color:var(--warn);background:var(--warn-soft);border-color:var(--warn-line)}
.dshp-pill.is-err{color:var(--err);background:var(--err-soft);border-color:var(--err-line)}
.dshp-pill.is-mute{color:var(--ink3);background:var(--card);border-color:var(--line)}
/* switch */
.dshp-sw{position:relative;flex:0 0 38px;width:38px;height:22px;border-radius:99px;border:1px solid var(--line);background:var(--line2);cursor:pointer;padding:0;transition:background .18s,border-color .18s}
.dshp-sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .18s cubic-bezier(.16,1,.3,1)}
.dshp-sw.is-on{background:var(--accent);border-color:var(--accent)}
.dshp-sw.is-on::after{transform:translateX(16px);background:#fff}
.dshp-sw:disabled{opacity:.4;cursor:not-allowed}
.dshp-sw:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.dshp-scope{display:grid;grid-template-columns:1fr 1fr}
.dshp-scope-col{padding:13px 16px}
.dshp-scope-col+.dshp-scope-col{border-left:1px solid var(--line2)}
.dshp-scope-h{font:600 11px/1 var(--font);letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);margin:0 0 10px}
.dshp-scope-i{display:flex;gap:8px;font-size:12.5px;line-height:1.55;color:var(--ink2);padding:3px 0}
.dshp-scope-i b{flex:0 0 12px;font-weight:600}
.dshp-scope-col.yes .dshp-scope-i b{color:var(--ok)}
.dshp-scope-col.no .dshp-scope-i b{color:var(--ink3)}
.dshp-note{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:var(--r-sm);border:1px solid;font-size:12.5px;line-height:1.5}
.dshp-note.is-ok{color:var(--ok);background:var(--ok-soft);border-color:var(--ok-line)}
.dshp-note.is-err{color:var(--err);background:var(--err-soft);border-color:var(--err-line)}
.dshp-note.is-info{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.dshp-note .dshp-btn{margin-left:auto}
/* form */
.dshp-form{padding:14px 16px;display:flex;flex-direction:column;gap:11px;background:var(--card2)}
.dshp-field{display:flex;flex-direction:column;gap:5px}
.dshp-field label{font-size:11.5px;font-weight:500;color:var(--ink2)}
.dshp-in,.dshp-ta{width:100%;box-sizing:border-box;font:13px/1.55 var(--font);padding:8px 10px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:var(--r-sm)}
.dshp-in:focus,.dshp-ta:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.dshp-in:disabled{opacity:.5}
.dshp-ta{min-height:280px;resize:vertical;font-family:var(--mono);font-size:12.5px}
.dshp-form-row{display:flex;gap:10px}
.dshp-form-row .dshp-field{flex:1}
.dshp-form-actions{display:flex;gap:8px;justify-content:flex-end;padding-top:2px}
.dshp-sk{background:linear-gradient(90deg,var(--line2) 25%,var(--line) 50%,var(--line2) 75%);background-size:200% 100%;animation:dshp-pulse 1.4s ease-in-out infinite;border-radius:var(--r-sm)}
@keyframes dshp-pulse{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (max-width:660px){
  .dshp-stats{grid-template-columns:1fr}
  .dshp-scope{grid-template-columns:1fr}
  .dshp-scope-col+.dshp-scope-col{border-left:0;border-top:1px solid var(--line2)}
  .dshp-head-r{width:100%}
  .dshp-head-r .dshp-btn{flex:1}
  .dshp-form-row{flex-direction:column}
}
@media (prefers-reduced-motion:reduce){.dshp-btn,.dshp-prog>i,.dshp-chev,.dshp-sw,.dshp-sw::after{transition:none}.dshp-sk{animation:none}}
`;

		function statusKind(p, t) {
			if (!p.enabled) return { k: "mute", v: t("status.off") };
			if (p.status === "applied" || p.status === "already") return { k: "ok", v: t("status.applied") };
			if (p.status === "missing_file" || p.status === "skipped") return { k: "mute", v: t("status.skip") };
			return { k: "wait", v: t("status.pending") };
		}

		function Btn({ variant, small, children, ...rest }) {
			const cls = ["dshp-btn", variant ? "dshp-btn-" + variant : "", small ? "dshp-btn-sm" : ""].filter(Boolean).join(" ");
			return h("button", Object.assign({ type: "button", className: cls }, rest), children);
		}

		function Switch({ on, disabled, onToggle, label }) {
			return h("button", {
				type: "button",
				className: "dshp-sw" + (on ? " is-on" : ""),
				role: "switch",
				"aria-checked": on ? "true" : "false",
				"aria-label": label,
				disabled,
				onClick: onToggle,
			});
		}

		function Pill({ kind, children }) {
			return h("span", { className: "dshp-pill is-" + kind }, children);
		}

		function Stat({ value, label, tone, title }) {
			return h("div", { className: "dshp-stat" + (tone ? " is-" + tone : ""), title: title || undefined },
				h("div", { className: "dshp-stat-n" }, String(value)),
				h("div", { className: "dshp-stat-l" }, label),
			);
		}

		function Group({ icon, title, count, open, onToggle, children }) {
			return h("div", null,
				h("button", {
					type: "button",
					className: "dshp-row is-btn",
					"aria-expanded": open ? "true" : "false",
					onClick: onToggle,
				},
					h("span", { className: "dshp-ico" }, icon),
					h("span", { className: "dshp-row-t" }, title),
					count != null ? h("span", { className: "dshp-row-c" }, count) : null,
					h("span", { className: "dshp-chev" + (open ? " is-open" : "") }, "▶"),
				),
				open ? h("div", { className: "dshp-list" }, children) : null,
			);
		}

		function PatchRow({ p, t, busy, onToggle }) {
			const st = statusKind(p, t);
			const label = t("patch." + p.id);
			return h("div", { className: "dshp-item" + (p.enabled ? "" : " is-off") },
				h("span", { className: "dshp-item-t" }, label || p.name),
				h(Pill, { kind: st.k }, st.v),
				h(Switch, { on: p.enabled, disabled: busy, onToggle: () => onToggle(p), label }),
			);
		}

		function PatchPanel({ status, t, busy, onToggle, onToggleWindows }) {
			const [open, setOpen] = useState({ cap: true, spec: false, ux: false });
			const toggle = (k) => setOpen((p) => Object.assign({}, p, { [k]: !p[k] }));
			if (!status || !status.patches) {
				return h("div", { className: "dshp-card" }, h("div", { style: { padding: 16 } }, h("div", { className: "dshp-sk", style: { height: 120 } })));
			}
			const groups = ["cap", "spec"].map((key) => {
				const items = status.patches.filter((p) => p.group === key);
				const on = items.filter((p) => p.enabled).length;
				return { key, items, on };
			});
			const wins = status.windows || [];
			const winOn = wins.filter((w) => w.enabled).length;
			return h("div", { className: "dshp-card" },
				groups.map(({ key, items, on }) =>
					h(Group, {
						key,
						icon: GROUP_ICON[key],
						title: t("group." + key),
						count: on + "/" + items.length,
						open: !!open[key],
						onToggle: () => toggle(key),
					}, items.map((p) => h(PatchRow, { key: p.name, p, t, busy, onToggle }))),
				),
				h(Group, {
					icon: GROUP_ICON.ux,
					title: t("group.ux"),
					count: winOn + "/" + wins.length,
					open: !!open.ux,
					onToggle: () => toggle("ux"),
				}, wins.map((w) => {
					const label = t("win." + w.key);
					return h("div", { key: w.key, className: "dshp-item" + (w.enabled ? "" : " is-off") },
						h("span", { className: "dshp-item-t" }, label),
						h(Pill, { kind: w.enabled ? "ok" : "mute" }, w.enabled ? t("status.applied") : t("status.off")),
						h(Switch, { on: w.enabled, disabled: busy, onToggle: () => onToggleWindows(w), label }),
					);
				})),
			);
		}

		function PresetPanel({ status, t, busy, onEdit, onNew, onDelete }) {
			const list = (status && status.presets) || [];
			const [open, setOpen] = useState(true);
			const tagOf = (p) => {
				if (p.modified) return { k: "wait", v: t("preset.modified") };
				if (p.bundled) return { k: "ok", v: t("preset.bundled") };
				return { k: "mute", v: t("preset.external") };
			};
			return h("div", { className: "dshp-card" },
				h("div", { className: "dshp-row" },
					h("button", {
						type: "button",
						className: "dshp-row is-btn",
						style: { padding: 0, border: 0, flex: 1 },
						"aria-expanded": open ? "true" : "false",
						onClick: () => setOpen((v) => !v),
					},
						h("span", { className: "dshp-ico" }, "🧩"),
						h("span", { className: "dshp-row-t" }, t("group.preset")),
						h("span", { className: "dshp-row-c" }, String(list.length)),
						h("span", { className: "dshp-chev" + (open ? " is-open" : "") }, "▶"),
					),
					h(Btn, { variant: "p", small: true, disabled: busy, onClick: onNew }, t("btn.new")),
				),
				open ? h("div", { className: "dshp-list" },
					h("div", { style: { padding: "10px 16px 4px" } },
						h("p", { style: { margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--ink3)" } }, t("preset.hint")),
					),
					list.length === 0
						? h("div", { className: "dshp-item" }, h("span", { className: "dshp-item-t" }, t("preset.empty")))
						: list.map((p) => {
							const tag = tagOf(p);
							return h("div", { key: p.id, className: "dshp-item" },
								h("span", { className: "dshp-item-t" },
									h("b", { style: { fontWeight: 600, color: "var(--ink)" } }, p.name || p.id),
									h("span", { style: { marginLeft: 8, fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink3)" } }, p.id),
								),
								h(Pill, { kind: tag.k }, tag.v),
								h(Btn, { small: true, disabled: busy, onClick: () => onEdit(p.id) }, t("btn.edit")),
								h(Btn, { variant: "d", small: true, disabled: busy, onClick: () => onDelete(p) }, t("btn.delete")),
							);
						}),
				) : null,
			);
		}

		function PresetEditor({ draft, setDraft, t, busy, onSave, onCancel, isNew }) {
			const set = (k) => (e) => setDraft(Object.assign({}, draft, { [k]: e.target.value }));
			return h("div", { className: "dshp-card" },
				h("div", { className: "dshp-card-h" }, h("h3", null, isNew ? t("preset.newTitle") : t("preset.editTitle"))),
				h("div", { className: "dshp-form" },
					h("div", { className: "dshp-form-row" },
						h("div", { className: "dshp-field" },
							h("label", null, t("field.id")),
							h("input", { className: "dshp-in", value: draft.id || "", disabled: !isNew, onChange: set("id"), placeholder: "my-mode" }),
						),
						h("div", { className: "dshp-field" },
							h("label", null, t("field.name")),
							h("input", { className: "dshp-in", value: draft.name || "", onChange: set("name") }),
						),
						h("div", { className: "dshp-field", style: { flex: "0 0 90px" } },
							h("label", null, t("field.order")),
							h("input", { className: "dshp-in", type: "number", value: draft.order ?? "", onChange: set("order") }),
						),
					),
					h("div", { className: "dshp-field" },
						h("label", null, t("field.desc")),
						h("input", { className: "dshp-in", value: draft.description || "", onChange: set("description") }),
					),
					h("div", { className: "dshp-field" },
						h("label", null, t("field.persona")),
						h("textarea", { className: "dshp-ta", value: draft.persona || "", onChange: set("persona"), spellCheck: false }),
					),
					h("div", { className: "dshp-form-actions" },
						h(Btn, { disabled: busy, onClick: onCancel }, t("btn.cancel")),
						h(Btn, { variant: "p", disabled: busy, onClick: onSave }, t("btn.save")),
					),
				),
			);
		}

		function ScopePanel({ status, t }) {
			const yes = (status && status.scope_owned) || [];
			const no = (status && status.scope_not_owned) || [];
			return h("div", { className: "dshp-card" },
				h("div", { className: "dshp-card-h" }, h("h3", null, t("scope.title"))),
				h("div", { className: "dshp-scope" },
					h("div", { className: "dshp-scope-col yes" },
						h("p", { className: "dshp-scope-h" }, t("scope.owned")),
						yes.map((s, i) => h("div", { key: i, className: "dshp-scope-i" }, h("b", null, "✓"), h("span", null, s))),
					),
					h("div", { className: "dshp-scope-col no" },
						h("p", { className: "dshp-scope-h" }, t("scope.notowned")),
						no.map((s, i) => h("div", { key: i, className: "dshp-scope-i" }, h("b", null, "·"), h("span", null, s))),
					),
				),
			);
		}

		function MainPanel() {
			const t = useT();
			const tRef = useRef(t);
			tRef.current = t;
			const [status, setStatus] = useState(null);
			const [busy, setBusy] = useState(false);
			const [notice, setNotice] = useState(null);
			const [needRestart, setNeedRestart] = useState(false);
			const [draft, setDraft] = useState(null);
			const [isNew, setIsNew] = useState(false);

			const load = useCallback(() => {
				const tr = tRef.current;
				apiJson("/dsh-breaker/status")
					.then((d) => { if (d && d.ok) setStatus(d); else setNotice({ kind: "err", text: tr("err.load", { error: (d && d.error) || "bad response" }) }); })
					.catch((e) => setNotice({ kind: "err", text: tr("err.load", { error: e.message }) }));
			}, []);

			useEffect(() => { load(); }, [load]);

			const run = useCallback((fn, okMsg, restart) => {
				setBusy(true);
				setNotice(null);
				Promise.resolve()
					.then(fn)
					.then((d) => {
						if (d && d.ok === false) throw new Error(d.error || "failed");
						if (d && d.status) setStatus(d.status);
						if (okMsg) setNotice({ kind: "ok", text: okMsg });
						if (restart) setNeedRestart(true);
						setBusy(false);
					})
					.catch((e) => {
						setNotice({ kind: "err", text: tRef.current("err.action", { error: e.message }) });
						setBusy(false);
					});
			}, []);

			const togglePatch = useCallback((p) => {
				const tr = tRef.current;
				const want = !p.enabled;
				const msg = tr("notice.toggled", { state: want ? tr("notice.on") : tr("notice.off") });
				run(() => apiPost("/dsh-breaker/patch", { name: p.name, enabled: want }), msg, true);
			}, [run]);

			const applyAll = useCallback(() => {
				const tr = tRef.current;
				const n = (status && status.patches_applied) || 0;
				run(() => apiPost("/dsh-breaker/apply", {}), tr("notice.applied", { n }), true);
			}, [run, status]);

			const revertAll = useCallback(() => {
				const tr = tRef.current;
				run(() => apiPost("/dsh-breaker/revert", {}), tr("notice.reverted", { n: "" }), true);
			}, [run]);

			const toggleWindows = useCallback((w) => {
				const tr = tRef.current;
				const want = !w.enabled;
				const msg = tr("notice.toggled", { state: want ? tr("notice.on") : tr("notice.off") });
				run(() => apiPost("/dsh-breaker/windows", { key: w.key, enabled: want }), msg, true);
			}, [run]);

			const openNew = useCallback(() => {
				setIsNew(true);
				setDraft({ id: "", name: "", description: "", order: 20, persona: "" });
			}, []);

			const openEdit = useCallback((id) => {
				const tr = tRef.current;
				setBusy(true);
				apiJson("/dsh-breaker/preset/read?id=" + encodeURIComponent(id))
					.then((d) => {
						if (d && d.ok) { setDraft(Object.assign({}, d.preset)); setIsNew(false); }
						else setNotice({ kind: "err", text: tr("err.action", { error: (d && d.error) || "" }) });
						setBusy(false);
					})
					.catch((e) => { setNotice({ kind: "err", text: tr("err.action", { error: e.message }) }); setBusy(false); });
			}, []);

			const savePreset = useCallback(() => {
				const tr = tRef.current;
				if (!draft || !String(draft.id || "").trim()) { setNotice({ kind: "err", text: tr("preset.needId") }); return; }
				const id = String(draft.id).trim();
				// 新建时不允许覆盖已存在的模式：先编辑再改，避免误清空人格
				const exists = ((status && status.presets) || []).some((p) => p.id === id);
				if (isNew && exists) { setNotice({ kind: "err", text: tr("preset.idTaken") }); return; }
				const order = Number(draft.order);
				setBusy(true);
				setNotice(null);
				apiPost("/dsh-breaker/preset/save", {
					id,
					name: draft.name,
					description: draft.description,
					order: Number.isFinite(order) ? order : undefined,
					persona: draft.persona,
				})
					.then((d) => {
						if (d && d.ok === false) throw new Error(d.error || "failed");
						if (d && d.status) setStatus(d.status);
						setNotice({ kind: "ok", text: tr("preset.saved") });
						setDraft(null);
						setBusy(false);
					})
					.catch((e) => {
						setNotice({ kind: "err", text: tRef.current("err.action", { error: e.message }) });
						setBusy(false);
					});
			}, [draft, isNew, status]);

			const deletePreset = useCallback((p) => {
				const tr = tRef.current;
				if (!window.confirm(tr("preset.deleteConfirm", { id: p.id }))) return;
				run(() => apiPost("/dsh-breaker/preset/delete", { id: p.id }), tr("preset.deleted"), false);
			}, [run]);

			// 统计卡只保留两张：全部项的开启数/总数、模式数量
			const total = (status && status.patches_total) || 0;
			const applied = (status && status.patches_applied) || 0;
			const winTotal = (status && status.windows && status.windows.length) || 0;
			const winOn = (status && status.windows && status.windows.filter((w) => w.enabled).length) || 0;
			// 全部项 = 补丁 + Windows 项；开启数按「已启用且已落盘」计入
			const all = total + winTotal;
			const allOn = applied + winOn;
			const pct = all ? Math.round((allOn / all) * 100) : 0;
			const presetCount = (status && status.presets && status.presets.length) || 0;

			return h("div", { className: "dshp-wrap" },
				h("header", { className: "dshp-head" },
					h("div", { className: "dshp-head-l" },
						h("div", { className: "dshp-mark" }, "DB"),
						h("div", null,
							h("h2", { className: "dshp-h2" }, "DSH-Breaker"),
							h("p", { className: "dshp-tagline" }, t("brand.sub")),
						),
					),
					h("div", { className: "dshp-head-r" },
						h(Btn, { variant: "p", disabled: busy || !status, onClick: applyAll }, t("btn.apply")),
						h(Btn, { variant: "d", disabled: busy || !status, onClick: revertAll }, t("btn.revert")),
					),
				),

				h("div", { className: "dshp-stats" },
					h(Stat, {
						value: allOn + "/" + all,
						label: t("metric.total"),
						tone: all && allOn === all ? "ok" : undefined,
					}),
					h(Stat, {
						value: presetCount,
						label: t("metric.presets"),
					}),
				),

				h("div", { className: "dshp-prog" }, h("i", { style: { width: pct + "%" } })),

				h(PatchPanel, { status, t, busy, onToggle: togglePatch, onToggleWindows: toggleWindows }),
				draft ? h(PresetEditor, { draft, setDraft, t, busy, isNew, onSave: savePreset, onCancel: () => setDraft(null) }) : null,
				h(PresetPanel, { status, t, busy, onNew: openNew, onEdit: openEdit, onDelete: deletePreset }),
				h(ScopePanel, { status, t }),

				notice ? h("div", { className: "dshp-note is-" + (notice.kind === "err" ? "err" : "ok") }, notice.text) : null,

				needRestart ? h("div", { className: "dshp-note is-info" },
					h("span", null, t("notice.restart") + " " + t("notice.restartHint")),
				) : null,
			);
		}

		function hostTheme() {
			try {
				if (typeof document !== "undefined") {
					if (document.body && document.body.hasAttribute("data-ds-dark-theme")) return "dark";
					const root = document.documentElement;
					const scheme = (root.style.colorScheme || getComputedStyle(root).getPropertyValue("color-scheme") || "").toLowerCase();
					if (scheme.includes("dark")) return "dark";
					if (scheme.includes("light")) return "light";
				}
				if (typeof window !== "undefined" && window.matchMedia) return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
			} catch { /* ignore */ }
			return "light";
		}

		function Root(props) {
			const t = typeof props.t === "function" ? props.t : ((k) => k);
			translate = t;
			const [theme, setTheme] = useState(hostTheme);
			useEffect(() => {
				let cancelled = false, timer = 0;
				const sync = () => {
					if (timer) window.clearTimeout(timer);
					timer = window.setTimeout(() => { if (!cancelled) setTheme(hostTheme()); }, 50);
				};
				sync();
				let mq;
				try { mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)"); if (mq && mq.addEventListener) mq.addEventListener("change", sync); } catch { /* ignore */ }
				let obs;
				try {
					if (document.body) { obs = new MutationObserver(sync); obs.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme", "class", "style"] }); }
				} catch { /* ignore */ }
				return () => {
					cancelled = true;
					if (timer) window.clearTimeout(timer);
					try { if (mq && mq.removeEventListener) mq.removeEventListener("change", sync); } catch { /* ignore */ }
					try { if (obs) obs.disconnect(); } catch { /* ignore */ }
				};
			}, []);
			return h("div", { className: "dshp", "data-t": theme }, h("style", null, CSS), h(MainPanel, null));
		}

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-breaker: dictionaries");
			const t = ctx.locale.bind(NS);
			translate = t;
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-breaker",
				order: 40,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({ t }),
			}, Root));
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
