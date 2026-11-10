import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clampInt,
  extractSubgraph,
  findNodes,
  kindRank,
  nodesByIds,
  summarize,
  DRAWABLE_EDGE_KINDS,
} from '../lib/codegraph.js'

/** 建一个最小的内存版 CodeGraph 库用于测试（结构与真实库一致）。 */
function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'cg-test-'))
  const path = join(dir, 'codegraph.db')
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY, kind TEXT, name TEXT, qualified_name TEXT,
      file_path TEXT, language TEXT, start_line INTEGER, end_line INTEGER,
      start_column INTEGER, end_column INTEGER, docstring TEXT, signature TEXT,
      visibility TEXT, is_exported INTEGER, is_async INTEGER, is_static INTEGER,
      is_abstract INTEGER, decorators TEXT, type_parameters TEXT, return_type TEXT,
      updated_at INTEGER
    );
    CREATE TABLE edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, target TEXT,
      kind TEXT, metadata TEXT, line INTEGER, col INTEGER, provenance TEXT
    );
  `)
  const insNode = db.prepare(
    `INSERT INTO nodes (id,kind,name,qualified_name,file_path,language,start_line,end_line,is_exported,is_async)
     VALUES (?,?,?,?,?,?,?,?,0,0)`,
  )
  // a 调 b，b 调 c，d 引用 a
  insNode.run('fn:a', 'function', 'alpha', 'alpha', 'src/a.ts', 'typescript', 1, 5)
  insNode.run('fn:b', 'function', 'beta', 'beta', 'src/b.ts', 'typescript', 1, 5)
  insNode.run('fn:c', 'function', 'gamma', 'gamma', 'src/c.ts', 'typescript', 1, 5)
  insNode.run('fn:d', 'function', 'delta', 'delta', 'src/d.ts', 'typescript', 1, 5)
  insNode.run('file:x', 'file', 'x.ts', 'x.ts', 'src/x.ts', 'typescript', 1, 1)
  const insEdge = db.prepare('INSERT INTO edges (source,target,kind,line) VALUES (?,?,?,?)')
  insEdge.run('fn:a', 'fn:b', 'calls', 3)
  insEdge.run('fn:b', 'fn:c', 'calls', 2)
  insEdge.run('fn:d', 'fn:a', 'references', 7)
  insEdge.run('file:x', 'fn:a', 'contains', 1)
  return { db, path, cleanup: () => { try { db.close() } catch {} rmSync(dir, { recursive: true, force: true }) } }
}

test('clampInt 夹取与回退', () => {
  assert.equal(clampInt('5', 1, 10, 3), 5)
  assert.equal(clampInt(0, 1, 10, 3), 1)
  assert.equal(clampInt(99, 1, 10, 3), 10)
  assert.equal(clampInt('abc', 1, 10, 3), 3)
  assert.equal(clampInt(undefined, 1, 10, 3), 3)
})

test('kindRank 让 route/function 排在 file 前', () => {
  assert.ok(kindRank('route') < kindRank('function'))
  assert.ok(kindRank('function') < kindRank('class'))
  assert.ok(kindRank('class') < kindRank('file'))
  assert.equal(kindRank('不存在'), 12)
})

test('summarize 统计节点与边分布', () => {
  const { db, cleanup } = makeDb()
  try {
    const s = summarize(db)
    assert.equal(s.nodes, 5)
    assert.equal(s.edges, 4)
    assert.equal(s.nodesByKind.function, 4)
    assert.equal(s.nodesByKind.file, 1)
    assert.equal(s.edgesByKind.calls, 2)
    assert.deepEqual(s.languages, ['typescript'])
  } finally {
    cleanup()
  }
})

test('findNodes 精确匹配优先', () => {
  const { db, cleanup } = makeDb()
  try {
    const exact = findNodes(db, 'alpha')
    assert.equal(exact.length, 1)
    assert.equal(exact[0].id, 'fn:a')
    // 部分匹配
    const partial = findNodes(db, 'alp')
    assert.equal(partial.length, 1)
    // kind 过滤
    assert.equal(findNodes(db, 'alpha', { kind: 'class' }).length, 0)
  } finally {
    cleanup()
  }
})

test('nodesByIds 批量取且去重', () => {
  const { db, cleanup } = makeDb()
  try {
    const nodes = nodesByIds(db, ['fn:a', 'fn:b', 'fn:a'])
    assert.equal(nodes.length, 2)
  } finally {
    cleanup()
  }
})

test('extractSubgraph 1 跳双向含 calls 与 references', () => {
  const { db, cleanup } = makeDb()
  try {
    const g = extractSubgraph(db, ['fn:a'], { depth: 1 })
    // a 的出边到 b（calls），入边来自 d（references）
    const ids = g.nodes.map((n) => n.id).sort()
    assert.deepEqual(ids, ['fn:a', 'fn:b', 'fn:d'])
    assert.equal(g.edges.length, 2)
    assert.ok(g.edges.every((e) => DRAWABLE_EDGE_KINDS.includes(e.kind)))
  } finally {
    cleanup()
  }
})

test('extractSubgraph 不画 contains 边', () => {
  const { db, cleanup } = makeDb()
  try {
    const g = extractSubgraph(db, ['fn:a'], { depth: 1 })
    assert.ok(!g.edges.some((e) => e.kind === 'contains'))
    assert.ok(!g.nodes.some((n) => n.id === 'file:x'))
  } finally {
    cleanup()
  }
})

test('extractSubgraph 方向 in / out', () => {
  const { db, cleanup } = makeDb()
  try {
    const out = extractSubgraph(db, ['fn:a'], { depth: 1, direction: 'out' })
    assert.deepEqual(out.nodes.map((n) => n.id).sort(), ['fn:a', 'fn:b'])
    const inn = extractSubgraph(db, ['fn:a'], { depth: 1, direction: 'in' })
    assert.deepEqual(inn.nodes.map((n) => n.id).sort(), ['fn:a', 'fn:d'])
  } finally {
    cleanup()
  }
})

test('extractSubgraph 2 跳可达 c', () => {
  const { db, cleanup } = makeDb()
  try {
    const g = extractSubgraph(db, ['fn:a'], { depth: 2, direction: 'out' })
    assert.deepEqual(g.nodes.map((n) => n.id).sort(), ['fn:a', 'fn:b', 'fn:c'])
  } finally {
    cleanup()
  }
})

test('extractSubgraph 节点上限触发截断标记', () => {
  const { db, cleanup } = makeDb()
  try {
    const g = extractSubgraph(db, ['fn:a'], { depth: 2, nodeLimit: 2 })
    assert.equal(g.truncated, true)
    assert.ok(g.nodes.length <= 2)
  } finally {
    cleanup()
  }
})

test('extractSubgraph 空种子返回空图', () => {
  const { db, cleanup } = makeDb()
  try {
    const g = extractSubgraph(db, [], { depth: 1 })
    assert.equal(g.nodes.length, 0)
    assert.equal(g.edges.length, 0)
  } finally {
    cleanup()
  }
})

test('边两端必须在节点集内', () => {
  const { db, cleanup } = makeDb()
  try {
    const g = extractSubgraph(db, ['fn:a'], { depth: 1, nodeLimit: 2 })
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const edge of g.edges) {
      assert.ok(ids.has(edge.source), '悬空 source: ' + edge.source)
      assert.ok(ids.has(edge.target), '悬空 target: ' + edge.target)
    }
  } finally {
    cleanup()
  }
})
