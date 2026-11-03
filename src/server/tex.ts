import { PREVIEW_BORDER_PT, type EngineChoice, type EngineName, type FormulaWrapMode } from "../shared/types";

const MAX_SOURCE_CHARS = 50_000;

export interface TexInput {
  latex: string;
  preamble: string;
  engine: EngineChoice;
  wrapMode: FormulaWrapMode;
  fontSizePt: number;
}

/** 自由模式下根据内容判断 Word 是否按「独立」段落插入 */
export function isDisplayMathBody(latex: string): boolean {
  const body = latex.trim();
  if (!body) return false;
  if (body.startsWith("$$")) return true;
  if (/^\\begin\{/.test(body)) return true;
  if (/^\\\[/.test(body)) return true;
  return false;
}

export function wordInlinePlacement(wrapMode: FormulaWrapMode, latex: string): boolean {
  if (wrapMode === "inline") return true;
  if (wrapMode === "display") return false;
  return !isDisplayMathBody(latex);
}

export function chooseEngine(engine: EngineChoice, latex: string, preamble: string): EngineName {
  if (engine === "pdflatex" || engine === "xelatex") return engine;
  return /[^\u0000-\u007f]/.test(`${latex}\n${preamble}`) ? "xelatex" : "pdflatex";
}

/** amsmath 展示环境、$$、\\[ 不能放进 \\sbox 水平盒，需用 \\vbox 测量 */
export function needsVerticalPreviewBox(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.startsWith("$$")) return true;
  if (/^\\\[/.test(trimmed)) return true;
  return /\\begin\{(equation|align|gather|multline|flalign|alignat|split|eqnarray)\*?\}/.test(body);
}

export function wrapLatex(latex: string, wrapMode: FormulaWrapMode): string {
  const body = latex.trim();
  if (!body) throw new Error("公式是空的");
  if (body.length > MAX_SOURCE_CHARS) throw new Error("公式太长了");
  if (wrapMode === "free") return body;
  if (/\\begin\{|\\\[|\\\]|\$\$/.test(body) || (body.startsWith("$") && body.endsWith("$"))) {
    return body;
  }
  if (wrapMode === "inline") return `$${body}$`;
  return `\\begin{equation*}\n${body}\n\\end{equation*}`;
}

export function xelatexFontBlock(preamble: string): string {
  if (/\\usepackage(\[[^\]]*\])?\{fontspec\}/.test(preamble) || /xeCJK/.test(preamble)) return "";
  return "\\usepackage{fontspec}\n\\usepackage{xeCJK}\n\\setCJKmainfont{Songti SC}\n";
}

export function preambleIncludesPackage(preamble: string, name: string): boolean {
  const re = new RegExp(String.raw`\\usepackage(?:\[[^\]]*\])?\{[^}]*\b${name}\b`, "i");
  return re.test(preamble);
}

function builtinPreambleLines(preamble: string): string {
  const lines: Array<{ pkg: string; line: string }> = [
    { pkg: "amsmath", line: "\\usepackage{amsmath,amssymb,amsfonts,mathtools}\n" },
  ];
  let merged = preamble;
  let out = "";
  for (const entry of lines) {
    if (preambleIncludesPackage(merged, entry.pkg)) continue;
    out += entry.line;
    merged += entry.line;
  }
  return out;
}

export function buildTexDocument(input: TexInput, engine: EngineName): string {
  const preamble = input.preamble.trim();
  if (preamble.length > MAX_SOURCE_CHARS) throw new Error("导言区太长了");
  if (/\\documentclass|\\begin\{document\}/.test(preamble)) {
    throw new Error("导言区只写 \\usepackage 这类命令，不要写完整的 LaTeX 文档");
  }

  const body = wrapLatex(input.latex, input.wrapMode);
  const fontSize = Number.isFinite(input.fontSizePt) && input.fontSizePt > 0 ? input.fontSizePt : 12;
  const baselineskip = (fontSize * 1.2).toFixed(2);
  const builtin = builtinPreambleLines(preamble);
  const mergedForDetect = `${preamble}\n${builtin}`;
  const xcolor = preambleIncludesPackage(mergedForDetect, "xcolor") ? "" : "\\usepackage{xcolor}\n";
  const xe = engine === "xelatex" ? xelatexFontBlock(mergedForDetect) : "";
  const border = PREVIEW_BORDER_PT;
  const fontBlock = `\\fontsize{${fontSize}pt}{${baselineskip}pt}\\selectfont`;
  const measureAndShow = needsVerticalPreviewBox(body)
    ? `\\setbox\\oefbox\\vbox{\\parindent0pt ${fontBlock}
${body}}
\\immediate\\write\\oefmetrics{depth=\\the\\dp\\oefbox}
\\immediate\\write\\oefmetrics{height=\\the\\ht\\oefbox}
\\immediate\\write\\oefmetrics{width=\\the\\wd\\oefbox}
\\box\\oefbox`
    : `\\sbox\\oefbox{${fontBlock} ${body}}
\\immediate\\write\\oefmetrics{depth=\\the\\dp\\oefbox}
\\immediate\\write\\oefmetrics{height=\\the\\ht\\oefbox}
\\immediate\\write\\oefmetrics{width=\\the\\wd\\oefbox}
\\usebox\\oefbox`;

  return `\\documentclass{article}
${preamble ? `${preamble}\n` : ""}${builtin}${xcolor}${xe}\\usepackage[active,tightpage]{preview}
\\setlength{\\PreviewBorder}{${border}pt}
\\newwrite\\oefmetrics
\\immediate\\openout\\oefmetrics=metrics.txt
\\begin{document}
\\nopagecolor
\\begin{preview}
\\newbox\\oefbox
${measureAndShow}
\\end{preview}
\\end{document}
`;
}

export interface TexMetrics {
  depthPt: number;
  heightPt: number;
  widthPt: number;
}

export function parseMetrics(text: string): TexMetrics {
  const read = (name: string) => {
    const match = text.match(new RegExp(`^${name}=([0-9.]+)pt\\s*$`, "m"));
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  };
  const depthPt = read("depth");
  const heightPt = read("height");
  const widthPt = read("width");
  if (depthPt === null || heightPt === null || widthPt === null) {
    throw new Error("没有读到公式的尺寸");
  }
  return { depthPt, heightPt, widthPt };
}

export function extractLatexError(log: string): string {
  const lines = log.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith("!"));
  if (index < 0) return lines.slice(-30).join("\n").trim();
  return lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 18)).join("\n").trim();
}

