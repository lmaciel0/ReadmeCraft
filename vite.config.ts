/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_PORT = Number(process.env.PORT ?? 8787);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // changeOrigin: false mantém o Host original, exigido pela checagem de Origin da API.
      "/api": { target: `http://localhost:${API_PORT}`, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    // Mermaid é carregado sob demanda (import dinâmico) e já sai dividido em chunks próprios.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    css: false,
  },
});
