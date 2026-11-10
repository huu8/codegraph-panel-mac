# codegraph-panel-mac

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）用的 **CodeGraph 面板插件**：在会话视图标签栏加一个 `CodeGraph` 标签，点开即可看索引概览、搜符号、画调用关系图、做影响面分析、看源码与调用链，以及一键 sync / 重建索引。

## 为什么需要它

[CodeGraph](https://github.com/) 是一个代码智能工具（本地 SQLite 知识图谱，含节点、边、调用关系），但**官方没有 UI**：

```bash
$ codegraph ui
error: 'codegraph ui' is not in this release yet.
       The browser viewer is coming in an upcoming release.
```

它只提供 CLI 和 MCP 工具。数据都在，看得见用得上，但**没有可视化入口**——尤其是"依赖图"这种本质上就该画出来的东西，CLI 只能给你一串文字。

本插件补上这个缺口，并以 DSH 插件形式集成，和其他会话标签（如 AOCI）并列。

## 功能

| 区块 | 内容 |
| --- | --- |
| 概览 | 文件数 / 节点数 / 边数 / 库体积 / 后端 / journal / 语言 / 最近索引时间 / 索引版本；待同步变化（+新增 ~修改 -删除）与是否建议重建；**节点类型分布**与**关系类型分布**（带占比条） |
| 符号搜索 | 按名称搜函数 / 类 / 路由 / 常量，可按 kind 过滤；结果行内直接跳「图」或「影响」 |
| 依赖图 | **cytoscape 交互图**：以符号的全部同名定义为种子，展开 1–3 跳邻域；节点按 kind 着色，边按关系类型着色（calls / imports / extends / instantiates / references）；可滚轮缩放、拖拽、点击看详情；显示截断提示 |
| 影响面 | 沿「谁依赖我」方向做 2 跳展开，按跳数分组列出受影响代码 |
| 符号详情 | 元数据（kind / 文件:行 / 签名 / 是否导出 / 是否异步 / qualified name）+ **源码与调用链**（来自 `codegraph node`） |
| 索引维护 | 一键 `sync`（增量）与 `index`（全量重建），显示退出码、耗时与输出 |

## 关键设计决策

### 图数据直接读 SQLite，而不是用 CLI

`codegraph impact --json` 返回的 `affected` 只有**平铺节点列表**（`name` / `kind` / `filePath` / `startLine`），**没有任何连线信息**——拿它画不出图。

真正的依赖关系在 `.codegraph/codegraph.db` 的 `edges` 表里：

```
nodes: id, kind, name, qualified_name, file_path, language, start_line, …, updated_at
edges: id, source, target, kind, metadata, line, col, provenance
```

因此画图走直读库。为了让这件事安全可控：

- **一律 `readOnly: true` 打开**，面板绝不写 CodeGraph 资产；
- 只读 `nodes` / `edges` 两张表，不做任何 DDL / DML；
- 唯一的写操作是 `sync` / `index`，且由 **CLI 自己完成**，面板只负责发起并转述输出。

### 画图必须做规模控制

真实仓库（dental-v3）有 6,914 节点 / 15,312 边。全图铺进浏览器会直接卡死，而且**没法看**——一万五千条线的毛球没有信息量。

所以图是**以符号为中心的局部图**：

| 控制 | 默认值 | 说明 |
| --- | --- | --- |
| 展开深度 | 1 | 可选 1–3 跳 |
| 节点上限 | 150 | 超过即停并标 `truncated` |
| 边上限 | 400 | 同上 |
| 方向 | 双向 | 可选 `in`（谁依赖我）/ `out`（我依赖谁） |

实测：`login`（39 个同名定义）深度 1 → 100 节点 / 104 边 / 约 25ms；深度 2 触达上限并正确标截断。

另外**默认不画 `contains` 边**（文件→符号的归属边，6,406 条，占了近半）。它是结构关系而非依赖关系，画进去只会糊成一团。可画的边类型：`calls` 4,957 / `imports` 1,853 / `references` 1,712 / `instantiates` 296 / `extends` 87。

### cytoscape 必须内联进 bundle

DSH 客户端用 `window.__ModuleLoader__.load({ factory: (require) => … })` 加载插件前端。这个 `require` 是个**共享模块注册表**，只认宿主已注册的包：

```
react, react-dom, react/jsx-runtime, zod, util, url,
@deepseek-ai/cordis, @deepseek-ai/dsh-client-store,
@deepseek-ai/dsh-client-ui-primitives, …
```

**cytoscape 不在其中**，`require("cytoscape")` 会失败。因此构建脚本把 cytoscape 的官方 UMD 构建内联进 `lib/client.js`（432 KB → 总计 470 KB），在独立函数作用域里取 `module.exports`。

#### 一个容易踩的坑

内联最初用 `template.replace('占位符', literal)` 失败，报 `Invalid or unexpected token`。原因不在编码，而在 **`String.replace` 的 `$` 特殊替换模式**：cytoscape 压缩源码里含 `$&`、`$'`、`` $` `` 等序列，被当成替换指令解释，字面量在 181,169 字节处被截断。

修法是函数式替换：

```js
template.replace('__CYTOSCAPE_SRC__', () => literal)  // 不再解释 $
```

自检脚本里有专门一条守着这个点。

## 安装

```bash
bash scripts/install.sh --check       # 预检：构建 bundle + 自检 + 探测 codegraph，不写文件
bash scripts/install.sh               # 装到 desktop profile
bash scripts/install.sh --profile web
bash scripts/install.sh --uninstall
```

装完**重启 DSH**，会话顶部出现 `CodeGraph` 标签（排在 AOCI 右侧，`order: 31`）。

### desktop profile 的特殊情况

`dsh plugin --profile desktop add` 会被拒绝：

```
error: profile "desktop" is managed exclusively by the Electron application
```

桌面版由 Electron 独占管理，而 pnpm 重装会清空整个 `node_modules`（会波及你已装的其他插件）。因此脚本走等效路径：

1. 在 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 与 `dsh.profile.bundles` 里登记（改前备份 `package.json.bak-cgpanel-*`）；
2. 把插件目录复制进 `node_modules/codegraph-panel-mac`。

非 `desktop` profile 不受此限。

## 配置

在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 里按行 id 覆盖：

```yaml
- id: codegraph-panel-mac
  name: codegraph-panel-mac
  config:
    binPath: '/Users/you/.local/bin/codegraph'  # 通常不需要，PATH 能探测到
    cliTimeoutMs: 180000
    graphNodeLimit: 150      # 10–500
    graphEdgeLimit: 400      # 10–2000
    defaultDepth: 1          # 1–3
```

配置在装载期校验，未知字段或越界值会让该行装载失败并在日志报错，不会带着错误默认值继续跑。

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/codegraph-panel/state` | 概览 + 项目列表 + 平台诊断 |
| GET | `/codegraph-panel/query` | 符号搜索（`q` / `kind` / `limit`） |
| GET | `/codegraph-panel/graph` | 局部依赖图（`q` 或 `ids` / `depth` / `direction` / `kinds`） |
| GET | `/codegraph-panel/impact` | 影响面（`q` / `depth`） |
| GET | `/codegraph-panel/node` | 符号详情 + 源码（`id` 或 `q`） |
| GET | `/codegraph-panel/about` | 版本、平台、CLI 版本、上限配置 |
| POST | `/codegraph-panel/sync` | 执行 sync / index（body: `{repo, action}`） |

## 平台适配

mac 优先，但不写死 Windows 语义：

- home 解析优先 `HOME`，Windows 回退 `USERPROFILE`，最后 `os.homedir()`；
- 二进制探测：显式配置 → `$CODEGRAPH_BINARY` → `PATH` → 惯例目录（`~/.local/bin`、`/opt/homebrew/bin`、`/usr/local/bin`）；
- 可执行性用权限位 `0o111` 判断，不只看扩展名；
- **子进程 PATH 注入**：GUI 启动的 DSH 拿到的 PATH 常缺 Homebrew 与 `~/.local/bin`，这会让 `codegraph` 明明装了却 exec 失败。

## 验证情况

- `bash scripts/install.sh --check` → 自检 **10/10 通过**（文件、语法、bundle 可解析、cytoscape 已内联、构建脚本用函数式替换、身份一致、DB 只读、七端点齐全、客户端接线、mac 路径适配）
- `node --test test/*.test.mjs` → **21/21 通过**（图算法 12 项：子图抽取 / 方向 / 深度 / 截断 / 悬空端点 / contains 排除；平台层 9 项）
- 对真实 dental-v3 索引（402 文件 / 6,914 节点 / 15,312 边 / 22.5 MB）端到端：

| 端点 | 结果 |
| --- | --- |
| `state` | CLI status + 直读库双通道，数字一致 |
| `query` login | 命中 5 |
| `graph` login depth=1 | **100 节点 / 104 边**，4 类边，未截断 |
| `impact` login | 66 受影响，跳数 39 → 25 → 2 |
| `node` | 元数据 + 697 字符源码与调用链 |
| `sync` | 退出码 0，1,282ms |
| `about` | `codegraph 1.6.2`，`restartRequired: false` |

## 已知限制

- 只在 macOS 上用真实仓库验证过；Linux/Windows 保留了代码路径但未实测
- 图的布局用 cytoscape 内置 `cose`，超 150 节点会明显变慢（已有上限兜底）
- 同名符号（如 `login` 有 39 个定义）会一起作为种子，图上按 `种子` 高亮区分，但不做消歧
- 不跟随 CodeGraph 版本升级，基于 v1.6.2 的库结构（`nodes` / `edges` 表）

## 许可

MIT。cytoscape 采用 MIT，版权归 The Cytoscape Consortium（见 `vendor/cytoscape.min.js` 头部）。
