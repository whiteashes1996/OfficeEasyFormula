#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build

NODE_VERSION="${NODE_VERSION:-v22.20.0}"
STAGE="$(mktemp -d /tmp/oef-pkg.XXXXXX)"
APP="$STAGE/Library/Application Support/OfficeEasyFormula"
mkdir -p "$APP/node" "$APP/dist" "$APP/dist-server"
cp -R "$ROOT/dist/." "$APP/dist/"
cp "$ROOT/dist-server/server.cjs" "$APP/dist-server/server.cjs"
cp "$ROOT/manifest.xml" "$APP/manifest.xml"
cp "$ROOT/scripts/install-user.sh" "$APP/install-user.sh"
chmod +x "$APP/install-user.sh"

download_node() {
  local arch="$1"
  local url="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-${arch}.tar.gz"
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "$url" -o "$tmp/node.tar.gz"
  tar -xzf "$tmp/node.tar.gz" -C "$tmp"
  mkdir -p "$APP/node/$arch"
  cp -R "$tmp/node-${NODE_VERSION}-darwin-${arch}/." "$APP/node/$arch/"
  rm -rf "$tmp"
}

download_node arm64
download_node x64

SCRIPT_DIR="$(mktemp -d /tmp/oef-pkg-scripts.XXXXXX)"
cat > "$SCRIPT_DIR/postinstall" <<'EOF'
#!/bin/bash
set -euo pipefail
APP="/Library/Application Support/OfficeEasyFormula"
CONSOLE_USER="$(stat -f %Su /dev/console)"
if [[ -z "$CONSOLE_USER" || "$CONSOLE_USER" == "root" ]]; then
  echo "没有登录用户，安装包已复制文件，但还没有注册 Word 加载项。"
  exit 0
fi
USER_HOME="$(dscl . -read "/Users/$CONSOLE_USER" NFSHomeDirectory | awk '{print $2}')"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64|x86_64) ;;
  *) echo "不支持的架构: $ARCH" >&2; exit 1 ;;
esac
if [[ "$ARCH" == "x86_64" ]]; then ARCH="x64"; fi
sudo -u "$CONSOLE_USER" HOME="$USER_HOME" bash "$APP/install-user.sh" \
  --node "$APP/node/$ARCH/bin/node" \
  --server "$APP/dist-server/server.cjs" \
  --static "$APP/dist" \
  --manifest "$APP/manifest.xml"
EOF
chmod +x "$SCRIPT_DIR/postinstall"

OUT="${1:-$ROOT/packaging/OfficeEasyFormula-1.0.0.pkg}"
mkdir -p "$(dirname "$OUT")"
pkgbuild \
  --root "$STAGE" \
  --scripts "$SCRIPT_DIR" \
  --identifier local.officeeasyformula \
  --version 1.0.0 \
  --install-location / \
  "$OUT"
rm -rf "$STAGE" "$SCRIPT_DIR"
echo "已生成 $OUT"
if [[ -n "${DEVELOPER_ID_INSTALLER:-}" ]]; then
  productsign --sign "$DEVELOPER_ID_INSTALLER" "$OUT" "${OUT%.pkg}-signed.pkg"
  echo "已签名 ${OUT%.pkg}-signed.pkg"
fi
