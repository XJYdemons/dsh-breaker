# DSH-Breaker

> DeepSeek Harness 能力增强面板。放宽工具上限、强化项目规范读取、消除 Windows 子进程黑框，并内置可自由增删改的 agent 模式。

设置页入口：**能力增强**。所有开关都可以在界面上直接操作，改动会明确提示是否需要重启。

---

## 它能做什么

| 类别 | 内容 |
|---|---|
| **工具能力** | read 上限、bash 超时、工具结果不截断、subagent 嵌套深度 |
| **规范强化** | 把 `AGENTS.md` 的工作区指令升格为强制配置 |
| **Windows 体验** | 子进程隐藏控制台与启动入口预载，两项独立开关 |
| **模式管理** | 内置逆向与工程模式，支持在界面新增、编辑、删除 |

每一项都可以单独开关。关闭的补丁不会参与状态检查，也不会在启动时被重新应用。

---

## 工具能力

| 补丁 | 改动 |
|---|---|
| read 上限放宽 | 单行 2e3 → 1e4 字符，单次 50KB → 1MB，行数 2e3 → 2e4 |
| bash 超时放宽 | 60 秒 → 600 秒 |
| 工具结果不截断 | 取消 8KB 修剪阈值，完整保留输出 |
| subagent 深度放宽 | 嵌套层数 3 → 10 |

读大文件不必分段，跑构建不会被中途杀掉，长输出不会被悄悄截断，子代理可以多层委派。

## 规范强化

| 补丁 | 改动 |
|---|---|
| AGENTS.md 包装 | 「参考建议」→「强制配置」 |
| 替换式基线 | 同步升格 |
| 作用域声明 | 升格，嵌套 AGENTS.md 同样强制 |

原版把工作区指令描述为「may be relevant... do not override system instructions」，强化后是「ACTIVE and MANDATORY... take precedence over any conflicting behavior」。

这是让项目规范真正生效的关键——否则模型会把它当参考建议处理。

规范通过**用户消息**通道注入，不占用系统提示词，因此与模式隔离互不干扰。

## Windows 体验

两项独立开关，各自可关：

| 开关 | 作用 |
|---|---|
| 隐藏控制台 | 所有子进程强制 `windowsHide`，不再弹出黑框 |
| 启动入口预载 | 在 dsh 启动脚本里预载隐藏模块，重启后依然生效 |

「启动入口预载」是为了覆盖 Node 24 冻结导入的限制：进程内的 `windowsHide` 无法影响已经启动的早期导入，必须在入口处拦截。两项都只影响是否弹出控制台窗口，不改动任何功能行为。

---

## 模式管理

模式即 Harness 的 agent preset。每个模式是一份独立的组合文件，放在：

```
$DSH_HOME/.agent-presets/<id>/agent.cordis.yml
```

**内置两个模式：**

| ID | 名称 | 用途 |
|---|---|---|
| `reverse` | 逆向模式 | 逆向工程、二进制分析、渗透测试与 CTF |
| `engineering` | 工程模式 | 三阶段工作流：研究 → 计划 → 实现 |

**在设置页可以：**

- **新建** — 填 ID、名称、描述、排序和人格正文
- **编辑** — 修改任意模式的元数据与人格正文
- **删除** — 移除模式目录

编辑时只替换人格正文，组合文件的其他部分（工具注册、realm 配置）原样保留。

**模式隔离**：每个模式的人格段标记为 `complete`，它会**替换**整段系统提示词，而不是追加。所以逆向模式的人格不会渗进工程模式，工程模式的措辞也不会影响普通对话。

**使用方式**：新开对话时在顶部下拉里选择。已开始的会话不能换模式，这是 Harness 的运行时约束。

**升级保护**：插件内置的模式在安装时会记录内容摘要。你改过之后，插件不会再覆盖它。

---

## 安装

```sh
# 从 GitHub 安装
dsh plugin --profile web add https://github.com/XJYdemons/dsh-breaker/archive/refs/heads/main.zip
```

或从本地目录：

```sh
git clone https://github.com/XJYdemons/dsh-breaker.git
cd dsh-breaker
dsh plugin --profile web add .
```

**重启 dsh**。启动时插件会自动：

1. 把内置模式安装到 `$DSH_HOME/.agent-presets/`
2. 应用启用中的补丁
3. 装配 Windows 无闪窗

---

## 使用

### 聊天命令

```
/breaker status     显示状态、补丁开关与模式列表
/breaker apply      应用启用中的补丁
/breaker revert     还原所有补丁到官方默认值
/breaker help       显示帮助
```

