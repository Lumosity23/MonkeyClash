import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "tribe-server",
    environment: "node",
    // src/private: the anticheat, when installed
    include: ["__tests__/**/*.spec.ts", "src/private/**/*.spec.ts"],
  },
});
