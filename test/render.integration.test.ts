import assert from "node:assert/strict";
import test from "node:test";
import { health, renderFormula } from "../src/server/render";

const tools = health();
const canRender = Boolean(tools.pdflatex && tools.gs);

test("pdfLaTeX 渲染带下伸部分的公式", { skip: !canRender, timeout: 60_000 }, async () => {
  const result = await renderFormula({
    latex: String.raw`E=mc^{2}+\int_{0}^{1}x\,dx`,
    preamble: "\\usepackage{amsmath,amssymb}",
    engine: "pdflatex",
    inline: true,
    fontSizePt: 12,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.engine, "pdflatex");
  assert.ok(result.depthPt > 1);
  assert.ok(result.widthPt > 40 && result.widthPt < 160);
  assert.ok(result.heightPt > result.depthPt);
  const png = Buffer.from(result.pngBase64, "base64");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png[25], 6);
});

test("含中文时走 XeLaTeX", { skip: !tools.xelatex || !tools.gs, timeout: 90_000 }, async () => {
  const result = await renderFormula({
    latex: String.raw`E=mc^2\text{能量}`,
    preamble: "\\usepackage{amsmath}",
    engine: "auto",
    inline: true,
    fontSizePt: 12,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.engine, "xelatex");
  assert.ok(result.widthPt > 20);
});

test("错误公式返回 log 片段", { skip: !canRender, timeout: 60_000 }, async () => {
  const result = await renderFormula({
    latex: "\\notacommand",
    preamble: "",
    engine: "pdflatex",
    inline: true,
    fontSizePt: 12,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.log ?? "", /Undefined control sequence|notacommand/);
});
