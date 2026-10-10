import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Uji dijalankan seolah di Asia/Jakarta, zona kerja pengguna.
    env: { TZ: "Asia/Jakarta" },
    // Paket automation/* (bot lokal) punya konfigurasi uji sendiri.
    exclude: ["**/node_modules/**", "automation/**"],
  },
});
