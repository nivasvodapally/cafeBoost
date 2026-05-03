import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { copyFileSync, existsSync } from "node:fs";

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
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), spaFallbackPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI component library
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-toast', '@radix-ui/react-popover', '@radix-ui/react-alert-dialog'],
          // Data fetching
          'vendor-query': ['@tanstack/react-query'],
          // Supabase
          'vendor-supabase': ['@supabase/supabase-js'],
          // Charts (heavy — owner dashboard only)
          'vendor-charts': ['recharts'],
          // Date utilities
          'vendor-date': ['date-fns', 'react-day-picker'],
          // Form utilities
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        }
      }
    },
    // Raise warning threshold temporarily while we measure improvement
    chunkSizeWarningLimit: 600,
  },
}));
