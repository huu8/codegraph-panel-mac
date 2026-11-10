#!/usr/bin/env node
/**
 * 把 vendor/cytoscape.min.js 内联进 client.template.js，生成 lib/client.js。
 *
 * 为什么必须内联：DSH 的客户端 ModuleLoader 只把宿主已注册的共享模块
 * （react / cordis / primitives 等）交给 bundle 的 require，第三方库拿不到。
 * 因此插件必须自带一份可执行源码。
 *
 * 生成结果可直接被 window.__ModuleLoader__.load 加载，无需构建工具链。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const templatePath = new URL('lib/client.template.js', root)
const vendorPath = new URL('vendor/cytoscape.min.js', root)
const outPath = new URL('lib/client.js', root)

const template = readFileSync(templatePath, 'utf8')
const vendor = readFileSync(vendorPath, 'utf8')

if (!template.includes('__CYTOSCAPE_SRC__')) {
  console.error('模板里没有 __CYTOSCAPE_SRC__ 占位符')
  process.exit(1)
}
// 用 JSON.stringify 得到安全的单行字符串字面量，避免源码里的反引号/</script> 问题
const literal = JSON.stringify(vendor)
// 必须用函数式替换：字符串形式里 cytoscape 源码中的 $&、$'、$` 会被当成
// String.replace 的特殊替换模式，导致字面量被截断成非法 JSON。
const output = template.replace('__CYTOSCAPE_SRC__', () => literal)

writeFileSync(outPath, output)
const kb = (n) => (n / 1024).toFixed(1) + ' KB'
console.log(`client.js 已生成：${kb(output.length)}（其中 cytoscape ${kb(literal.length)}）`)
