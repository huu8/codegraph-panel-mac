#!/usr/bin/env bash
# codegraph-panel-mac 安装 / 卸载（macOS）。
#
#   bash scripts/install.sh --check        # 预检，不写任何东西
#   bash scripts/install.sh                # 装到 desktop profile
#   bash scripts/install.sh --profile web
#   bash scripts/install.sh --uninstall
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="desktop"
MODE="install"

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="${2:?--profile 需要一个值}"; shift 2 ;;
    --uninstall) MODE="uninstall"; shift ;;
    --check) MODE="check"; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }

# 1. 定位 codegraph
CG_BIN=""
for candidate in "$(command -v codegraph 2>/dev/null || true)" "$HOME/.local/bin/codegraph" /opt/homebrew/bin/codegraph /usr/local/bin/codegraph; do
  [ -n "$candidate" ] && [ -x "$candidate" ] && { CG_BIN="$candidate"; break; }
done
if [ -n "$CG_BIN" ]; then
  say "codegraph : $CG_BIN ($("$CG_BIN" --version 2>/dev/null | head -1 || echo '版本读取失败'))"
else
  say "⚠ 未探测到 codegraph。面板仍会显示已建的索引，但 sync / index 与源码详情不可用。"
  say "  安装后在面板配置里指定 binPath，或把 codegraph 放进 PATH。"
fi

# 2. 校验 client bundle 与 template 同步
say "→ 构建 client bundle ..."
node "$PLUGIN_DIR/scripts/build-client.mjs"
node "$PLUGIN_DIR/scripts/check.mjs"

PROFILE_DIR="$HOME/.dsh/profiles/$PROFILE"
say "profile   : $PROFILE ($PROFILE_DIR)"
[ -d "$PROFILE_DIR" ] || { say "✗ profile 目录不存在：$PROFILE_DIR"; exit 1; }

if [ "$MODE" = "check" ]; then
  say "预检完成，未写入任何文件。"
  exit 0
fi

PKG_JSON="$PROFILE_DIR/package.json"
NM_DIR="$PROFILE_DIR/node_modules/codegraph-panel-mac"

if [ "$MODE" = "uninstall" ]; then
  say "→ 卸载 codegraph-panel-mac ..."
  if [ -f "$PKG_JSON" ]; then
    cp "$PKG_JSON" "$PKG_JSON.bak-cgpanel-$(date +%Y%m%d-%H%M%S)"
    node -e '
      const fs = require("fs")
      const p = process.argv[1]
      const d = JSON.parse(fs.readFileSync(p, "utf8"))
      delete d.dependencies["codegraph-panel-mac"]
      const b = d.dsh?.profile?.bundles
      if (Array.isArray(b)) d.dsh.profile.bundles = b.filter((x) => x !== "codegraph-panel-mac")
      fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n")
    ' "$PKG_JSON"
  fi
  rm -rf "$NM_DIR"
  say "✓ 已卸载。重启 DSH 后标签消失。"
  exit 0
fi

# 3. 登记到 profile
say "→ 登记到 profile $PROFILE ..."
cp "$PKG_JSON" "$PKG_JSON.bak-cgpanel-$(date +%Y%m%d-%H%M%S)"
node -e '
  const fs = require("fs")
  const p = process.argv[1]
  const dir = process.argv[2]
  const d = JSON.parse(fs.readFileSync(p, "utf8"))
  d.dependencies = d.dependencies || {}
  d.dependencies["codegraph-panel-mac"] = "file:" + dir
  d.dsh = d.dsh || {}
  d.dsh.profile = d.dsh.profile || {}
  const b = Array.isArray(d.dsh.profile.bundles) ? d.dsh.profile.bundles : []
  if (!b.includes("codegraph-panel-mac")) b.push("codegraph-panel-mac")
  d.dsh.profile.bundles = b
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n")
' "$PKG_JSON" "$PLUGIN_DIR"

# 4. 复制到 node_modules（desktop profile 被 Electron 独占管理，
#    dsh plugin add 会被拒绝；这里走等效登记 + 复制，避免 pnpm 重装整个目录）
say "→ 复制到 $NM_DIR ..."
rm -rf "$NM_DIR"
mkdir -p "$(dirname "$NM_DIR")"
cp -R "$PLUGIN_DIR" "$NM_DIR"
rm -rf "$NM_DIR/.git" "$NM_DIR/test" "$NM_DIR/vendor"

say ""
say "✓ 安装完成。"
say "下一步：重启 DSH，会话顶部会出现 CodeGraph 标签（在 AOCI 右侧）。"
