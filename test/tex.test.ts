import assert from "node:assert/strict";
import test from "node:test";
import { injectBaseline } from "../src/shared/baseline";
import { PREVIEW_BORDER_PT } from "../src/shared/types";
import { buildTexDocument, chooseEngine, extractLatexError, parseMetrics, wrapLatex, xelatexFontBlock } from "../src/server/tex";

test("行内公式包进美元符号，独立公式用 displaystyle", () => {
  assert.equal(wrapLatex("E=mc^2", true), "$E=mc^2$");
  assert.equal(wrapLatex("E=mc^2", false), "$\\displaystyle E=mc^2$");
});

test("用户自己写了环境或定界符时不再包一层", () => {
  assert.equal(wrapLatex("\\begin{aligned}a&=b\\end{aligned}", true), "\\begin{aligned}a&=b\\end{aligned}");
  assert.equal(wrapLatex("$E=mc^2$", false), "$E=mc^2$");
  assert.equal(wrapLatex("$$a$$", true), "$$a$$");
});

test("空公式会被拒绝", () => {
  assert.throws(() => wrapLatex("   ", true), /公式是空的/);
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
    { latex: "能量", preamble: "\\usepackage{amsmath}", engine: "xelatex", inline: true, fontSizePt: 12 },
    "xelatex",
  );
  assert.match(tex, /xeCJK/);
  assert.match(tex, /Songti SC/);
});

test("模板包含尺寸写出、透明页面和裁剪边距", () => {
  const tex = buildTexDocument(
    { latex: "a+b", preamble: "\\usepackage{amsmath}", engine: "auto", inline: true, fontSizePt: 12 },
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
        { latex: "a", preamble: "\\documentclass{article}", engine: "auto", inline: true, fontSizePt: 12 },
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
