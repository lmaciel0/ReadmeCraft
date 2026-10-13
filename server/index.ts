import { setDefaultResultOrder } from "node:dns";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { createAppFromEnv } from "./fromEnv";

try {
  process.loadEnvFile();
} catch {
  // Sem .env: segue com as variáveis do ambiente.
}

// Redes com IPv6 quebrado fazem o fetch do Node expirar antes de tentar IPv4.
setDefaultResultOrder("ipv4first");

const port = Number(process.env.PORT ?? 8787);
const { app, isProd } = createAppFromEnv({
  connectionIp: (c) => {
    try {
      return getConnInfo(c).remote.address;
    } catch {
      return undefined;
    }
  },
});

if (isProd) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ReadmeCraft API em http://localhost:${info.port}`);
});
