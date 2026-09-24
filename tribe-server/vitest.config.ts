import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "tribe-server",
    environment: "node",
    include: ["__tests__/**/*.spec.ts"],
  },
});
