# LaTeX 公式

这是装进 macOS Word 的加载项。功能区「开始」里的「LaTeX 公式」会打开任务窗格，用本机的 MacTeX 把公式渲染成透明矢量图（SVG）插入文档。选中公式后，任务窗格会载入原来的 LaTeX，可以改完再更新。

对方电脑需要已经安装：

- 从微软安装的 Word（Microsoft 365 或官网版本）
- MacTeX 或 BasicTeX（`/Library/TeX/texbin/latex`、`dvisvgm`；含中文时还要 `xelatex`）
- Ghostscript 共享库（`libgs`，供 dvisvgm 处理 preview 特殊指令；Homebrew 的 `ghostscript` 通常会带上）

BasicTeX 若没有 dvisvgm，可执行 `sudo tlmgr install dvisvgm`。

## 开发

```bash
npm install
npm run certs
npm run icons
npm test
npm run dev
npm run sideload
```

`npm run certs` 会要一次钥匙串密码。然后运行 `npm run sideload`。如果终端提示不能写入，按脚本打开的 Finder 窗口，在 Documents 里新建 `wef` 文件夹，把 `manifest.xml` 拖进去。Word 如果已经开着，完全退出后重开，在「开始」里打开「LaTeX 公式」。

## 给自己设成登录启动

```bash
npm run build
bash scripts/install-user.sh
```

卸掉登录项和 Word 清单：

```bash
bash scripts/uninstall-user.sh
```

## 安装包

```bash
bash scripts/build-pkg.sh
```

脚本会下载 macOS 版 Node（Apple 芯片和 Intel），打出 `packaging/OfficeEasyFormula-1.0.0.pkg`。有 Apple Developer ID 时可以设置 `DEVELOPER_ID_INSTALLER` 再签名。没有证书时，对方需要在系统设置里允许这个安装包。
