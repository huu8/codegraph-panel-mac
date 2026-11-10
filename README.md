# codegraph-panel-mac

> 给 **DeepSeek Harness（DSH）** 的 CodeGraph 面板 —— 把代码调用关系画成图。
> 装上之后，DSH 会话顶部会多一个 **CodeGraph** 标签，点开就能搜符号、看调用关系图、分析改一处会波及什么。

---

## 一句话说明它解决什么

**CodeGraph 官方没有界面。**

```bash
$ codegraph ui
error: 'codegraph ui' is not in this release yet.
       The browser viewer is coming in an upcoming release.
```

它只有命令行工具。数据都在本地（一个 SQLite 数据库，里面有节点和关系），但**你只能看到一串文字**——尤其是"调用关系图"这种天生就该画出来的东西。

这个插件把 CodeGraph 的数据画成图，做成 DSH 的一个标签页。

---

## 快速开始（3 分钟）

### 前置条件

这个插件是 CodeGraph 的**界面**，所以你得先有 CodeGraph：

```bash
codegraph --version
```

看到版本号（例如 `1.6.2`）就可以继续。如果 `command not found`，先装 CodeGraph。

另外，**你的项目得建过索引**：

```bash
cd 你的项目目录
codegraph init       # 第一次建索引
```

> 怎么确认建好了？看项目目录下有没有 `.codegraph/codegraph.db` 这个文件。

### 装插件

**方式一：插件市场**（推荐，不用碰终端）

1. 打开 DSH
2. **设置 → 插件 → 插件市场（Discover）**
3. 索引地址填：
   ```
   https://raw.githubusercontent.com/huu8/dsh-plugin-index/main/index.json
   ```
4. 找到 **CodeGraph 认知面板**，点安装
5. **重启 DSH**

**方式二：源码安装**

```bash
git clone https://github.com/huu8/codegraph-panel-mac.git
cd codegraph-panel-mac
bash scripts/install.sh --check    # 预检，不写任何东西
bash scripts/install.sh            # 正式安装
```

### 验证

重启 DSH，打开一个**建过 CodeGraph 索引的项目**的会话，顶部应该出现 `CodeGraph` 标签（在 AOCI 右边）。

点开 → 概览应显示文件数、节点数、边数。数字不是 0 就成功了。

---

## 五个功能怎么用

打开 `CodeGraph` 标签，顶部有五个子页面。

### 1. 概览

一眼看清索引状况：

- **文件数 / 节点数 / 边数**：这个项目被解析出多少东西
- **库大小**：索引数据库多大
- **语言**：索引了哪些语言
- **待同步**：`+新增 ~修改 -删除`，有没有改动还没进索引
- **节点类型分布**：函数多少、类多少、路由多少（带条形图）
- **关系类型分布**：调用关系多少、导入多少

底部有 **索引维护** 按钮：

- `增量同步（sync）`：只处理改动过的文件，快
- `全量重建（index）`：从头重建，慢但彻底

> 什么时候用哪个？日常改了代码用 sync。感觉索引乱了、或者 CodeGraph 升级后用 index。

### 2. 符号搜索

输入函数名、类名，回车。

- 支持部分匹配：输 `login` 能搜到 `login`、`handleLogin`、`loginUser`
- 可以按类型过滤（只看函数 / 只看类 / 只看路由）
- 每条结果右边有两个快捷按钮：
  - **图** → 直接跳到依赖图，画这个符号
  - **影响** → 直接跳到影响面分析

点结果本身 → 进符号详情页。

### 3. 依赖图 ⭐ 核心功能

这是最有价值的部分。输入一个符号名（比如 `login`），点「画图」。

你会看到一张**可交互的关系图**：

- **节点颜色 = 符号类型**：函数蓝、类紫、路由橙、常量黄、文件灰
- **边颜色 = 关系类型**：调用蓝、导入绿、继承紫、实例化黄
- **橙色粗边框的节点** = 你搜索的那个符号（种子）
- 鼠标**滚轮缩放**、**拖拽移动**、**点节点看详情**
- 右下角有颜色图例

三个调节项：

| 选项 | 说明 |
| --- | --- |
| **深度 1/2/3** | 往外扩几层。1 看直接关系，2 看间接关系 |
| **方向** | `双向`（默认）/`谁依赖我`/`我依赖谁` |
| **上限提示** | 超过 150 节点或 400 边会标「已截断」 |

