import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { PORT } from "../shared/types";
import { handleApi } from "./api";
import { loadHttpsCredentials } from "./certs";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function staticDir(): string {
  if (process.env.OEF_STATIC_DIR) return process.env.OEF_STATIC_DIR;
  return path.resolve(process.cwd(), "dist");
}

function serveStatic(res: http.ServerResponse, urlPath: string): void {
  const root = staticDir();
  const requested = urlPath === "/" ? "/taskpane.html" : urlPath;
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(filePath).pipe(res);
}

const credentials = loadHttpsCredentials();
const server = https.createServer(credentials, (req, res) => {
  void (async () => {
    if (await handleApi(req, res)) return;
    serveStatic(res, new URL(req.url ?? "/", "https://localhost").pathname);
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "服务器错误";
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(message);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`OfficeEasyFormula 正在监听 https://127.0.0.1:${PORT}`);
});
