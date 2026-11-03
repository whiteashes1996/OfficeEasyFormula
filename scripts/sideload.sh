#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$HOME/Library/Containers/com.microsoft.Word/Data/Documents"
WEF="$DOCS/wef"
MANIFEST="$ROOT/manifest.xml"

copy_with_terminal() {
  mkdir -p "$WEF"
  cp "$MANIFEST" "$WEF/office-easy-formula.xml"
}

if copy_with_terminal 2>/dev/null; then
  echo "已把加载项清单放到 $WEF/office-easy-formula.xml"
  echo "如果 Word 已经开着，请完全退出后重新打开，再在「开始」选项卡里找「LaTeX 公式」。"
  exit 0
fi

echo "终端不能把文件写进 Word 的数据目录。请把清单拖进这个文件夹："
echo "$WEF"
# Finder 可以在已经打开的窗口里建文件夹，但不能替用户把文件拷进去。
open "$DOCS" >/dev/null 2>&1 || true
osascript -l JavaScript <<'EOF' || true
const Finder = Application("Finder");
let dest = null;
const wins = Finder.windows();
for (let i = 0; i < wins.length; i++) {
  const url = String(wins[i].target().url());
  if (url.includes("com.microsoft.Word/Data/Documents") && !url.includes("/wef")) dest = wins[i].target();
}
if (dest) {
  try { dest.folders.byName("wef").name(); }
  catch (e) { Finder.make({new: "folder", at: dest, withProperties: {name: "wef"}}); }
}
EOF
open "$WEF"
open -R "$MANIFEST"
echo "1. 把选中的 manifest.xml 拖进标题为 wef 的窗口。不要拖到「文稿」或 Documents。"
echo "2. 用 Command+Q 退出 Word，再重新打开。"
echo "3. 按钮在 Home 功能区上，名字是 LaTeX 公式，不在 Add-ins 菜单里。"
exit 1