### CLI

```sh
node bin/dsh-breaker.js --status
node bin/dsh-breaker.js --apply
node bin/dsh-breaker.js --revert
node bin/dsh-breaker.js --help
```

### 模型工具

```
breaker_status    breaker_apply    breaker_revert
```

---

## 重启

设置页**不提供重启按钮**——由界面去杀自己所在的服务进程并不可靠，容易留下半死状态。改动后请手动重启：

```
在终端里按 Ctrl+C 停止，再重新执行原来的启动命令。
```

界面上会提示哪些改动需要重启。模式的新增、编辑、删除**不需要**重启，新开对话即可看到。

---

## 工作原理

### 补丁机制

补丁是精确字符串替换：读文件、查找原文、替换、写回。

```js
const ENABLED_PATCH_IDS = new Set([1, 2, 3, 19, 22, 23, 24]);
```

原文对不上时跳过而非猜测，这是安全设计。改完需要重启 dsh —— Node 已把旧模块加载进内存。

### 还原：反向替换，不用备份

关闭一个补丁时，插件把该补丁的**替换值改回原值**，而不是从备份文件恢复。

这样做的好处：

- **不依赖备份**。备份文件被删、被覆盖、被 npm 升级冲掉，还原依然有效。
- **幂等**。连续还原多次结果一致，不会越还原越乱。
- **精确**。只回退这个补丁改过的字符串，同文件里其他补丁的改动原样保留。

同一文件被多个补丁共享时（规范强化组的三项都改 `agent-instructions`），关掉一个不会连带撤销其他的。

补丁定义里同时保留 `pattern` 与 `replace`，因此天然可逆。若某条补丁的替换值包含原值前缀（例如 `60000` → `600000`），插件会额外做前缀重叠检查并锚定边界，避免重复应用时越改越长。

### 配置存储

```
$DSH_HOME/.dsh-breaker/config.json
```

只存用户选择，不存运行时状态：

```json
{ "disabledPatches": [], "disabledWindows": [] }
```

文件缺失或损坏时回落到默认值（全部启用），保证插件始终可用。

### 自动重洗

启动时检查启用中的补丁，缺失的自动重新应用。npm 升级覆盖 `node_modules` 后不必手动处理。

---

## 目录结构

```
dsh-breaker/
├── lib/
│   ├── core.js                 # 路径探测、补丁引擎、反向还原
│   ├── config.js               # 配置持久化
│   ├── presets.js              # 模式安装与增删改查
│   ├── index.js                # 插件入口：命令、工具、HTTP
│   ├── hide-console.js         # Windows 控制台隐藏
│   └── child-process-hide.mjs  # child_process facade
├── presets/                    # 内置模式
│   ├── reverse/
│   └── engineering/
├── tools/render-test.cjs       # 设置页渲染冒烟测试
├── bin/dsh-breaker.js          # CLI
├── client.js                   # 设置页
├── cordis.patch.yml            # 装载声明
└── package.json
```

---

## 路径探测

按顺序尝试：

1. `DSH_HOME` / `DSH_BASE`（显式指定）
2. dsh 启动器旁的 `.dsh`（便携安装）
3. DSH Desktop 解包目录
4. `npm prefix -g` / `npm root -g`
5. 嵌套 `@deepseek-ai/dsh/node_modules/@deepseek-ai`
6. 系统默认 `~/.dsh`

找不到目标时提示设置 `DSH_BASE`，不改任何文件。

---

## 兼容性

| 项目 | 说明 |
|---|---|
| 目标 dsh | 0.1.5-rc.1 |
| Node | ≥18；Windows 控制台隐藏需要 Node ≥22 |
| 平台 | 跨平台，Windows 专属部分在其他平台自动跳过 |
| 模式冲突 | 同名模式不会被覆盖 |
| 权限 | 不修改权限与审批设置 |

---

## 本地校验

```sh
node --check lib/index.js
node --check lib/core.js
node --check lib/config.js
node --check lib/presets.js
node --check client.js
node --check bin/dsh-breaker.js
```

三个自检脚本：

| 脚本 | 校验内容 |
|---|---|
| `node tools/load-test.mjs` | 插件入口能加载、每条补丁可逆、启用中的补丁确实已落盘 |
| `node tools/render-test.cjs` | 用一个极小的 React 运行时把设置页真渲染一遍：开关数量、Windows 项可切换、统计卡数值、界面上不再残留重启入口 |
| `node tools/i18n-audit.cjs` | 中英文词条键集合一致，没有定义未用或用了未定义的键 |

---

## License

MIT
