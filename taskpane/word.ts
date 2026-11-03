import { injectBaseline, newFormulaId } from "../src/shared/baseline";
import { PREVIEW_BORDER_PT, TEX_NAMESPACE, type FormulaRecord } from "../src/shared/types";

const TAG_PREFIX = "oef:";
const TITLE_PREFIX = "OEF:";

export interface SelectedFormula {
  id: string;
  record: FormulaRecord | null;
  latex: string;
  widthPt: number;
}

export interface PlaceRequest {
  latex: string;
  preamble: string;
  engine: FormulaRecord["engine"];
  inline: boolean;
  pngBase64: string;
  widthPt: number;
  heightPt: number;
  depthPt: number;
  fontSizePt: number;
  mode: "insert" | "update" | "insert-new";
  existingId?: string;
  currentWidthPt?: number;
  previousNaturalWidthPt?: number;
}

export interface PlaceResult {
  record: FormulaRecord;
  baselineAdjusted: boolean;
}

function officeValue<T>(fn: (callback: (result: Office.AsyncResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) resolve(result.value);
      else reject(new Error(result.error?.message || "读写文档数据失败"));
    });
  });
}

function encodeRecord(record: FormulaRecord): string {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeRecord(payload: string): FormulaRecord | null {
  try {
    const binary = atob(payload.trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as FormulaRecord;
    if (parsed?.v !== 1 || typeof parsed.id !== "string" || typeof parsed.latex !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function serializeStore(records: FormulaRecord[]): string {
  const body = records
    .map((record) => `<formula id="${record.id}"><payload>${encodeRecord(record)}</payload></formula>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><formulas xmlns="${TEX_NAMESPACE}">${body}</formulas>`;
}

function parseStore(xml: string): FormulaRecord[] {
  const document = new DOMParser().parseFromString(xml, "text/xml");
  if (document.querySelector("parsererror")) return [];
  const records: FormulaRecord[] = [];
  const nodes = document.getElementsByTagName("formula");
  for (let index = 0; index < nodes.length; index += 1) {
    const payload = nodes[index].getElementsByTagName("payload")[0]?.textContent ?? "";
    const record = decodeRecord(payload);
    if (record) records.push(record);
  }
  return records;
}

async function readStore(): Promise<FormulaRecord[]> {
  const parts = await officeValue<Office.CustomXmlPart[]>((callback) =>
    Office.context.document.customXmlParts.getByNamespaceAsync(TEX_NAMESPACE, callback),
  );
  const merged = new Map<string, FormulaRecord>();
  for (const part of parts) {
    const xml = await officeValue<string>((callback) => part.getXmlAsync(callback));
    for (const record of parseStore(xml)) merged.set(record.id, record);
  }
  return [...merged.values()];
}

async function writeStore(records: FormulaRecord[]): Promise<void> {
  const existing = await officeValue<Office.CustomXmlPart[]>((callback) =>
    Office.context.document.customXmlParts.getByNamespaceAsync(TEX_NAMESPACE, callback),
  );
  await officeValue<Office.CustomXmlPart>((callback) =>
    Office.context.document.customXmlParts.addAsync(serializeStore(records), callback),
  );
  await Promise.all(existing.map((part) => new Promise<void>((resolve) => part.deleteAsync(() => resolve()))));
}

function idFrom(value: string | null | undefined, prefix: string): string | null {
  if (!value?.startsWith(prefix)) return null;
  const id = value.slice(prefix.length);
  return /^[a-f0-9]{32}$/.test(id) ? id : null;
}

function decorate(picture: Word.InlinePicture, id: string, latex: string, width: number, height: number) {
  picture.altTextTitle = `${TITLE_PREFIX}${id}`;
  picture.altTextDescription = latex.slice(0, 16000);
  picture.lockAspectRatio = true;
  picture.width = width;
  picture.height = height;
}

function scaleForUpdate(currentWidth: number | undefined, naturalWidth: number | undefined): number {
  if (!currentWidth || !naturalWidth) return 1;
  const scale = currentWidth / naturalWidth;
  if (!Number.isFinite(scale) || scale < 0.2 || scale > 5) return 1;
  if (Math.abs(scale - 1) < 0.02) return 1;
  return scale;
}

export async function selectionFontSize(): Promise<number | null> {
  try {
    return await Word.run(async (context) => {
      const font = context.document.getSelection().font;
      font.load("size");
      await context.sync();
      return typeof font.size === "number" && font.size > 0 ? font.size : null;
    });
  } catch {
    return null;
  }
}

export async function readSelectedPicture(): Promise<SelectedFormula | null> {
  return Word.run(async (context) => {
    const selection = context.document.getSelection();
    const pictures = selection.inlinePictures;
    pictures.load("altTextTitle,altTextDescription,width");
    const parent = selection.parentContentControlOrNullObject;
    parent.load("isNullObject,tag");
    await context.sync();

    const matches = pictures.items
      .map((picture) => ({
        id: idFrom(picture.altTextTitle, TITLE_PREFIX),
        latex: picture.altTextDescription ?? "",
        widthPt: picture.width,
      }))
      .filter((picture) => picture.id);
    if (matches.length > 1) return null;

    let id = matches[0]?.id ?? (parent.isNullObject ? null : idFrom(parent.tag, TAG_PREFIX));
    let latex = matches[0]?.latex ?? "";
    let widthPt = matches[0]?.widthPt ?? 0;
    if (!id) return null;

    if (!widthPt && !parent.isNullObject && idFrom(parent.tag, TAG_PREFIX) === id) {
      const inner = parent.getRange(Word.RangeLocation.content).inlinePictures;
      inner.load("width,altTextDescription");
      await context.sync();
      const picture = inner.items[0];
      if (picture) {
        widthPt = picture.width;
        latex = latex || picture.altTextDescription || "";
      }
    }
    return { id, latex, widthPt, record: null };
  });
}

export async function readFormulaRecord(id: string): Promise<FormulaRecord | null> {
  return (await readStore()).find((item) => item.id === id) ?? null;
}

async function pictureById(context: Word.RequestContext, id: string): Promise<Word.InlinePicture | null> {
  const controls = context.document.contentControls.getByTag(`${TAG_PREFIX}${id}`);
  controls.load("items");
  await context.sync();
  const control = controls.items[0];
  if (!control) return null;
  const pictures = control.getRange(Word.RangeLocation.content).inlinePictures;
  pictures.load("altTextTitle");
  await context.sync();
  return pictures.items.find((picture) => idFrom(picture.altTextTitle, TITLE_PREFIX) === id) ?? pictures.items[0] ?? null;
}

function staysInParagraph(relation: Word.LocationRelation | string): boolean {
  return (
    relation === Word.LocationRelation.before ||
    relation === Word.LocationRelation.adjacentBefore ||
    relation === Word.LocationRelation.equal ||
    relation === Word.LocationRelation.inside ||
    relation === Word.LocationRelation.insideStart ||
    relation === Word.LocationRelation.insideEnd ||
    relation === Word.LocationRelation.overlapsBefore
  );
}

async function inlineInsertionHost(selection: Word.Range): Promise<Word.Range> {
  const paragraph = selection.paragraphs.getFirst();
  const parent = selection.parentContentControlOrNullObject;
  parent.load("isNullObject,tag");
  await selection.context.sync();

  if (!parent.isNullObject && idFrom(parent.tag, TAG_PREFIX)) {
    const after = parent.getRange(Word.RangeLocation.after);
    const relation = after.compareLocationWith(paragraph.getRange(Word.RangeLocation.end));
    await selection.context.sync();
    if (!staysInParagraph(relation.value)) {
      return paragraph.insertText("\u00A0", Word.InsertLocation.end);
    }
    return after.getRange(Word.RangeLocation.start).insertText("\u00A0", Word.InsertLocation.start);
  }
  return selection.getRange(Word.RangeLocation.end).insertText("\u00A0", Word.InsertLocation.start);
}

async function displayParagraph(selection: Word.Range): Promise<Word.Paragraph> {
  const paragraph = selection.paragraphs.getFirst();
  const parent = paragraph.parentContentControlOrNullObject;
  parent.load("isNullObject,tag");
  await selection.context.sync();

  const created =
    !parent.isNullObject && idFrom(parent.tag, TAG_PREFIX)
      ? parent.getRange(Word.RangeLocation.after).insertParagraph("", Word.InsertLocation.before)
      : paragraph.insertParagraph("", Word.InsertLocation.after);
  created.alignment = Word.Alignment.centered;
  return created;
}

export async function placeFormula(request: PlaceRequest): Promise<PlaceResult> {
  const id = request.mode === "update" && request.existingId ? request.existingId : newFormulaId();
  const scale =
    request.mode === "update" ? scaleForUpdate(request.currentWidthPt, request.previousNaturalWidthPt) : 1;
  const width = Math.round(request.widthPt * scale * 100) / 100;
  const height = Math.round(request.heightPt * scale * 100) / 100;
  const record: FormulaRecord = {
    v: 1,
    id,
    latex: request.latex,
    preamble: request.preamble,
    engine: request.engine,
    inline: request.inline,
    depthPt: request.depthPt,
    naturalWidthPt: request.widthPt,
    naturalHeightPt: request.heightPt,
    fontSizePt: request.fontSizePt,
  };

  await Word.run(async (context) => {
    const selection = context.document.getSelection();
    let picture: Word.InlinePicture;
    if (request.mode === "update") {
      const current = await pictureById(context, id);
      if (!current) throw new Error("找不到文档里的这条公式，可能已经被删除。");
      picture = current.insertInlinePictureFromBase64(request.pngBase64, Word.InsertLocation.replace);
    } else {
      const host = request.inline
        ? await inlineInsertionHost(selection)
        : (await displayParagraph(selection)).insertText("\u00A0", Word.InsertLocation.start);
      const control = host.insertContentControl();
      control.title = "OfficeEasyFormula";
      control.tag = `${TAG_PREFIX}${id}`;
      control.appearance = Word.ContentControlAppearance.hidden;
      picture = control.insertInlinePictureFromBase64(request.pngBase64, Word.InsertLocation.replace);
    }
    decorate(picture, id, request.latex, width, height);
    await context.sync();
  });

  let baselineAdjusted = false;
  try {
    baselineAdjusted = await adjustBaseline(id, request.depthPt + PREVIEW_BORDER_PT, width, height, request.latex);
  } catch {
    baselineAdjusted = false;
  }
  if (request.mode !== "update") {
    try {
      await selectFormula(id);
    } catch {
      // 图片已经写入。选中失败时，原来的选区可以继续留着。
    }
  }
  await writeStore(mergeRecord(await readStore(), record));
  return { record, baselineAdjusted };
}

async function selectFormula(id: string): Promise<void> {
  await Word.run(async (context) => {
    const picture = await pictureById(context, id);
    if (!picture) return;
    picture.select(Word.SelectionMode.select);
    await context.sync();
  });
}

function mergeRecord(records: FormulaRecord[], record: FormulaRecord): FormulaRecord[] {
  return [...records.filter((item) => item.id !== record.id), record];
}

async function adjustBaseline(
  id: string,
  lowerPt: number,
  width: number,
  height: number,
  latex: string,
): Promise<boolean> {
  return Word.run(async (context) => {
    const picture = await pictureById(context, id);
    if (!picture) return false;
    const range = picture.getRange(Word.RangeLocation.whole);
    const ooxml = range.getOoxml();
    await context.sync();
    const next = injectBaseline(ooxml.value, lowerPt);
    if (next === ooxml.value) return false;
    range.insertOoxml(next, Word.InsertLocation.replace);
    await context.sync();

    const refreshed = context.document.contentControls.getByTag(`${TAG_PREFIX}${id}`);
    refreshed.load("items");
    await context.sync();
    const stillThere = refreshed.items[0];
    if (!stillThere) return true;
    stillThere.tag = `${TAG_PREFIX}${id}`;
    stillThere.title = "OfficeEasyFormula";
    stillThere.appearance = Word.ContentControlAppearance.hidden;
    const pictures = stillThere.getRange(Word.RangeLocation.content).inlinePictures;
    pictures.load("altTextTitle");
    await context.sync();
    const updated =
      pictures.items.find((item) => idFrom(item.altTextTitle, TITLE_PREFIX) === id) ??
      pictures.items.find((item) => !idFrom(item.altTextTitle, TITLE_PREFIX)) ??
      pictures.items[0];
    if (updated) decorate(updated, id, latex, width, height);
    await context.sync();
    return true;
  });
}
