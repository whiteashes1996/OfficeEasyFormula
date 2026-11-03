export const PORT = 47321;
export const PREVIEW_BORDER_PT = 1;
export const TEX_NAMESPACE = "urn:officeeasyformula:v1";

export type EngineChoice = "auto" | "pdflatex" | "xelatex";
export type EngineName = "pdflatex" | "xelatex";
export type FormulaWrapMode = "inline" | "display" | "free";

export interface RenderRequest {
  latex: string;
  preamble: string;
  engine: EngineChoice;
  /** 旧客户端只传 inline；新客户端传 wrapMode */
  inline?: boolean;
  wrapMode?: FormulaWrapMode;
  fontSizePt: number;
}

export function resolveWrapMode(request: { wrapMode?: FormulaWrapMode; inline?: boolean }): FormulaWrapMode {
  if (request.wrapMode === "inline" || request.wrapMode === "display" || request.wrapMode === "free") {
    return request.wrapMode;
  }
  return request.inline === false ? "display" : "inline";
}

export interface RenderSuccess {
  ok: true;
  svgBase64: string;
  widthPt: number;
  heightPt: number;
  depthPt: number;
  engine: EngineName;
}

export interface RenderFailure {
  ok: false;
  error: string;
  log?: string;
}

export type RenderResponse = RenderSuccess | RenderFailure;

export interface HealthResponse {
  ok: boolean;
  pdflatex: string | null;
  latex: string | null;
  xelatex: string | null;
  dvisvgm: string | null;
  gs: string | null;
  libgs: string | null;
}

export interface FormulaRecord {
  v: 1;
  id: string;
  latex: string;
  preamble: string;
  engine: EngineName;
  wrapMode?: FormulaWrapMode;
  inline: boolean;
  depthPt: number;
  naturalWidthPt: number;
  naturalHeightPt: number;
  fontSizePt: number;
}

export const DEFAULT_PREAMBLE = `\\usepackage{amsmath,amssymb,amsfonts,mathtools}
\\usepackage{bm,mathrsfs,stmaryrd,cancel}
\\usepackage{physics}
\\usepackage[version=4]{mhchem}`;

/** 递增后会把仍停留在旧默认导言区的 localStorage 升级到 DEFAULT_PREAMBLE */
export const PREAMBLE_VERSION = 2;

const LEGACY_DEFAULT_PREAMBLES = [
  `\\usepackage{amsmath,amssymb,amsfonts,mathtools}
\\usepackage{bm}`,
  `\\usepackage{amsmath,amssymb,amsfonts,mathtools}`,
];

export function normalizePreamble(text: string): string {
  return text.trim().replace(/\r\n/g, "\n");
}

export function isLegacyDefaultPreamble(text: string): boolean {
  const normalized = normalizePreamble(text);
  return LEGACY_DEFAULT_PREAMBLES.some((legacy) => normalizePreamble(legacy) === normalized);
}

export function loadStoredPreamble(storage: Pick<Storage, "getItem" | "setItem">): string {
  const stored = storage.getItem("oef.preamble");
  if (stored === null) return DEFAULT_PREAMBLE;

  const version = Number(storage.getItem("oef.preambleVersion") ?? "1");
  if (version < PREAMBLE_VERSION && isLegacyDefaultPreamble(stored)) {
    storage.setItem("oef.preamble", DEFAULT_PREAMBLE);
    storage.setItem("oef.preambleVersion", String(PREAMBLE_VERSION));
    return DEFAULT_PREAMBLE;
  }
  return stored;
}

export function rememberStoredPreamble(storage: Pick<Storage, "setItem">, preamble: string): void {
  storage.setItem("oef.preamble", preamble);
  storage.setItem("oef.preambleVersion", String(PREAMBLE_VERSION));
}