> **为什么会有上限？** 真实项目动辄 6000+ 节点、15000+ 边。全部画出来浏览器会卡死，而且一万五千条线缠成一团，**根本看不出信息**。所以做成以符号为中心的局部图，这是唯一能看清的做法。

### 4. 影响面

输入一个符号，问它：**「我改了这里，会影响哪些代码？」**

结果按跳数分组：

```
种子定义 · 1        ← 这个符号自己（可能有多个同名定义）
第 1 跳 · 25        ← 直接依赖它的代码
第 2 跳 · 2         ← 间接依赖的
```

动手改核心函数之前先看一眼这个，能提前知道雷区在哪。

### 5. 符号详情

从搜索、图、影响面任意一处点进来，显示：

- **元数据**：类型、文件:行号、语言、签名、是否导出、是否异步
- **源码与调用链**：实际代码 + 谁调用了它

底部还能一键跳到「看依赖图」或「看影响面」，几个视图互相串起来用。

---

## 常见问题

### 概览显示「该仓库尚无 CodeGraph 索引」

这个项目还没建索引。终端执行：

```bash
cd 你的项目目录
codegraph init
```

### 显示「未找到 codegraph 可执行文件」

1. 终端确认 `codegraph --version` 能跑
2. 找出路径：`which codegraph`
3. 把路径填进配置的 `binPath`（见下方配置章节）

mac 上从图形界面启动 DSH 时，`PATH` 可能缺 `~/.local/bin` 和 `/opt/homebrew/bin`。插件已自动补这两个目录，装在别处就要手动填。

### 图是空白 / 加载不出来

先刷新面板（右上角「刷新」）。还是空的话：

- 确认搜的符号名存在（先用「符号搜索」验证能搜到）
- 试试把深度调回 1
- 如果符号有几十个同名定义（比如很多文件都有 `login`），种子会很多，试试在搜索页选中具体那一条再点「图」

### 一直提示「需要重启生效」

版本比对提示。重启 DSH；还提示就重新跑 `bash scripts/install.sh`。

### desktop profile 装不上

看到这个报错是正常的：

```
error: profile "desktop" is managed exclusively by the Electron application
```

**桌面版 DSH 由 Electron 独占管理**，不接受外部 pnpm 安装。`scripts/install.sh` 已处理——它走等效路径（改 profile 的 `package.json` 并在改前自动备份，然后复制插件到 `node_modules`）。

**别自己跑 `pnpm install`**，那会重装整个 `node_modules`，可能弄坏你其他插件。

### 提示「CLI 不可用」但索引数据有显示

说明数据库能读（图上能画），但 CLI 调不通（sync、源码详情会不可用）。检查 `codegraph --version`，或填 `binPath`。

---

## 配置（一般不用动）

`~/.dsh/profiles/<profile>/cordis.patch.yml`：

```yaml
- id: codegraph-panel-mac
  name: codegraph-panel-mac
  config:
    binPath: ''              # 留空 = 自动探测
    cliTimeoutMs: 180000     # 命令超时（毫秒）
    graphNodeLimit: 150      # 图上最多多少节点（10-500）
    graphEdgeLimit: 400      # 最多多少边（10-2000）
    defaultDepth: 1          # 默认展开几跳（1-3）
```

配错了插件会在装载时**直接报错**（而不是带着错误默认值继续跑），看 DSH 日志能看到具体哪个字段不对。

图太卡就把 `graphNodeLimit` 调小；想看更大范围就调大（但会变慢）。

---

## 它是怎么做到的（技术说明）

<details>
<summary>点开看设计细节</summary>

### 为什么图数据直读数据库，而不是用 CLI

`codegraph impact --json` 返回的 `affected` 只有**平铺的节点列表**：

```json
{ "name": "login", "kind": "function", "filePath": "a.ts", "startLine": 13 }
```

**没有任何连线信息**——靠它画不出图。

真实的关系在 `.codegraph/codegraph.db` 的 `edges` 表里：

```
nodes: id, kind, name, qualified_name, file_path, language, start_line, …
edges: id, source, target, kind, metadata, line, col, provenance
```

所以画图走直读数据库。安全边界：

- **一律 `readOnly: true` 打开**，绝不写 CodeGraph 的资产
- 只读 `nodes` / `edges` 两张表，不做任何结构或数据修改
- 唯一的写操作是 `sync` / `index`，且**由 CodeGraph CLI 自己完成**，插件只负责发起和转述输出

