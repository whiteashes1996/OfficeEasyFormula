import { DEFAULT_PREAMBLE, type EngineChoice, type HealthResponse, type RenderRequest, type RenderResponse, type RenderSuccess } from "../src/shared/types";
import { placeFormula, readFormulaRecord, readSelectedPicture, selectionFontSize, type SelectedFormula } from "./word";

const latexInput = document.querySelector<HTMLTextAreaElement>("#latex")!;
const preambleInput = document.querySelector<HTMLTextAreaElement>("#preamble")!;
const engineInput = document.querySelector<HTMLSelectElement>("#engine")!;
const preview = document.querySelector<HTMLDivElement>("#preview")!;
const errorBox = document.querySelector<HTMLPreElement>("#error")!;
const primaryButton = document.querySelector<HTMLButtonElement>("#primary")!;
const insertNewButton = document.querySelector<HTMLButtonElement>("#insert-new")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const banner = document.querySelector<HTMLDivElement>("#banner")!;
const hostNote = document.querySelector<HTMLParagraphElement>("#host-note")!;

let inWord = false;
let fontSizePt = 12;
let loaded: SelectedFormula | null = null;
let applying = false;
let selectionGeneration = 0;
let busy = false;
let previewToken = 0;
let previewTimer = 0;
let lastGood: { signature: string; result: RenderSuccess } | null = null;
let healthState: HealthResponse | null = null;

function engineChoice(): EngineChoice {
  const value = engineInput.value;
  return value === "pdflatex" || value === "xelatex" ? value : "auto";
}

function inlineMode(): boolean {
  return document.querySelector<HTMLInputElement>('input[name="display"]:checked')?.value !== "display";
}

function requestBody(): RenderRequest {
  return {
    latex: latexInput.value,
    preamble: preambleInput.value,
    engine: engineChoice(),
    inline: inlineMode(),
    fontSizePt,
  };
}

function signatureOf(request: RenderRequest): string {
  return JSON.stringify(request);
}

function setStatus(text: string) {
  status.textContent = text;
}

function showError(text: string) {
  errorBox.hidden = !text;
  errorBox.textContent = text;
}

function setBusy(next: boolean) {
  busy = next;
  primaryButton.disabled = next;
  insertNewButton.disabled = next;
}

function rememberPreferences() {
  localStorage.setItem("oef.preamble", preambleInput.value);
  localStorage.setItem("oef.engine", engineInput.value);
  localStorage.setItem("oef.inline", inlineMode() ? "1" : "0");
  localStorage.setItem("oef.draft", latexInput.value);
}

function restorePreferences() {
  preambleInput.value = localStorage.getItem("oef.preamble") ?? DEFAULT_PREAMBLE;
  engineInput.value = localStorage.getItem("oef.engine") ?? "auto";
  const inline = localStorage.getItem("oef.inline") !== "0";
  const radio = document.querySelector<HTMLInputElement>(`input[name="display"][value="${inline ? "inline" : "display"}"]`);
  if (radio) radio.checked = true;
  const draft = localStorage.getItem("oef.draft");
  if (draft) latexInput.value = draft;
}

function updateButtons() {
  const editing = loaded !== null;
  primaryButton.textContent = editing ? "更新" : "插入";
  insertNewButton.hidden = loaded === null;
}

function showPreview(result: RenderSuccess) {
  preview.replaceChildren();
  const image = document.createElement("img");
  image.alt = latexInput.value.trim() || "公式预览";
  image.src = `data:image/png;base64,${result.pngBase64}`;
  preview.append(image);
  showError("");
  const engineName = result.engine === "xelatex" ? "XeLaTeX" : "pdfLaTeX";
  setStatus(`已用 ${engineName} 渲染`);
}

async function runPreview() {
  const request = requestBody();
  if (!request.latex.trim()) {
    preview.replaceChildren();
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "预览会显示在这里";
    preview.append(placeholder);
    showError("");
    setStatus("");
    lastGood = null;
    return;
  }
  const token = ++previewToken;
  setStatus("正在渲染…");
  try {
    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const result = (await response.json()) as RenderResponse;
    if (token !== previewToken) return;
    if (!result.ok) {
      showError(result.log || result.error);
      setStatus(result.error);
      return;
    }
    lastGood = { signature: signatureOf(request), result };
    showPreview(result);
  } catch {
    if (token !== previewToken) return;
    showError("");
    setStatus("连不上本机编译服务。请确认它正在运行。");
  }
}

function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => void runPreview(), 500);
}

function paintFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function writeLatex(latex: string) {
  applying = true;
  latexInput.value = latex;
  applying = false;
}

function applyRecord(selected: SelectedFormula) {
  const record = selected.record;
  if (!record) return;
  applying = true;
  if (record.latex && record.latex !== latexInput.value) latexInput.value = record.latex;
  preambleInput.value = record.preamble;
  engineInput.value = record.engine;
  const radio = document.querySelector<HTMLInputElement>(
    `input[name="display"][value="${record.inline ? "inline" : "display"}"]`,
  );
  if (radio) radio.checked = true;
  if (record.fontSizePt > 0) fontSizePt = record.fontSizePt;
  applying = false;
}

async function showFormulaPane() {
  const show = Office.addin?.showAsTaskpane;
  if (typeof show !== "function") return;
  try {
    await show();
  } catch {
    // 窗格已经在前面时，再切一次会失败。选区载入仍然继续。
  }
}

