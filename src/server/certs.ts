import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface HttpsCredentials {
  key: Buffer;
  cert: Buffer;
}

export function certificateDirectories(): string[] {
  const dirs = [
    process.env.OEF_CERT_DIR,
    path.join(os.homedir(), ".office-addin-dev-certs"),
    path.join(os.homedir(), "Library", "Application Support", "OfficeEasyFormula", "certs"),
  ];
  return dirs.filter((dir): dir is string => Boolean(dir));
}

export function loadHttpsCredentials(): HttpsCredentials {
  for (const dir of certificateDirectories()) {
    const keyPath = path.join(dir, "localhost.key");
    const certPath = path.join(dir, "localhost.crt");
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    }
  }
  throw new Error(
    "找不到 localhost 证书。开发时先运行 npm run certs；安装包会在首次安装时把证书放到 ~/Library/Application Support/OfficeEasyFormula/certs。",
  );
}
