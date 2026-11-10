/**
 * index.js —— codegraph-panel-mac 宿主半（Cordis 插件）。
 *
 * CodeGraph 官方没有 UI（`codegraph ui` 明确提示将在后续版本提供），本插件补上：
 * 在 DSH 会话标签栏加一个 CodeGraph 标签，提供索引概览、符号搜索、调用关系图、
 * 影响面分析与符号详情，以及一键 sync / 重建索引。
 *
 * 提供以下本地端点：
 *   GET  /codegraph-panel/state      索引概览 + 项目列表 + 平台诊断
 *   GET  /codegraph-panel/query      符号搜索（?q=&kind=&limit=）
 *   GET  /codegraph-panel/graph      局部依赖图（?id=|q=&depth=&direction=&kinds=）
 *   GET  /codegraph-panel/impact     影响面分析（?q=&depth=）
 *   GET  /codegraph-panel/node       符号详情 + 源码（?id=|q=）
 *   POST /codegraph-panel/sync       执行 codegraph sync / index
 *   GET  /codegraph-panel/about      版本与平台诊断
 *
 * 写入边界：本插件只读 CodeGraph 资产（`.codegraph/` 一律 readOnly 打开）。
 * 唯一的写操作是 sync / index —— 由 codegraph CLI 自己完成，面板只负责发起
 * 并把输出转成人话。不碰业务源码。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

import {
  DRAWABLE_EDGE_KINDS,
  analyzeImpact,
  clampInt,
  extractSubgraph,
  findNodes,
  inspectIndex,
  nodesByIds,
  openDatabase,
  summarize,
} from './codegraph.js'
import { buildEnv, platformInfo, resolveBinary, userHome } from './platform.js'

/** 请求体上限（sync 只带小 JSON）。 */
const BODY_LIMIT = 64 * 1024

const SELF = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  } catch (error) {
    return { name: 'codegraph-panel-mac', version: '0.0.0', homepage: '' }
  }
})()

export const name = 'codegraph-panel-mac'
export const inject = ['webServer']

export function apply(ctx, config) {
  const settings = normalizeConfig(config)
  try {
    install(ctx, settings)
  } catch (error) {
    console.error('[codegraph-panel-mac] 装载失败：', error)
  }
}

/** 配置默认值与校验（装载期响亮失败，避免带错误默认值继续跑）。 */
function normalizeConfig(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const allowed = ['binPath', 'cliTimeoutMs', 'graphNodeLimit', 'graphEdgeLimit', 'defaultDepth']
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw new Error(`未知配置字段 ${key}（可用：${allowed.join('、')}）`)
    }
  }
  const num = (key, fallback, min, max) => {
    if (input[key] === undefined || input[key] === null) return fallback
    const n = Number(input[key])
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`配置项 ${key} 必须是 ${min}–${max} 之间的数字`)
    }
    return Math.trunc(n)
  }
  return {
    binPath: typeof input.binPath === 'string' ? input.binPath : '',
    cliTimeoutMs: num('cliTimeoutMs', 180000, 5000, 1800000),
    graphNodeLimit: num('graphNodeLimit', 150, 10, 500),
    graphEdgeLimit: num('graphEdgeLimit', 400, 10, 2000),
    defaultDepth: num('defaultDepth', 1, 1, 3),
  }
}

