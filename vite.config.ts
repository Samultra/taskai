import { copyFileSync, existsSync } from "node:fs";
import path from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";

/** GitHub Pages отдаёт 404.html при прямом заходе на /taskai/login — копия index даёт тот же SPA-бандл. */
function ghPagesSpaFallback(): Plugin {
  return {
    name: "gh-pages-spa-fallback",
    apply: "build",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      const indexHtml = path.join(distDir, "index.html");
      const notFoundHtml = path.join(distDir, "404.html");
      if (existsSync(indexHtml)) copyFileSync(indexHtml, notFoundHtml);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/taskai/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), ghPagesSpaFallback()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
