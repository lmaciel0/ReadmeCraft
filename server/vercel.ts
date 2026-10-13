import { getRequestListener } from "@hono/node-server";
import { createAppFromEnv } from "./fromEnv";

/**
 * Entrada da Vercel Function (empacotada por scripts/build-vercel.mjs).
 * Exporta um handler Node `(req, res)`; o frontend estático é servido pela CDN.
 */
const { app } = createAppFromEnv({ env: { ...process.env, TRUST_PROXY: process.env.TRUST_PROXY ?? "vercel" } });

export default getRequestListener(app.fetch);
