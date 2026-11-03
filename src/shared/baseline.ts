/**
 * Word 把行内图片的底边贴在文字基线上，公式会偏高。
 * 在包含图片的那个 run 上写入 w:position（半点，负值下移）。
 */
export function injectBaseline(ooxml: string, lowerPt: number): string {
  const half = -Math.round(lowerPt * 2);
  if (!Number.isFinite(half) || half === 0) return ooxml;

  const drawing = ooxml.match(/<([A-Za-z0-9]+):drawing\b/);
  if (!drawing || drawing.index === undefined) return ooxml;

  const prefix = drawing[1];
  const drawingIndex = drawing.index;
  const before = ooxml.slice(0, drawingIndex);
  const runRe = new RegExp(`<${prefix}:r(?![A-Za-z])`, "g");
  let runIndex = -1;
  for (let match = runRe.exec(before); match; match = runRe.exec(before)) {
    runIndex = match.index;
  }
  if (runIndex < 0) return ooxml;

  const positionXml = `<${prefix}:position ${prefix}:val="${half}"/>`;
  const runSlice = ooxml.slice(runIndex, drawingIndex);
  const positionRe = new RegExp(`<${prefix}:position\\b[^>]*/>`);
  if (positionRe.test(runSlice)) {
    const replaced = runSlice.replace(positionRe, positionXml);
    return ooxml.slice(0, runIndex) + replaced + ooxml.slice(drawingIndex);
  }

  const rPr = runSlice.match(new RegExp(`<${prefix}:rPr(\\s[^>]*)?>`));
  if (rPr && rPr.index !== undefined) {
    const insertAt = runIndex + rPr.index + rPr[0].length;
    return ooxml.slice(0, insertAt) + positionXml + ooxml.slice(insertAt);
  }

  const block = `<${prefix}:rPr>${positionXml}</${prefix}:rPr>`;
  return ooxml.slice(0, drawingIndex) + block + ooxml.slice(drawingIndex);
}

export function newFormulaId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
