/**
 * codegraph.js —— CodeGraph 数据层（只读为主）。
 *
 * CodeGraph 本身没有 UI（`codegraph ui` 明确报 "coming in an upcoming release"），
 * 只提供 CLI 与一个 SQLite 库。本模块把两者收成面板可用的形状：
 *
 *   1. CLI 通道：status / query / impact / node / sync / index，全部走 `--json`；
 *   2. DB 直读：`nodes` + `edges` 表用于画真正的依赖图 —— CLI 的 `impact`
 *      只给平铺节点列表，拿不到连线，因此画图必须直接查库；
 *   3. 子图抽取：以若干种子符号为中心做 N 跳邻域，并对节点/边数量设上限，
 *      避免 6875 节点的全图把浏览器拖死。
 *
 * 整个模块零第三方依赖，只用 node:sqlite（Node 22+ 内置）。
 * DB 一律以 readOnly 打开，绝不写入 CodeGraph 的资产。
 */

import { DatabaseSync } from 'node:sqlite'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 子图规模上限：超过这个量浏览器渲染会明显掉帧。 */
export const GRAPH_NODE_LIMIT = 150
export const GRAPH_EDGE_LIMIT = 400

/** 画图时纳入的边类型（contains 是文件→符号的归属边，默认不画，太密）。 */
export const DRAWABLE_EDGE_KINDS = ['calls', 'imports', 'references', 'instantiates', 'extends']

/** 索引里各 kind 的展示排序权重（越靠前越重要）。 */
const KIND_ORDER = [
  'route',
  'function',
  'method',
  'class',
  'interface',
  'component',
  'type_alias',
  'constant',
  'variable',
  'property',
  'import',
  'file',
]

export function kindRank(kind) {
  const index = KIND_ORDER.indexOf(String(kind ?? ''))
  return index < 0 ? KIND_ORDER.length : index
}

/**
 * 解析项目索引位置并做基本体检。
 * 返回 exists / dbPath / dbSize / 是否可读，不做任何写入。
 */
export function inspectIndex(projectPath) {
  const indexPath = join(projectPath, '.codegraph')
  const dbPath = join(indexPath, 'codegraph.db')
  const present = existsSync(dbPath)
  let dbSize = 0
  if (present) {
    try {
      dbSize = statSync(dbPath).size
    } catch (error) {
      dbSize = 0
    }
  }
  return { projectPath, indexPath, dbPath, present, dbSize }
}

/**
 * 以只读方式打开 CodeGraph 库。
 *
 * 失败时抛出带可读原因的 Error（面板据此显示「索引未建立 / 库被锁 / 版本不符」）。
 * 调用方负责 close()。
 */
export function openDatabase(dbPath) {
  if (!existsSync(dbPath)) {
    throw new Error(`未找到 CodeGraph 索引：${dbPath}（先在该仓库跑 codegraph init）`)
  }
  try {
    return new DatabaseSync(dbPath, { readOnly: true })
  } catch (error) {
    const detail = error && error.message ? error.message : String(error)
    throw new Error(`打开 CodeGraph 库失败：${detail}`)
  }
}

/** 读取表是否存在（旧版本库可能缺表）。 */
function hasTable(db, name) {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(name)
    return !!row
  } catch (error) {
    return false
  }
}

/**
 * 统计节点与边的分布，用于概览区块。
 * 只做聚合查询，不拉明细。
 */
export function summarize(db) {
  const out = { nodes: 0, edges: 0, nodesByKind: {}, edgesByKind: {}, languages: [] }
  if (!hasTable(db, 'nodes')) return out
  try {
    for (const row of db.prepare('SELECT kind, COUNT(*) AS n FROM nodes GROUP BY kind').all()) {
      out.nodesByKind[row.kind] = Number(row.n) || 0
      out.nodes += Number(row.n) || 0
    }
  } catch (error) {
    /* 结构不符时保持 0 */
  }
  if (hasTable(db, 'edges')) {
    try {
      for (const row of db.prepare('SELECT kind, COUNT(*) AS n FROM edges GROUP BY kind').all()) {
        out.edgesByKind[row.kind] = Number(row.n) || 0
        out.edges += Number(row.n) || 0
      }
    } catch (error) {
      /* 同上 */
    }
  }
  try {
    const langs = db
      .prepare("SELECT DISTINCT language FROM nodes WHERE language IS NOT NULL AND language <> ''")
      .all()
    out.languages = langs.map((row) => String(row.language)).sort()
  } catch (error) {
    out.languages = []
  }
  return out
}

