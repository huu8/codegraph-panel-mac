#!/usr/bin/env node
/**
 * 自检：语法、结构、关键设计点、包元数据一致性。
 * 只读、不联网、不改文件。退出码非 0 表示有问题。
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const results = []
function check(name, fn) {
  try {
    const detail = fn()
    results.push({ ok: true, name, detail: detail || '' })
  } catch (error) {
    results.push({ ok: false, name, detail: String(error?.message ?? error) })
  }
}

const REQUIRED = [
  'package.json',
  'cordis.patch.yml',
  'icon.svg',
  'lib/index.js',
  'lib/client.js',
  'lib/client.template.js',
  'lib/codegraph.js',
  'lib/platform.js',
  'locale/zh.json',
  'locale/en.json',
  'vendor/cytoscape.min.js',
  'scripts/build-client.mjs',
]

check('必需文件齐全', () => {
  const missing = REQUIRED.filter((file) => !existsSync(file))
  if (missing.length > 0) throw new Error('缺少：' + missing.join(', '))
  return `${REQUIRED.length} 个文件`
})

check('宿主半语法', () => {
  const files = ['lib/index.js', 'lib/codegraph.js', 'lib/platform.js']
  for (const file of files) execFileSync('node', ['--check', file], { stdio: 'pipe' })
  return files.length + ' 个文件'
})

check('client bundle 可解析', () => {
  const code = readFileSync('lib/client.js', 'utf8')
  // 用 Function 解析（node --check 对含压缩字面量的文件输出噪声太大）
  new Function(code)
  if (!code.startsWith('window.__ModuleLoader__.load(')) throw new Error('不是 ModuleLoader bundle')
  return (code.length / 1024).toFixed(0) + ' KB'
})

check('client 已内联 cytoscape', () => {
  const code = readFileSync('lib/client.js', 'utf8')
  if (!code.includes('CYTOSCAPE_SRC')) throw new Error('缺少 CYTOSCAPE_SRC 定义')
  const template = readFileSync('lib/client.template.js', 'utf8')
  if (!template.includes('__CYTOSCAPE_SRC__')) throw new Error('模板占位符已丢失')
  // 内联后应显著大于模板
  if (code.length < template.length * 2) throw new Error('内联似乎未生效')
  return '已内联 ' + (code.length / 1024 - template.length / 1024).toFixed(0) + ' KB'
})

check('构建脚本用函数式替换', () => {
  const src = readFileSync('scripts/build-client.mjs', 'utf8')
  // cytoscape 源码含 $& / $' / $`，字符串形式替换会截断字面量
  if (!src.includes('() => literal')) throw new Error('未使用函数式替换，$ 序列会被当成替换模式')
  return 'template.replace(占位符, () => literal)'
})

check('包元数据与身份一致', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  if (pkg.name !== 'codegraph-panel-mac') throw new Error('name 应为 codegraph-panel-mac')
  const patch = readFileSync('cordis.patch.yml', 'utf8')
  if (!patch.includes('codegraph-panel-mac')) throw new Error('cordis.patch.yml 未引用本插件')
  const host = readFileSync('lib/index.js', 'utf8')
  if (!host.includes("export const name = 'codegraph-panel-mac'")) throw new Error('宿主半 name 不一致')
  if (pkg.type !== 'module') throw new Error('应声明 type: module')
  return `${pkg.name}@${pkg.version}`
})

check('DB 访问一律只读', () => {
  const src = readFileSync('lib/codegraph.js', 'utf8')
  if (!src.includes('readOnly: true')) throw new Error('openDatabase 未以只读方式打开')
  const writeOps = ['writeFile', 'appendFile', 'unlink', 'mkdir', 'rename']
  // 数据层不应出现写文件调用（sync 由 CLI 自己完成）
  for (const op of writeOps) {
    if (new RegExp('\\b' + op + 'Sync\\b').test(src)) throw new Error('数据层出现了写操作：' + op)
  }
  return 'readOnly + 无写文件调用'
})

check('七个端点齐全', () => {
  const host = readFileSync('lib/index.js', 'utf8')
  const wanted = [
    '/codegraph-panel/state',
    '/codegraph-panel/query',
    '/codegraph-panel/graph',
    '/codegraph-panel/impact',
    '/codegraph-panel/node',
    '/codegraph-panel/about',
    '/codegraph-panel/sync',
  ]
  const missing = wanted.filter((path) => !host.includes(path))
  if (missing.length > 0) throw new Error('缺少端点：' + missing.join(', '))
  return wanted.length + ' 个'
})

check('图渲染与客户端功能接线', () => {
  const client = readFileSync('lib/client.js', 'utf8')
  for (const token of ['getCytoscape', 'GraphView', 'conversation.view', 'codegraph']) {
    if (!client.includes(token)) throw new Error('client 缺少 ' + token)
  }
  for (const tab of ['符号搜索', '依赖图', '影响面', '符号详情']) {
    if (!client.includes(tab)) throw new Error('client 缺少区块 ' + tab)
  }
  return 'cytoscape + 5 个区块'
})

check('mac 路径适配', () => {
  const platform = readFileSync('lib/platform.js', 'utf8')
  if (!platform.includes('env.HOME, env.USERPROFILE')) throw new Error('home 解析未优先 HOME')
  if (!platform.includes('findInPath')) throw new Error('缺少 PATH 探测')
  if (!platform.includes('buildEnv')) throw new Error('缺少子进程 PATH 注入')
  return 'HOME 优先 + PATH 探测 + env 注入'
})

let failed = 0
for (const item of results) {
  if (!item.ok) failed += 1
  console.log(`${item.ok ? '  ok' : 'FAIL'}  ${item.name}${item.detail ? ' — ' + item.detail : ''}`)
}
console.log()
console.log(`${results.length - failed}/${results.length} 通过`)
process.exit(failed === 0 ? 0 : 1)
