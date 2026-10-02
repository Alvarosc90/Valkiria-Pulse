import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const valky = mode === "valky";
  const apiTarget = valky
    ? "http://127.0.0.1:4101"
    : "http://127.0.0.1:4200";

  return {
    plugins: [react()],
    server: {
      port: valky ? 5175 : 5173,
      host: valky ? "127.0.0.1" : "0.0.0.0",
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true
        },
        "/health": {
          target: apiTarget,
          changeOrigin: true
        }
      }
    }
  };
});