/** 把库里的节点行转成面板统一形状。 */
function toNode(row) {
  return {
    id: String(row.id ?? ''),
    kind: String(row.kind ?? ''),
    name: String(row.name ?? ''),
    qualifiedName: String(row.qualified_name ?? ''),
    filePath: String(row.file_path ?? ''),
    language: String(row.language ?? ''),
    startLine: Number(row.start_line) || 0,
    endLine: Number(row.end_line) || 0,
    signature: String(row.signature ?? ''),
    isExported: Number(row.is_exported) === 1,
    isAsync: Number(row.is_async) === 1,
  }
}

/**
 * 按符号名查节点，支持 kind 过滤。
 * 优先精确匹配 name，其次 qualified_name 包含，最后回退模糊。
 */
export function findNodes(db, name, options = {}) {
  const wanted = String(name ?? '').trim()
  if (!wanted) return []
  const limit = clampInt(options.limit, 1, 200, 30)
  const kind = String(options.kind ?? '').trim()
  if (!hasTable(db, 'nodes')) return []

  const filters = []
  const params = []
  if (kind) {
    filters.push('kind = ?')
    params.push(kind)
  }

  const exact = db
    .prepare(
      `SELECT * FROM nodes WHERE name = ?${filters.length ? ' AND ' + filters.join(' AND ') : ''}
       ORDER BY kind, file_path LIMIT ?`,
    )
    .all(wanted, ...params, limit)
  if (exact.length > 0) return exact.map(toNode)

  const contains = db
    .prepare(
      `SELECT * FROM nodes WHERE (qualified_name LIKE ? OR name LIKE ?)
       ${filters.length ? ' AND ' + filters.join(' AND ') : ''}
       ORDER BY kind, file_path LIMIT ?`,
    )
    .all('%' + wanted + '%', '%' + wanted + '%', ...params, limit)
  return contains.map(toNode)
}

/** 按 id 批量取节点（画图时补全邻居信息）。 */
export function nodesByIds(db, ids) {
  const list = Array.from(new Set((ids || []).filter(Boolean)))
  if (list.length === 0 || !hasTable(db, 'nodes')) return []
  const out = []
  // SQLite 变量上限保守取 500，分批避免 "too many SQL variables"
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400)
    const placeholders = chunk.map(() => '?').join(',')
    const rows = db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...chunk)
    for (const row of rows) out.push(toNode(row))
  }
  return out
}

/**
 * 抽取以种子节点为中心的 N 跳子图。
 *
 * 这是面板画图的核心：CLI 的 impact 只给平铺节点，没有连线；真实依赖关系必须
 * 从 edges 表读。为了不把 15k 条边全塞给浏览器，这里做三件事：
 *   1. 只走可画的边类型（默认排除 contains）；
 *   2. 逐跳 BFS，到上限即停并把 truncated 标出来；
 *   3. 边只保留两端都在结果集内的（避免出现悬空端点）。
 */
