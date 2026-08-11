import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Sub-path deployment: set VITE_BASE_URL=/vehix/ in production
const base = process.env.VITE_BASE_URL || "/";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/mcp": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
