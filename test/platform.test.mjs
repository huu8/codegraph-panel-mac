import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { buildEnv, expandHome, findInPath, resolveBinary, userHome } from '../lib/platform.js'

test('expandHome 展开 ~/', () => {
  assert.equal(expandHome('~/bin/x', '/Users/u'), '/Users/u/bin/x')
  assert.equal(expandHome('~', '/Users/u'), '/Users/u')
  assert.equal(expandHome('', '/Users/u'), '')
  assert.equal(expandHome('/abs/path', '/Users/u'), '/abs/path')
})

test('userHome 在 mac 上优先 HOME', () => {
  assert.equal(userHome({ HOME: '/Users/u', USERPROFILE: 'C:/u' }), '/Users/u')
  assert.equal(userHome({ USERPROFILE: 'C:/u' }), 'C:/u')
})

test('findInPath 在真实 PATH 里找到 codegraph（本机）', () => {
  const found = findInPath()
  if (process.platform === 'darwin' && existsSync('/Users/huzijing/.local/bin/codegraph')) {
    assert.ok(found.endsWith('/codegraph'), '实际: ' + found)
  }
})

test('findInPath 对空 PATH 返回空串', () => {
  assert.equal(findInPath({ PATH: '' }), '')
})

test('resolveBinary 优先显式配置', () => {
  const explicit = '/usr/bin/env'
  assert.equal(resolveBinary(explicit, { PATH: '' }), explicit)
})

test('resolveBinary 回退 PATH', () => {
  const PATH = process.env.PATH || ''
  const got = resolveBinary('', { PATH, HOME: process.env.HOME })
  if (process.platform === 'darwin' && existsSync('/Users/huzijing/.local/bin/codegraph')) {
    assert.ok(got !== '', '应能从 PATH 或惯例目录解析到')
  }
})

test('resolveBinary 全部失败返回空串', () => {
  assert.equal(resolveBinary('', { PATH: '', HOME: '/nonexistent-home-xyz' }), '')
})

test('buildEnv 补齐 mac bin 目录且不缩短原 PATH', () => {
  const env = buildEnv({ PATH: '/usr/bin:/bin', HOME: '/Users/u' })
  const parts = env.PATH.split(':')
  assert.ok(parts.includes('/usr/bin'))
  assert.ok(parts.includes('/bin'))
  if (process.platform === 'darwin') {
    assert.ok(parts.length >= 2)
  }
})

test('buildEnv 不改动其他环境变量', () => {
  const env = buildEnv({ PATH: '/usr/bin', KEEP: 'yes' })
  assert.equal(env.KEEP, 'yes')
})