### 为什么要有节点/边上限

真实仓库（测试用 dental-v3）有 **6,914 节点 / 15,312 边**。

| 控制 | 默认 | 原因 |
| --- | --- | --- |
| 展开深度 | 1 跳 | 2 跳就会爆炸式增长 |
| 节点上限 | 150 | 再多浏览器掉帧 |
| 边上限 | 400 | 同上 |
| 默认不画 `contains` 边 | — | 见下 |

**为什么默认不画 `contains`？** 它是"文件包含符号"的归属边，有 **6,406 条**，占了所有边近一半。它是结构关系不是依赖关系，画进去只会糊成一团，掩盖真正的调用关系。

可画的边：`calls` 4,957 / `imports` 1,853 / `references` 1,712 / `instantiates` 296 / `extends` 87。

### 为什么 cytoscape 要塞进 bundle

DSH 客户端加载插件前端用的是：

```js
window.__ModuleLoader__.load({ factory: (require) => … })
```

这个 `require` 是个**共享模块注册表**，只认宿主已经注册的包：

```
react, react-dom, react/jsx-runtime, zod, util, url,
@deepseek-ai/cordis, @deepseek-ai/dsh-client-store,
@deepseek-ai/dsh-client-ui-primitives, …
```

**cytoscape 不在里面**，`require("cytoscape")` 会失败。

所以构建脚本把 cytoscape 的官方 UMD 构建内联进 `lib/client.js`（432 KB → 共 470 KB），在独立函数作用域里取 `module.exports`。

### 一个踩过的坑

内联最初用这种方式：

```js
template.replace('占位符', literal)   // ✗ 失败：Invalid or unexpected token
```

根因不在编码，而在 **`String.replace` 的 `$` 特殊替换模式**——cytoscape 的压缩源码里有 `$&`、`$'`、`` $` `` 这些序列，被当成替换指令解释，导致字面量在 181,169 字节处被截断。

正确写法（`$` 不再被解释）：

```js
template.replace('__CYTOSCAPE_SRC__', () => literal)   // ✓
```

自检脚本里有专门一条守着这个点。

</details>

---

## 端点（给开发者）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/codegraph-panel/state` | 概览 + 项目列表 + 平台诊断 |
| GET | `/codegraph-panel/query` | 符号搜索（`q` / `kind` / `limit`） |
| GET | `/codegraph-panel/graph` | 局部依赖图（`q` 或 `ids` / `depth` / `direction` / `kinds`） |
| GET | `/codegraph-panel/impact` | 影响面（`q` / `depth`） |
| GET | `/codegraph-panel/node` | 符号详情 + 源码（`id` 或 `q`） |
| GET | `/codegraph-panel/about` | 版本、平台、CLI 版本、上限配置 |
| POST | `/codegraph-panel/sync` | 执行 sync / index（body: `{repo, action}`） |

调试示例：

```bash
curl -s "http://127.0.0.1:<端口>/codegraph-panel/about" | jq
```

---

## 验证情况

- `bash scripts/install.sh --check` → **10/10 自检通过**
- `node --test test/*.test.mjs` → **21/21 单测通过**（图算法 12 项 + 平台层 9 项）
- 真实项目（dental-v3，402 文件 / 6,914 节点 / 15,312 边）端到端：

| 端点 | 结果 |
| --- | --- |
| `state` | CLI 与直读库双通道，数字一致 |
| `query` login | 命中 5 |
| `graph` login 深度 1 | **100 节点 / 104 边**，4 类边 |
| `impact` login | 66 受影响，跳数 39 → 25 → 2 |
| `node` | 元数据 + 697 字符源码 |
| `sync` | 退出码 0，1,282ms |
| `about` | `codegraph 1.6.2` |

---

## 已知限制

- 只在 macOS 上用真实仓库验证过；Linux / Windows 保留代码路径但未实测
- 图布局用 cytoscape 内置 `cose` 算法，超 150 节点会明显变慢（已有上限兜底）
- 同名符号（例如 `login` 有 39 个定义）会一起作为种子，图上用橙色边框标出，但不做消歧
- 基于 CodeGraph v1.6.2 的库结构（`nodes` / `edges` 表），大版本升级可能不兼容

---

## 许可

MIT。cytoscape 同样是 MIT，版权归 The Cytoscape Consortium（见 `vendor/cytoscape.min.js` 文件头）。
