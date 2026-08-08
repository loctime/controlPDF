import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["lib/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
})
