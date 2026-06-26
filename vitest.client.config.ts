import { defineConfig } from "vitest/config";
import reactSwc from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [reactSwc()],
  test: {
    include: ["client/src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./client/src/test-setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client/src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
