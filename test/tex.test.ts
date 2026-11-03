import assert from "node:assert/strict";
import test from "node:test";
import { injectBaseline } from "../src/shared/baseline";
import { DEFAULT_PREAMBLE, isLegacyDefaultPreamble, loadStoredPreamble, PREVIEW_BORDER_PT } from "../src/shared/types";
import {
  buildTexDocument,
  chooseEngine,
  extractLatexError,
  isDisplayMathBody,
  needsVerticalPreviewBox,
  padSvgPreviewBorder,
  parseMetrics,
  readSvgSizePt,
  svgSizeFromMetrics,
  wordInlinePlacement,
  wrapLatex,
  xelatexFontBlock,
} from "../src/server/tex";

test("旧默认导言区会从 localStorage 升级", () => {
  const storage = new Map<string, string>([
    [
      "oef.preamble",
      "\\usepackage{amsmath,amssymb,amsfonts,mathtools}\n\\usepackage{bm}",
    ],
    ["oef.preambleVersion", "1"],
  ]);
  const bag = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
  assert.equal(isLegacyDefaultPreamble(bag.getItem("oef.preamble")!), true);
  assert.equal(loadStoredPreamble(bag), DEFAULT_PREAMBLE);
  assert.equal(storage.get("oef.preambleVersion"), "2");
});

test("行内公式包进美元符号，独立公式用 equation*", () => {
  assert.equal(wrapLatex("E=mc^2", "inline"), "$E=mc^2$");
  assert.equal(wrapLatex("E=mc^2", "display"), "\\begin{equation*}\nE=mc^2\n\\end{equation*}");
});

test("自由模式不再自动包一层", () => {
  assert.equal(wrapLatex("E=mc^2", "free"), "E=mc^2");
  assert.equal(wrapLatex("$E=mc^2$", "free"), "$E=mc^2$");
  assert.equal(wrapLatex("$$a$$", "free"), "$$a$$");
  assert.equal(wrapLatex("\\begin{equation}a\\end{equation}", "free"), "\\begin{equation}a\\end{equation}");
});

test("用户自己写了环境或定界符时不再包一层", () => {
  assert.equal(wrapLatex("\\begin{aligned}a&=b\\end{aligned}", "inline"), "\\begin{aligned}a&=b\\end{aligned}");
  assert.equal(wrapLatex("$E=mc^2$", "display"), "$E=mc^2$");
  assert.equal(wrapLatex("$$a$$", "inline"), "$$a$$");
});

test("展示环境用 vbox 测量，行内仍用 sbox", () => {
  assert.equal(needsVerticalPreviewBox("\\begin{equation}a\\end{equation}"), true);
  assert.equal(needsVerticalPreviewBox("$a$"), false);
  const display = buildTexDocument(
    { latex: "E=mc^2", preamble: "\\usepackage{amsmath}", engine: "pdflatex", wrapMode: "display", fontSizePt: 12 },
    "pdflatex",
  );
  assert.match(display, /\\setbox\\oefbox\\vbox/);
  const inline = buildTexDocument(
    { latex: "E=mc^2", preamble: "\\usepackage{amsmath}", engine: "pdflatex", wrapMode: "inline", fontSizePt: 12 },
    "pdflatex",
  );
  assert.match(inline, /\\sbox\\oefbox/);
});

test("自由模式按内容判断 Word 插入位置", () => {
  assert.equal(isDisplayMathBody("$$E=mc^2$$"), true);
  assert.equal(isDisplayMathBody("\\begin{align}a\\end{align}"), true);
  assert.equal(isDisplayMathBody("$E=mc^2$"), false);
  assert.equal(wordInlinePlacement("free", "$E=mc^2$"), true);
  assert.equal(wordInlinePlacement("free", "$$E=mc^2$$"), false);
});

test("空公式会被拒绝", () => {
  assert.throws(() => wrapLatex("   ", "inline"), /公式是空的/);
});

test("含非 ASCII 时自动改用 XeLaTeX", () => {
  assert.equal(chooseEngine("auto", "E=mc^2", ""), "pdflatex");
  assert.equal(chooseEngine("auto", "\\text{能量}", ""), "xelatex");
  assert.equal(chooseEngine("pdflatex", "\\text{能量}", ""), "pdflatex");
});

test("已经加载 fontspec 时不重复加中文配置", () => {
  assert.match(xelatexFontBlock("\\usepackage{amsmath}"), /xeCJK/);
  assert.equal(xelatexFontBlock("\\usepackage{fontspec}"), "");
});

