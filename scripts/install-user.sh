#!/bin/bash
set -euo pipefail

NODE_BIN=""
SERVER_JS=""
STATIC_DIR=""
MANIFEST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --node) NODE_BIN="$2"; shift 2 ;;
    --server) SERVER_JS="$2"; shift 2 ;;
    --static) STATIC_DIR="$2"; shift 2 ;;
    --manifest) MANIFEST="$2"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
SERVER_JS="${SERVER_JS:-$ROOT/dist-server/server.cjs}"
STATIC_DIR="${STATIC_DIR:-$ROOT/dist}"
MANIFEST="${MANIFEST:-$ROOT/manifest.xml}"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "找不到 Node：$NODE_BIN" >&2
  exit 1
fi
if [[ ! -f "$SERVER_JS" || ! -d "$STATIC_DIR" || ! -f "$MANIFEST" ]]; then
  echo "请先在项目里运行 npm run build。" >&2
  exit 1
fi

SUPPORT="$HOME/Library/Application Support/OfficeEasyFormula"
CERT_DIR="$SUPPORT/certs"
DEV_CERTS="$HOME/.office-addin-dev-certs"
if [[ -f "$DEV_CERTS/localhost.crt" && -f "$DEV_CERTS/localhost.key" ]]; then
  CERT_DIR="$DEV_CERTS"
else
  mkdir -p "$CERT_DIR"
  if [[ ! -f "$CERT_DIR/localhost.crt" || ! -f "$CERT_DIR/localhost.key" ]]; then
    openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
      -keyout "$CERT_DIR/localhost.key" \
      -out "$CERT_DIR/localhost.crt" \
      -subj "/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
    security add-trusted-cert -r trustRoot -p basic \
      -k "$HOME/Library/Keychains/login.keychain-db" \
      "$CERT_DIR/localhost.crt"
  fi
fi

WEF="$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
mkdir -p "$WEF"
cp "$MANIFEST" "$WEF/office-easy-formula.xml"

LOG_DIR="$HOME/Library/Logs/OfficeEasyFormula"
mkdir -p "$LOG_DIR"
PLIST="$HOME/Library/LaunchAgents/local.officeeasyformula.plist"
UID_VALUE="$(id -u)"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>local.officeeasyformula</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${SERVER_JS}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/Library/TeX/texbin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>OEF_CERT_DIR</key>
    <string>${CERT_DIR}</string>
    <key>OEF_STATIC_DIR</key>
    <string>${STATIC_DIR}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/server.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/server.err</string>
</dict>
</plist>
EOF

launchctl bootout "gui/${UID_VALUE}/local.officeeasyformula" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${UID_VALUE}" "$PLIST"
echo "编译服务已设为登录后自动启动。请完全退出并重新打开 Word，然后在「开始」里打开「LaTeX 公式」。"