export function readSvgSizePt(svg: string): { widthPt: number; heightPt: number } | null {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return null;
  const width = parseSvgLengthPt(root.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1]);
  const height = parseSvgLengthPt(root.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1]);
  if (width === null || height === null || width <= 0 || height <= 0) return null;
  return { widthPt: width, heightPt: height };
}

function parseSvgLengthPt(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^([0-9]*\.?[0-9]+)\s*(pt|px|in|mm|cm)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] ?? "pt").toLowerCase();
  if (unit === "pt") return value;
  if (unit === "px") return (value * 72) / 96;
  if (unit === "in") return value * 72;
  if (unit === "mm") return (value * 72) / 25.4;
  if (unit === "cm") return (value * 72) / 2.54;
  return null;
}

/**
 * preview 包交给 dvisvgm 的是内容盒；PNG 时代 Ghostscript 会带上 PreviewBorder。
 * 给 SVG 四周补同样的边，基线仍用 depthPt + PREVIEW_BORDER_PT。
 */
export function padSvgPreviewBorder(svg: string, borderPt: number): { svg: string; widthPt: number; heightPt: number } {
  const size = readSvgSizePt(svg);
  if (!size) throw new Error("SVG 里没有可读的宽高");
  if (!(borderPt > 0)) return { svg, widthPt: size.widthPt, heightPt: size.heightPt };

  const widthPt = size.widthPt + 2 * borderPt;
  const heightPt = size.heightPt + 2 * borderPt;
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) throw new Error("SVG 根元素缺失");

  let nextRoot = root;
  const viewBox = root.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
      const [minX, minY, vbWidth, vbHeight] = parts;
      const scaleX = size.widthPt > 0 ? vbWidth / size.widthPt : 1;
      const scaleY = size.heightPt > 0 ? vbHeight / size.heightPt : 1;
      const padded = `${minX - borderPt * scaleX} ${minY - borderPt * scaleY} ${vbWidth + 2 * borderPt * scaleX} ${vbHeight + 2 * borderPt * scaleY}`;
      nextRoot = nextRoot.replace(viewBox[0], `viewBox='${padded}'`);
    }
  } else {
    nextRoot = nextRoot.replace(/<svg\b/i, `<svg viewBox='${-borderPt} ${-borderPt} ${widthPt} ${heightPt}'`);
  }

  nextRoot = replaceOrInsertSvgAttr(nextRoot, "width", `${roundSvgPt(widthPt)}pt`);
  nextRoot = replaceOrInsertSvgAttr(nextRoot, "height", `${roundSvgPt(heightPt)}pt`);
  return { svg: svg.replace(root, nextRoot), widthPt: roundSvgPt(widthPt), heightPt: roundSvgPt(heightPt) };
}

function replaceOrInsertSvgAttr(root: string, name: string, value: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*["'][^"']*["']`, "i");
  if (re.test(root)) return root.replace(re, `${name}='${value}'`);
  return root.replace(/<svg\b/i, `<svg ${name}='${value}'`);
}

function roundSvgPt(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function svgSizeFromMetrics(metrics: TexMetrics, borderPt: number): { widthPt: number; heightPt: number } {
  return {
    widthPt: roundSvgPt(metrics.widthPt + 2 * borderPt),
    heightPt: roundSvgPt(metrics.heightPt + metrics.depthPt + 2 * borderPt),
  };
}