test("XeLaTeX 模板会补上中文字体", () => {
  const tex = buildTexDocument(
    { latex: "能量", preamble: "\\usepackage{amsmath}", engine: "xelatex", wrapMode: "inline", fontSizePt: 12 },
    "xelatex",
  );
  assert.match(tex, /xeCJK/);
  assert.match(tex, /Songti SC/);
});

test("空导言区会补上 amsmath 与 xcolor", () => {
  const tex = buildTexDocument({ latex: "a+b", preamble: "", engine: "auto", wrapMode: "inline", fontSizePt: 12 }, "pdflatex");
  assert.match(tex, /\\usepackage\{amsmath,amssymb,amsfonts,mathtools\}/);
  assert.match(tex, /\\usepackage\{xcolor\}/);
});

test("模板包含尺寸写出、透明页面和裁剪边距", () => {
  const tex = buildTexDocument(
    { latex: "a+b", preamble: "\\usepackage{amsmath}", engine: "auto", wrapMode: "inline", fontSizePt: 12 },
    "pdflatex",
  );
  assert.match(tex, /\\usepackage\{xcolor\}/);
  assert.match(tex, /\\nopagecolor/);
  assert.match(tex, /\\setlength\{\\PreviewBorder\}\{1pt\}/);
  assert.match(tex, /\$a\+b\$/);
  assert.match(tex, /depth=\\the\\dp\\oefbox/);
  assert.equal(PREVIEW_BORDER_PT, 1);
});

test("导言区不能是一整份文档", () => {
  assert.throws(
    () =>
      buildTexDocument(
        { latex: "a", preamble: "\\documentclass{article}", engine: "auto", wrapMode: "inline", fontSizePt: 12 },
        "pdflatex",
      ),
    /导言区/,
  );
});

test("解析 TeX 写出的尺寸", () => {
  const metrics = parseMetrics("depth=4.16673pt\nheight=11.65562pt\nwidth=95.97289pt\n");
  assert.equal(metrics.depthPt, 4.16673);
  assert.equal(metrics.widthPt, 95.97289);
});

test("从 log 里截出第一条错误", () => {
  const log = "normal line\n! Undefined control sequence.\nl.12 \\foo\nmore\n";
  const extracted = extractLatexError(log);
  assert.match(extracted, /Undefined control sequence/);
  assert.match(extracted, /\\foo/);
});

test("基线下移写进图片所在 run，并可以覆盖旧值", () => {
  const ooxml = `<w:p><w:r><w:rPr><w:noProof/></w:rPr><w:drawing/></w:r></w:p>`;
  const once = injectBaseline(ooxml, 4.2);
  assert.match(once, /<w:rPr><w:position w:val="-8"\/><w:noProof\/><\/w:rPr><w:drawing/);
  const twice = injectBaseline(once, 3);
  assert.match(twice, /<w:position w:val="-6"\/>/);
  assert.equal(twice.match(/<w:position/g)?.length, 1);
});

test("没有 rPr 时补上一层", () => {
  const ooxml = `<w:r><w:drawing/></w:r>`;
  assert.match(injectBaseline(ooxml, 1), /<w:r><w:rPr><w:position w:val="-2"\/><\/w:rPr><w:drawing\/>/);
});

test("读取 SVG 根元素的 pt 尺寸", () => {
  const svg = `<svg width='81.92pt' height='13.6pt' viewBox='0 -10 81.92 13.6'></svg>`;
  assert.deepEqual(readSvgSizePt(svg), { widthPt: 81.92, heightPt: 13.6 });
});

test("给 SVG 补 PreviewBorder 并扩大 viewBox", () => {
  const svg = `<svg version='1.1' width='80pt' height='10pt' viewBox='0 -8 80 10'><path d='M0 0'/></svg>`;
  const padded = padSvgPreviewBorder(svg, PREVIEW_BORDER_PT);
  assert.equal(padded.widthPt, 82);
  assert.equal(padded.heightPt, 12);
  assert.match(padded.svg, /width='82pt'/);
  assert.match(padded.svg, /height='12pt'/);
  assert.match(padded.svg, /viewBox='-1 -9 82 12'/);
});

test("metrics 缺 SVG 尺寸时可推宽高", () => {
  assert.deepEqual(svgSizeFromMetrics({ widthPt: 80, heightPt: 10, depthPt: 3 }, 1), {
    widthPt: 82,
    heightPt: 15,
  });
});