async function refreshSelection() {
  if (!inWord || applying || busy) return;
  const generation = ++selectionGeneration;
  const fontPromise = selectionFontSize();
  let picked: SelectedFormula | null = null;
  try {
    picked = await readSelectedPicture();
  } catch {
    return;
  }
  if (generation !== selectionGeneration) return;
  if (!picked) {
    loaded = null;
    updateButtons();
    return;
  }
  void showFormulaPane();
  if (loaded?.id === picked.id) return;

  loaded = picked;
  writeLatex(picked.latex);
  updateButtons();
  await paintFrame();
  if (generation !== selectionGeneration) return;

  try {
    const [record, size] = await Promise.all([readFormulaRecord(picked.id), fontPromise]);
    if (generation !== selectionGeneration) return;
    if (size) fontSizePt = size;
    loaded = { ...picked, record, latex: record?.latex || picked.latex };
    applyRecord(loaded);
  } catch {
    if (generation !== selectionGeneration) return;
  }
  void runPreview();
}

async function renderForInsert(): Promise<RenderSuccess> {
  const request = requestBody();
  if (lastGood && lastGood.signature === signatureOf(request)) return lastGood.result;
  const response = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const result = (await response.json()) as RenderResponse;
  if (!result.ok) {
    showError(result.log || result.error);
    throw new Error(result.error);
  }
  lastGood = { signature: signatureOf(request), result };
  showPreview(result);
  return result;
}

async function commit(mode: "insert" | "update" | "insert-new") {
  if (!inWord) {
    setStatus("插入需要在 Word 的任务窗格里进行。这里可以先预览。");
    return;
  }
  if (!latexInput.value.trim()) {
    setStatus("先写公式。");
    return;
  }
  setBusy(true);
  try {
    const rendered = await renderForInsert();
    const placed = await placeFormula({
      latex: latexInput.value,
      preamble: preambleInput.value,
      engine: rendered.engine,
      inline: inlineMode(),
      pngBase64: rendered.pngBase64,
      widthPt: rendered.widthPt,
      heightPt: rendered.heightPt,
      depthPt: rendered.depthPt,
      fontSizePt,
      mode: mode === "update" && loaded ? "update" : mode === "insert-new" ? "insert-new" : "insert",
      existingId: loaded?.id,
      currentWidthPt: loaded?.widthPt,
      previousNaturalWidthPt: loaded?.record?.naturalWidthPt,
    });
    const previousScale =
      mode === "update" && loaded?.widthPt && loaded.record?.naturalWidthPt
        ? loaded.widthPt / loaded.record.naturalWidthPt
        : 1;
    loaded = {
      id: placed.record.id,
      record: placed.record,
      latex: placed.record.latex,
      widthPt: placed.record.naturalWidthPt * (Number.isFinite(previousScale) ? previousScale : 1),
    };
    updateButtons();
    setStatus(placed.baselineAdjusted ? "已写入文档。" : "已写入文档。基线没有对齐，公式可能显得偏高。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "没有写入文档");
  } finally {
    setBusy(false);
  }
}

function onEdit() {
  if (applying) return;
  rememberPreferences();
  schedulePreview();
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    healthState = (await response.json()) as HealthResponse;
  } catch {
    healthState = null;
  }
  if (!healthState) {
    banner.hidden = false;
    banner.textContent = "连不上本机编译服务。安装后它会在登录时自动启动；开发时请运行 npm run dev。";
    return;
  }
  if (!healthState.pdflatex || !healthState.gs) {
    banner.hidden = false;
    banner.textContent = "找不到 pdfLaTeX 或 Ghostscript。请安装 MacTeX，并确认 /Library/TeX/texbin/pdflatex 存在。";
    return;
  }
  banner.hidden = true;
}

function start(wordHost: boolean) {
  if (document.body.dataset.ready === "1") return;
  document.body.dataset.ready = "1";
  inWord = wordHost;
  hostNote.textContent = wordHost ? "单击文档里的公式，这里会自动打开并载入它。" : "当前不在 Word 里，只能预览。";
  restorePreferences();
  updateButtons();
  latexInput.addEventListener("input", onEdit);
  preambleInput.addEventListener("input", onEdit);
  engineInput.addEventListener("change", onEdit);
  for (const radio of Array.from(document.querySelectorAll<HTMLInputElement>('input[name="display"]'))) {
    radio.addEventListener("change", onEdit);
  }
  primaryButton.addEventListener("click", () => void commit(loaded ? "update" : "insert"));
  insertNewButton.addEventListener("click", () => void commit("insert-new"));
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void commit(loaded ? "update" : "insert");
    }
  });
  void loadHealth();
  void runPreview();
  if (wordHost) {
    if (Office.context.requirements.isSetSupported("SharedRuntime", "1.1")) {
      Office.addin.setStartupBehavior(Office.StartupBehavior.load).then(
        () => {
          hostNote.textContent = "单击公式会载入到这里。请保存文档，下次打开会自动待命。";
        },
        () => undefined,
      );
    }
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, () => {
      window.setTimeout(() => void refreshSelection(), 150);
    });
    void refreshSelection();
  }
}

if (typeof Office === "undefined") start(false);
else Office.onReady((info) => start(info.host === Office.HostType.Word));
