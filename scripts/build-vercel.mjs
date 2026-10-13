// Gera .vercel/output (Build Output API v3): frontend estático + uma Node Function
// empacotada com esbuild. A Vercel publica esse diretório como está.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const OUT = ".vercel/output";
const FUNC = `${OUT}/functions/api.func`;

rmSync(OUT, { recursive: true, force: true });
execSync("npx vite build", { stdio: "inherit" });

mkdirSync(`${OUT}/static`, { recursive: true });
cpSync("dist", `${OUT}/static`, { recursive: true });

await build({
  entryPoints: ["server/vercel.ts"],
  outfile: `${FUNC}/index.mjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: true,
  sourcemap: false,
  // Algumas dependências CommonJS usam require() em tempo de execução.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});

writeFileSync(
  `${FUNC}/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 60 }, null, 2),
);

// Mesma política do servidor Node (server/app.ts), aplicada às páginas estáticas.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "form-action 'self' https://github.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/(.*)",
          headers: {
            "Content-Security-Policy": CSP,
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
          },
          continue: true,
        },
        { src: "/assets/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "/api(?:/.*)?", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log("Build Output API pronto em", OUT);
