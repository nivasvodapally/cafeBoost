import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { copyFileSync, existsSync } from "node:fs";
import { componentTagger } from "lovable-tagger";

const spaFallbackPlugin = () => ({
  name: "spa-404-fallback",
  closeBundle() {
    const indexPath = path.resolve(__dirname, "dist/index.html");
    const fallbackPath = path.resolve(__dirname, "dist/404.html");

    if (existsSync(indexPath)) {
      copyFileSync(indexPath, fallbackPath);
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), spaFallbackPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
