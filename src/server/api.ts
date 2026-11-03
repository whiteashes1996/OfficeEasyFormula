import type { IncomingMessage, ServerResponse } from "node:http";
import { health, renderFormula } from "./render";
import type { RenderRequest } from "../shared/types";

const MAX_BODY = 200_000;

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "https://localhost");
  if (url.pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, health());
    return true;
  }
  if (url.pathname === "/api/render" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const request = JSON.parse(body) as RenderRequest;
      if (!request || typeof request.latex !== "string") {
        sendJson(res, 400, { ok: false, error: "请求里没有公式" });
        return true;
      }
      const result = await renderFormula({
        latex: request.latex,
        preamble: typeof request.preamble === "string" ? request.preamble : "",
        engine: request.engine ?? "auto",
        inline: request.inline !== false,
        fontSizePt: typeof request.fontSizePt === "number" ? request.fontSizePt : 12,
      });
      sendJson(res, result.ok ? 200 : 422, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求无法处理";
      sendJson(res, 400, { ok: false, error: message });
    }
    return true;
  }
  return false;
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("请求太大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
