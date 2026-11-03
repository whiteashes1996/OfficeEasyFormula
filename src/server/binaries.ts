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

export function findXelatex(): string | null {
  return existing([path.join(TEXBIN, "xelatex")]) ?? findOnPath("xelatex");
}

export function findGhostscript(): string | null {
  return (
    findOnPath("gs") ??
    existing(["/opt/homebrew/bin/gs", "/usr/local/bin/gs", path.join(TEXBIN, "gs")])
  );
}
