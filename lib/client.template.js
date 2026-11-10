window.__ModuleLoader__.load({
	id: "codegraph-panel-mac",
	factory: (require) => {
		var module = { exports: {} };
		let react = require("react");

		// ---------------------------------------------------------------- //
		// cytoscape 内联：宿主 ModuleLoader 的 require 只认已注册的共享模块
		// （react / cordis / primitives 等），第三方库不在其中。因此把官方
		// UMD 构建直接塞进 bundle，用独立函数作用域取 module.exports。
		// ---------------------------------------------------------------- //
		const CYTOSCAPE_SRC = __CYTOSCAPE_SRC__;
		let cytoscapeLib = null;
		function getCytoscape() {
			if (cytoscapeLib) return cytoscapeLib;
			const holder = { exports: {} };
			try {
				new Function("module", "exports", "window", "document", CYTOSCAPE_SRC)(
					holder,
					holder.exports,
					window,
					document
				);
				cytoscapeLib = holder.exports;
			} catch (error) {
				cytoscapeLib = null;
			}
			return cytoscapeLib;
		}

		const CSS = [
			".cg-panel{display:flex;flex-direction:column;min-height:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}",
			".cg-head{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap;position:sticky;top:0;background:var(--dsw-alias-bg-base);z-index:2}",
			".cg-title{font-weight:600;font-size:13px}",
			".cg-spacer{flex:1}",
			".cg-body{padding:12px 14px 40px;display:flex;flex-direction:column;gap:10px}",
			".cg-tabs{display:flex;gap:2px;flex-wrap:wrap}",
			".cg-tab{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer}",
			".cg-tab:hover{color:var(--dsw-alias-label-primary)}",
			".cg-tab.active{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-weight:600}",
			".cg-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:8px;padding:10px 12px}",
			".cg-card>h4{margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);font-weight:600}",
			".cg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px 12px}",
			".cg-kv{display:flex;flex-direction:column;gap:1px;min-width:0}",
			".cg-k{color:var(--dsw-alias-label-secondary);font-size:11px}",
			".cg-v{word-break:break-all;font-variant-numeric:tabular-nums;font-size:12px}",
			".cg-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
			".cg-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 8px;font-size:11px;background:var(--dsw-alias-bg-layer-2)}",
			".cg-chip.ok{color:var(--dsw-alias-state-success-primary);border-color:currentColor}",
			".cg-chip.bad{color:var(--dsw-alias-state-error-primary);border-color:currentColor}",
			".cg-chip.warn{color:var(--dsw-alias-state-warn-primary);border-color:currentColor}",
			".cg-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer}",
			".cg-btn:hover{border-color:var(--dsw-alias-brand-primary)}",
			".cg-btn:disabled{opacity:.5;cursor:default}",
			".cg-btn.primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-inverse,#fff);border-color:transparent}",
			".cg-input,.cg-select{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:inherit;border-radius:6px;padding:3px 8px;font-size:12px;max-width:100%}",
			".cg-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;max-height:420px;overflow-y:auto}",
			".cg-item{display:flex;gap:8px;padding:5px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;align-items:baseline;font-size:12px}",
			".cg-item:last-child{border-bottom:none}",
			".cg-item:hover{background:var(--dsw-alias-bg-layer-2)}",
			".cg-item.sel{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}",
			".cg-name{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:nowrap}",
			".cg-kind{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-secondary);flex:0 0 auto}",
			".cg-path{color:var(--dsw-alias-label-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}",
			".cg-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.55;white-space:pre;overflow:auto;max-height:420px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:8px 10px}",
			".cg-empty{color:var(--dsw-alias-label-secondary);padding:16px;text-align:center}",
			".cg-intro{color:var(--dsw-alias-label-secondary);font-size:12px;margin:0 0 8px}",
			".cg-banner{border-radius:6px;padding:8px 10px;font-size:12px;border:1px solid var(--dsw-alias-border-l1)}",
			".cg-banner.bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}",
			".cg-banner.warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}",
			".cg-graph{width:100%;height:520px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);position:relative;overflow:hidden}",
			".cg-graph-legend{position:absolute;right:8px;bottom:8px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:6px 8px;font-size:10px;line-height:1.7;z-index:3;pointer-events:none}",
			".cg-legend-dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:middle}",
			".cg-bar{height:4px;border-radius:2px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin-top:3px}",
			".cg-bar>i{display:block;height:100%;background:var(--dsw-alias-brand-primary)}",
		].join("");

		// 节点 kind → 配色（跟随主题令牌会更好，但 cytoscape 需要具体色值）
		const KIND_COLORS = {
			route: "#e8590c",
			function: "#1c7ed6",
			method: "#4dabf7",
			class: "#7048e8",
			interface: "#9775fa",
			component: "#0ca678",
			type_alias: "#12b886",
			constant: "#f59f00",
			variable: "#fab005",
			property: "#868e96",
			import: "#adb5bd",
			file: "#495057",
		};

		function fmt(n) {
			const value = Number(n);
			if (!Number.isFinite(value)) return "-";
			return value.toLocaleString("zh-CN");
		}

		function bytes(n) {
			const value = Number(n);
			if (!Number.isFinite(value) || value <= 0) return "-";
			if (value < 1024) return value + " B";
			if (value < 1048576) return (value / 1024).toFixed(1) + " KB";
			return (value / 1048576).toFixed(1) + " MB";
		}

		function Field(props) {
			return react.createElement(
				"div",
				{ className: "cg-kv" },
				react.createElement("span", { className: "cg-k" }, props.label),
				react.createElement("span", { className: "cg-v", title: String(props.value) }, props.value === undefined || props.value === "" ? "-" : props.value)
			);
		}

		function Chip(props) {
			return react.createElement("span", { className: "cg-chip" + (props.tone ? " " + props.tone : "") }, props.children);
		}

		async function api(path, query) {
			const qs = query ? "?" + new URLSearchParams(query).toString() : "";
			const response = await fetch(path + qs, { headers: { accept: "application/json" } });
			if (!response.ok) throw new Error("HTTP " + response.status);
			return await response.json();
		}

		async function post(path, body) {
			const response = await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json", accept: "application/json" },
				body: JSON.stringify(body || {}),
			});
			if (!response.ok) throw new Error("HTTP " + response.status);
			return await response.json();
		}

		// 图渲染：cytoscape 实例生命周期挂在 ref 上，避免每次 render 重建
		function GraphView(props) {
			const host = react.useRef(null);
			const cy = react.useRef(null);

			react.useEffect(() => {
				const lib = getCytoscape();
				if (!host.current) return;
				if (!lib) {
					host.current.innerHTML = "";
					return;
				}
				if (!cy.current) {
					cy.current = lib({
						container: host.current,
						style: [
							{
								selector: "node",
								style: {
									"background-color": "data(color)",
									label: "data(label)",
									"font-size": 9,
									color: "#e9ecef",
									"text-outline-width": 2,
									"text-outline-color": "#212529",
									"text-valign": "center",
									"text-halign": "center",
									width: "data(size)",
									height: "data(size)",
									"border-width": "data(border)",
									"border-color": "#ffd43b",
									"min-zoomed-font-size": 6,
								},
							},
							{
								selector: "node[?isSeed]",
								style: { "border-width": 3, "border-color": "#ff922b" },
							},
							{
								selector: "edge",
								style: {
									width: 1,
									"line-color": "#495057",
									"target-arrow-color": "#495057",
									"target-arrow-shape": "triangle",
									"arrow-scale": 0.6,
									"curve-style": "bezier",
									opacity: 0.55,
								},
							},
							{
								selector: "edge[kind = 'calls']",
								style: { "line-color": "#1c7ed6", "target-arrow-color": "#1c7ed6" },
							},
							{
								selector: "edge[kind = 'imports']",
								style: { "line-color": "#40c057", "target-arrow-color": "#40c057" },
							},
							{
								selector: "edge[kind = 'extends']",
								style: { "line-color": "#7048e8", "target-arrow-color": "#7048e8" },
							},
							{
								selector: "edge[kind = 'instantiates']",
								style: { "line-color": "#f59f00", "target-arrow-color": "#f59f00" },
							},
							{
								selector: ":selected",
								style: { "border-width": 4, "border-color": "#20c997" },
							},
						],
						layout: { name: "cose", animate: false, padding: 24, nodeRepulsion: 12000, idealEdgeLength: 90 },
						wheelSensitivity: 0.2,
					});
					cy.current.on("tap", "node", (event) => {
						const id = event.target.id();
						if (props.onPick) props.onPick(id);
					});
					cy.current.on("tap", "edge", (event) => {
						const data = event.target.data();
						if (props.onPickEdge) props.onPickEdge(data);
					});
				}
				const c = cy.current;
				c.elements().remove();
				const nodeIds = new Set((props.graph.nodes || []).map((n) => n.id));
				const elements = [];
				for (const node of props.graph.nodes || []) {
					elements.push({
						data: {
							id: node.id,
							label: node.name || node.filePath || node.id,
							color: KIND_COLORS[node.kind] || "#868e96",
							size: props.seedIds && props.seedIds.has(node.id) ? 26 : 14,
							border: props.seedIds && props.seedIds.has(node.id) ? 3 : 1,
							isSeed: props.seedIds && props.seedIds.has(node.id),
							kind: node.kind,
							filePath: node.filePath,
						},
					});
				}
				for (const edge of props.graph.edges || []) {
					if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
					elements.push({
						data: {
							id: edge.id,
							source: edge.source,
							target: edge.target,
							kind: edge.kind,
						},
					});
				}
				c.add(elements);
				try {
					c.layout({ name: "cose", animate: false, padding: 24, nodeRepulsion: 12000, idealEdgeLength: 90 }).run();
					c.fit(undefined, 30);
				} catch (error) {
					/* 布局失败不影响元素显示 */
				}
			}, [props.graph, props.seedIds]);

			react.useEffect(() => {
				return () => {
					if (cy.current) {
						try {
							cy.current.destroy();
						} catch (error) {
							/* 忽略 */
						}
						cy.current = null;
					}
				};
			}, []);

			const kindsUsed = Array.from(new Set((props.graph.nodes || []).map((n) => n.kind))).sort();
			return react.createElement(
				"div",
				{ className: "cg-graph" },
				react.createElement("div", { ref: host, style: { width: "100%", height: "100%" } }),
				react.createElement(
					"div",
					{ className: "cg-graph-legend" },
					kindsUsed.map((kind) =>
						react.createElement(
							"div",
							{ key: kind },
							react.createElement("span", {
								className: "cg-legend-dot",
								style: { background: KIND_COLORS[kind] || "#868e96" },
							}),
							kind
						)
					)
				)
			);
		}

		function Panel(props) {
			const [tab, setTab] = react.useState("overview");
			const [state, setState] = react.useState(null);
			const [about, setAbout] = react.useState(null);
			const [busy, setBusy] = react.useState(true);
			const [err, setErr] = react.useState("");
			const [repo, setRepo] = react.useState("");

			// 搜索
			const [q, setQ] = react.useState("");
			const [kindFilter, setKindFilter] = react.useState("");
			const [results, setResults] = react.useState(null);
			const [searching, setSearching] = react.useState(false);

			// 图
			const [graph, setGraph] = react.useState(null);
			const [graphQ, setGraphQ] = react.useState("");
			const [graphDepth, setGraphDepth] = react.useState(1);
			const [graphDir, setGraphDir] = react.useState("both");
			const [graphBusy, setGraphBusy] = react.useState(false);

			// 影响面
			const [impactQ, setImpactQ] = react.useState("");
			const [impact, setImpact] = react.useState(null);
			const [impactBusy, setImpactBusy] = react.useState(false);

			// 详情
			const [detail, setDetail] = react.useState(null);
			const [detailBusy, setDetailBusy] = react.useState(false);

			// sync
			const [syncOut, setSyncOut] = react.useState(null);
			const [syncBusy, setSyncBusy] = react.useState(false);

			const sessionId = (props && props.sessionId) || "";

			const load = react.useCallback(
				async (nextRepo, force) => {
					setBusy(true);
					setErr("");
					try {
						const query = { sessionId };
						const target = nextRepo !== undefined ? nextRepo : force ? undefined : repo;
						if (target) query.repo = target;
						const data = await api("/codegraph-panel/state", query);
						setState(data);
						if (data && data.project && data.project.path) setRepo(data.project.path);
					} catch (error) {
						setErr(String(error && error.message ? error.message : error));
					} finally {
						setBusy(false);
					}
				},
				[sessionId, repo]
			);

			react.useEffect(() => {
				load();
				api("/codegraph-panel/about")
					.then((data) => setAbout(data))
					.catch(() => setAbout(null));
			}, []);

			const doSearch = async () => {
				const needle = q.trim();
				if (!needle) return;
				setSearching(true);
				try {
					const query = { sessionId, q: needle, limit: "60" };
					if (repo) query.repo = repo;
					if (kindFilter) query.kind = kindFilter;
					setResults(await api("/codegraph-panel/query", query));
				} catch (error) {
					setResults({ error: String(error.message || error) });
				} finally {
					setSearching(false);
				}
			};

			const doGraph = async (symbol) => {
				const needle = String(symbol !== undefined ? symbol : graphQ).trim();
				if (!needle) return;
				setGraphBusy(true);
				try {
					const query = { sessionId, q: needle, depth: String(graphDepth), direction: graphDir };
					if (repo) query.repo = repo;
					setGraph(await api("/codegraph-panel/graph", query));
				} catch (error) {
					setGraph({ error: String(error.message || error) });
				} finally {
					setGraphBusy(false);
				}
			};

			const doImpact = async (symbol) => {
				const needle = String(symbol !== undefined ? symbol : impactQ).trim();
				if (!needle) return;
				setImpactBusy(true);
				try {
					const query = { sessionId, q: needle, depth: "2" };
					if (repo) query.repo = repo;
					setImpact(await api("/codegraph-panel/impact", query));
				} catch (error) {
					setImpact({ error: String(error.message || error) });
				} finally {
					setImpactBusy(false);
				}
			};

			const doDetail = async (id, symbol) => {
				setDetailBusy(true);
				try {
					const query = { sessionId };
					if (repo) query.repo = repo;
					if (id) query.id = id;
					else if (symbol) query.q = symbol;
					setDetail(await api("/codegraph-panel/node", query));
					setTab("detail");
				} catch (error) {
					setDetail({ error: String(error.message || error) });
				} finally {
					setDetailBusy(false);
				}
			};

			const doSync = async (action) => {
				setSyncBusy(true);
				try {
					setSyncOut(await post("/codegraph-panel/sync", { repo, sessionId, action }));
					await load();
				} catch (error) {
					setSyncOut({ error: String(error.message || error) });
				} finally {
					setSyncBusy(false);
				}
			};

			const children = [];
			const project = state && state.project;
			const index = state && state.index;
			const summary = state && state.summary;

			const head = react.createElement(
				"div",
				{ className: "cg-head" },
				react.createElement("span", { className: "cg-title" }, "CodeGraph"),
				react.createElement(
					"div",
					{ className: "cg-tabs" },
					[
						["overview", "概览"],
						["search", "符号搜索"],
						["graph", "依赖图"],
						["impact", "影响面"],
						["detail", "符号详情"],
					].map((pair) =>
						react.createElement(
							"button",
							{
								key: pair[0],
								className: "cg-tab" + (tab === pair[0] ? " active" : ""),
								onClick: () => setTab(pair[0]),
							},
							pair[1]
						)
					)
				),
				react.createElement("span", { className: "cg-spacer" }),
				project ? react.createElement("span", { className: "cg-path", style: { maxWidth: 320 } }, project.title) : null,
				state && state.platform ? react.createElement(Chip, { tone: state.platform.cliAvailable ? "ok" : "bad" }, state.platform.cliAvailable ? "CLI " + (about && about.platform ? about.platform.cliVersion || "" : "") : "CLI 不可用") : null,
				react.createElement("button", { className: "cg-btn", onClick: () => load(undefined, true) }, busy ? "…" : "刷新"),
				about ? react.createElement("span", { className: "cg-k" }, "v" + about.version) : null
			);

			if (err) children.push(react.createElement("div", { className: "cg-banner bad", key: "err" }, err));

			// 概览
			if (tab === "overview") {
				if (!state) {
					children.push(react.createElement("div", { className: "cg-empty", key: "loading" }, "正在读取 CodeGraph 状态…"));
				} else if (!project) {
					children.push(
						react.createElement(
							"div",
							{ className: "cg-card", key: "noproj" },
							react.createElement("h4", null, "未找到项目"),
							react.createElement("p", { className: "cg-intro" }, "当前会话与已注册工作区里都没有 CodeGraph 项目。")
						)
					);
				} else if (!project.indexed) {
					children.push(
						react.createElement(
							"div",
							{ className: "cg-card", key: "noindex" },
							react.createElement("h4", null, "该仓库尚无 CodeGraph 索引"),
							react.createElement("p", { className: "cg-intro" }, project.path),
							react.createElement("div", { className: "cg-code" }, state.initCommand || "codegraph init")
						)
					);
				} else {
					if (state.indexError) {
						children.push(react.createElement("div", { className: "cg-banner warn", key: "idxerr" }, "CLI status 未取到：" + state.indexError + "（下方数据来自直接读库）"));
					}
					if (state.dbError) {
						children.push(react.createElement("div", { className: "cg-banner bad", key: "dberr" }, "读库失败：" + state.dbError));
					}
					children.push(
						react.createElement(
							"div",
							{ className: "cg-card", key: "ov" },
							react.createElement("h4", null, "索引概览"),
							react.createElement(
								"div",
								{ className: "cg-grid" },
								react.createElement(Field, { key: "proj", label: "项目", value: project.title }),
								react.createElement(Field, { key: "files", label: "文件", value: fmt(index ? index.fileCount : "-") }),
								react.createElement(Field, { key: "nodes", label: "节点", value: fmt(summary ? summary.nodes : index ? index.nodeCount : "-") }),
								react.createElement(Field, { key: "edges", label: "边", value: fmt(summary ? summary.edges : index ? index.edgeCount : "-") }),
								react.createElement(Field, { key: "db", label: "库大小", value: summary ? bytes(summary.dbSize) : "-" }),
								react.createElement(Field, { key: "backend", label: "后端", value: index ? index.backend : "-" }),
								react.createElement(Field, { key: "journal", label: "Journal", value: index ? index.journalMode : "-" }),
								react.createElement(Field, { key: "langs", label: "语言", value: summary && summary.languages && summary.languages.length ? summary.languages.join(", ") : "-" }),
								react.createElement(Field, { key: "last", label: "最近索引", value: index && index.lastIndexed ? String(index.lastIndexed).replace("T", " ").replace(/\..*/, "") : "-" }),
								react.createElement(Field, { key: "ver", label: "索引版本", value: index && index.version ? index.version : "-" })
							),
							index && index.pendingChanges
								? react.createElement(
										"div",
										{ className: "cg-row", style: { marginTop: "8px" } },
										react.createElement(
											Chip,
											{ tone: index.pendingChanges.added + index.pendingChanges.modified + index.pendingChanges.removed > 0 ? "warn" : "ok" },
											"待同步 +" + index.pendingChanges.added + " ~" + index.pendingChanges.modified + " -" + index.pendingChanges.removed
										),
										index.index && index.index.reindexRecommended ? react.createElement(Chip, { tone: "warn" }, "建议重建索引") : null,
										index.index && index.index.state ? react.createElement(Chip, null, "状态 " + index.index.state) : null
									)
								: null
						)
					);

					if (summary && summary.nodesByKind) {
						const kinds = Object.keys(summary.nodesByKind).sort((a, b) => summary.nodesByKind[b] - summary.nodesByKind[a]);
						const max = kinds.length > 0 ? summary.nodesByKind[kinds[0]] : 1;
						children.push(
							react.createElement(
								"div",
								{ className: "cg-card", key: "kinds" },
								react.createElement("h4", null, "节点类型分布"),
								react.createElement(
									"div",
									{ className: "cg-grid", style: { gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" } },
									kinds.map((kind) =>
										react.createElement(
											"div",
											{ className: "cg-kv", key: kind },
											react.createElement(
												"div",
												{ className: "cg-row", style: { justifyContent: "space-between" } },
												react.createElement("span", { className: "cg-k", style: { color: KIND_COLORS[kind] || undefined } }, kind),
												react.createElement("span", { className: "cg-v" }, fmt(summary.nodesByKind[kind]))
											),
											react.createElement("div", { className: "cg-bar" }, react.createElement("i", { style: { width: Math.max(2, Math.round((summary.nodesByKind[kind] / max) * 100)) + "%", background: KIND_COLORS[kind] || undefined } }))
										)
									)
								)
							)
						);
					}

					if (summary && summary.edgesByKind) {
						const ek = Object.keys(summary.edgesByKind).sort((a, b) => summary.edgesByKind[b] - summary.edgesByKind[a]);
						children.push(
							react.createElement(
								"div",
								{ className: "cg-card", key: "ekinds" },
								react.createElement("h4", null, "关系类型分布"),
								react.createElement(
									"div",
									{ className: "cg-row" },
									ek.map((kind) => react.createElement(Chip, { key: kind }, kind + " " + fmt(summary.edgesByKind[kind])))
								),
								react.createElement("p", { className: "cg-intro", style: { marginTop: "8px", marginBottom: 0 } }, "依赖图默认画 calls / imports / references / instantiates / extends；contains 是文件归属边，不画以免过密。")
							)
						);
					}

					children.push(
						react.createElement(
							"div",
							{ className: "cg-card", key: "sync" },
							react.createElement("h4", null, "索引维护"),
							react.createElement(
								"div",
								{ className: "cg-row" },
								react.createElement("button", { className: "cg-btn", disabled: syncBusy, onClick: () => doSync("sync") }, syncBusy ? "执行中…" : "增量同步（sync）"),
								react.createElement("button", { className: "cg-btn", disabled: syncBusy, onClick: () => doSync("index") }, syncBusy ? "执行中…" : "全量重建（index）"),
								react.createElement("span", { className: "cg-k" }, "由 codegraph CLI 自己写 .codegraph/，面板不改业务代码")
							),
							syncOut
								? react.createElement(
										"div",
										{ style: { marginTop: "8px" } },
										syncOut.error
											? react.createElement("div", { className: "cg-banner bad" }, syncOut.error)
											: react.createElement(
													"div",
													{ className: "cg-row" },
													react.createElement(Chip, { tone: syncOut.ok ? "ok" : "bad" }, (syncOut.ok ? "成功" : "退出码 " + syncOut.exitCode) + " · " + syncOut.elapsedMs + "ms"),
													react.createElement(Chip, null, syncOut.action)
												),
										react.createElement("div", { className: "cg-code", style: { marginTop: "6px" } }, (syncOut.stdout || "") + (syncOut.stderr ? "\n[stderr]\n" + syncOut.stderr : ""))
									)
								: null
						)
					);
				}

				if (state && state.projects && state.projects.length > 1) {
					children.push(
						react.createElement(
							"div",
							{ className: "cg-card", key: "projects" },
							react.createElement("h4", null, "其他项目"),
							react.createElement(
								"div",
								{ className: "cg-row" },
								state.projects
									.filter((item) => item.path !== project.path)
									.map((item) =>
										react.createElement(
											"button",
											{
												key: item.path,
												className: "cg-btn",
												onClick: () => {
													setRepo(item.path);
													load(item.path, true);
												},
											},
											item.title + (item.indexed ? "" : "（无索引）")
										)
									)
							)
						)
					);
				}
			}

			// 符号搜索
			if (tab === "search") {
				children.push(
					react.createElement(
						"div",
						{ className: "cg-card", key: "searchbox" },
						react.createElement("h4", null, "符号搜索"),
						react.createElement(
							"div",
							{ className: "cg-row" },
							react.createElement("input", {
								className: "cg-input",
								style: { flex: "1 1 220px" },
								placeholder: "函数 / 类 / 路由 / 常量名，支持部分匹配…",
								value: q,
								onChange: (event) => setQ(event.target.value),
								onKeyDown: (event) => {
									if (event.key === "Enter") doSearch();
								},
							}),
							react.createElement(
								"select",
								{ className: "cg-select", value: kindFilter, onChange: (event) => setKindFilter(event.target.value) },
								react.createElement("option", { value: "" }, "全部类型"),
								Object.keys(KIND_COLORS).map((kind) => react.createElement("option", { key: kind, value: kind }, kind))
							),
							react.createElement("button", { className: "cg-btn primary", disabled: searching, onClick: doSearch }, searching ? "搜索中…" : "搜索")
						)
					)
				);

				if (results && results.error) {
					children.push(react.createElement("div", { className: "cg-banner bad", key: "serr" }, results.error));
				} else if (results) {
					children.push(
						react.createElement(
							"div",
							{ className: "cg-card", key: "res" },
							react.createElement("h4", null, "结果 · " + results.count),
							results.count === 0
								? react.createElement("div", { className: "cg-empty" }, "无匹配符号")
								: react.createElement(
										"div",
										{ className: "cg-list" },
										results.results.map((item, index2) =>
											react.createElement(
												"div",
												{
													key: item.id || index2,
													className: "cg-item",
													onClick: () => doDetail(item.id),
													title: "点击查看详情",
												},
												react.createElement("span", { className: "cg-kind", style: { color: KIND_COLORS[item.kind] || undefined } }, item.kind),
												react.createElement("span", { className: "cg-name" }, item.name),
												react.createElement("span", { className: "cg-path" }, item.filePath + (item.startLine ? ":" + item.startLine : "")),
												react.createElement(
													"span",
													{ className: "cg-row", style: { flex: "0 0 auto" } },
													react.createElement(
														"button",
														{
															className: "cg-btn",
															onClick: (event) => {
																event.stopPropagation();
																setGraphQ(item.name);
																setTab("graph");
																doGraph(item.name);
															},
														},
														"图"
													),
													react.createElement(
														"button",
														{
															className: "cg-btn",
															onClick: (event) => {
																event.stopPropagation();
																setImpactQ(item.name);
																setTab("impact");
																doImpact(item.name);
															},
														},
														"影响"
													)
												)
											)
										)
									)
						)
					);
				}
			}

			// 依赖图
			if (tab === "graph") {
				children.push(
					react.createElement(
						"div",
						{ className: "cg-card", key: "graphbox" },
						react.createElement("h4", null, "调用关系图"),
						react.createElement(
							"div",
							{ className: "cg-row" },
							react.createElement("input", {
								className: "cg-input",
								style: { flex: "1 1 200px" },
								placeholder: "符号名，例如 login / saveOrder …",
								value: graphQ,
								onChange: (event) => setGraphQ(event.target.value),
								onKeyDown: (event) => {
									if (event.key === "Enter") doGraph();
								},
							}),
							react.createElement(
								"select",
								{ className: "cg-select", value: String(graphDepth), onChange: (event) => setGraphDepth(Number(event.target.value)) },
								[1, 2, 3].map((d) => react.createElement("option", { key: d, value: String(d) }, "深度 " + d))
							),
							react.createElement(
								"select",
								{ className: "cg-select", value: graphDir, onChange: (event) => setGraphDir(event.target.value) },
								react.createElement("option", { value: "both" }, "双向"),
								react.createElement("option", { value: "in" }, "谁依赖我"),
								react.createElement("option", { value: "out" }, "我依赖谁")
							),
							react.createElement("button", { className: "cg-btn primary", disabled: graphBusy, onClick: () => doGraph() }, graphBusy ? "构建中…" : "画图")
						),
						react.createElement("p", { className: "cg-intro", style: { marginTop: "8px", marginBottom: 0 } }, "以同名符号的全部定义为种子展开邻域。节点数超过上限会自动截断，避免浏览器卡死；滚轮缩放、拖拽移动、点击节点看详情。")
					)
				);

				if (graph && graph.error) {
					children.push(react.createElement("div", { className: "cg-banner bad", key: "gerr" }, graph.error));
				} else if (graph) {
					const seedIds = new Set(graph.seedIds || []);
					children.push(
						react.createElement(
							"div",
							{ className: "cg-card", key: "gstat" },
							react.createElement(
								"div",
								{ className: "cg-row" },
								react.createElement(Chip, null, "节点 " + (graph.nodes ? graph.nodes.length : 0)),
								react.createElement(Chip, null, "边 " + (graph.edges ? graph.edges.length : 0)),
								react.createElement(Chip, null, "深度 " + graph.depth),
								graph.truncated ? react.createElement(Chip, { tone: "warn" }, "已截断至上限") : null,
								graph.limits ? react.createElement("span", { className: "cg-k" }, "上限 " + graph.limits.nodes + " 节点 / " + graph.limits.edges + " 边") : null
							)
						),
						react.createElement(
							"div",
							{ className: "cg-card", key: "gcanvas", style: { padding: "6px" } },
							react.createElement(GraphView, {
								graph: graph,
								seedIds: seedIds,
								onPick: (id) => doDetail(id),
							})
						)
					);
				}
			}

			// 影响面
			if (tab === "impact") {
				children.push(
					react.createElement(
						"div",
						{ className: "cg-card", key: "impactbox" },
						react.createElement("h4", null, "影响面分析"),
						react.createElement(
							"div",
							{ className: "cg-row" },
							react.createElement("input", {
								className: "cg-input",
								style: { flex: "1 1 220px" },
								placeholder: "改哪个符号？例如 saveInvoice",
								value: impactQ,
								onChange: (event) => setImpactQ(event.target.value),
								onKeyDown: (event) => {
									if (event.key === "Enter") doImpact();
								},
							}),
							react.createElement("button", { className: "cg-btn primary", disabled: impactBusy, onClick: () => doImpact() }, impactBusy ? "分析中…" : "分析")
						),
						react.createElement("p", { className: "cg-intro", style: { marginTop: "8px", marginBottom: 0 } }, "沿「谁依赖我」方向做 2 跳展开：改这个符号会波及哪些代码。")
					)
				);

				if (impact && impact.error) {
					children.push(react.createElement("div", { className: "cg-banner bad", key: "ierr" }, impact.error));
				} else if (impact) {
					children.push(
						react.createElement(
							"div",
							{ className: "cg-card", key: "istat" },
							react.createElement(
								"div",
								{ className: "cg-row" },
								react.createElement(Chip, null, "受影响 " + impact.total),
								react.createElement(Chip, null, "深度 " + impact.depth),
								impact.truncated ? react.createElement(Chip, { tone: "warn" }, "已截断") : null
							)
						)
					);
					for (const bucket of impact.byDepth || []) {
						children.push(
							react.createElement(
								"div",
								{ className: "cg-card", key: "bucket" + bucket.depth },
								react.createElement("h4", null, bucket.depth === 0 ? "种子定义 · " + bucket.count : "第 " + bucket.depth + " 跳 · " + bucket.count),
								react.createElement(
									"div",
									{ className: "cg-list" },
									bucket.nodes.map((item) =>
										react.createElement(
											"div",
											{ key: item.id, className: "cg-item", onClick: () => doDetail(item.id) },
											react.createElement("span", { className: "cg-kind", style: { color: KIND_COLORS[item.kind] || undefined } }, item.kind),
											react.createElement("span", { className: "cg-name" }, item.name),
											react.createElement("span", { className: "cg-path" }, item.filePath + (item.startLine ? ":" + item.startLine : ""))
										)
									)
								)
							)
						);
					}
				}
			}

			// 符号详情
			if (tab === "detail") {
				if (!detail) {
					children.push(react.createElement("div", { className: "cg-empty", key: "nodetail" }, "从「符号搜索」「依赖图」或「影响面」里点一个符号，这里显示源码与调用链。"));
				} else if (detail.error) {
					children.push(react.createElement("div", { className: "cg-banner bad", key: "derr" }, detail.error));
				} else {
					const node = detail.node;
					children.push(
						react.createElement(
							"div",
							{ className: "cg-card", key: "dmeta" },
							react.createElement("h4", null, "符号"),
							node
								? react.createElement(
										"div",
										{ className: "cg-grid" },
										react.createElement(Field, { key: "name", label: "名称", value: node.name }),
										react.createElement(Field, { key: "kind", label: "类型", value: node.kind }),
										react.createElement(Field, { key: "file", label: "文件", value: node.filePath + ":" + node.startLine }),
										react.createElement(Field, { key: "lang", label: "语言", value: node.language }),
										react.createElement(Field, { key: "sig", label: "签名", value: node.signature || "-" }),
										react.createElement(Field, { key: "exp", label: "导出", value: node.isExported ? "是" : "否" }),
										react.createElement(Field, { key: "async", label: "异步", value: node.isAsync ? "是" : "否" }),
										react.createElement(Field, { key: "qname", label: "qualified", value: node.qualifiedName || "-" })
									)
								: react.createElement("div", { className: "cg-empty" }, "库里没有该符号的元数据"),
							node
								? react.createElement(
										"div",
										{ className: "cg-row", style: { marginTop: "8px" } },
										react.createElement(
											"button",
											{
												className: "cg-btn",
												onClick: () => {
													setGraphQ(node.name);
													setTab("graph");
													doGraph(node.name);
												},
											},
											"看依赖图"
										),
										react.createElement(
											"button",
											{
												className: "cg-btn",
												onClick: () => {
													setImpactQ(node.name);
													setTab("impact");
													doImpact(node.name);
												},
											},
											"看影响面"
										)
									)
								: null
						)
					);
					if (detail.detailError) {
						children.push(react.createElement("div", { className: "cg-banner warn", key: "dwerr" }, "源码未取到：" + detail.detailError));
					}
					if (detail.detail) {
						children.push(
							react.createElement(
								"div",
								{ className: "cg-card", key: "dsrc" },
								react.createElement("h4", null, "源码与调用链"),
								react.createElement("div", { className: "cg-code" }, detail.detail)
							)
						);
					}
				}
			}

			return react.createElement(
				"div",
				{ className: "cg-panel" },
				head,
				react.createElement("div", { className: "cg-body" }, children)
			);
		}

		function apply(ctx) {
			ctx.effect(() => {
				const el = document.createElement("style");
				el.setAttribute("data-codegraph-panel-mac", "");
				el.textContent = CSS;
				document.head.appendChild(el);
				return () => {
					try {
						el.remove();
					} catch (error) {
						/* 样式已移除 */
					}
				};
			}, "codegraph-panel-mac: styles");
			ctx.slots.inject("conversation.view", () => {
				return ctx.slots.register(
					{
						name: "conversation.view",
						id: "codegraph",
						order: 31,
						label: "CodeGraph",
					},
					(props) => react.createElement(Panel, props)
				);
			});
		}

		module.exports = {
			name: "codegraph-panel-mac",
			inject: ["slots"],
			apply,
		};
		return module.exports;
	},
});
