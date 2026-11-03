#!/bin/bash
set -euo pipefail
UID_VALUE="$(id -u)"
PLIST="$HOME/Library/LaunchAgents/local.officeeasyformula.plist"
launchctl bootout "gui/${UID_VALUE}/local.officeeasyformula" >/dev/null 2>&1 || true
rm -f "$PLIST"
rm -f "$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef/office-easy-formula.xml"
echo "已移除登录项和 Word 里的加载项清单。证书仍留在本机。"