function install(ctx, settings) {
  /* ------------------------------------------------------------------ *
   * 基础助手
   * ------------------------------------------------------------------ */

  const str = (value) => (value === undefined || value === null ? '' : String(value))

  function clip(value, limit) {
    const text = str(value)
    return text.length > limit ? text.slice(0, limit) + '…' : text
  }

  /** 会话工作目录，用于把面板自动定位到当前项目。 */
  function sessionCwd(sessionId) {
    const sessions = ctx.get('sessions')
    if (!sessionId || sessions === undefined) return ''
    try {
      const session = sessions.get(sessionId)
      if (!session) return ''
      const header = session.header
      if (header && typeof header.cwd === 'string') return header.cwd
      if (typeof session.cwd === 'string') return session.cwd
      return ''
    } catch (error) {
      return ''
    }
  }

  /** 已注册工作区列表。 */
  function workspaceList() {
    const registry = ctx.get('workspaceRegistry')
    if (registry === undefined) return []
    try {
      return registry.list() || []
    } catch (error) {
      return []
    }
  }

  async function resolveBinaryPath() {
    return resolveBinary(settings.binPath)
  }

  /* ------------------------------------------------------------------ *
   * CLI 通道：subprocess 优先，失败回退 shell
   * ------------------------------------------------------------------ */

  let transport = ''

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), ms)),
    ])
  }

  async function viaSubprocess(bin, argv, cwd) {
    const subprocess = ctx.get('subprocess')
    if (subprocess === undefined) {
      return { ran: false, transport: 'subprocess', error: 'subprocess 服务不可用' }
    }
    let handle = null
    try {
      handle = subprocess.spawn({
        argv: [bin].concat(argv),
        cwd,
        env: buildEnv(),
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 8 * 1024 * 1024 },
          stderr: { maxBytes: 512 * 1024 },
        },
        graceMs: 3000,
      })
    } catch (error) {
      return { ran: false, transport: 'subprocess', error: clip(error?.message ?? error, 300) }
    }
    const settled = handle.done.then(
      (outcome) => outcome || {},
      (error) => ({ failure: clip(error?.message ?? error, 300) }),
    )
    const outcome = await withTimeout(settled, settings.cliTimeoutMs)
    if (outcome && outcome.timedOut) {
      try {
        handle.terminate()
      } catch (error) {
        /* 忽略 */
      }
      return { ran: false, transport: 'subprocess', error: `命令超时（${settings.cliTimeoutMs}ms）` }
    }
    let stdout = ''
    let stderr = ''
    try {
      if (handle.collected?.stdout) stdout = str(handle.collected.stdout.readFrom(0).text)
    } catch (error) {
      stdout = ''
    }
    try {
      if (handle.collected?.stderr) stderr = str(handle.collected.stderr.readFrom(0).text)
    } catch (error) {
      stderr = ''
    }
    return {
      ran: true,
      transport: 'subprocess',
      exitCode: outcome?.exitCode ?? null,
      stdout,
      stderr,
      failure: outcome?.failure ?? '',
    }
  }

  async function viaShell(bin, argv, cwd) {
    const shell = ctx.get('shell')
    if (shell === undefined) return { ran: false, transport: 'shell', error: 'shell 服务不可用' }
    try {
      const quote = (value) => '"' + str(value) + '"'
      const command = [bin].concat(argv).map(quote).join(' ')
      const result = await shell.run(shell.resolve({ command, workdir: cwd, timeoutMs: settings.cliTimeoutMs }))
      return {
        ran: true,
        transport: 'shell',
        exitCode: result?.exitCode ?? null,
        stdout: result?.stdout ? str(result.stdout.text) : '',
        stderr: result?.stderr ? str(result.stderr.text) : '',
      }
    } catch (error) {
      return { ran: false, transport: 'shell', error: clip(error?.message ?? error, 300) }
    }
  }

  /** 跑一条 CLI 命令，按最小权限优先尝试各通道，记住命中的那个。 */
  async function runCli(bin, argv, cwd) {
    if (!bin) return { ran: false, error: '未找到 codegraph 可执行文件', attempts: [] }
    const order = transport ? [transport, 'subprocess', 'shell'] : ['subprocess', 'shell']
    const attempts = []
    let last = null
    for (const kind of order) {
      const result = kind === 'subprocess' ? await viaSubprocess(bin, argv, cwd) : await viaShell(bin, argv, cwd)
      attempts.push(kind + (result.ran ? '✓' : '✗'))
      if (result.ran) {
        transport = kind
        return { ...result, attempts }
      }
      last = result
    }
    return { ...(last || { ran: false }), attempts }
  }

  /** 跑 CLI 并解析 JSON。 */
  async function runCliJson(bin, argv, cwd) {
    const result = await runCli(bin, argv, cwd)
    if (!result.ran) return { ok: false, error: result.error || 'CLI 不可用', attempts: result.attempts }
    const raw = str(result.stdout)
    const start = raw.indexOf('[') >= 0 && (raw.indexOf('{') < 0 || raw.indexOf('[') < raw.indexOf('{'))
      ? raw.indexOf('[')
      : raw.indexOf('{')
    if (start < 0) {
      return {
        ok: false,
        error: '命令没有返回 JSON',
        stderr: clip(result.stderr, 600),
        exitCode: result.exitCode,
        attempts: result.attempts,
      }
    }
    try {
      return {
        ok: true,
        json: JSON.parse(raw.slice(start)),
        exitCode: result.exitCode,
        stderr: clip(result.stderr, 600),
        attempts: result.attempts,
      }
    } catch (error) {
      return {
        ok: false,
        error: 'JSON 解析失败：' + clip(error.message, 200),
        stderr: clip(result.stderr, 600),
        attempts: result.attempts,
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 项目解析
   * ------------------------------------------------------------------ */

  function normPath(value) {
    return str(value).replace(/\\/g, '/').replace(/\/+$/, '')
  }

  /** 枚举带 CodeGraph 索引的项目（已注册工作区 + 会话目录）。 */
  function candidateProjects(sessionId) {
    const out = []
    const seen = new Set()
    const push = (path, title, source) => {
      const value = str(path).trim()
      if (!value) return
      const key = normPath(value)
      if (seen.has(key)) return
      seen.add(key)
      out.push({
        path: value,
        title: str(title) || value.split('/').pop() || value,
        source,
        indexed: existsSync(join(value, '.codegraph', 'codegraph.db')),
      })
    }
    const cwd = normPath(sessionCwd(sessionId))
    if (cwd) push(cwd, cwd.split('/').pop(), 'session')
    for (const workspace of workspaceList()) {
      push(workspace.path, workspace.title, 'workspace')
    }
    return out
  }

  /** 选定要操作的项目：显式 repo 优先，否则会话目录，否则第一个已索引项目。 */
  function pickProject(repo, sessionId) {
    const projects = candidateProjects(sessionId)
    const wanted = normPath(repo)
    if (wanted) {
      const hit = projects.find((item) => normPath(item.path) === wanted)
      if (hit) return hit
      // 显式给了路径但不在注册表里 —— 仍然尊重它（用户可能手工指定）
      return {
        path: str(repo),
        title: str(repo).split('/').pop() || str(repo),
        source: 'explicit',
        indexed: existsSync(join(repo, '.codegraph', 'codegraph.db')),
      }
    }
    return (
      projects.find((item) => item.source === 'session' && item.indexed) ||
      projects.find((item) => item.indexed) ||
      projects[0] ||
      null
    )
  }

  /* ------------------------------------------------------------------ *
   * 路由处理
   * ------------------------------------------------------------------ */

  /** 索引概览（读 CLI status 拿权威状态，读库拿分布）。 */
  async function buildState(query) {
    const project = pickProject(query.get('repo'), query.get('sessionId'))
    const bin = await resolveBinaryPath()
    const projects = candidateProjects(query.get('sessionId'))
    const platform = {
      ...platformInfo,
      home: userHome(),
      binPath: bin,
      cliAvailable: bin !== '',
    }
    if (!project) {
      return { projects, project: null, platform, index: null, summary: null }
    }
    if (!project.indexed) {
      return {
        projects,
        project,
        platform,
        index: null,
        summary: null,
        reason: '该仓库没有 CodeGraph 索引（先跑 codegraph init）',
        initCommand: `cd "${project.path}" && codegraph init`,
      }
    }

    let statusJson = null
    let statusError = ''
    if (bin) {
      const status = await runCliJson(bin, ['status', '--json'], project.path)
      if (status.ok) statusJson = status.json
      else statusError = status.error || ''
    } else {
      statusError = '未找到 codegraph 可执行文件'
    }

    let summary = null
    let dbError = ''
    try {
      const info = inspectIndex(project.path)
      const db = openDatabase(info.dbPath)
      try {
        summary = summarize(db)
      } finally {
        db.close()
      }
      summary.dbSize = info.dbSize
      summary.dbPath = info.dbPath
    } catch (error) {
      dbError = clip(error?.message ?? error, 300)
    }

    return {
      projects,
      project,
      platform,
      bin,
      index: statusJson,
      indexError: statusError,
      summary,
      dbError,
      transport,
    }
  }

  /** 符号搜索：优先走 DB（可控 limit 与 kind），CLI 作为补充。 */
  async function buildQuery(query) {
    const project = pickProject(query.get('repo'), query.get('sessionId'))
    if (!project) return { error: '没有可用项目' }
    if (!project.indexed) return { error: '该仓库没有 CodeGraph 索引', initCommand: `cd "${project.path}" && codegraph init` }
    const q = str(query.get('q')).trim()
    if (!q) return { results: [], q: '' }
    const kind = str(query.get('kind')).trim()
    const limit = clampInt(query.get('limit'), 1, 200, 40)

    let results = []
    let dbError = ''
    try {
      const db = openDatabase(inspectIndex(project.path).dbPath)
      try {
        results = findNodes(db, q, { kind, limit }).map((node) => ({
          ...node,
          id: node.id,
        }))
      } finally {
        db.close()
      }
    } catch (error) {
      dbError = clip(error?.message ?? error, 300)
    }

    // DB 命中为空时回退 CLI 的模糊搜索（它带 FTS 分词能力）
    if (results.length === 0) {
      const bin = await resolveBinaryPath()
      if (bin) {
        const argv = ['query', q, '--json', '-l', String(limit)]
        if (kind) argv.push('-k', kind)
        const cli = await runCliJson(bin, argv, project.path)
        if (cli.ok && Array.isArray(cli.json)) {
          results = cli.json.map((item) => {
            const node = item?.node || item
            return {
              id: str(node.id),
              kind: str(node.kind),
              name: str(node.name),
              qualifiedName: str(node.qualifiedName || node.qualified_name),
              filePath: str(node.filePath || node.file_path),
              language: str(node.language),
              startLine: Number(node.startLine || node.start_line) || 0,
              signature: str(node.signature),
            }
          })
        }
      }
    }

    return { q, kind, limit, count: results.length, results, dbError, project: project.path }
  }

  /** 局部依赖图：种子可由 id 直接给，也可由符号名解析。 */
  async function buildGraph(query) {
    const project = pickProject(query.get('repo'), query.get('sessionId'))
    if (!project) return { error: '没有可用项目' }
    if (!project.indexed) return { error: '该仓库没有 CodeGraph 索引' }

    const depth = clampInt(query.get('depth'), 1, 3, settings.defaultDepth)
    const direction = str(query.get('direction')) || 'both'
    const kindsParam = str(query.get('kinds'))
    const edgeKinds = kindsParam
      ? kindsParam.split(',').map((item) => item.trim()).filter(Boolean)
      : DRAWABLE_EDGE_KINDS

    let seedIds = []
    const rawIds = str(query.get('ids'))
    if (rawIds) seedIds = rawIds.split(',').map((item) => item.trim()).filter(Boolean)

    let seeds = []
    try {
      const db = openDatabase(inspectIndex(project.path).dbPath)
      try {
        if (seedIds.length === 0) {
          const symbol = str(query.get('q')).trim()
          if (!symbol) return { error: '缺少 q（符号名）或 ids 参数' }
          seeds = findNodes(db, symbol, { limit: 60 })
          seedIds = seeds.map((item) => item.id)
        } else {
          seeds = nodesByIds(db, seedIds)
        }
        if (seedIds.length === 0) {
          return { error: `未找到符号「${str(query.get('q'))}」`, seeds: [] }
        }
        const graph = extractSubgraph(db, seedIds, {
          depth,
          direction,
          edgeKinds,
          nodeLimit: settings.graphNodeLimit,
          edgeLimit: settings.graphEdgeLimit,
        })
        return {
          project: project.path,
          seeds,
          ...graph,
          limits: { nodes: settings.graphNodeLimit, edges: settings.graphEdgeLimit },
        }
      } finally {
        db.close()
      }
    } catch (error) {
      return { error: clip(error?.message ?? error, 400) }
    }
  }

  /** 影响面：改这个符号会波及什么。 */
  async function buildImpact(query) {
    const project = pickProject(query.get('repo'), query.get('sessionId'))
    if (!project) return { error: '没有可用项目' }
    if (!project.indexed) return { error: '该仓库没有 CodeGraph 索引' }
    const symbol = str(query.get('q')).trim()
    if (!symbol) return { error: '缺少 q（符号名）' }
    const depth = clampInt(query.get('depth'), 1, 3, 2)
    try {
      const db = openDatabase(inspectIndex(project.path).dbPath)
      try {
        const seeds = findNodes(db, symbol, { limit: 60 })
        if (seeds.length === 0) return { error: `未找到符号「${symbol}」` }
        const impact = analyzeImpact(db, seeds.map((item) => item.id), { depth })
        return { project: project.path, symbol, seeds, ...impact }
      } finally {
        db.close()
      }
    } catch (error) {
      return { error: clip(error?.message ?? error, 400) }
    }
  }

  /** 符号详情：库里取元数据，源码交给 CLI 的 node 命令（它带调用链）。 */
  async function buildNode(query) {
    const project = pickProject(query.get('repo'), query.get('sessionId'))
    if (!project) return { error: '没有可用项目' }
    if (!project.indexed) return { error: '该仓库没有 CodeGraph 索引' }
    const id = str(query.get('id')).trim()
    const symbol = str(query.get('q')).trim()
    if (!id && !symbol) return { error: '缺少 id 或 q 参数' }

    const bin = await resolveBinaryPath()
    let node = null
    try {
      const db = openDatabase(inspectIndex(project.path).dbPath)
      try {
        if (id) {
          const found = nodesByIds(db, [id])
          node = found[0] || null
        } else {
          const found = findNodes(db, symbol, { limit: 1 })
          node = found[0] || null
        }
      } finally {
        db.close()
      }
    } catch (error) {
      /* 落到 CLI 兜底 */
    }

    let detail = ''
    let detailError = ''
    if (bin) {
      const argv = ['node']
      if (node && node.filePath) {
        argv.push(node.name || symbol, '--file', node.filePath)
      } else {
        argv.push(symbol || id)
      }
      const result = await runCli(bin, argv, project.path)
      if (result.ran) detail = clip(result.stdout, 60000)
      else detailError = result.error || ''
    } else {
      detailError = '未找到 codegraph 可执行文件'
    }

    return { project: project.path, node, detail, detailError }
  }

  /** 一键 sync / index（唯一会写 .codegraph 的操作，由 CLI 自己完成）。 */
  async function runSync(body) {
    const project = pickProject(body?.repo, body?.sessionId)
    if (!project) return { error: '没有可用项目' }
    if (!project.indexed) return { error: '该仓库没有 CodeGraph 索引', initCommand: `cd "${project.path}" && codegraph init` }
    const action = str(body?.action) === 'index' ? 'index' : 'sync'
    const bin = await resolveBinaryPath()
    if (!bin) return { error: '未找到 codegraph 可执行文件' }
    const started = Date.now()
    const result = await runCli(bin, [action], project.path)
    const elapsedMs = Date.now() - started
    if (!result.ran) return { error: result.error || '命令执行失败', action, elapsedMs }
    return {
      action,
      exitCode: result.exitCode,
      ok: result.exitCode === 0,
      elapsedMs,
      stdout: clip(result.stdout, 8000),
      stderr: clip(result.stderr, 4000),
      transport: result.transport,
    }
  }

  /** 版本与平台诊断。 */
  async function buildAbout() {
    const bin = await resolveBinaryPath()
    let version = ''
    let versionError = ''
    if (bin) {
      const result = await runCli(bin, ['--version'], userHome())
      if (result.ran) version = clip(result.stdout, 200).trim()
      else versionError = result.error || ''
    }
    const diskVersion = readDiskVersion()
    return {
      packageName: SELF.name,
      version: SELF.version,
      loadedVersion: SELF.version,
      diskVersion,
      restartRequired: diskVersion !== '' && diskVersion !== SELF.version,
      homepage: str(SELF.homepage),
      platform: {
        ...platformInfo,
        home: userHome(),
        binPath: bin,
        cliAvailable: bin !== '',
        cliVersion: version,
        cliError: versionError,
      },
      transport,
      limits: {
        graphNodeLimit: settings.graphNodeLimit,
        graphEdgeLimit: settings.graphEdgeLimit,
        defaultDepth: settings.defaultDepth,
        cliTimeoutMs: settings.cliTimeoutMs,
      },
    }
  }

  function readDiskVersion() {
    try {
      const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
      return str(JSON.parse(raw).version)
    } catch (error) {
      return ''
    }
  }

  /* ------------------------------------------------------------------ *
   * HTTP 管路
   * ------------------------------------------------------------------ */

  function sendJson(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  function route(handler) {
    return async (req, res) => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { error: '仅支持 GET' })
          return
        }
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        sendJson(res, 200, await handler(url.searchParams))
      } catch (error) {
        sendJson(res, 500, { error: clip(error?.message ?? error, 500) })
      }
    }
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > BODY_LIMIT) {
          reject(new Error('请求体过大'))
          try {
            req.destroy()
          } catch (error) {
            /* 忽略 */
          }
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8').trim()
        if (!raw) return resolve({})
        try {
          resolve(JSON.parse(raw))
        } catch (error) {
          reject(new Error('请求体不是合法 JSON'))
        }
      })
      req.on('error', reject)
    })
  }

  function routePost(handler) {
    return async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: '仅支持 POST' })
          return
        }
        sendJson(res, 200, await handler(await readBody(req)))
      } catch (error) {
        sendJson(res, 500, { error: clip(error?.message ?? error, 500) })
      }
    }
  }

  const routes = [
    ['/codegraph-panel/state', route(buildState)],
    ['/codegraph-panel/query', route(buildQuery)],
    ['/codegraph-panel/graph', route(buildGraph)],
    ['/codegraph-panel/impact', route(buildImpact)],
    ['/codegraph-panel/node', route(buildNode)],
    ['/codegraph-panel/about', route(buildAbout)],
    ['/codegraph-panel/sync', routePost(runSync)],
  ]

  for (const [path, handler] of routes) {
    ctx.effect(
      () => ctx.webServer.register({ kind: 'exact', path, handler }),
      `codegraph-panel-mac: ${path}`,
    )
  }
}
