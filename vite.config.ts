import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { PORT } from "./src/shared/types";
import { handleApi } from "./src/server/api";
import { loadHttpsCredentials } from "./src/server/certs";

const root = path.dirname(fileURLToPath(import.meta.url));

function apiPlugin(): Plugin {
  return {
    name: "oef-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req, res).then((handled) => {
          if (!handled) next();
        });
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const https = command === "serve" ? loadHttpsCredentials() : undefined;
  return {
    root: path.join(root, "taskpane"),
    publicDir: path.join(root, "taskpane", "public"),
    plugins: [apiPlugin()],
    build: {
      outDir: path.join(root, "dist"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          taskpane: path.join(root, "taskpane", "taskpane.html"),
          commands: path.join(root, "taskpane", "commands.html"),
        },
      },
    },
    server: {
      host: "127.0.0.1",
      port: PORT,
      strictPort: true,
      https,
      fs: { allow: [root] },
    },
  };
});