export function extractSubgraph(db, seedIds, options = {}) {
  const depth = clampInt(options.depth, 1, 3, 1)
  const nodeLimit = clampInt(options.nodeLimit, 1, 500, GRAPH_NODE_LIMIT)
  const edgeLimit = clampInt(options.edgeLimit, 1, 2000, GRAPH_EDGE_LIMIT)
  const kinds = Array.isArray(options.edgeKinds) && options.edgeKinds.length > 0
    ? options.edgeKinds.filter((k) => DRAWABLE_EDGE_KINDS.includes(k))
    : DRAWABLE_EDGE_KINDS
  const direction = options.direction === 'in' || options.direction === 'out' ? options.direction : 'both'

  const empty = { nodes: [], edges: [], truncated: false, depth, edgeKinds: kinds }
  if (!hasTable(db, 'nodes') || !hasTable(db, 'edges')) return empty
  const seeds = Array.from(new Set((seedIds || []).filter(Boolean)))
  if (seeds.length === 0) return empty

  const visited = new Set(seeds)
  const collectedEdges = new Map() // id -> edge row
  let frontier = seeds.slice()
  let truncated = false

  for (let hop = 0; hop < depth; hop += 1) {
    if (frontier.length === 0) break
    const next = []
    for (let i = 0; i < frontier.length; i += 200) {
      const chunk = frontier.slice(i, i + 200)
      const placeholders = chunk.map(() => '?').join(',')
      const kindPlaceholders = kinds.map(() => '?').join(',')
      const sql =
        direction === 'out'
          ? `SELECT id, source, target, kind, line, provenance FROM edges
             WHERE source IN (${placeholders}) AND kind IN (${kindPlaceholders}) LIMIT ?`
          : direction === 'in'
            ? `SELECT id, source, target, kind, line, provenance FROM edges
               WHERE target IN (${placeholders}) AND kind IN (${kindPlaceholders}) LIMIT ?`
            : `SELECT id, source, target, kind, line, provenance FROM edges
               WHERE (source IN (${placeholders}) OR target IN (${placeholders}))
                 AND kind IN (${kindPlaceholders}) LIMIT ?`
      const args =
        direction === 'both'
          ? [...chunk, ...chunk, ...kinds, edgeLimit * 2]
          : [...chunk, ...kinds, edgeLimit * 2]
      let rows = []
      try {
        rows = db.prepare(sql).all(...args)
      } catch (error) {
        rows = []
      }
      for (const row of rows) {
        const source = String(row.source ?? '')
        const target = String(row.target ?? '')
        if (!source || !target) continue
        collectedEdges.set(String(row.id ?? source + '>' + target + ':' + row.kind), row)
        for (const endpoint of [source, target]) {
          if (!visited.has(endpoint)) {
            if (visited.size >= nodeLimit) {
              truncated = true
              continue
            }
            visited.add(endpoint)
            next.push(endpoint)
          }
        }
      }
      if (collectedEdges.size >= edgeLimit) {
        truncated = true
        break
      }
    }
    frontier = next
    if (truncated && visited.size >= nodeLimit) break
  }

  const nodeRows = nodesByIds(db, Array.from(visited))
  const nodeSet = new Set(nodeRows.map((node) => node.id))
  const edges = []
  for (const row of collectedEdges.values()) {
    const source = String(row.source ?? '')
    const target = String(row.target ?? '')
    if (!nodeSet.has(source) || !nodeSet.has(target)) continue
    edges.push({
      id: String(row.id ?? source + '>' + target),
      source,
      target,
      kind: String(row.kind ?? ''),
      line: Number(row.line) || 0,
    })
    if (edges.length >= edgeLimit) {
      truncated = true
      break
    }
  }

  nodeRows.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.filePath.localeCompare(b.filePath))
  return { nodes: nodeRows, edges, truncated, depth, edgeKinds: kinds, seedIds: seeds }
}

/**
 * 影响面分析：从种子节点出发沿 calls/imports/references 做 BFS，
 * 按距离分组返回，供面板显示「改这个符号会波及什么」。
 *
 * 与 extractSubgraph 的差别：这里关心的是**受影响的集合与距离**，
 * 因此只沿「谁依赖我」的方向（默认 in），并按跳数归档。
 */
export function analyzeImpact(db, seedIds, options = {}) {
  const depth = clampInt(options.depth, 1, 3, 2)
  const limit = clampInt(options.limit, 1, 500, 200)
  const kinds = DRAWABLE_EDGE_KINDS
  const seeds = Array.from(new Set((seedIds || []).filter(Boolean)))
  if (seeds.length === 0 || !hasTable(db, 'edges')) {
    return { available: false, reason: '没有可分析的种子节点' }
  }

  const seen = new Map() // id -> hop
  for (const seed of seeds) seen.set(seed, 0)
  let frontier = seeds.slice()
  let truncated = false

  for (let hop = 1; hop <= depth; hop += 1) {
    if (frontier.length === 0) break
    const next = []
    for (let i = 0; i < frontier.length; i += 200) {
      const chunk = frontier.slice(i, i + 200)
      const placeholders = chunk.map(() => '?').join(',')
      const kindPlaceholders = kinds.map(() => '?').join(',')
      let rows = []
      try {
        rows = db
          .prepare(
            `SELECT source FROM edges WHERE target IN (${placeholders})
             AND kind IN (${kindPlaceholders}) LIMIT ?`,
          )
          .all(...chunk, ...kinds, limit)
      } catch (error) {
        rows = []
      }
      for (const row of rows) {
        const source = String(row.source ?? '')
        if (!source || seen.has(source)) continue
        if (seen.size >= limit) {
          truncated = true
          continue
        }
        seen.set(source, hop)
        next.push(source)
      }
    }
    frontier = next
  }

  const ids = Array.from(seen.keys())
  const nodeRows = nodesByIds(db, ids)
  const buckets = new Map()
  for (const node of nodeRows) {
    const hop = seen.get(node.id)
    if (!buckets.has(hop)) buckets.set(hop, [])
    buckets.get(hop).push(node)
  }
  const byDepth = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hop, nodes]) => ({ depth: hop, count: nodes.length, nodes }))

  return {
    available: true,
    depth,
    total: nodeRows.length,
    truncated,
    byDepth,
  }
}

/** 把正整数参数夹到合理范围内。 */
export function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const i = Math.trunc(n)
  if (i < min) return min
  if (i > max) return max
  return i
}

export { KIND_ORDER }
