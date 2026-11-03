import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PREVIEW_BORDER_PT,
  resolveWrapMode,
  type EngineName,
  type HealthResponse,
  type RenderRequest,
  type RenderResponse,
} from "../shared/types";
import { findDvisvgm, findLatex, findLibgs, findPdflatex, findXelatex, findGhostscript } from "./binaries";
import {
  buildTexDocument,
  chooseEngine,
  extractLatexError,
  padSvgPreviewBorder,
  parseMetrics,
  readSvgSizePt,
  svgSizeFromMetrics,
} from "./tex";

const TIMEOUT_MS = 20_000;

export function health(): HealthResponse {
  const pdflatex = findPdflatex();
  const latex = findLatex();
  const xelatex = findXelatex();
  const dvisvgm = findDvisvgm();
  const gs = findGhostscript();
  const libgs = findLibgs();
  return {
    ok: Boolean(latex && dvisvgm),
    pdflatex,
    latex,
    xelatex,
    dvisvgm,
    gs,
    libgs,
  };
}

function run(command: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, timeout: TIMEOUT_MS });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function renderFormula(request: RenderRequest): Promise<RenderResponse> {
  const tools = health();
  let engine: EngineName;
  let tex: string;
  try {
    engine = chooseEngine(request.engine, request.latex, request.preamble);
    tex = buildTexDocument(
      {
        latex: request.latex,
        preamble: request.preamble,
        engine: request.engine,
        wrapMode: resolveWrapMode(request),
        fontSizePt: typeof request.fontSizePt === "number" ? request.fontSizePt : 12,
      },
      engine,
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "无法准备公式" };
  }

  if (!tools.dvisvgm) {
    return {
      ok: false,
      error: "找不到 dvisvgm。完整 MacTeX 通常自带；BasicTeX 可执行 sudo tlmgr install dvisvgm。",
    };
  }

  // pdfLaTeX 引擎走 latex→DVI；XeLaTeX 走 xelatex -no-pdf→XDV。dvisvgm 再转成描边 SVG。
  // 新版 Ghostscript 不能给 dvisvgm --pdf 用，所以不经过 PDF。
  const command = engine === "xelatex" ? tools.xelatex : tools.latex;
  if (!command) {
    const expected = engine === "xelatex" ? "xelatex" : "latex";
    return {
      ok: false,
      error: `找不到 ${expected}。请安装 MacTeX 或 BasicTeX，并确认 /Library/TeX/texbin/${expected} 存在。`,
    };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oef-"));
  try {
    await fs.writeFile(path.join(dir, "formula.tex"), tex, "utf8");
    const engineArgs = [
      "-no-shell-escape",
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-output-directory",
      dir,
      "formula.tex",
    ];
    if (engine === "xelatex") engineArgs.unshift("-no-pdf");

    const compiled = await run(command, engineArgs, dir);
    const logPath = path.join(dir, "formula.log");
    const log = await fs.readFile(logPath, "utf8").catch(() => compiled.stdout + compiled.stderr);
    if (compiled.code !== 0) {
      return { ok: false, error: "LaTeX 编译失败", log: extractLatexError(log) };
    }

    const vectorInput = engine === "xelatex" ? path.join(dir, "formula.xdv") : path.join(dir, "formula.dvi");
    const svgPath = path.join(dir, "formula.svg");
    const dvisvgmArgs = ["--no-fonts", "-o", svgPath, vectorInput];
    if (tools.libgs) dvisvgmArgs.unshift(`--libgs=${tools.libgs}`);

    const converted = await run(tools.dvisvgm, dvisvgmArgs, dir);
    if (converted.code !== 0) {
      return {
        ok: false,
        error: "没能把公式转成 SVG",
        log: (converted.stderr || converted.stdout).slice(-2000),
      };
    }

    const rawSvg = await fs.readFile(svgPath, "utf8");
    const metricsText = await fs.readFile(path.join(dir, "metrics.txt"), "utf8");
    const metrics = parseMetrics(metricsText);
    const fallback = svgSizeFromMetrics(metrics, PREVIEW_BORDER_PT);
    let svg = rawSvg;
    let widthPt = fallback.widthPt;
    let heightPt = fallback.heightPt;
    try {
      if (readSvgSizePt(rawSvg)) {
        const padded = padSvgPreviewBorder(rawSvg, PREVIEW_BORDER_PT);
        svg = padded.svg;
        widthPt = padded.widthPt;
        heightPt = padded.heightPt;
      }
    } catch {
      svg = rawSvg;
      widthPt = fallback.widthPt;
      heightPt = fallback.heightPt;
    }

    return {
      ok: true,
      svgBase64: Buffer.from(svg, "utf8").toString("base64"),
      widthPt: roundPt(widthPt),
      heightPt: roundPt(heightPt),
      depthPt: metrics.depthPt,
      engine,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "渲染失败";
    return { ok: false, error: message };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function roundPt(value: number): number {
  return Math.round(value * 100) / 100;
}
