import assert from "node:assert/strict";
import test from "node:test";
import { health, renderFormula } from "../src/server/render";

const tools = health();
const canRender = Boolean(tools.latex && tools.dvisvgm);

function decodeSvg(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf8");
}

test("pdfLaTeX 渲染带下伸部分的公式为描边 SVG", { skip: !canRender, timeout: 60_000 }, async () => {
  const result = await renderFormula({
    latex: String.raw`E=mc^{2}+\int_{0}^{1}x\,dx`,
    preamble: "\\usepackage{amsmath,amssymb}",
    engine: "pdflatex",
    wrapMode: "inline",
    fontSizePt: 12,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.engine, "pdflatex");
  assert.ok(result.depthPt > 1);
  assert.ok(result.widthPt > 40 && result.widthPt < 160);
  assert.ok(result.heightPt > result.depthPt);
  const svg = decodeSvg(result.svgBase64);
  assert.match(svg, /<svg\b/i);
  assert.match(svg, /\bwidth=['"][0-9.]+pt['"]/i);
  assert.match(svg, /\bheight=['"][0-9.]+pt['"]/i);
  assert.match(svg, /<path\b/i);
  assert.equal(/<text\b/i.test(svg), false);
});

test("含中文时走 XeLaTeX", { skip: !tools.xelatex || !tools.dvisvgm, timeout: 90_000 }, async () => {
  const result = await renderFormula({
    latex: String.raw`E=mc^2\text{能量}`,
    preamble: "\\usepackage{amsmath}",
    engine: "auto",
    wrapMode: "inline",
    fontSizePt: 12,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.engine, "xelatex");
  assert.ok(result.widthPt > 20);
  const svg = decodeSvg(result.svgBase64);
  assert.match(svg, /<path\b/i);
  assert.equal(/<text\b/i.test(svg), false);
});

test("独立模式长公式用 equation 可编译", { skip: !canRender, timeout: 60_000 }, async () => {
  const result = await renderFormula({
    latex: String.raw`Q\left(\varepsilon_a\right) \leq \sum_{i=2}^N \frac{\left\|\mathcal{W}_o^{1 / 2}\left(\tilde{\varepsilon}_{a, i}-\hat{A}_i^{T_a} \tilde{e}_{0, i}^x\right)\right\|^2}{1 / \lambda_i+\sigma_{\min }\left(\mathcal{W}_o \tilde{\mathcal{W}}_{c, i}\right)}`,
    preamble: "\\usepackage{amsmath,amssymb}",
    engine: "pdflatex",
    wrapMode: "display",
    fontSizePt: 12,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.widthPt > 50);
});

test("自由模式按用户写的 $$ 原样渲染", { skip: !canRender, timeout: 60_000 }, async () => {
  const result = await renderFormula({
    latex: "$$E=mc^{2}$$",
    preamble: "\\usepackage{amsmath}",
    engine: "pdflatex",
    wrapMode: "free",
    fontSizePt: 12,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.widthPt > 20);
});

test("错误公式返回 log 片段", { skip: !canRender, timeout: 60_000 }, async () => {
  const result = await renderFormula({
    latex: "\\notacommand",
    preamble: "",
    engine: "pdflatex",
    wrapMode: "free",
    fontSizePt: 12,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.log ?? "", /Undefined control sequence|notacommand/);
});
