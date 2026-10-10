// UI AR Bot: React + Tailwind v4 memakai token & komponen AR Workspace langsung dari repo (alias "@" = akar repo),
// sehingga tampilan selalu seragam dengan aplikasi web.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const src = fileURLToPath(new URL("./src", import.meta.url));
const nm = fileURLToPath(new URL("./node_modules", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./src/ui", import.meta.url)),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // Komponen repo (components/*) & UI ini harus memakai SATU salinan React — milik paket ini.
      { find: /^react(\/.*)?$/, replacement: `${nm}/react$1` },
      { find: /^react-dom(\/.*)?$/, replacement: `${nm}/react-dom$1` },
      { find: /^@\//, replacement: `${repo}/` },
      { find: /^~\//, replacement: `${src}/` },
    ],
  },
  server: { fs: { allow: [repo] } },
  build: { outDir: fileURLToPath(new URL("./dist/ui", import.meta.url)), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
