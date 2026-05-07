import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
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
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.svg', 'icon-512.svg', 'placeholder.svg'],
      manifest: {
        name: 'CafeBoost',
        short_name: 'CafeBoost',
        description: 'QR ordering, loyalty, bookings, payments, and live cafe operations in one platform.',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'New Order',
            short_name: 'Order',
            description: 'Place a new order',
            url: '/app/menu'
          },
          {
            name: 'Book Table',
            short_name: 'Book',
            description: 'Make a reservation',
            url: '/app/book'
          },
          {
            name: 'My Orders',
            short_name: 'Orders',
            description: 'View your orders',
            url: '/app/orders'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    }),
    spaFallbackPlugin()
  ],
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
