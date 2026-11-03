export const PORT = 47321;
export const PREVIEW_BORDER_PT = 1;
export const RENDER_DPI = 600;
export const TEX_NAMESPACE = "urn:officeeasyformula:v1";

export type EngineChoice = "auto" | "pdflatex" | "xelatex";
export type EngineName = "pdflatex" | "xelatex";

export interface RenderRequest {
  latex: string;
  preamble: string;
  engine: EngineChoice;
  inline: boolean;
  fontSizePt: number;
}

export interface RenderSuccess {
  ok: true;
  pngBase64: string;
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
  xelatex: string | null;
  gs: string | null;
}

export interface FormulaRecord {
  v: 1;
  id: string;
  latex: string;
  preamble: string;
  engine: EngineName;
  inline: boolean;
  depthPt: number;
  naturalWidthPt: number;
  naturalHeightPt: number;
  fontSizePt: number;
}

export const DEFAULT_PREAMBLE = `\\usepackage{amsmath,amssymb,amsfonts,mathtools}
\\usepackage{bm}`;
