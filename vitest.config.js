import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest config for the frontend Run Console tests (component/hook logic).
export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/test/**/*.test.{js,jsx}"],
  },
});
