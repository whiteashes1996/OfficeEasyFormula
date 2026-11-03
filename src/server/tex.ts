import { PREVIEW_BORDER_PT, type EngineChoice, type EngineName } from "../shared/types";

const MAX_SOURCE_CHARS = 50_000;

export interface TexInput {
  latex: string;
  preamble: string;
  engine: EngineChoice;
  inline: boolean;
  fontSizePt: number;
}

export function chooseEngine(engine: EngineChoice, latex: string, preamble: string): EngineName {
  if (engine === "pdflatex" || engine === "xelatex") return engine;
  return /[^\u0000-\u007f]/.test(`${latex}\n${preamble}`) ? "xelatex" : "pdflatex";
}

export function wrapLatex(latex: string, inline: boolean): string {
  const body = latex.trim();
  if (!body) throw new Error("公式是空的");
  if (body.length > MAX_SOURCE_CHARS) throw new Error("公式太长了");
  if (/\\begin\{|\\\[|\\\]|\$\$/.test(body) || (body.startsWith("$") && body.endsWith("$"))) {
    return body;
  }
  if (inline) return `$${body}$`;
  return `$\\displaystyle ${body}$`;
}

export function xelatexFontBlock(preamble: string): string {
  if (/\\usepackage(\[[^\]]*\])?\{fontspec\}/.test(preamble) || /xeCJK/.test(preamble)) return "";
  return "\\usepackage{fontspec}\n\\usepackage{xeCJK}\n\\setCJKmainfont{Songti SC}\n";
}

export function buildTexDocument(input: TexInput, engine: EngineName): string {
  const preamble = input.preamble.trim();
  if (preamble.length > MAX_SOURCE_CHARS) throw new Error("导言区太长了");
  if (/\\documentclass|\\begin\{document\}/.test(preamble)) {
    throw new Error("导言区只写 \\usepackage 这类命令，不要写完整的 LaTeX 文档");
  }

  const body = wrapLatex(input.latex, input.inline);
  const fontSize = Number.isFinite(input.fontSizePt) && input.fontSizePt > 0 ? input.fontSizePt : 12;
  const baselineskip = (fontSize * 1.2).toFixed(2);
  const xcolor = /\\usepackage(\[[^\]]*\])?\{xcolor\}/.test(preamble) ? "" : "\\usepackage{xcolor}\n";
  const xe = engine === "xelatex" ? xelatexFontBlock(preamble) : "";
  const border = PREVIEW_BORDER_PT;

  return `\\documentclass{article}
${preamble ? `${preamble}\n` : ""}${xcolor}${xe}\\usepackage[active,tightpage]{preview}
\\setlength{\\PreviewBorder}{${border}pt}
\\newwrite\\oefmetrics
\\immediate\\openout\\oefmetrics=metrics.txt
\\begin{document}
\\nopagecolor
\\begin{preview}
\\newbox\\oefbox
\\sbox\\oefbox{\\fontsize{${fontSize}pt}{${baselineskip}pt}\\selectfont ${body}}
\\immediate\\write\\oefmetrics{depth=\\the\\dp\\oefbox}
\\immediate\\write\\oefmetrics{height=\\the\\ht\\oefbox}
\\immediate\\write\\oefmetrics{width=\\the\\wd\\oefbox}
\\usebox\\oefbox
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

export function pngPixelSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png[0] !== 0x89) throw new Error("渲染结果不是 PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export function pixelsToPoints(pixels: number, dpi: number): number {
  return (pixels / dpi) * 72;
}
