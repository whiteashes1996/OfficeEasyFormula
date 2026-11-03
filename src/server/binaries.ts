import fs from "node:fs";
import path from "node:path";

const TEXBIN = "/Library/TeX/texbin";

function existing(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function findOnPath(name: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  return existing(dirs.map((dir) => path.join(dir, name)));
}

export function findPdflatex(): string | null {
  return existing([path.join(TEXBIN, "pdflatex")]) ?? findOnPath("pdflatex");
}

export function findLatex(): string | null {
  return existing([path.join(TEXBIN, "latex")]) ?? findOnPath("latex");
}

export function findXelatex(): string | null {
  return existing([path.join(TEXBIN, "xelatex")]) ?? findOnPath("xelatex");
}

export function findDvisvgm(): string | null {
  return existing([path.join(TEXBIN, "dvisvgm")]) ?? findOnPath("dvisvgm");
}

export function findGhostscript(): string | null {
  return (
    findOnPath("gs") ??
    existing(["/opt/homebrew/bin/gs", "/usr/local/bin/gs", path.join(TEXBIN, "gs")])
  );
}

/** dvisvgm 处理 DVI/EPS 时需要 Ghostscript 共享库；新版 Homebrew 的 gs 可执行文件本身不够。 */
export function findLibgs(): string | null {
  return existing([
    "/opt/homebrew/lib/libgs.dylib",
    "/usr/local/lib/libgs.dylib",
    "/opt/homebrew/lib/libgs.10.dylib",
    "/usr/local/lib/libgs.10.dylib",
  ]);
}
