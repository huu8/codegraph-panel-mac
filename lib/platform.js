/**
 * platform.js —— macOS 平台适配（CodeGraph 版）。
 *
 * 与 aoic-panel-mac 同源思路：把平台差异收敛到一处，避免写死 Windows 路径。
 * 相对 AOCI 版更简单——CodeGraph 只有单一可执行文件，且库是 SQLite、
 * 不依赖复杂目录约定。
 */

import { accessSync, constants as fsConstants, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const isWin = process.platform === 'win32'

/** mac GUI 启动时 PATH 常缺这些目录，导致装好的 CLI 找不到。 */
const MAC_EXTRA_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
]

/** `~/` 展开。 */
export function expandHome(input, home = userHome()) {
  const text = String(input ?? '').trim()
  if (!text) return ''
  if (text === '~') return home
  if (text.startsWith('~/')) {
    const base = String(home ?? '').replace(/[\\/]+$/, '')
    return base ? base + '/' + text.slice(2) : text
  }
  return text
}

/** 用户 home：mac 优先 HOME，Windows 回退 USERPROFILE。 */
export function userHome(env = process.env) {
  const candidates = isWin ? [env.USERPROFILE, env.HOME] : [env.HOME, env.USERPROFILE]
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim()
    if (value) return value
  }
  try {
    return homedir()
  } catch (error) {
    return ''
  }
}

/** 文件是否可执行：非 Windows 校验 0o111。 */
export function isExecutable(path) {
  if (!path) return false
  try {
    const info = statSync(path)
    if (!info.isFile()) return false
    if (isWin) return true
    accessSync(path, fsConstants.X_OK)
    return (info.mode & 0o111) !== 0
  } catch (error) {
    return false
  }
}

/** 从 PATH 里找 codegraph，返回第一个可执行路径或空串。 */
export function findInPath(env = process.env) {
  const names = isWin ? ['codegraph.exe', 'codegraph.cmd', 'codegraph.bat'] : ['codegraph']
  const seen = new Set()
  for (const dir of String(env.PATH ?? '').split(delimiter)) {
    const base = dir.trim()
    if (!base || seen.has(base)) continue
    seen.add(base)
    for (const name of names) {
      const full = join(base, name)
      if (existsSync(full) && isExecutable(full)) return full
    }
  }
  return ''
}

/**
 * 解析 codegraph 可执行文件。
 * 顺序：显式配置 → $CODEGRAPH_BINARY → PATH → 惯例位置（含 ~/.local/bin 符号链接）。
 */
export function resolveBinary(configured = '', env = process.env) {
  const explicit = expandHome(configured, userHome(env))
  if (explicit && isExecutable(explicit)) return explicit
  const fromEnv = String(env.CODEGRAPH_BINARY ?? '').trim()
  if (fromEnv && isExecutable(fromEnv)) return fromEnv
  const inPath = findInPath(env)
  if (inPath) return inPath
  const home = userHome(env)
  const conventional = isWin
    ? [join(home, 'AppData', 'Local', 'codegraph', 'codegraph.exe')]
    : [join(home, '.local', 'bin', 'codegraph'), '/opt/homebrew/bin/codegraph', '/usr/local/bin/codegraph']
  for (const candidate of conventional) {
    if (isExecutable(candidate)) return candidate
  }
  return ''
}

/**
 * 给子进程补 PATH，避免 GUI 启动的 DSH 找不到 CLI。
 * Windows 原样返回。
 */
export function buildEnv(baseEnv = process.env) {
  const env = { ...baseEnv }
  if (isWin) return env
  const parts = String(env.PATH ?? '').split(delimiter).filter(Boolean)
  const seen = new Set(parts)
  const extra = []
  for (const dir of MAC_EXTRA_PATHS) {
    if (!seen.has(dir) && existsSync(dir)) {
      seen.add(dir)
      extra.push(dir)
    }
  }
  if (extra.length > 0) env.PATH = [...parts, ...extra].join(delimiter)
  return env
}

export const platformInfo = Object.freeze({
  platform: process.platform,
  arch: process.arch,
  isMac: process.platform === 'darwin',
  isWindows: isWin,
  isLinux: process.platform === 'linux',
})
