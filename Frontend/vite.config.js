import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";

import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const apiUrl = process.env.VITE_API_URL || "http://localhost:3001";

  return {
    plugins: [react(), tailwindcss()],
    base: "/",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/features/TextEditor/"),
      },
    },
    define: {
      global: "globalThis",
    },
    optimizeDeps: {
      include: ["socket.io-client"],
    },
    server: {
      proxy: {
        "/socket.io": {
          target: apiUrl,
          ws: true,
          changeOrigin: true,
        },
        "/api": {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
