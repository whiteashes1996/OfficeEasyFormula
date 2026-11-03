import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RENDER_DPI, type EngineName, type HealthResponse, type RenderRequest, type RenderResponse } from "../shared/types";
import { findGhostscript, findPdflatex, findXelatex } from "./binaries";
import { buildTexDocument, chooseEngine, extractLatexError, parseMetrics, pixelsToPoints, pngPixelSize } from "./tex";

const TIMEOUT_MS = 20_000;

export function health(): HealthResponse {
  const pdflatex = findPdflatex();
  const xelatex = findXelatex();
  const gs = findGhostscript();
  return { ok: Boolean(pdflatex && gs), pdflatex, xelatex, gs };
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
    tex = buildTexDocument(request, engine);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "无法准备公式" };
  }

  const command = engine === "xelatex" ? tools.xelatex : tools.pdflatex;
  if (!command) {
    const expected = engine === "xelatex" ? "xelatex" : "pdflatex";
    return {
      ok: false,
      error: `找不到 ${expected}。请安装 MacTeX 或 BasicTeX，并确认 /Library/TeX/texbin/${expected} 存在。`,
    };
  }
  if (!tools.gs) {
    return { ok: false, error: "找不到 Ghostscript（gs）。MacTeX 通常会带上它，也可以用 Homebrew 安装 ghostscript。" };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oef-"));
  try {
    await fs.writeFile(path.join(dir, "formula.tex"), tex, "utf8");
    const compiled = await run(
      command,
      ["-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-output-directory", dir, "formula.tex"],
      dir,
    );
    const logPath = path.join(dir, "formula.log");
    const log = await fs.readFile(logPath, "utf8").catch(() => compiled.stdout + compiled.stderr);
    if (compiled.code !== 0) {
      return { ok: false, error: "LaTeX 编译失败", log: extractLatexError(log) };
    }

    const pdfPath = path.join(dir, "formula.pdf");
    const pngPath = path.join(dir, "formula.png");
    const converted = await run(
      tools.gs,
      ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pngalpha", `-r${RENDER_DPI}`, "-o", pngPath, pdfPath],
      dir,
    );
    if (converted.code !== 0) {
      return { ok: false, error: "没能把 PDF 转成图片", log: (converted.stderr || converted.stdout).slice(-2000) };
    }

    const png = await fs.readFile(pngPath);
    const pixels = pngPixelSize(png);
    const metricsText = await fs.readFile(path.join(dir, "metrics.txt"), "utf8");
    const metrics = parseMetrics(metricsText);
    return {
      ok: true,
      pngBase64: png.toString("base64"),
      widthPt: roundPt(pixelsToPoints(pixels.width, RENDER_DPI)),
      heightPt: roundPt(pixelsToPoints(pixels.height, RENDER_DPI)),
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
